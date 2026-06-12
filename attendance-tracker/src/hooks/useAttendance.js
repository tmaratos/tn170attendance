import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MOCK_MEMBERS,
  MOCK_GUESTS,
  MOCK_ACTIVITY,
  DEFAULT_SETTINGS,
} from '../data/mockData';
import { isFirebaseConfigured } from '../services/firebase';
import {
  subscribeMembers,
  searchMembers as searchMemberList,
  toUiMember,
  createPin,
  resetMemberPin,
  verifySeniorAccess,
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
  getStats,
} from '../services/attendanceService';
import {
  subscribeGuestAttendance,
  subscribeRecurringGuests,
  guestCheckIn,
  guestCheckOut,
} from '../services/guestService';

const STORAGE_KEY = 'tn170-attendance';
const SENIOR_SESSION_KEY = 'tn170-senior-session';

function loadMockState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* use defaults */
  }
  return {
    members: MOCK_MEMBERS,
    guests: MOCK_GUESTS,
    activity: MOCK_ACTIVITY,
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

function useMockAttendance() {
  const [state, setState] = useState(loadMockState);

  useEffect(() => {
    saveMockState(state);
  }, [state]);

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
              ? { ...m, status: 'checked-in', checkInTime: now, checkOutTime: null }
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
    (memberId, force = false) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? { ...m, status: 'checked-out', checkOutTime: now } : m
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

  const checkOutGuest = useCallback(
    (guestId) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const guest = prev.guests.find((g) => g.id === guestId);
        const updatedGuests = prev.guests.map((g) =>
          g.id === guestId ? { ...g, status: 'checked-out', checkOutTime: now } : g
        );
        const recurringGuests = prev.recurringGuests.map((g) =>
          guest && g.name.toLowerCase() === guest.name.toLowerCase()
            ? { ...g, status: 'checked-out' }
            : g
        );
        return { ...prev, guests: updatedGuests, recurringGuests };
      });
      const guest = state.guests.find((g) => g.id === guestId);
      if (guest) addActivity(`${guest.name} (Guest) checked out`, 'guest-out');
    },
    [state.guests, addActivity]
  );

  const updateSettings = useCallback((newSettings) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...newSettings } }));
  }, []);

  const resetData = useCallback(() => {
    const fresh = {
      members: MOCK_MEMBERS,
      guests: MOCK_GUESTS,
      activity: MOCK_ACTIVITY,
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
      return member && member.pin === pin;
    },
    [state.members]
  );

  const verifyAdminPin = useCallback(
    (pin) => state.settings.adminPin === pin,
    [state.settings.adminPin]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = state.members.find((m) => m.id === memberId);
      return member && !!member.pin;
    },
    [state.members]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = state.members.find((m) => m.id === memberId);
      return member && !member.pin;
    },
    [state.members]
  );

  const createMemberPin = useCallback(async () => true, []);
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
      })),
    [guestRecords]
  );

  const searchMembers = useCallback(
    (query) => {
      const filtered = searchMemberList(rawMembers, query);
      const byCapid = new Map(
        attendanceRecords.map((r) => [String(r.capid), r])
      );
      return filtered.map((m) => {
        const raw = rawMembers.find((rm) => String(rm.capid) === String(m.capid));
        return toUiMember(raw, byCapid.get(String(m.capid)));
      });
    },
    [rawMembers, attendanceRecords]
  );

  const memberHasPin = useCallback(
    (memberId) => {
      const member = rawMembers.find((m) => String(m.capid) === String(memberId));
      return member ? !!member.hasPin && !member.pinResetRequired : false;
    },
    [rawMembers]
  );

  const needsPinSetup = useCallback(
    (memberId) => {
      const member = rawMembers.find((m) => String(m.capid) === String(memberId));
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

  const checkOutMember = useCallback(async (memberId, pin) => {
    return verifyPinAndCheckOut(memberId, pin);
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
      return forceCheckIn(seniorSession.capid, actorPin, targetCapid, notes);
    },
    [seniorSession]
  );

  const forceCheckOutMember = useCallback(
    async (targetCapid, actorPin, notes) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return forceCheckOut(seniorSession.capid, actorPin, targetCapid, notes);
    },
    [seniorSession]
  );

  const resetMemberPinFn = useCallback(
    async (targetCapid, actorPin) => {
      if (!seniorSession) throw new Error('Senior authentication required.');
      return resetMemberPin(seniorSession.capid, actorPin, targetCapid);
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

  return {
    members,
    guests,
    activity,
    settings,
    recurringGuests,
    meeting,
    seniorSession,
    isFirebase: true,
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
    clearSeniorSession: () => {
      setSeniorSession(null);
      saveSeniorSession(null);
    },
    addActivity: () => {},
  };
}

export function useAttendance() {
  if (isFirebaseConfigured()) {
    return useFirebaseAttendance();
  }
  return useMockAttendance();
}
