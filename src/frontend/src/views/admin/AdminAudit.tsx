import MaterialIcon from '../../components/MaterialIcon'

export default function AdminAudit() {
  return (
    <div className="p-xl flex flex-col items-center justify-center min-h-[60vh] gap-md text-on-surface-variant">
      <MaterialIcon name="policy" size={48} className="text-outline" />
      <p className="text-headline-sm font-headline text-on-surface">Audit Log</p>
      <p className="text-body-md">Coming in the next session — write-once activity log with full diff viewer.</p>
    </div>
  )
}
