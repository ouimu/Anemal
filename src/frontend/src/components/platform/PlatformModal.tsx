/**
 * PlatformModal — a simple accessible dialog used across platform console screens.
 * Closes on backdrop click or Escape key.
 */
import React, { useEffect } from 'react'
import MaterialIcon from '../MaterialIcon'

interface Props {
  title:     string
  open:      boolean
  onClose:   () => void
  children:  React.ReactNode
  /** Width token class, e.g. 'max-w-lg' */
  width?:    string
}

export default function PlatformModal({
  title,
  open,
  onClose,
  children,
  width = 'max-w-lg',
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-md bg-primary/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative bg-surface rounded-lg shadow-lvl3 w-full ${width} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-md border-b border-outline-variant">
          <h2 className="text-headline-sm font-headline font-bold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
            aria-label="Close modal"
          >
            <MaterialIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-md">{children}</div>
      </div>
    </div>
  )
}
