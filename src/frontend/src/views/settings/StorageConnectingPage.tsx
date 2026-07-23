import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const REDIRECT_DELAY_MS = 1500

export default function StorageConnectingPage(): React.ReactElement {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/settings/storage', { replace: true }), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-md bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-body-lg text-on-surface">Connecting to Google Drive…</p>
    </div>
  )
}
