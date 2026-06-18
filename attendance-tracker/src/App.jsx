import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import PublicKiosk from './pages/PublicKiosk';
import Dashboard from './pages/Dashboard';
import CheckIn from './pages/CheckIn';
import CheckOut from './pages/CheckOut';
import IPadKiosk from './pages/IPadKiosk';
import GuestSignIn from './pages/GuestSignIn';
import GuestSignOut from './pages/GuestSignOut';
import AdminLogin from './pages/AdminLogin';
import Guests from './pages/Guests';
import AttendanceList from './pages/AttendanceList';
import Reports from './pages/Reports';
import AdminTools from './pages/AdminTools';
import Settings from './pages/Settings';
import SyncWarningBanner from './components/SyncWarningBanner';
import { useAttendance } from './hooks/useAttendance';

import './styles/globals.css';
import './styles/dashboard.css';
import './styles/tables.css';
import './styles/forms.css';
import './styles/kiosk.css';

export default function App() {
  const attendance = useAttendance();

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell attendance={attendance} />
    </BrowserRouter>
  );
}

function AppShell({ attendance }) {
  const location = useLocation();
  const [adminAuthed, setAdminAuthed] = useState(() => {
    try {
      return sessionStorage.getItem('tn170-admin-auth') === 'true';
    } catch {
      return false;
    }
  });
  const isAdminRoute = location.pathname.startsWith('/admin/');
  const isAdminLogin = location.pathname === '/admin-login';
  const isPublicFullScreen = !isAdminRoute || isAdminLogin;
  const hasAdminAccess = adminAuthed || Boolean(attendance.seniorSession);

  useEffect(() => {
    if (attendance.seniorSession) {
      setAdminAuthed(true);
      sessionStorage.setItem('tn170-admin-auth', 'true');
    }
  }, [attendance.seniorSession]);

  const handleAdminLogin = () => {
    setAdminAuthed(true);
    sessionStorage.setItem('tn170-admin-auth', 'true');
  };

  return (
    <div className={`app-layout ${isPublicFullScreen ? 'public-app-layout' : ''}`}>
      <SyncWarningBanner
        isSyncAvailable={attendance.isSyncAvailable}
        syncError={attendance.syncError}
      />
      {!isPublicFullScreen && <Sidebar settings={attendance.settings} />}
      <main className={`main-content ${isPublicFullScreen ? 'public-main-content' : ''}`}>
        <Routes>
          <Route path="/" element={<PublicKiosk attendance={attendance} />} />
          <Route path="/kiosk" element={<PublicKiosk attendance={attendance} />} />
          <Route path="/check-in" element={<CheckIn attendance={attendance} />} />
          <Route path="/check-out" element={<CheckOut attendance={attendance} />} />
          <Route path="/guest-sign-in" element={<GuestSignIn attendance={attendance} />} />
          <Route path="/guest-sign-out" element={<GuestSignOut attendance={attendance} />} />
          <Route path="/ipad-kiosk" element={<IPadKiosk attendance={attendance} />} />
          <Route
            path="/admin-login"
            element={<AdminLogin attendance={attendance} onLogin={handleAdminLogin} />}
          />

          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/admin/dashboard"
            element={
              hasAdminAccess ? <Dashboard attendance={attendance} /> : <Navigate to="/admin-login" replace />
            }
          />
          <Route
            path="/admin/reports"
            element={hasAdminAccess ? <Reports attendance={attendance} /> : <Navigate to="/admin-login" replace />}
          />
          <Route
            path="/admin/members"
            element={hasAdminAccess ? <AttendanceList attendance={attendance} /> : <Navigate to="/admin-login" replace />}
          />
          <Route
            path="/admin/settings"
            element={hasAdminAccess ? <Settings attendance={attendance} /> : <Navigate to="/admin-login" replace />}
          />
          <Route
            path="/admin/guests"
            element={hasAdminAccess ? <Guests attendance={attendance} /> : <Navigate to="/admin-login" replace />}
          />
          <Route
            path="/admin/tools"
            element={hasAdminAccess ? <AdminTools attendance={attendance} /> : <Navigate to="/admin-login" replace />}
          />

          <Route path="/guests" element={<Navigate to="/admin/guests" replace />} />
          <Route path="/attendance" element={<Navigate to="/admin/members" replace />} />
          <Route path="/reports" element={<Navigate to="/admin/reports" replace />} />
          <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
