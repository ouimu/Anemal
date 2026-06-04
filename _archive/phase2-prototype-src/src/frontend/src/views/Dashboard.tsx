// ==============================================
// views/Dashboard.tsx
// Main dashboard — Today's summary for clinic staff
// Tablet-first responsive layout
// ==============================================

import React, { useEffect, useState } from 'react';
import apiClient from '../utils/api';
import { useAuthStore } from '../stores/auth.store';

interface DashboardStats {
  todayAppointments: number;
  waitingQueue: number;
  revenueToday: number;
  lowStockAlerts: number;
  vaccinationsDueSoon: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiClient.get('/dashboard/stats');
        setStats(res.data.data);
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">
          {greeting()}, {user?.name?.split(' ')[0]} 🐾
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          {new Date().toLocaleDateString('th-TH', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>
      </div>

      {/* Stats Grid — 2 cols on tablet, 4 cols on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Today's Appointments"
          value={stats?.todayAppointments ?? 0}
          icon="📅"
          color="bg-blue-50 text-blue-700"
          loading={loading}
        />
        <StatCard
          title="Waiting Queue"
          value={stats?.waitingQueue ?? 0}
          icon="⏳"
          color="bg-amber-50 text-amber-700"
          loading={loading}
        />
        <StatCard
          title="Revenue Today"
          value={stats ? `฿${stats.revenueToday.toLocaleString()}` : '—'}
          icon="💰"
          color="bg-green-50 text-green-700"
          loading={loading}
        />
        <StatCard
          title="Stock Alerts"
          value={stats?.lowStockAlerts ?? 0}
          icon="⚠️"
          color="bg-red-50 text-red-700"
          loading={loading}
        />
      </div>

      {/* Quick Actions — Large touch targets for Tablet */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionButton
            label="New Visit"
            icon="🏥"
            onClick={() => window.location.href = '/appointments/walk-in'}
            primary
          />
          <QuickActionButton
            label="Appointment"
            icon="📅"
            onClick={() => window.location.href = '/appointments/new'}
          />
          <QuickActionButton
            label="Search Patient"
            icon="🔍"
            onClick={() => window.location.href = '/pets/search'}
          />
          <QuickActionButton
            label="Inventory"
            icon="💊"
            onClick={() => window.location.href = '/inventory'}
          />
        </div>
      </div>

      {/* Vaccination Reminder */}
      {stats && stats.vaccinationsDueSoon > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">💉</span>
          <div>
            <p className="font-semibold text-amber-800">Vaccination Reminders</p>
            <p className="text-sm text-amber-600">
              {stats.vaccinationsDueSoon} pets have vaccinations due in the next 30 days
            </p>
          </div>
          <button
            className="ml-auto text-sm font-medium text-amber-700 underline min-h-[44px] px-2"
            onClick={() => window.location.href = '/vaccinations/due'}
          >
            View All
          </button>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──────────────────────────────────

interface StatCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: string;
  loading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, loading }) => (
  <div className={`rounded-2xl p-4 ${color.split(' ')[0]}`}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-2xl">{icon}</span>
    </div>
    {loading ? (
      <div className="h-8 bg-current opacity-20 rounded animate-pulse" />
    ) : (
      <p className={`text-2xl font-bold ${color.split(' ')[1]}`}>{value}</p>
    )}
    <p className="text-xs text-neutral-500 mt-1">{title}</p>
  </div>
);

interface QuickActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  primary?: boolean;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  label, icon, onClick, primary
}) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center gap-2 p-4 rounded-2xl
      min-h-[88px] touch-manipulation transition-all duration-150
      active:scale-[0.97] font-medium text-sm
      ${primary
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
        : 'bg-white text-neutral-700 shadow-sm hover:shadow-md border border-neutral-100'
      }
    `}
    aria-label={label}
  >
    <span className="text-2xl">{icon}</span>
    <span>{label}</span>
  </button>
);

export default Dashboard;
