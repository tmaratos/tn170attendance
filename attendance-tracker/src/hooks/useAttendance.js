import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MOCK_MEMBERS,
  DEFAULT_SETTINGS,
  getEmbeddedRosterMembers,
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
  subscribeToActiveMeeting,
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
  checkInMemberFirestore,
  checkOutMemberFirestore,
  forceCheckInFirestore,
  forceCheckOutFirestore,
  systemForceCheckoutFirestore,
  appendActivityLogSpark,
  ensureActiveMeeting,
  SYNC_UNAVAILABLE,
} from '../services/attendanceService';
import {
  subscribeGuestAttendance,
  subscribeRecurringGuests,
  guestCheckIn,
  guestCheckOut,
  guestCheckInFirestore,
  guestCheckOutFirestore,
} from '../services/guestService';
import { isAfterSystemForceCheckoutTime } from '../utils/timeRules';
import { resolveMemberAdminPermissions } from '../data/rosterData';

const STORAGE_KEY = 'tn170-attendance-v2';
const KIOSK_UI_PREFS_KEY = 'tn170-kiosk-ui-prefs';
const KIOSK_OFFLINE_CACHE_KEY = 'tn170-kiosk-offline-cache';
const SENIOR_SESSION_KEY = 'tn170-senior-session';
const KIOSK_ADMIN_SESSION_KEY = 'tn170-kiosk-admin-session';
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

