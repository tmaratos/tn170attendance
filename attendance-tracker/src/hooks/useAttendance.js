import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MOCK_MEMBERS,
  DEFAULT_SETTINGS,
  getEmbeddedRosterMembers,
  buildEmptyKioskLocalState,
} from '../data/mockData';
import { isFirebaseConfigured, isSparkKioskMode } from '../services/firebase';
import { verifyKioskPin } from '../services/kioskPin';
import {
  subscribeMembers,
  searchMembers as searchMemberList,
  toUiMember,
  createPin,
  createPinSpark,
  resetMemberPin,
  resetMemberPinSpark,
  verifyPinSpark,
  verifySeniorAccess,
  subscribeSettings,
  subscribeMemberPins,
  createPendingMember,
  updatePendingMemberCapid,
  deactivateMember,
  reactivateMember,
} from '../services/memberService';
import {
  subscribeTodaysMeeting,
  subscribeAttendanceRecords,
  subscribeActivityLog,
  mergeMembersWithAttendance,
  verifyPinAndCheckIn,
  verifyPinAndCheckOut,
  forceCheckIn,
  forceCheckOut,
  startMeeting,
  closeMeeting,
  getStats,
} from '../services/attendanceService';
import {
  subscribeGuestAttendance,
  subscribeRecurringGuests,
  guestCheckIn,
  guestCheckOut,
} from '../services/guestService';
import { isAfterSystemForceCheckoutTime } from '../utils/timeRules';
import { ADMIN_CAPIDS } from '../data/rosterData';

const STORAGE_KEY = 'tn170-attendance-v2';
const KIOSK_STORAGE_KEY = 'tn170-kiosk-local-v3';
const SENIOR_SESSION_KEY = 'tn170-senior-session';
const SYSTEM_FORCE_KEY_PREFIX = 'tn170-system-force-checkout';

function mockHashPin(pin, memberId) {
  const input = `${memberId}:${pin}:tn170`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function loadMockState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.members) && parsed.members.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* use defaults */
  }
  return {
    members: MOCK_MEMBERS,
    guests: [],
    activity: [],
    settings: DEFAULT_SETTINGS,
    recurringGuests: [],
  };
}

