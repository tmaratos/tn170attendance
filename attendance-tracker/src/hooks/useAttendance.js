import { useState, useEffect, useCallback } from 'react';
import {
  MOCK_MEMBERS,
  MOCK_GUESTS,
  MOCK_ACTIVITY,
  DEFAULT_SETTINGS,
} from '../data/mockData';

const STORAGE_KEY = 'tn170-attendance';

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
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

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useAttendance() {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    saveState(state);
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
        const updatedMembers = prev.members.map((m) =>
          m.id === memberId
            ? { ...m, status: 'checked-in', checkInTime: now, checkOutTime: null }
            : m
        );
        return { ...prev, members: updatedMembers };
      });
      const member = state.members.find((m) => m.id === memberId);
      if (member) {
        const msg = force
          ? `Force checked in by admin — ${member.name}`
          : `${member.name} checked in`;
        addActivity(msg, force ? 'force-in' : 'check-in');
      }
    },
    [state.members, addActivity]
  );

  const checkOutMember = useCallback(
    (memberId, force = false) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const updatedMembers = prev.members.map((m) =>
          m.id === memberId
            ? { ...m, status: 'checked-out', checkOutTime: now }
            : m
        );
        return { ...prev, members: updatedMembers };
      });
      const member = state.members.find((m) => m.id === memberId);
      if (member) {
        const msg = force
          ? `Force checked out by admin — ${member.name}`
          : `${member.name} checked out`;
        addActivity(msg, force ? 'force-out' : 'check-out');
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
          guests: [...prev.guests.filter((g) => g.status !== 'checked-in' || g.name !== guestData.name), newGuest],
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
          g.id === guestId
            ? { ...g, status: 'checked-out', checkOutTime: now }
            : g
        );
        const recurringGuests = prev.recurringGuests.map((g) =>
          guest && g.name.toLowerCase() === guest.name.toLowerCase()
            ? { ...g, status: 'checked-out' }
            : g
        );
        return { ...prev, guests: updatedGuests, recurringGuests };
      });
      const guest = state.guests.find((g) => g.id === guestId);
      if (guest) {
        addActivity(`${guest.name} (Guest) checked out`, 'guest-out');
      }
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
    saveState(fresh);
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

  const getStats = useCallback(() => {
    const checkedIn = state.members.filter((m) => m.status === 'checked-in').length;
    const checkedOut = state.members.filter((m) => m.status === 'checked-out').length;
    const guestsPresent = state.guests.filter((g) => g.status === 'checked-in').length;
    const totalPresent = checkedIn + guestsPresent;
    const totalMembers = state.members.length;
    return { checkedIn, checkedOut, guestsPresent, totalPresent, totalMembers };
  }, [state.members, state.guests]);

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

  return {
    members: state.members,
    guests: state.guests,
    activity: state.activity,
    settings: state.settings,
    recurringGuests: state.recurringGuests,
    checkInMember,
    checkOutMember,
    checkInGuest,
    checkOutGuest,
    updateSettings,
    resetData,
    searchMembers,
    getStats,
    verifyPin,
    verifyAdminPin,
    addActivity,
  };
}
