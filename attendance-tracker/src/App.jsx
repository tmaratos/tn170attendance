import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CheckIn from './pages/CheckIn';
import CheckOut from './pages/CheckOut';
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
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar settings={attendance.settings} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard attendance={attendance} />} />
            <Route path="/check-in" element={<CheckIn attendance={attendance} />} />
            <Route path="/check-out" element={<CheckOut attendance={attendance} />} />
            <Route path="/guests" element={<Guests attendance={attendance} />} />
            <Route path="/attendance" element={<AttendanceList attendance={attendance} />} />
            <Route path="/reports" element={<Reports attendance={attendance} />} />
            <Route path="/admin" element={<AdminTools attendance={attendance} />} />
            <Route path="/settings" element={<Settings attendance={attendance} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