function saveMockState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadSeniorSession() {
  try {
    const raw = sessionStorage.getItem(SENIOR_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSeniorSession(session) {
  if (session) {
    sessionStorage.setItem(SENIOR_SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SENIOR_SESSION_KEY);
  }
}

function forceCheckoutDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA');
}

function systemForceNote(date = new Date()) {
  return `System force logout at ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} local time.`;
}

function adminForceNote(date = new Date()) {
  return `Admin force logout at ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} local time.`;
}

function memberStorageKey(memberDoc) {
  return String(memberDoc?.capid || memberDoc?.memberId || memberDoc?.temporaryId);
}

function loadKioskLocalState() {
  try {
    const stored = localStorage.getItem(KIOSK_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...buildEmptyKioskLocalState(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    }
  } catch {
    /* seed fresh below */
  }

  return {
    ...buildEmptyKioskLocalState(),
    settings: DEFAULT_SETTINGS,
  };
}

function saveKioskLocalState(state) {
  localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(state));
}

function attendanceRecordToUi(record) {
  if (!record) return null;
  return {
    status: record.status,
    checkInTime: record.checkInTime || null,
    checkOutTime: record.checkOutTime || null,
    forceAction: !!record.forceAction,
    forceType: record.forceType || null,
    notes: record.forceNote || null,
  };
}

function useSparkKioskAttendance() {
  const [rawMembers, setRawMembers] = useState(() => getEmbeddedRosterMembers());
  const [usingLocalRoster, setUsingLocalRoster] = useState(true);
  const [localState, setLocalState] = useState(loadKioskLocalState);
  const [memberPinHashes, setMemberPinHashes] = useState({});
  const [remoteSettings, setRemoteSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saveKioskLocalState(localState);
  }, [localState]);

  useEffect(() => {
    const embedded = getEmbeddedRosterMembers();
    const unsubs = [
      subscribeMembers((members) => {
        if (members.length > 0) {
          setRawMembers(members);
          setUsingLocalRoster(false);
        } else {
          setRawMembers(embedded);
          setUsingLocalRoster(true);
        }
        setLoading(false);
      }),
      subscribeSettings(setRemoteSettings),
      subscribeMemberPins(setMemberPinHashes),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  useEffect(() => {
    const runSystemForceCheckout = () => {
      const now = new Date();
      if (!isAfterSystemForceCheckoutTime(now)) return;

      const forceKey = `${SYSTEM_FORCE_KEY_PREFIX}-${forceCheckoutDateKey(now)}`;
      if (localStorage.getItem(forceKey) === 'done') return;

      setLocalState((prev) => {
        const openMemberIds = Object.entries(prev.attendance)
          .filter(([, record]) => record.status === 'checked-in')
          .map(([id]) => id);
        const openGuests = prev.guests.filter((g) => g.status === 'checked-in');
        if (!openMemberIds.length && !openGuests.length) {
          localStorage.setItem(forceKey, 'done');
          return prev;
        }

        const checkOutTime = now.toISOString();
        const note = systemForceNote(now);
        localStorage.setItem(forceKey, 'done');
        const attendance = { ...prev.attendance };
        for (const id of openMemberIds) {
          attendance[id] = {
            ...attendance[id],
            status: 'checked-out',
            checkOutTime,
            forceAction: true,
            forceType: 'system',
            forceNote: note,
          };
        }

        return {
          ...prev,
          attendance,
          guests: prev.guests.map((guest) =>
            guest.status === 'checked-in'
              ? {
                  ...guest,
                  status: 'checked-out',
                  checkOutTime,
                  forceAction: true,
                  forceType: 'system',
                  forceNote: note,
                }
              : guest
          ),
          activity: [
            ...openMemberIds.map((id, index) => {
              const member = rawMembers.find(
                (m) => String(m.memberId || m.capid || m.temporaryId) === String(id)
              );
              return {
                id: `sfm${Date.now()}-${index}`,
                message: `${member?.displayName || member?.fullName || id} system force logged out`,
                timestamp: checkOutTime,
                type: 'force-out',
              };
            }),
            ...openGuests.map((guest, index) => ({
              id: `sfg${Date.now()}-${index}`,
              message: `${guest.name} (Guest) system force logged out`,
              timestamp: checkOutTime,
              type: 'force-out',
            })),
            ...prev.activity,
          ].slice(0, 50),
        };
      });
    };

    runSystemForceCheckout();
    const interval = window.setInterval(runSystemForceCheckout, 30000);
    return () => window.clearInterval(interval);
  }, [rawMembers]);

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...localState.settings, ...(remoteSettings || {}) }),
    [localState.settings, remoteSettings]
  );

  const members = useMemo(
    () =>
      rawMembers.map((member) => {
        const memberId = memberStorageKey(member);
        const record = attendanceRecordToUi(localState.attendance[memberId]);
        const uiMember = toUiMember(member, record);
        const pinResetRequired = !!member.pinResetRequired;
        const hasFirestorePin = !!memberPinHashes[memberId];
        return {
          ...uiMember,
          hasPin: hasFirestorePin && !pinResetRequired,
          pinResetRequired,
        };
      }),
    [rawMembers, localState.attendance, memberPinHashes]
  );

  const adminMembers = useMemo(
    () =>
      members
        .filter((member) => ADMIN_CAPIDS.has(String(member.capidRaw || member.id)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const addActivity = useCallback((message, type) => {
    setLocalState((prev) => ({
      ...prev,
      activity: [
        { id: `a${Date.now()}`, message, timestamp: new Date().toISOString(), type },
        ...prev.activity,
      ].slice(0, 50),
    }));
  }, []);

  const checkInMember = useCallback(
    async (memberId, pinOrForce = false) => {
      const force = pinOrForce === true;
      const id = String(memberId);
      if (!force && typeof pinOrForce === 'string') {
        const storedHash = memberPinHashes[id];
        if (!storedHash || !(await verifyKioskPin(pinOrForce, id, storedHash))) {
          throw new Error('Incorrect PIN.');
        }
      }
      const now = new Date().toISOString();
      setLocalState((prev) => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          [String(memberId)]: {
            status: 'checked-in',
            checkInTime: now,
            checkOutTime: null,
            forceAction: false,
            forceType: null,
            forceNote: null,
          },
        },
      }));
      const member = members.find((m) => String(m.id) === String(memberId));
      if (member) {
        addActivity(
          force ? `${member.name} force checked in by admin` : `${member.name} checked in`,
          force ? 'force-in' : 'check-in'
        );
      }
    },
    [members, addActivity, memberPinHashes]
  );

  const checkOutMember = useCallback(
    async (memberId, pinOrForce = false, note = null) => {
      const force = pinOrForce === true;
      const id = String(memberId);
      const now = new Date().toISOString();
      setLocalState((prev) => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          [id]: {
            ...prev.attendance[id],
            status: 'checked-out',
            checkOutTime: now,
            ...(force
              ? {
                  forceAction: true,
                  forceType: 'admin',
                  forceNote: note || adminForceNote(new Date()),
                }
              : {}),
          },
        },
      }));
      const member = members.find((m) => String(m.id) === id);
      if (member) {
        addActivity(
          force ? `${member.name} force checked out by admin` : `${member.name} checked out`,
          force ? 'force-out' : 'check-out'
        );
      }
    },
    [members, addActivity, memberPinHashes]
  );

  const checkInGuest = useCallback(
    (guestData) => {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      setLocalState((prev) => {
        const existing = prev.recurringGuests.find(
          (g) => g.name.toLowerCase() === guestData.name.toLowerCase()
        );
        let recurringGuests = prev.recurringGuests;
        if (existing) {
          recurringGuests = prev.recurringGuests.map((g) =>
            g.name.toLowerCase() === guestData.name.toLowerCase()
              ? {
                  ...g,
                  hostId: guestData.hostId,
                  hostName: guestData.hostName,
                  lastVisit: today,
                  totalVisits: g.totalVisits + 1,
                  status: 'checked-in',
                }
              : g
          );
        } else {
          recurringGuests = [
            ...prev.recurringGuests,
            {
              id: `rg${Date.now()}`,
              name: guestData.name,
              hostId: guestData.hostId,
              hostName: guestData.hostName,
              firstVisit: today,
              lastVisit: today,
              totalVisits: 1,
              status: 'checked-in',
            },
          ];
        }
        const newGuest = {
          id: `g${Date.now()}`,
          name: guestData.name,
          hostId: guestData.hostId,
          hostName: guestData.hostName,
          checkInTime: now,
          checkOutTime: null,
          status: 'checked-in',
          forceAction: false,
          forceType: null,
          forceNote: null,
          firstVisit: existing?.firstVisit || today,
          lastVisit: today,
          totalVisits: existing ? existing.totalVisits + 1 : 1,
        };
        return {
          ...prev,
          guests: [
            ...prev.guests.filter(
              (g) => g.status !== 'checked-in' || g.name !== guestData.name
            ),
            newGuest,
          ],
          recurringGuests,
        };
      });
      addActivity(`${guestData.name} (Guest) checked in`, 'guest-in');
    },
    [addActivity]
  );

  const updateSettings = useCallback((newSettings) => {
    setLocalState((prev) => ({ ...prev, settings: { ...prev.settings, ...newSettings } }));
  }, []);

  const resetData = useCallback(() => {
    const fresh = {
      ...buildEmptyKioskLocalState(),
      settings: DEFAULT_SETTINGS,
    };
    setLocalState(fresh);
    saveKioskLocalState(fresh);
  }, []);

  const searchMembers = useCallback(
    (query) => {
      const filtered = searchMemberList(rawMembers, query);
      return filtered.map((member) => {
        const memberId = String(member.id);
        const record = attendanceRecordToUi(localState.attendance[memberId]);
        const raw = rawMembers.find(
          (rm) => String(rm.memberId || rm.capid || rm.temporaryId) === memberId
        );
        const uiMember = toUiMember(raw, record);
        const pinResetRequired = !!raw?.pinResetRequired;
        const hasFirestorePin = !!memberPinHashes[memberId];
        return {
          ...uiMember,
          hasPin: hasFirestorePin && !pinResetRequired,
          pinResetRequired,
        };
      });
    },
    [rawMembers, localState.attendance, memberPinHashes]
  );

  const getStatsFn = useCallback(
    () => getStats(members, localState.guests),
    [members, localState.guests]
  );

  const verifyPin = useCallback(
    async (memberId, pin) => {
      const storedHash = memberPinHashes[String(memberId)];
      if (storedHash) {
        return verifyKioskPin(pin, String(memberId), storedHash);
      }
      return verifyPinSpark(memberId, pin);
    },
    [memberPinHashes]
  );

  const checkOutGuest = useCallback(
    async (guestId) => {
      const guest = localState.guests.find((g) => g.id === guestId);
      if (!guest) throw new Error('Guest not found.');
      if (guest.status !== 'checked-in') throw new Error('Guest is not currently signed in.');

      const now = new Date().toISOString();
      setLocalState((prev) => {
        const currentGuest = prev.guests.find((g) => g.id === guestId);
        const updatedGuests = prev.guests.map((g) =>
          g.id === guestId ? { ...g, status: 'checked-out', checkOutTime: now } : g
        );
        const recurringGuests = prev.recurringGuests.map((g) =>
          currentGuest && g.name.toLowerCase() === currentGuest.name.toLowerCase()
            ? { ...g, status: 'checked-out' }
            : g
        );
        return { ...prev, guests: updatedGuests, recurringGuests };
      });
      addActivity(`Kiosk: ${guest.name} checked out`, 'guest-out');
    },
    [localState.guests, addActivity]
  );

  const verifyAdminPin = useCallback(
    async (adminIdOrPin, pinMaybe) => {
      if (pinMaybe === undefined) {
        return settings.adminPin === adminIdOrPin;
      }
      const adminId = String(adminIdOrPin);
      if (!ADMIN_CAPIDS.has(adminId)) return false;
      if (pinMaybe === settings.adminPin) return true;
      return verifyPinSpark(adminId, pinMaybe);
    },
    [settings.adminPin]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = rawMembers.find(
        (m) => memberStorageKey(m) === String(memberId)
      );
      const id = String(memberId);
      return !!memberPinHashes[id] && !member?.pinResetRequired;
    },
    [memberPinHashes, rawMembers]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = rawMembers.find(
        (m) => memberStorageKey(m) === String(memberId)
      );
      const id = String(memberId);
      return !memberPinHashes[id] || !!member?.pinResetRequired;
    },
    [memberPinHashes, rawMembers]
  );

  const createMemberPin = useCallback(async (memberId, pin, confirmPin) => {
    const result = await createPinSpark(memberId, pin, confirmPin);
    const member = rawMembers.find((m) => memberStorageKey(m) === String(memberId));
    addActivity(
      `${member?.displayName || member?.fullName || memberId} created a new PIN`,
      'pin-created'
    );
    return result;
  }, [rawMembers, addActivity]);

  const authenticateSenior = useCallback(async () => null, []);
  const resetMemberPinFn = useCallback(
    async (targetCapid, actorPin, actorCapid) => {
      if (!actorCapid) {
        throw new Error('Select your admin account before resetting a PIN.');
      }
      const result = await resetMemberPinSpark(actorCapid, actorPin, targetCapid);
      addActivity(
        `PIN reset for ${result.targetName || targetCapid} by admin ${actorCapid}`,
        'pin-reset'
      );
      return result;
    },
    [addActivity]
  );

  return {
    members,
    guests: localState.guests,
    activity: localState.activity,
    settings,
    recurringGuests: localState.recurringGuests,
    meeting: null,
    seniorSession: null,
    isFirebase: true,
    isCloudBackend: false,
    isKioskMode: true,
    usingLocalRoster,
    adminMembers,
    loading,
    error: null,
    checkInMember,
    checkOutMember,
    checkInGuest,
    checkOutGuest,
    updateSettings,
    resetData,
    searchMembers,
    getStats: getStatsFn,
    verifyPin,
    verifyAdminPin,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
    authenticateSenior,
    resetMemberPin: resetMemberPinFn,
    canResetPins: true,
    addActivity,
  };
}

