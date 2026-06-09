import MaterialIcon from '../../components/MaterialIcon'

export default function AdminBranches() {
  return (
    <div className="p-xl flex flex-col items-center justify-center min-h-[60vh] gap-md text-on-surface-variant">
      <MaterialIcon name="apartment" size={48} className="text-outline" />
      <p className="text-headline-sm font-headline text-on-surface">Branch Management</p>
      <p className="text-body-md">Coming in the next session — branch creation, operating hours, and doctor shifts.</p>
    </div>
  )
}