function loadKioskAdminSession() {
  try {
    const raw = sessionStorage.getItem(KIOSK_ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveKioskAdminSession(session) {
  if (session) {
    sessionStorage.setItem(KIOSK_ADMIN_SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(KIOSK_ADMIN_SESSION_KEY);
  }
}

function buildKioskAdminSession(memberDoc, memberId) {
  const capid = String(memberId);
  const perms = resolveMemberAdminPermissions({ ...memberDoc, capid, memberId: capid });
  if (!perms.isAdmin) return null;
  return {
    capid,
    memberId: capid,
    displayName: memberDoc?.displayName || memberDoc?.fullName || capid,
    ...perms,
  };
}

function enrichMemberDoc(member) {
  const capid = String(member.capid || member.memberId || member.temporaryId);
  return { ...member, ...resolveMemberAdminPermissions({ ...member, capid }) };
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

function clearStoredAdminSessions() {
  try {
    sessionStorage.removeItem(SENIOR_SESSION_KEY);
    sessionStorage.removeItem(KIOSK_ADMIN_SESSION_KEY);
    sessionStorage.removeItem('tn170-admin-auth');
  } catch {
    /* ignore storage errors */
  }
}

function applyLocalForceCheckoutRecords(records, now, note) {
  const checkOutTime = now.toISOString();
  return records.map((record) =>
    record.status === 'checked_in'
      ? {
          ...record,
          status: 'checked_out',
          checkOutTime,
          forceAction: true,
          forceType: 'system',
          forceNote: note,
          notes: note,
        }
      : record
  );
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

function loadKioskUiPrefs() {
  try {
    const stored = localStorage.getItem(KIOSK_UI_PREFS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveKioskUiPrefs(prefs) {
  localStorage.setItem(KIOSK_UI_PREFS_KEY, JSON.stringify(prefs));
}

function loadOfflineCache() {
  try {
    const stored = localStorage.getItem(KIOSK_OFFLINE_CACHE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveOfflineCache(payload) {
  try {
    localStorage.setItem(KIOSK_OFFLINE_CACHE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch {
    /* ignore quota errors */
  }
}

function useSparkKioskAttendance() {
  const offlineCache = loadOfflineCache();
  const [rawMembers, setRawMembers] = useState(() => getEmbeddedRosterMembers().map(enrichMemberDoc));
  const [usingLocalRoster, setUsingLocalRoster] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState(offlineCache?.attendanceRecords || []);
  const [guestRecords, setGuestRecords] = useState(offlineCache?.guestRecords || []);
  const [recurringGuests, setRecurringGuests] = useState(offlineCache?.recurringGuests || []);
  const [activity, setActivity] = useState(offlineCache?.activity || []);
  const [meeting, setMeeting] = useState(offlineCache?.meeting || null);
  const [memberPinHashes, setMemberPinHashes] = useState({});
  const [remoteSettings, setRemoteSettings] = useState(null);
  const [localUiPrefs, setLocalUiPrefs] = useState(loadKioskUiPrefs);
  const [kioskAdminSession, setKioskAdminSession] = useState(loadKioskAdminSession);
  const [loading, setLoading] = useState(true);
  const [isSyncAvailable, setIsSyncAvailable] = useState(true);
  const [syncError, setSyncError] = useState(null);

  const markSyncUnavailable = useCallback(() => {
    setIsSyncAvailable(false);
    setSyncError(SYNC_UNAVAILABLE);
  }, []);

  const markSyncAvailable = useCallback(() => {
    setIsSyncAvailable(true);
    setSyncError(null);
  }, []);

  const persistOfflineCache = useCallback((payload) => {
    saveOfflineCache(payload);
  }, []);

  useEffect(() => {
    const embedded = getEmbeddedRosterMembers();
    const unsubs = [
      subscribeMembers(
        (members) => {
          if (members.length > 0) {
            setRawMembers(members.map(enrichMemberDoc));
            setUsingLocalRoster(false);
          } else {
            setRawMembers(embedded.map(enrichMemberDoc));
            setUsingLocalRoster(true);
          }
          setLoading(false);
          markSyncAvailable();
        },
        () => {
          markSyncUnavailable();
          setLoading(false);
        }
      ),
      subscribeSettings(
        (settingsDoc) => {
          setRemoteSettings(settingsDoc);
          markSyncAvailable();
        },
        () => markSyncUnavailable()
      ),
      subscribeMemberPins(
        (pins) => {
          setMemberPinHashes(pins);
          markSyncAvailable();
        },
        () => markSyncUnavailable()
      ),
      subscribeToActiveMeeting(
        (activeMeeting) => {
          setMeeting(activeMeeting);
          markSyncAvailable();
        },
        () => markSyncUnavailable()
      ),
      subscribeRecurringGuests(
        (guests) => {
          setRecurringGuests(guests);
          markSyncAvailable();
        },
        () => markSyncUnavailable()
      ),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [markSyncAvailable, markSyncUnavailable]);

  useEffect(() => {
    if (!meeting?.id) {
      setAttendanceRecords([]);
      setGuestRecords([]);
      setActivity([]);
      return undefined;
    }

    const unsubAttendance = subscribeAttendanceRecords(
      meeting.id,
      (records) => {
        setAttendanceRecords(records);
        markSyncAvailable();
      },
      () => markSyncUnavailable()
    );
    const unsubGuests = subscribeGuestAttendance(
      meeting.id,
      (records) => {
        setGuestRecords(records);
        markSyncAvailable();
      },
      () => markSyncUnavailable()
    );
    const unsubActivity = subscribeActivityLog(
      meeting.id,
      (items) => {
        setActivity(items);
        markSyncAvailable();
      },
      50,
      () => markSyncUnavailable()
    );

    return () => {
      unsubAttendance();
      unsubGuests();
      unsubActivity();
    };
  }, [meeting?.id, markSyncAvailable, markSyncUnavailable]);

  useEffect(() => {
    if (!isSyncAvailable) return;
    persistOfflineCache({
      meeting,
      attendanceRecords,
      guestRecords,
      recurringGuests,
      activity,
    });
  }, [
    isSyncAvailable,
    meeting,
    attendanceRecords,
    guestRecords,
    recurringGuests,
    activity,
    persistOfflineCache,
  ]);

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(remoteSettings || {}), ...localUiPrefs }),
    [remoteSettings, localUiPrefs]
  );

  useEffect(() => {
    const meetingEnd = settings.meetingEnd || DEFAULT_SETTINGS.meetingEnd;

    const runSystemForceCheckout = async () => {
      const now = new Date();
      if (!isAfterSystemForceCheckoutTime(now, meetingEnd)) return;
      if (!meeting?.id) return;
      if (meeting.systemForceCompletedDate === forceCheckoutDateKey(now)) return;

      const forceKey = `${SYSTEM_FORCE_KEY_PREFIX}-${forceCheckoutDateKey(now)}`;
      if (localStorage.getItem(forceKey) === 'done') return;

      const openMembers = attendanceRecords.filter((record) => record.status === 'checked_in');
      const openGuests = guestRecords.filter((record) => record.status === 'checked_in');
      if (!openMembers.length && !openGuests.length) {
        localStorage.setItem(forceKey, 'done');
        return;
      }

      const note = systemForceNote(now);

      try {
        await systemForceCheckoutFirestore({
          meetingId: meeting.id,
          attendanceRecords,
          guestRecords,
          note,
        });
        localStorage.setItem(forceKey, 'done');
        clearStoredAdminSessions();
        setKioskAdminSession(null);
        markSyncAvailable();
      } catch {
        setAttendanceRecords((prev) => applyLocalForceCheckoutRecords(prev, now, note));
        setGuestRecords((prev) => applyLocalForceCheckoutRecords(prev, now, note));
        localStorage.setItem(forceKey, 'done');
        clearStoredAdminSessions();
        setKioskAdminSession(null);
        markSyncUnavailable();
      }
    };

    runSystemForceCheckout();
    const interval = window.setInterval(runSystemForceCheckout, 30000);
    return () => window.clearInterval(interval);
  }, [
    settings.meetingEnd,
    meeting,
    attendanceRecords,
    guestRecords,
    markSyncAvailable,
    markSyncUnavailable,
  ]);

  const members = useMemo(() => {
    const merged = mergeMembersWithAttendance(rawMembers, attendanceRecords);
    return merged.map((member) => {
      const memberId = String(member.id);
      const pinResetRequired = !!member.pinResetRequired;
      const hasFirestorePin = !!memberPinHashes[memberId];
      return {
        ...member,
        hasPin: hasFirestorePin && !pinResetRequired,
        pinResetRequired,
      };
    });
  }, [rawMembers, attendanceRecords, memberPinHashes]);

  const guests = useMemo(
    () =>
      guestRecords.map((guest) => ({
        ...guest,
        status: guest.status === 'checked_in' ? 'checked-in' : 'checked-out',
        forceAction: !!guest.forceAction,
        forceType: guest.forceType || null,
        forceNote: guest.forceNote || guest.notes || null,
      })),
    [guestRecords]
  );

  const adminMembers = useMemo(
    () =>
      members
        .filter((member) => member.isAdmin || member.isSeniorMember)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const checkInMember = useCallback(
    async (memberId, pinOrForce = false) => {
      const force = pinOrForce === true;
      const id = String(memberId);
      const member = rawMembers.find((m) => memberStorageKey(m) === id);
      if (!member) throw new Error('Member not found.');

      if (!force && typeof pinOrForce === 'string') {
        const storedHash = memberPinHashes[id];
        if (!storedHash || !(await verifyKioskPin(pinOrForce, id, storedHash))) {
          throw new Error('Incorrect PIN.');
        }
      }

      try {
        if (force) {
          const actorId = kioskAdminSession?.capid || kioskAdminSession?.memberId || 'admin';
          await forceCheckInFirestore(actorId, member, null, meeting?.id);
        } else {
          await checkInMemberFirestore(id, member, meeting?.id);
        }
        markSyncAvailable();
      } catch (err) {
        markSyncUnavailable();
        throw err;
      }
    },
    [rawMembers, memberPinHashes, meeting?.id, kioskAdminSession, markSyncAvailable, markSyncUnavailable]
  );

  const checkOutMember = useCallback(
    async (memberId, pinOrForce = false, note = null) => {
      const force = pinOrForce === true;
      const id = String(memberId);
      const member = rawMembers.find((m) => memberStorageKey(m) === id);

      try {
        if (force) {
          const actorId = kioskAdminSession?.capid || kioskAdminSession?.memberId || 'admin';
          await forceCheckOutFirestore(
            actorId,
            id,
            note || adminForceNote(new Date()),
            meeting?.id,
            member?.displayName || member?.fullName
          );
        } else {
          await checkOutMemberFirestore(id, meeting?.id);
        }
        markSyncAvailable();
      } catch (err) {
        markSyncUnavailable();
        throw err;
      }
    },
    [rawMembers, meeting?.id, kioskAdminSession, markSyncAvailable, markSyncUnavailable]
  );

  const checkInGuest = useCallback(
    async (guestData) => {
      const host = rawMembers.find((m) => memberStorageKey(m) === String(guestData.hostId));
      try {
        await guestCheckInFirestore({
          hostCapid: guestData.hostCapid || guestData.hostId,
          hostPin: guestData.hostPin,
          guestName: guestData.name,
          guestId: guestData.guestId || null,
          hostMemberDoc: host,
          meetingId: meeting?.id,
        });
        markSyncAvailable();
      } catch (err) {
        markSyncUnavailable();
        throw err;
      }
    },
    [rawMembers, meeting?.id, markSyncAvailable, markSyncUnavailable]
  );

  const updateSettings = useCallback((newSettings) => {
    setLocalUiPrefs((prev) => {
      const next = { ...prev, ...newSettings };
      saveKioskUiPrefs(next);
      return next;
    });
  }, []);

  const resetData = useCallback(() => {
    setLocalUiPrefs({});
    saveKioskUiPrefs({});
    setKioskAdminSession(null);
    saveKioskAdminSession(null);
  }, []);

  const searchMembers = useCallback(
    (queryText) => {
      const filtered = searchMemberList(rawMembers, queryText);
      const byKey = new Map(
        attendanceRecords.map((record) => [String(record.memberId || record.capid), record])
      );
      return filtered.map((member) => {
        const memberId = String(member.id);
        const raw = rawMembers.find(
          (rm) => String(rm.memberId || rm.capid || rm.temporaryId) === memberId
        );
        const uiMember = toUiMember(raw, byKey.get(memberId));
        const pinResetRequired = !!raw?.pinResetRequired;
        const hasFirestorePin = !!memberPinHashes[memberId];
        return {
          ...uiMember,
          hasPin: hasFirestorePin && !pinResetRequired,
          pinResetRequired,
        };
      });
    },
    [rawMembers, attendanceRecords, memberPinHashes]
  );

  const getStatsFn = useCallback(() => getStats(members, guests), [members, guests]);

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
      const guest = guestRecords.find((g) => g.id === guestId);
      if (!guest) throw new Error('Guest not found.');
      if (guest.status !== 'checked_in') throw new Error('Guest is not currently signed in.');

      try {
        await guestCheckOutFirestore(guestId);
        markSyncAvailable();
      } catch (err) {
        markSyncUnavailable();
        throw err;
      }
    },
    [guestRecords, markSyncAvailable, markSyncUnavailable]
  );

  const verifyAdminPin = useCallback(
    async (adminIdOrPin, pinMaybe) => {
      if (pinMaybe === undefined) {
        return settings.adminPin === adminIdOrPin;
      }
      const adminId = String(adminIdOrPin);
      const member = rawMembers.find((m) => memberStorageKey(m) === adminId);
      const perms = resolveMemberAdminPermissions({ ...member, capid: adminId, memberId: adminId });
      if (!perms.isAdmin) return false;
      if (pinMaybe === settings.adminPin) return true;
      return verifyPinSpark(adminId, pinMaybe);
    },
    [settings.adminPin, rawMembers]
  );

  const authenticateKioskAdmin = useCallback(
    async (adminId, pin) => {
      const ok = await verifyAdminPin(adminId, pin);
      if (!ok) {
        throw new Error('Invalid admin credentials.');
      }
      const member = rawMembers.find((m) => memberStorageKey(m) === String(adminId));
      const session = buildKioskAdminSession(member, adminId);
      if (!session) {
        throw new Error('You do not have admin access.');
      }
      setKioskAdminSession(session);
      saveKioskAdminSession(session);
      return session;
    },
    [verifyAdminPin, rawMembers]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = rawMembers.find((m) => memberStorageKey(m) === String(memberId));
      const id = String(memberId);
      return !!memberPinHashes[id] && !member?.pinResetRequired;
    },
    [memberPinHashes, rawMembers]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = rawMembers.find((m) => memberStorageKey(m) === String(memberId));
      const id = String(memberId);
      return !memberPinHashes[id] || !!member?.pinResetRequired;
    },
    [memberPinHashes, rawMembers]
  );

  const createMemberPin = useCallback(
    async (memberId, pin, confirmPin) => {
      const result = await createPinSpark(memberId, pin, confirmPin);
      const member = rawMembers.find((m) => memberStorageKey(m) === String(memberId));
      try {
        const activeMeeting = meeting || (await ensureActiveMeeting());
        await appendActivityLogSpark({
          meetingId: activeMeeting.id,
          type: 'pin_created',
          targetMemberId: String(memberId),
          targetCapid: member?.capid || memberId,
          targetName: member?.displayName || member?.fullName || memberId,
        });
        markSyncAvailable();
      } catch {
        markSyncUnavailable();
      }
      return result;
    },
    [rawMembers, meeting, markSyncAvailable, markSyncUnavailable]
  );

  const resetMemberPinFn = useCallback(
    async (targetCapid, actorPin, actorCapid) => {
      const actorId = actorCapid || kioskAdminSession?.capid || kioskAdminSession?.memberId;
      if (!actorId) {
        throw new Error('Select your admin account before resetting a PIN.');
      }
      const result = await resetMemberPinSpark(actorId, actorPin, targetCapid);
      try {
        const activeMeeting = meeting || (await ensureActiveMeeting());
        await appendActivityLogSpark({
          meetingId: activeMeeting.id,
          type: 'pin_reset',
          actorCapid: String(actorId),
          targetCapid: String(targetCapid),
          targetName: result.targetName || String(targetCapid),
        });
        markSyncAvailable();
      } catch {
        markSyncUnavailable();
      }
      return result;
    },
    [kioskAdminSession, meeting, markSyncAvailable, markSyncUnavailable]
  );

  const clearKioskAdminSession = useCallback(() => {
    setKioskAdminSession(null);
    saveKioskAdminSession(null);
  }, []);

  return {
    members,
    guests,
    activity,
    settings,
    recurringGuests,
    meeting,
    seniorSession: kioskAdminSession,
    isFirebase: true,
    isCloudBackend: false,
    isKioskMode: true,
    isSyncAvailable,
    syncError,
    usingLocalRoster,
    adminMembers,
    loading,
    error: syncError,
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
    authenticateKioskAdmin,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
    authenticateSenior: authenticateKioskAdmin,
    resetMemberPin: resetMemberPinFn,
    canResetPins: kioskAdminSession?.canResetPins ?? false,
    clearSeniorSession: clearKioskAdminSession,
    addActivity: () => {},
  };
}

function useMockAttendance() {
  const [state, setState] = useState(loadMockState);

  useEffect(() => {
    saveMockState(state);
  }, [state]);

  useEffect(() => {
    const meetingEnd = state.settings.meetingEnd || DEFAULT_SETTINGS.meetingEnd;

    const runSystemForceCheckout = () => {
      const now = new Date();
      if (!isAfterSystemForceCheckoutTime(now, meetingEnd)) return;

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
        clearStoredAdminSessions();

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
          ],
        };
      });
    };

    runSystemForceCheckout();
    const interval = window.setInterval(runSystemForceCheckout, 30000);
    return () => window.clearInterval(interval);
  }, [state.settings.meetingEnd]);

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
      const member = state.members.find((m) => String(m.id) === adminId);
      const perms = resolveMemberAdminPermissions({
        ...member,
        capid: adminId,
        memberId: adminId,
      });
      if (!perms.isAdmin) return false;
      return verifyPin(adminId, pinMaybe);
    },
    [state.settings.adminPin, state.members, verifyPin]
  );

  const adminMembers = useMemo(
    () =>
      state.members
        .filter((member) => member.isAdmin || member.isSeniorMember)
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

  useEffect(() => {
    const meetingEnd = settings.meetingEnd || DEFAULT_SETTINGS.meetingEnd;

    const runSystemForceCheckout = async () => {
      const now = new Date();
      if (!isAfterSystemForceCheckoutTime(now, meetingEnd)) return;
      if (!meeting?.id) return;
      if (meeting.systemForceCompletedDate === forceCheckoutDateKey(now)) return;

      const forceKey = `${SYSTEM_FORCE_KEY_PREFIX}-${forceCheckoutDateKey(now)}`;
      if (localStorage.getItem(forceKey) === 'done') return;

      const openMembers = attendanceRecords.filter((record) => record.status === 'checked_in');
      const openGuests = guestRecords.filter((record) => record.status === 'checked_in');
      if (!openMembers.length && !openGuests.length) {
        localStorage.setItem(forceKey, 'done');
        return;
      }

      const note = systemForceNote(now);

      try {
        await systemForceCheckoutFirestore({
          meetingId: meeting.id,
          attendanceRecords,
          guestRecords,
          note,
        });
        localStorage.setItem(forceKey, 'done');
        clearStoredAdminSessions();
        setSeniorSession(null);
        saveSeniorSession(null);
      } catch {
        /* retry on next interval tick */
      }
    };

    runSystemForceCheckout();
    const interval = window.setInterval(runSystemForceCheckout, 30000);
    return () => window.clearInterval(interval);
  }, [settings.meetingEnd, meeting, attendanceRecords, guestRecords]);

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
        .filter((member) => member.isAdmin || member.isSeniorMember)
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