function useMockAttendance() {
  const [state, setState] = useState(loadMockState);

  useEffect(() => {
    saveMockState(state);
  }, [state]);

  useEffect(() => {
    const runSystemForceCheckout = () => {
      const now = new Date();
      if (!isAfterSystemForceCheckoutTime(now)) return;

      const forceKey = `${SYSTEM_FORCE_KEY_PREFIX}-${forceCheckoutDateKey(now)}`;
      if (localStorage.getItem(forceKey) === 'done') return;

      setState((prev) => {
        const openMembers = prev.members.filter((m) => m.status === 'checked-in');
        const openGuests = prev.guests.filter((g) => g.status === 'checked-in');
        if (!openMembers.length && !openGuests.length) {
          localStorage.setItem(forceKey, 'done');
          return prev;
        }

        const checkOutTime = now.toISOString();
        const note = systemForceNote(now);
        localStorage.setItem(forceKey, 'done');

        return {
          ...prev,
          members: prev.members.map((member) =>
            member.status === 'checked-in'
              ? {
                  ...member,
                  status: 'checked-out',
                  checkOutTime,
                  forceAction: true,
                  forceType: 'system',
                  forceNote: note,
                }
              : member
          ),
          guests: prev.guests.map((guest) =>
            guest.status === 'checked-in'
              ? {
                  ...guest,
                  status: 'checked-out',
                  checkOutTime,
                  forceAction: true,
                  forceType: 'system',
                  forceNote: note,
                }
              : guest
          ),
          activity: [
            ...openMembers.map((member, index) => ({
              id: `sfm${Date.now()}-${index}`,
              message: `${member.name} system force logged out`,
              timestamp: checkOutTime,
              type: 'force-out',
            })),
            ...openGuests.map((guest, index) => ({
              id: `sfg${Date.now()}-${index}`,
              message: `${guest.name} (Guest) system force logged out`,
              timestamp: checkOutTime,
              type: 'force-out',
            })),
            ...prev.activity,
          ].slice(0, 50),
        };
      });
    };

    runSystemForceCheckout();
    const interval = window.setInterval(runSystemForceCheckout, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const addActivity = useCallback((message, type) => {
    setState((prev) => ({
      ...prev,
      activity: [
        { id: `a${Date.now()}`, message, timestamp: new Date().toISOString(), type },
        ...prev.activity,
      ].slice(0, 50),
    }));
  }, []);

  const checkInMember = useCallback(
    (memberId, force = false) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const member = prev.members.find((m) => m.id === memberId);
        if (!member) return prev;
        return {
          ...prev,
          members: prev.members.map((m) =>
            m.id === memberId
              ? {
                  ...m,
                  status: 'checked-in',
                  checkInTime: now,
                  checkOutTime: null,
                  forceAction: false,
                  forceType: null,
                  forceNote: null,
                }
              : m
          ),
        };
      });
      const member = state.members.find((m) => m.id === memberId);
      if (member) {
        addActivity(
          force ? `${member.name} force checked in by admin` : `${member.name} checked in`,
          force ? 'force-in' : 'check-in'
        );
      }
    },
    [state.members, addActivity]
  );

  const checkOutMember = useCallback(
    (memberId, force = false, note = null) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId
            ? {
                ...m,
                status: 'checked-out',
                checkOutTime: now,
                ...(force
                  ? {
                      forceAction: true,
                      forceType: 'admin',
                      forceNote: note || adminForceNote(new Date()),
                    }
                  : {}),
              }
            : m
        ),
      }));
      const member = state.members.find((m) => m.id === memberId);
      if (member) {
        addActivity(
          force ? `${member.name} force checked out by admin` : `${member.name} checked out`,
          force ? 'force-out' : 'check-out'
        );
      }
    },
    [state.members, addActivity]
  );

  const checkInGuest = useCallback(
    (guestData) => {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      setState((prev) => {
        const existing = prev.recurringGuests.find(
          (g) => g.name.toLowerCase() === guestData.name.toLowerCase()
        );
        let recurringGuests = prev.recurringGuests;
        if (existing) {
          recurringGuests = prev.recurringGuests.map((g) =>
            g.name.toLowerCase() === guestData.name.toLowerCase()
              ? {
                  ...g,
                  hostId: guestData.hostId,
                  hostName: guestData.hostName,
                  lastVisit: today,
                  totalVisits: g.totalVisits + 1,
                  status: 'checked-in',
                }
              : g
          );
        } else {
          recurringGuests = [
            ...prev.recurringGuests,
            {
              id: `rg${Date.now()}`,
              name: guestData.name,
              hostId: guestData.hostId,
              hostName: guestData.hostName,
              firstVisit: today,
              lastVisit: today,
              totalVisits: 1,
              status: 'checked-in',
            },
          ];
        }
        const newGuest = {
          id: `g${Date.now()}`,
          name: guestData.name,
          hostId: guestData.hostId,
          hostName: guestData.hostName,
          checkInTime: now,
          checkOutTime: null,
          status: 'checked-in',
          forceAction: false,
          forceType: null,
          forceNote: null,
          firstVisit: existing?.firstVisit || today,
          lastVisit: today,
          totalVisits: existing ? existing.totalVisits + 1 : 1,
        };
        return {
          ...prev,
          guests: [
            ...prev.guests.filter(
              (g) => g.status !== 'checked-in' || g.name !== guestData.name
            ),
            newGuest,
          ],
          recurringGuests,
        };
      });
      addActivity(`${guestData.name} (Guest) checked in`, 'guest-in');
    },
    [addActivity]
  );

  const updateSettings = useCallback((newSettings) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...newSettings } }));
  }, []);

  const resetData = useCallback(() => {
    const fresh = {
      members: MOCK_MEMBERS,
      guests: [],
      activity: [],
      settings: DEFAULT_SETTINGS,
      recurringGuests: [],
    };
    setState(fresh);
    saveMockState(fresh);
  }, []);

  const searchMembers = useCallback(
    (query) => {
      if (!query.trim()) return state.members;
      const q = query.toLowerCase();
      return state.members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.capid.includes(q) ||
          m.grade.toLowerCase().includes(q)
      );
    },
    [state.members]
  );

  const getStatsFn = useCallback(
    () => getStats(state.members, state.guests),
    [state.members, state.guests]
  );

  const verifyPin = useCallback(
    (memberId, pin) => {
      const member = state.members.find((m) => m.id === memberId);
      if (!member) return false;
      if (member.pinHash) return member.pinHash === mockHashPin(pin, memberId);
      return member.pin === pin;
    },
    [state.members]
  );

  const checkOutGuest = useCallback(
    async (guestId) => {
      const guest = state.guests.find((g) => g.id === guestId);
      if (!guest) throw new Error('Guest not found.');
      if (guest.status !== 'checked-in') throw new Error('Guest is not currently signed in.');

      const now = new Date().toISOString();
      setState((prev) => {
        const currentGuest = prev.guests.find((g) => g.id === guestId);
        const updatedGuests = prev.guests.map((g) =>
          g.id === guestId ? { ...g, status: 'checked-out', checkOutTime: now } : g
        );
        const recurringGuests = prev.recurringGuests.map((g) =>
          currentGuest && g.name.toLowerCase() === currentGuest.name.toLowerCase()
            ? { ...g, status: 'checked-out' }
            : g
        );
        return { ...prev, guests: updatedGuests, recurringGuests };
      });
      addActivity(`Kiosk: ${guest.name} checked out`, 'guest-out');
    },
    [state.guests, addActivity]
  );

  const verifyAdminPin = useCallback(
    (adminIdOrPin, pinMaybe) => {
      if (pinMaybe === undefined) {
        return state.settings.adminPin === adminIdOrPin;
      }
      const adminId = String(adminIdOrPin);
      if (!ADMIN_CAPIDS.has(adminId)) return false;
      return verifyPin(adminId, pinMaybe);
    },
    [state.settings.adminPin, verifyPin]
  );

  const adminMembers = useMemo(
    () =>
      state.members
        .filter((member) => ADMIN_CAPIDS.has(String(member.capidRaw || member.id || member.capid)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.members]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = state.members.find((m) => m.id === memberId);
      return member && (!!member.pin || !!member.pinHash);
    },
    [state.members]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = state.members.find((m) => m.id === memberId);
      return member && !member.pin && !member.pinHash;
    },
    [state.members]
  );

  const createMemberPin = useCallback(async (memberId, pin, confirmPin) => {
    if (!/^\d{4}$/.test(pin) || pin !== confirmPin) {
      throw new Error('PIN must be 4 digits and match confirmation.');
    }
    setState((prev) => ({
      ...prev,
      members: prev.members.map((member) =>
        member.id === memberId
          ? { ...member, pin: null, pinHash: mockHashPin(pin, memberId), hasPin: true }
          : member
      ),
    }));
    return true;
  }, []);
  const authenticateSenior = useCallback(async () => null, []);
  const resetMemberPinFn = useCallback(async () => {}, []);

  return {
    members: state.members,
    guests: state.guests,
    activity: state.activity,
    settings: state.settings,
    recurringGuests: state.recurringGuests,
    meeting: null,
    seniorSession: null,
    isFirebase: false,
    isCloudBackend: false,
    isKioskMode: false,
    adminMembers,
    loading: false,
    error: null,
    checkInMember,
    checkOutMember,
    checkInGuest,
    checkOutGuest,
    updateSettings,
    resetData,
    searchMembers,
    getStats: getStatsFn,
    verifyPin,
    verifyAdminPin,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
    authenticateSenior,
    resetMemberPin: resetMemberPinFn,
    addActivity,
  };
}

