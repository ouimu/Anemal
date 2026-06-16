import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'

// ─── Types ────────────────────────────────────────────────────────────────────
interface PetLite { id: number; name: string; species: string }
interface Donor { id: number; petId: number; bloodType: string; lastDonationAt: string | null; isEligible: boolean; notes: string | null; pet: PetLite }
interface Bag { id: number; donorId: number; volumeMl: string; collectedAt: string; expiryDate: string; status: string; donor: Donor }
interface Transfusion { id: number; recipientPetId: number; donationId: number | null; volumeMl: string; administeredAt: string; reactions: string | null; notes: string | null }
interface SearchResult { petId: number; petName: string; species: string; ownerId: number; ownerName: string; phone: string }

const BLOOD_TYPES = ['DEA 1.1+', 'DEA 1.1-', 'DEA 4', 'DEA 7', 'A', 'B', 'AB']

const inputCls =
  'w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors min-h-[44px]'

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

// ─── Pet search field (shared) ────────────────────────────────────────────────
function PetSearch({ selected, onSelect }: { selected: SearchResult | null; onSelect: (p: SearchResult | null) => void }) {
  const [q, setQ] = useState('')
  const { data: results = [] } = useQuery<SearchResult[]>({
    queryKey: ['bb-search', q],
    queryFn: () => api.get(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.data.data),
    enabled: q.length >= 1 && !selected,
  })
  if (selected) {
    return (
      <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-md py-sm">
        <span className="text-body-md text-on-surface">{selected.petName} <span className="text-on-surface-variant">· {selected.ownerName}</span></span>
        <button onClick={() => { onSelect(null); setQ('') }} className="min-h-[40px] min-w-[40px] flex items-center justify-center text-on-surface-variant hover:text-error"><MaterialIcon name="close" size={16} /></button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Search pet by name…" />
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-xs bg-surface border border-outline-variant rounded-xl shadow-lg z-20 overflow-hidden max-h-56 overflow-y-auto">
          {results.map(r => (
            <button key={r.petId} onClick={() => { onSelect(r); setQ('') }} className="w-full text-left px-md py-sm hover:bg-surface-container border-b border-outline-variant last:border-0">
              <p className="text-body-md text-on-surface">{r.petName}</p>
              <p className="text-label-md text-on-surface-variant">{r.ownerName} · {r.phone}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-xl pt-xl pb-md border-b border-outline-variant">
          <p className="text-headline-sm font-headline font-bold text-on-surface">{title}</p>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant"><MaterialIcon name="close" size={20} /></button>
        </div>
        <div className="px-xl py-lg flex flex-col gap-md">{children}</div>
        <div className="flex gap-sm px-xl pb-xl">{footer}</div>
      </div>
    </div>
  )
}

const cancelBtn = 'flex-1 min-h-[44px] rounded-xl border border-outline-variant bg-surface text-on-surface hover:bg-surface-container text-body-md font-medium transition-colors'
const saveBtn = 'flex-1 min-h-[44px] rounded-xl bg-primary text-primary-on text-body-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity'

// ─── Donor registration ───────────────────────────────────────────────────────
function DonorModal({ onClose }: { onClose: () => void }) {
  const [pet, setPet] = useState<SearchResult | null>(null)
  const [bloodType, setBloodType] = useState(BLOOD_TYPES[0])
  const [notes, setNotes] = useState('')
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (body: object) => api.post('/api/blood-bank/donors', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bb-donors'] }); onClose() },
  })
  return (
    <Modal title="Register Donor" onClose={onClose} footer={<>
      <button onClick={onClose} className={cancelBtn}>Cancel</button>
      <button disabled={!pet || mut.isPending} onClick={() => pet && mut.mutate({ petId: pet.petId, bloodType, notes: notes || null })} className={saveBtn}>
        {mut.isPending ? 'Saving…' : 'Register'}
      </button>
    </>}>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Donor pet *</label><PetSearch selected={pet} onSelect={setPet} /></div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Blood type *</label>
        <select className={inputCls} value={bloodType} onChange={e => setBloodType(e.target.value)}>{BLOOD_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Notes</label>
        <textarea className={`${inputCls} min-h-[64px] resize-none`} value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </div>
      {mut.isError && <p className="text-body-sm text-error">{(mut.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not register donor.'}</p>}
    </Modal>
  )
}

// ─── Collection ───────────────────────────────────────────────────────────────
function CollectionModal({ donors, onClose }: { donors: Donor[]; onClose: () => void }) {
  const [donorId, setDonorId] = useState('')
  const [volumeMl, setVolumeMl] = useState('450')
  const [expiry, setExpiry] = useState('')
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (body: object) => api.post('/api/blood-bank/collections', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bb-bags'] }); qc.invalidateQueries({ queryKey: ['bb-donors'] }); onClose() },
  })
  return (
    <Modal title="Record Collection" onClose={onClose} footer={<>
      <button onClick={onClose} className={cancelBtn}>Cancel</button>
      <button disabled={!donorId || !expiry || mut.isPending}
        onClick={() => mut.mutate({ donorId: Number(donorId), volumeMl: Number(volumeMl), expiryDate: new Date(expiry).toISOString(), notes: null })} className={saveBtn}>
        {mut.isPending ? 'Saving…' : 'Record Bag'}
      </button>
    </>}>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Donor *</label>
        <select className={inputCls} value={donorId} onChange={e => setDonorId(e.target.value)}>
          <option value="">Select donor…</option>
          {donors.map(d => <option key={d.id} value={d.id}>{d.pet.name} · {d.bloodType}{!d.isEligible ? ' (not eligible)' : ''}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Volume (mL) *</label>
        <input type="number" min="1" className={inputCls} value={volumeMl} onChange={e => setVolumeMl(e.target.value)} />
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Expiry date *</label>
        <input type="date" className={inputCls} value={expiry} onChange={e => setExpiry(e.target.value)} />
      </div>
      {mut.isError && <p className="text-body-sm text-error">{(mut.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record collection.'}</p>}
    </Modal>
  )
}

// ─── Transfusion ──────────────────────────────────────────────────────────────
function TransfusionModal({ bags, onClose }: { bags: Bag[]; onClose: () => void }) {
  const [pet, setPet] = useState<SearchResult | null>(null)
  const [donationId, setDonationId] = useState('')
  const [recipientBloodType, setRecipientBloodType] = useState('')
  const [volumeMl, setVolumeMl] = useState('200')
  const [reactions, setReactions] = useState('')
  const [ack, setAck] = useState(false)
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (body: object) => api.post('/api/blood-bank/transfusions', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bb-transfusions'] }); qc.invalidateQueries({ queryKey: ['bb-bags'] }); onClose() },
  })
  const availableBags = bags.filter(b => b.status === 'available')
  const selectedBag = availableBags.find(b => b.id === Number(donationId))
  const mismatch = !!selectedBag && !!recipientBloodType && selectedBag.donor.bloodType !== recipientBloodType

  return (
    <Modal title="Record Transfusion" onClose={onClose} footer={<>
      <button onClick={onClose} className={cancelBtn}>Cancel</button>
      <button disabled={!pet || mut.isPending || (mismatch && !ack)}
        onClick={() => pet && mut.mutate({
          recipientPetId: pet.petId,
          donationId: donationId ? Number(donationId) : null,
          volumeMl: Number(volumeMl),
          recipientBloodType: recipientBloodType || null,
          reactions: reactions || null,
          acknowledgeMismatch: mismatch ? ack : undefined,
        })} className={saveBtn}>
        {mut.isPending ? 'Saving…' : 'Record'}
      </button>
    </>}>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Recipient pet *</label><PetSearch selected={pet} onSelect={setPet} /></div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Recipient blood type</label>
        <select className={inputCls} value={recipientBloodType} onChange={e => setRecipientBloodType(e.target.value)}>
          <option value="">Unknown</option>{BLOOD_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Blood bag</label>
        <select className={inputCls} value={donationId} onChange={e => { setDonationId(e.target.value); setAck(false) }}>
          <option value="">No bag (record only)</option>
          {availableBags.map(b => <option key={b.id} value={b.id}>#{b.id} · {b.donor.bloodType} · {Number(b.volumeMl)}mL · exp {fmtDate(b.expiryDate)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Volume (mL) *</label>
        <input type="number" min="1" className={inputCls} value={volumeMl} onChange={e => setVolumeMl(e.target.value)} />
      </div>
      <div className="flex flex-col gap-xs"><label className="text-label-lg text-on-surface-variant">Reactions / notes</label>
        <textarea className={`${inputCls} min-h-[64px] resize-none`} value={reactions} onChange={e => setReactions(e.target.value)} rows={2} />
      </div>

      {/* Compatibility guard */}
      {mismatch && (
        <div className="bg-error-container rounded-lg p-md flex flex-col gap-sm">
          <div className="flex items-start gap-sm text-error">
            <MaterialIcon name="warning" size={20} className="flex-shrink-0" />
            <p className="text-body-sm font-medium">Blood type mismatch: bag is <strong>{selectedBag!.donor.bloodType}</strong>, recipient is <strong>{recipientBloodType}</strong>.</p>
          </div>
          <label className="flex items-center gap-sm cursor-pointer">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="w-5 h-5 rounded border-outline-variant text-error" />
            <span className="text-body-sm text-error">I acknowledge the risk and want to proceed.</span>
          </label>
        </div>
      )}
      {mut.isError && <p className="text-body-sm text-error">{(mut.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not record transfusion.'}</p>}
    </Modal>
  )
}

// ─── Status badge for bags ────────────────────────────────────────────────────
function BagStatus({ bag }: { bag: Bag }) {
  if (bag.status !== 'available') {
    return <span className="px-sm py-xs rounded-full text-label-sm font-medium bg-surface-container-high text-on-surface-variant capitalize">{bag.status}</span>
  }
  const d = daysUntil(bag.expiryDate)
  if (d < 0)  return <span className="px-sm py-xs rounded-full text-label-sm font-medium bg-error-container text-error">Expired</span>
  if (d <= 7) return <span className="px-sm py-xs rounded-full text-label-sm font-medium bg-warning/20 text-warning">Expires in {d}d</span>
  return <span className="px-sm py-xs rounded-full text-label-sm font-medium bg-success/20 text-success">Available</span>
}

// ─── Main view ────────────────────────────────────────────────────────────────
type Tab = 'donors' | 'bags' | 'transfusions'

export default function AdminBloodBank() {
  const [tab, setTab] = useState<Tab>('donors')
  const [modal, setModal] = useState<'donor' | 'collection' | 'transfusion' | null>(null)

  const { data: donors = [] } = useQuery<Donor[]>({ queryKey: ['bb-donors'], queryFn: () => api.get('/api/blood-bank/donors').then(r => r.data.data) })
  const { data: bags = [] } = useQuery<Bag[]>({ queryKey: ['bb-bags'], queryFn: () => api.get('/api/blood-bank/collections').then(r => r.data.data) })
  const { data: transfusions = [] } = useQuery<Transfusion[]>({ queryKey: ['bb-transfusions'], queryFn: () => api.get('/api/blood-bank/transfusions').then(r => r.data.data) })

  const tabs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: 'donors', label: 'Donors', icon: 'volunteer_activism', count: donors.length },
    { key: 'bags', label: 'Bag Inventory', icon: 'bloodtype', count: bags.length },
    { key: 'transfusions', label: 'Transfusions', icon: 'water_drop', count: transfusions.length },
  ]

  const addBtn = (label: string, action: () => void) => (
    <button onClick={action} className="min-h-[44px] flex items-center gap-xs px-lg rounded-xl bg-primary text-primary-on text-body-sm font-medium hover:opacity-90 transition-opacity">
      <MaterialIcon name="add" size={18} /> {label}
    </button>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-headline-sm font-headline font-bold text-primary">Blood Bank</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">Donor registry, bag inventory &amp; transfusion records</p>
        </div>
        {tab === 'donors' && addBtn('Register Donor', () => setModal('donor'))}
        {tab === 'bags' && addBtn('Record Collection', () => setModal('collection'))}
        {tab === 'transfusions' && addBtn('Record Transfusion', () => setModal('transfusion'))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-xs px-md py-sm min-h-[44px] border-b-2 transition-colors text-body-sm font-medium ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            <MaterialIcon name={t.icon} size={18} /> {t.label}
            <span className="ml-xs px-xs rounded-full bg-surface-container-high text-label-sm">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Donors */}
      {tab === 'donors' && (
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          {donors.length === 0 ? <Empty icon="volunteer_activism" text="No registered donors yet." /> : (
            <table className="w-full text-body-sm">
              <thead><tr className="bg-surface-container-low text-on-surface-variant text-label-md uppercase">
                <th className="text-left px-4 py-2 font-medium">Pet</th><th className="text-left px-4 py-2 font-medium">Blood Type</th>
                <th className="text-left px-4 py-2 font-medium">Last Donation</th><th className="text-left px-4 py-2 font-medium">Eligibility</th>
              </tr></thead>
              <tbody>{donors.map(d => (
                <tr key={d.id} className="border-t border-outline-variant">
                  <td className="px-4 py-2 text-on-surface">{d.pet.name} <span className="text-on-surface-variant capitalize">· {d.pet.species}</span></td>
                  <td className="px-4 py-2"><span className="px-sm py-xs rounded-full bg-error-container text-error text-label-sm font-medium font-mono">{d.bloodType}</span></td>
                  <td className="px-4 py-2 text-on-surface-variant">{fmtDate(d.lastDonationAt)}</td>
                  <td className="px-4 py-2">{d.isEligible
                    ? <span className="text-success flex items-center gap-xs"><MaterialIcon name="check_circle" size={16} />Eligible</span>
                    : <span className="text-on-surface-variant flex items-center gap-xs"><MaterialIcon name="schedule" size={16} />Resting</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Bags */}
      {tab === 'bags' && (
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          {bags.length === 0 ? <Empty icon="bloodtype" text="No blood bags recorded yet." /> : (
            <table className="w-full text-body-sm">
              <thead><tr className="bg-surface-container-low text-on-surface-variant text-label-md uppercase">
                <th className="text-left px-4 py-2 font-medium">Bag</th><th className="text-left px-4 py-2 font-medium">Blood Type</th>
                <th className="text-left px-4 py-2 font-medium">Volume</th><th className="text-left px-4 py-2 font-medium">Collected</th>
                <th className="text-left px-4 py-2 font-medium">Expiry</th><th className="text-left px-4 py-2 font-medium">Status</th>
              </tr></thead>
              <tbody>{bags.map(b => (
                <tr key={b.id} className="border-t border-outline-variant">
                  <td className="px-4 py-2 font-mono text-on-surface-variant">#{b.id}</td>
                  <td className="px-4 py-2"><span className="px-sm py-xs rounded-full bg-error-container text-error text-label-sm font-medium font-mono">{b.donor.bloodType}</span></td>
                  <td className="px-4 py-2 text-on-surface font-mono">{Number(b.volumeMl)} mL</td>
                  <td className="px-4 py-2 text-on-surface-variant">{fmtDate(b.collectedAt)}</td>
                  <td className="px-4 py-2 text-on-surface-variant">{fmtDate(b.expiryDate)}</td>
                  <td className="px-4 py-2"><BagStatus bag={b} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Transfusions */}
      {tab === 'transfusions' && (
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          {transfusions.length === 0 ? <Empty icon="water_drop" text="No transfusion records yet." /> : (
            <table className="w-full text-body-sm">
              <thead><tr className="bg-surface-container-low text-on-surface-variant text-label-md uppercase">
                <th className="text-left px-4 py-2 font-medium">Date</th><th className="text-left px-4 py-2 font-medium">Recipient Pet</th>
                <th className="text-left px-4 py-2 font-medium">Bag</th><th className="text-left px-4 py-2 font-medium">Volume</th>
                <th className="text-left px-4 py-2 font-medium">Reactions</th>
              </tr></thead>
              <tbody>{transfusions.map(t => (
                <tr key={t.id} className="border-t border-outline-variant">
                  <td className="px-4 py-2 text-on-surface-variant font-mono">{fmtDate(t.administeredAt)}</td>
                  <td className="px-4 py-2 text-on-surface">#{t.recipientPetId}</td>
                  <td className="px-4 py-2 text-on-surface-variant font-mono">{t.donationId ? `#${t.donationId}` : '—'}</td>
                  <td className="px-4 py-2 text-on-surface font-mono">{Number(t.volumeMl)} mL</td>
                  <td className="px-4 py-2 text-on-surface-variant">{t.reactions
                    ? <span className="text-warning flex items-center gap-xs"><MaterialIcon name="warning" size={16} />{t.reactions}</span>
                    : <span className="text-success">None</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {modal === 'donor' && <DonorModal onClose={() => setModal(null)} />}
      {modal === 'collection' && <CollectionModal donors={donors} onClose={() => setModal(null)} />}
      {modal === 'transfusion' && <TransfusionModal bags={bags} onClose={() => setModal(null)} />}
    </div>
  )
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="p-8 text-center text-on-surface-variant">
      <MaterialIcon name={icon} size={40} className="text-outline mb-2" />
      <p className="text-body-md">{text}</p>
    </div>
  )
}
