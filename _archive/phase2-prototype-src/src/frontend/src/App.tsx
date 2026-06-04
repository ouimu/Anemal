// App.tsx — Root router with protected routes
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import AppLayout  from './components/AppLayout';
import Dashboard  from './views/Dashboard';
import PetsList   from './views/PetsList';
import PetProfile from './views/PetProfile';
import EMRView    from './views/EMRView';
import CalendarView from './views/CalendarView';
import LoginPage  from './views/LoginPage';

/** Redirect unauthenticated users to /login */
const ProtectedRoute: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      {/* Public */}
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<LoginPage isRegister />} />

      {/* Protected — wrapped in AppLayout (sidebar + header) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index                        element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"             element={<Dashboard />} />
          <Route path="pets"                  element={<PetsList />} />
          <Route path="pets/:id"              element={<PetProfile />} />
          <Route path="pets/:petId/visit/new" element={<EMRView />} />
          <Route path="medical-records/:id"   element={<EMRView />} />
          <Route path="appointments"          element={<CalendarView />} />
          <Route path="*"                     element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