function useFirebaseAttendance() {
  const [rawMembers, setRawMembers] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [guestRecords, setGuestRecords] = useState([]);
  const [recurringGuests, setRecurringGuests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [meeting, setMeeting] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [seniorSession, setSeniorSession] = useState(loadSeniorSession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubs = [subscribeMembers(setRawMembers)];
    unsubs.push(subscribeTodaysMeeting(setMeeting));
    unsubs.push(subscribeRecurringGuests(setRecurringGuests));
    unsubs.push(
      subscribeSettings((remoteSettings) => {
        if (remoteSettings) {
          setSettings((prev) => ({ ...prev, ...remoteSettings }));
        }
      })
    );
    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!meeting?.id) {
      setAttendanceRecords([]);
      setGuestRecords([]);
      return undefined;
    }
    const unsubAttendance = subscribeAttendanceRecords(meeting.id, setAttendanceRecords);
    const unsubGuests = subscribeGuestAttendance(meeting.id, setGuestRecords);
    const unsubActivity = subscribeActivityLog(meeting.id, setActivity);
    return () => {
      unsubAttendance();
      unsubGuests();
      unsubActivity();
    };
  }, [meeting?.id]);

  const members = useMemo(
    () => mergeMembersWithAttendance(rawMembers, attendanceRecords),
    [rawMembers, attendanceRecords]
  );

  const guests = useMemo(
    () =>
      guestRecords.map((g) => ({
        ...g,
        status: g.status === 'checked_in' ? 'checked-in' : 'checked-out',
        forceAction: !!g.forceAction,
        forceType: g.forceType || null,
        forceNote: g.forceNote || g.notes || null,
      })),
    [guestRecords]
  );

  const searchMembers = useCallback(
    (query) => {
      const filtered = searchMemberList(rawMembers, query);
      const byKey = new Map(
        attendanceRecords.map((r) => [String(r.memberId || r.capid), r])
      );
      return filtered.map((m) => {
        const raw = rawMembers.find(
          (rm) => String(rm.memberId || rm.capid || rm.temporaryId) === String(m.id)
        );
        const key = String(raw?.memberId || raw?.capid || raw?.temporaryId);
        return toUiMember(raw, byKey.get(key));
      });
    },
    [rawMembers, attendanceRecords]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = rawMembers.find(
        (m) => String(m.memberId || m.capid || m.temporaryId) === String(memberId)
      );
      return member ? !!member.hasPin && !member.pinResetRequired : false;
    },
    [rawMembers]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = rawMembers.find(
        (m) => String(m.memberId || m.capid || m.temporaryId) === String(memberId)
      );
      return member ? !member.hasPin || member.pinResetRequired : false;
    },
    [rawMembers]
  );

  const createMemberPin = useCallback(async (memberId, pin, confirmPin) => {
    return createPin(memberId, pin, confirmPin);
  }, []);

  const checkInMember = useCallback(async (memberId, pin) => {
    return verifyPinAndCheckIn(memberId, pin);
  }, []);

  const checkOutMember = useCallback(async (memberId) => {
    return verifyPinAndCheckOut(memberId);
  }, []);

  const checkInGuest = useCallback(async (guestData) => {
    return guestCheckIn({
      hostCapid: guestData.hostCapid || guestData.hostId,
      hostPin: guestData.hostPin,
      guestName: guestData.name,
      guestId: guestData.guestId || null,
    });
  }, []);

  const checkOutGuest = useCallback(async (guestAttendanceId) => {
    return guestCheckOut(guestAttendanceId);
  }, []);

  const authenticateSenior = useCallback(async (capid, pin) => {
    const session = await verifySeniorAccess(capid, pin);
    setSeniorSession(session);
    saveSeniorSession(session);
    return session;
  }, []);

  const verifyAdminPin = useCallback(
    async (capid, pin) => {
      try {
        await authenticateSenior(capid, pin);
        return true;
      } catch {
        return false;
      }
    },
    [authenticateSenior]
  );

  const forceCheckInMember = useCallback(
    async (targetCapid, actorPin, notes) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      const actorId = seniorSession.memberId || seniorSession.capid;
      return forceCheckIn(actorId, actorPin, targetCapid, notes);
    },
    [seniorSession]
  );

  const forceCheckOutMember = useCallback(
    async (targetCapid, actorPin, notes) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      const actorId = seniorSession.memberId || seniorSession.capid;
      return forceCheckOut(actorId, actorPin, targetCapid, notes);
    },
    [seniorSession]
  );

  const resetMemberPinFn = useCallback(
    async (targetCapid, actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return resetMemberPin(seniorSession.memberId || seniorSession.capid, actorPin, targetCapid);
    },
    [seniorSession]
  );

  const createPendingMemberFn = useCallback(
    async (payload, actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return createPendingMember({
        actorCapid: seniorSession.memberId || seniorSession.capid,
        actorPin,
        ...payload,
      });
    },
    [seniorSession]
  );

  const updatePendingCapidFn = useCallback(
    async (memberId, newCapid, actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return updatePendingMemberCapid({
        actorCapid: seniorSession.memberId || seniorSession.capid,
        actorPin,
        memberId,
        newCapid,
      });
    },
    [seniorSession]
  );

  const deactivateMemberFn = useCallback(
    async (targetMemberId, actorPin, reason) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return deactivateMember({
        actorCapid: seniorSession.memberId || seniorSession.capid,
        actorPin,
        targetMemberId,
        reason,
      });
    },
    [seniorSession]
  );

  const reactivateMemberFn = useCallback(
    async (targetMemberId, actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return reactivateMember({
        actorCapid: seniorSession.memberId || seniorSession.capid,
        actorPin,
        targetMemberId,
      });
    },
    [seniorSession]
  );

  const startMeetingFn = useCallback(
    async (actorPin, meetingTitle) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return startMeeting(seniorSession.memberId || seniorSession.capid, actorPin, meetingTitle);
    },
    [seniorSession]
  );

  const closeMeetingFn = useCallback(
    async (actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return closeMeeting(seniorSession.memberId || seniorSession.capid, actorPin);
    },
    [seniorSession]
  );

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const resetData = useCallback(() => {
    setSeniorSession(null);
    saveSeniorSession(null);
  }, []);

  const getStatsFn = useCallback(() => getStats(members, guests), [members, guests]);

  const verifyPin = useCallback(() => false, []);

  const adminMembers = useMemo(
    () =>
      members
        .filter((member) => member.isAdmin || ADMIN_CAPIDS.has(String(member.capidRaw || member.id)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  return {
    members,
    guests,
    activity,
    settings,
    recurringGuests,
    meeting,
    seniorSession,
    isFirebase: true,
    isCloudBackend: true,
    isKioskMode: false,
    adminMembers,
    loading,
    error,
    checkInMember,
    checkOutMember,
    checkInGuest,
    checkOutGuest,
    updateSettings,
    resetData,
    searchMembers,
    getStats: getStatsFn,
    verifyPin,
    verifyAdminPin,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
    authenticateSenior,
    forceCheckInMember,
    forceCheckOutMember,
    resetMemberPin: resetMemberPinFn,
    createPendingMember: createPendingMemberFn,
    updatePendingMemberCapid: updatePendingCapidFn,
    deactivateMember: deactivateMemberFn,
    reactivateMember: reactivateMemberFn,
    startMeeting: startMeetingFn,
    closeMeeting: closeMeetingFn,
    clearSeniorSession: () => {
      setSeniorSession(null);
      saveSeniorSession(null);
    },
    addActivity: () => {},
  };
}

export function useAttendance() {
  if (!isFirebaseConfigured()) {
    return useMockAttendance();
  }
  if (isSparkKioskMode()) {
    return useSparkKioskAttendance();
  }
  return useFirebaseAttendance();
}
