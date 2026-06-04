// Dashboard stub — Phase 2 will populate KPI widgets
import React from 'react'
import { useAuthStore } from '../store/authStore'

export default function DashboardView() {
  const { name, role } = useAuthStore()
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-1">
        Welcome back, {name}
      </h2>
      <p className="text-sm text-gray-500 capitalize mb-8">Role: {role}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["Today's Appointments", "Patients", "Low Stock Alerts", "Pending Invoices"].map((label) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-primary">—</p>
            <p className="text-xs text-gray-300 mt-1">Available in Phase 2</p>
          </div>
        ))}
      </div>
    </div>
  )
}
