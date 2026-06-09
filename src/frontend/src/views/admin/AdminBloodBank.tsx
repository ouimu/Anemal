import MaterialIcon from '../../components/MaterialIcon'

export default function AdminBloodBank() {
  return (
    <div className="p-xl flex flex-col items-center justify-center min-h-[60vh] gap-md text-on-surface-variant">
      <MaterialIcon name="bloodtype" size={48} className="text-outline" />
      <p className="text-headline-sm font-headline text-on-surface">Blood Bank</p>
      <p className="text-body-md">Coming in the next session — donors, collection bags, and transfusion records.</p>
    </div>
  )
}
