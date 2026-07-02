import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

interface WorklistRow {
  petId:       number
  petName:     string
  species:     string
  breed:       string | null
  ownerName:   string
  ownerPhone:  string | null
  vaccineName: string
  nextDueAt:   string
  daysDue:     number
}

export default function ClinicVaccinationsDue() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<WorklistRow[]>({
    queryKey: ['vaccinations', 'due-worklist'],
    queryFn:  () => api.get('/api/vaccinations/due-worklist').then(r => r.data.data),
  })

  const dueBadge = (days: number) => {
    if (days < 0) return (
      <span className="text-error text-label-md">Overdue by {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''}</span>
    )
    if (days === 0) return <span className="text-warning text-label-md">Due today</span>
    return <span className="text-on-surface-variant text-label-md">Due in {days} day{days !== 1 ? 's' : ''}</span>
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  const toRecord = (row: WorklistRow) =>
    `/clinic/vaccinations-due/record?petId=${row.petId}&vaccine=${encodeURIComponent(row.vaccineName)}&nextDueAt=${encodeURIComponent(row.nextDueAt)}`

  return (
    <div className="p-lg">
      <div className="mb-lg">
        <h2 className="text-headline-lg font-headline font-bold text-primary">Vaccines Due</h2>
        <p className="text-body-md text-on-surface-variant mt-xs">
          Overdue and due within 7 days · sorted overdue-first
        </p>
      </div>

      <div className="glass-card rounded-xl shadow-lvl1 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-container-low">
            <tr>
              {['Owner', 'Pet', 'Vaccine', 'Due Date', ''].map((h, i) => (
                <th key={i} className="text-left px-md py-sm text-label-md text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-xl text-on-surface-variant">Loading…</td></tr>
            )}
            {!isLoading && !data?.length && (
              <tr>
                <td colSpan={5} className="px-md py-xl text-center text-on-surface-variant">
                  <MaterialIcon name="vaccines" size={32} className="text-outline mb-sm block mx-auto" />
                  No vaccinations due in the next 7 days.
                </td>
              </tr>
            )}
            {data?.map((row, i) => (
              <tr key={i} onClick={() => navigate(toRecord(row))}
                  className="hover:bg-surface-container transition-colors cursor-pointer">
                <td className="px-md py-sm">
                  <p className="font-medium text-on-surface">{row.ownerName}</p>
                  {row.ownerPhone && <p className="text-label-md text-on-surface-variant">{row.ownerPhone}</p>}
                </td>
                <td className="px-md py-sm">
                  <p className="font-medium text-on-surface">{row.petName}</p>
                  <p className="text-label-md text-on-surface-variant capitalize">
                    {row.species}{row.breed ? ` · ${row.breed}` : ''}
                  </p>
                </td>
                <td className="px-md py-sm text-on-surface">{row.vaccineName}</td>
                <td className="px-md py-sm">
                  <p className="text-on-surface">{formatDate(row.nextDueAt)}</p>
                  {dueBadge(row.daysDue)}
                </td>
                <td className="px-md py-sm">
                  <MaterialIcon name="chevron_right" size={20} className="text-on-surface-variant" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
