// @uiux-agent spec: flex layout, sidebar + main, hand-mode aware
import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useUiStore } from '../store/uiStore'

export default function AppShell() {
  const handMode = useUiStore((s) => s.handMode)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar: order controlled by handMode */}
      <Sidebar />

      {/* Main area */}
      <div className={`flex flex-col flex-1 overflow-hidden ${handMode === 'right' ? 'order-first' : ''}`}>
        <TopNav />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
