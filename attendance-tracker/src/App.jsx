import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CheckIn from './pages/CheckIn';
import CheckOut from './pages/CheckOut';
import IPadKiosk from './pages/IPadKiosk';
import Guests from './pages/Guests';
import AttendanceList from './pages/AttendanceList';
import Reports from './pages/Reports';
import AdminTools from './pages/AdminTools';
import Settings from './pages/Settings';
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
  const isIPadKiosk = location.pathname === '/ipad-kiosk';

  return (
    <div className={`app-layout ${isIPadKiosk ? 'ipad-app-layout' : ''}`}>
      {!isIPadKiosk && <Sidebar settings={attendance.settings} />}
      <main className={`main-content ${isIPadKiosk ? 'ipad-main-content' : ''}`}>
        <Routes>
          <Route path="/" element={<Dashboard attendance={attendance} />} />
          <Route path="/check-in" element={<CheckIn attendance={attendance} />} />
          <Route path="/check-out" element={<CheckOut attendance={attendance} />} />
          <Route path="/ipad-kiosk" element={<IPadKiosk attendance={attendance} />} />
          <Route path="/kiosk" element={<Navigate to="/ipad-kiosk" replace />} />
          <Route path="/guests" element={<Guests attendance={attendance} />} />
          <Route path="/attendance" element={<AttendanceList attendance={attendance} />} />
          <Route path="/reports" element={<Reports attendance={attendance} />} />
          <Route path="/admin" element={<AdminTools attendance={attendance} />} />
          <Route path="/settings" element={<Settings attendance={attendance} />} />
        </Routes>
      </main>
    </div>
  );
}
