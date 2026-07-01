export interface IdleLogoutModalProps {
  open:        boolean
  secondsLeft: number
  onStay:      () => void
}

export default function IdleLogoutModal({ open, secondsLeft, onStay }: IdleLogoutModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="alertdialog" aria-live="assertive">
      <div className="bg-surface rounded-xl p-6 max-w-sm w-full shadow-lvl3 text-center mx-4">
        <p className="text-headline-xs font-headline font-bold text-on-surface mb-2">
          Session expiring
        </p>
        <p className="text-body-md text-on-surface-variant mb-4">
          You&apos;ll be logged out in {secondsLeft}s due to inactivity.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="min-h-[44px] px-6 bg-primary text-on-primary rounded-lg text-body-md font-semibold"
        >
          Stay logged in
        </button>
      </div>
    </div>
  )
}
