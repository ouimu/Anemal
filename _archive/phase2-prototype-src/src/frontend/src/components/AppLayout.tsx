// components/AppLayout.tsx
// Tablet-first responsive layout
// Sidebar: collapsible on Tablet, always-visible on Desktop
import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

interface NavItem {
  path:  string;
  label: string;
  icon:  string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',    label: 'Dashboard',    icon: '🏠' },
  { path: '/appointments', label: 'Appointments', icon: '📅' },
  { path: '/pets',         label: 'Patients',     icon: '🐾' },
  { path: '/inventory',    label: 'Inventory',    icon: '💊' },
  { path: '/billing',      label: 'Billing',      icon: '🧾' },
];

const AppLayout: React.FC = () => {
  const { user, logout }       = useAuthStore();
  const [sidebarOpen, setSidebar] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* ── Top Header ── */}
      <header className="h-16 bg-white shadow-sm flex items-center px-4 gap-3 z-30 sticky top-0">

        {/* Hamburger (Tablet only) */}
        <button
          onClick={() => setSidebar(!sidebarOpen)}
          className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center
                     rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          <span className="text-xl">{sidebarOpen ? '✕' : '☰'}</span>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <span className="text-2xl">🐾</span>
          <span className="font-bold text-blue-700 text-lg hidden sm:block">VetCare</span>
        </div>

        <div className="flex-1" />

        {/* Quick search */}
        <button
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl
                     text-slate-500 text-sm min-h-[44px] hover:bg-slate-200 transition-colors"
          onClick={() => navigate('/pets?search=true')}
        >
          🔍 <span>Search patient...</span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2 ml-2">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center
                          text-white font-bold text-sm">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-slate-800 leading-none">{user?.name}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="ml-2 text-sm text-slate-400 hover:text-red-500 min-h-[44px] px-2"
            aria-label="Logout"
          >
            ⎋
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar Overlay (Tablet) ── */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/30 z-20"
            onClick={() => setSidebar(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={`
            fixed lg:static top-16 left-0 h-[calc(100vh-4rem)] w-64
            bg-white shadow-lg lg:shadow-none z-20
            flex flex-col pt-4 pb-6 transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <nav className="flex-1 px-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebar(false)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                  min-h-[52px] transition-colors
                  ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'}
                `}
              >
                <span className="text-xl w-6 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Bottom: clinic info */}
          <div className="px-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 truncate">Clinic settings & help</p>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
