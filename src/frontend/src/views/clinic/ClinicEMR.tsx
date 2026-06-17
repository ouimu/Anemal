import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pet { id: number; name: string; species: string; photoUrl?: string; allergies?: string; underlyingConditions?: string; owner?: { firstName: string; lastName: string; phone: string } }
interface MedicalRecord { id: number; petId: number; createdAt: string; assessment?: string; subjective?: string; objective?: string; plan?: string; weightKg?: number; temperatureC?: number; heartRateBpm?: number; respRateRpm?: number; anatomyAnnotation?: AnatomyAnnotation; prescriptions?: Prescription[]; attachments?: Attachment[] }
interface Prescription { id: number; quantity: number; unit?: string; dosageInstruction?: string; drug: { id: number; name: string; unit?: string; stockQuantity: number } }
interface Attachment { id: number; fileName: string; fileUrl: string; fileType?: string }
interface Drug { id: number; name: string; unit?: string; stockQuantity: number; barcode?: string }
interface SearchResult { petId: number; petName: string; species: string; ownerName: string; phone: string }
interface AnatomyAnnotation { template: string; imageData: string }

// ─── Anatomy Canvas ───────────────────────────────────────────────────────────
const TEMPLATES = ['Canine - Lateral', 'Canine - Dorsal', 'Feline - Lateral']

// Canvas drawing requires literal color values (ctx.strokeStyle / inline swatch),
// so these mirror the error / on-surface / info token hexes from tailwind.config.js.
const PEN_COLORS = ['#EF4444', '#191c1e', '#0EA5E9'] as const

function AnatomyCanvas({ value, onChange }: { value: AnatomyAnnotation | null; onChange: (v: AnatomyAnnotation | null) => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const [tool, setTool]     = useState<'pen' | 'eraser'>('pen')
  const [color, setColor]   = useState<string>(PEN_COLORS[0])
  const [template, setTemplate] = useState(TEMPLATES[0])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (value?.imageData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = value.imageData
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  // value.imageData intentionally excluded — canvas is redrawn only on template change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template])

  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPos(e)
    if (tool === 'eraser') {
      ctx.clearRect(p.x - 10, p.y - 10, 20, 20)
    } else {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }

  const onUp = () => {
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange({ template, imageData: canvas.toDataURL() })
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-sm">
      {/* Template selector */}
      <div className="flex gap-sm flex-wrap">
        {TEMPLATES.map(t => (
          <button key={t} type="button" onClick={() => setTemplate(t)}
            className={`px-md py-xs rounded-full text-label-md font-medium transition-colors min-h-[36px] ${template === t ? 'bg-primary text-primary-on' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tool row */}
      <div className="flex items-center gap-sm">
        {PEN_COLORS.map(c => (
          <button key={c} type="button" onClick={() => { setTool('pen'); setColor(c) }}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c && tool === 'pen' ? 'border-primary scale-110' : 'border-outline-variant'}`}
            style={{ background: c }} />
        ))}
        <button type="button" onClick={() => setTool('eraser')}
          className={`px-md py-xs rounded-lg text-label-md min-h-[36px] transition-colors ${tool === 'eraser' ? 'bg-primary text-primary-on' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
          <MaterialIcon name="ink_eraser" size={16} className="inline mr-xs" />Eraser
        </button>
        <button type="button" onClick={clearCanvas} className="px-md py-xs rounded-lg text-label-md bg-surface-container text-on-surface-variant hover:bg-surface-container-high min-h-[36px] transition-colors">
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant">
        <div className="p-md text-center text-label-md text-on-surface-variant border-b border-outline-variant">{template} — Use stylus or finger to annotate</div>
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      </div>
    </div>
  )
}

// ─── Vital stepper ────────────────────────────────────────────────────────────
function VitalStepper({ label, unit, value, onChange, step = 0.1, min = 0 }: {
  label: string; unit: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number
}) {
  const display = value !== null ? value : '—'
  const inc = () => onChange(Math.round(((value ?? 0) + step) * 10) / 10)
  const dec = () => { const v = Math.round(((value ?? 0) - step) * 10) / 10; onChange(v < min ? null : v) }

  return (
    <div className="flex flex-col items-center gap-xs bg-surface-container-low rounded-xl p-md min-w-[90px]">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-sm">
        <button type="button" onClick={dec} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface hover:bg-surface-container border border-outline-variant text-headline-sm font-bold transition-colors">−</button>
        <span className="text-headline-xs font-bold min-w-[48px] text-center">{display}</span>
        <button type="button" onClick={inc} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-surface hover:bg-surface-container border border-outline-variant text-headline-sm font-bold transition-colors">+</button>
      </div>
      <span className="text-label-md text-on-surface-variant">{unit}</span>
    </div>
  )
}

// ─── Prescription form ────────────────────────────────────────────────────────
function PrescriptionPanel({ recordId, prescriptions, onRefresh }: {
  recordId: number
  prescriptions: Prescription[]
  onRefresh: () => void
}) {
  const [drugSearch, setDrugSearch] = useState('')
  const [selectedDrug, setDrug]     = useState<Drug | null>(null)
  const [qty, setQty]               = useState(1)
  const [instruction, setInstruction] = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const addPrescription = async () => {
    if (!selectedDrug) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/prescriptions', { medicalRecordId: recordId, drugId: selectedDrug.id, quantity: qty, unit: selectedDrug.unit, dosageInstruction: instruction || null })
      setDrug(null)
      setDrugSearch('')
      setQty(1)
      setInstruction('')
      onRefresh()
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add')
    } finally { setSaving(false) }
  }

  const removePrescription = async (id: number) => {
    try {
      await api.delete(`/api/prescriptions/${id}`)
      onRefresh()
    } catch { /* deletion failure is non-critical; UI will re-fetch */ }
  }

  return (
    <div>
      <h4 className="text-body-sm font-semibold text-on-surface-variant mb-md">Prescriptions</h4>

      {/* Existing prescriptions */}
      {prescriptions.map(p => (
        <div key={p.id} className="flex items-center justify-between min-h-[48px] border-b border-outline-variant/50 py-sm gap-md">
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-medium truncate">{p.drug.name}</p>
            <p className="text-label-md text-on-surface-variant">{Number(p.quantity)} {p.unit} · {p.dosageInstruction}</p>
          </div>
          <button onClick={() => removePrescription(p.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-error hover:bg-error-container rounded-lg transition-colors">
            <MaterialIcon name="delete" size={18} />
          </button>
        </div>
      ))}

      {/* Add drug */}
      <div className="mt-md flex flex-col gap-sm">
        {error && <p className="text-error text-label-md">{error}</p>}
        {selectedDrug ? (
          <div className="flex items-center gap-sm bg-surface-container-low rounded-lg px-md py-sm">
            <MaterialIcon name="medication" size={16} className="text-secondary" />
            <span className="flex-1 text-body-sm font-medium truncate">{selectedDrug.name}</span>
            <span className={`text-label-md font-medium px-sm py-xs rounded-full ${Number(selectedDrug.stockQuantity) > 0 ? 'bg-success/10 text-success' : 'bg-error-container text-error'}`}>
              Stock: {Number(selectedDrug.stockQuantity)} {selectedDrug.unit}
            </span>
            <button type="button" onClick={() => setDrug(null)} className="min-h-[32px] min-w-[32px] flex items-center justify-center text-on-surface-variant"><MaterialIcon name="close" size={16} /></button>
          </div>
        ) : (
          <input className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search drug by name or barcode…" value={drugSearch} onChange={e => setDrugSearch(e.target.value)} />
        )}

        {selectedDrug && (
          <>
            <div className="flex gap-sm items-center">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-headline-sm font-bold hover:bg-surface-container transition-colors">−</button>
              <span className="text-headline-xs font-bold min-w-[48px] text-center">{qty}</span>
              <button type="button" onClick={() => setQty(q => q + 1)} className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-headline-sm font-bold hover:bg-surface-container transition-colors">+</button>
              <span className="text-body-sm text-on-surface-variant">{selectedDrug.unit}</span>
            </div>
            <input className="bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Dosage instructions…" value={instruction} onChange={e => setInstruction(e.target.value)} />
            <button onClick={addPrescription} disabled={saving} className="w-full min-h-[44px] bg-secondary text-secondary-on rounded-lg text-body-sm font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Prescription'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── SOAP Tabs ────────────────────────────────────────────────────────────────
const SOAP_TABS = ['Subjective', 'Objective', 'Assessment', 'Plan'] as const
type SoapTab = typeof SOAP_TABS[number]

// ─── Main View ────────────────────────────────────────────────────────────────
export default function ClinicEMR() {
  const t = useT()
  const { userId } = useAuthStore()

  // Patient selection state
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)
  const [isNewRecord, setIsNewRecord] = useState(false)

  // SOAP form state
  const [soapTab, setSoapTab] = useState<SoapTab>('Subjective')
  const [subjective, setSubjective]   = useState('')
  const [objective, setObjective]     = useState('')
  const [assessment, setAssessment]   = useState('')
  const [plan, setPlan]               = useState('')
  const [weightKg, setWeightKg]       = useState<number | null>(null)
  const [tempC, setTempC]             = useState<number | null>(null)
  const [heartRate, setHeartRate]     = useState<number | null>(null)
  const [respRate, setRespRate]       = useState<number | null>(null)
  const [anatomy, setAnatomy]         = useState<AnatomyAnnotation | null>(null)
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')

  // Patient search
  const { data: searchData } = useQuery({
    queryKey: ['search-emr', patientSearch],
    queryFn: () => api.get('/api/search', { params: { q: patientSearch } }).then(r => r.data.data as SearchResult[]),
    enabled: patientSearch.length >= 2,
    staleTime: 15_000,
  })

  // Selected pet
  const { data: petData } = useQuery({
    queryKey: ['pet-emr', selectedPetId],
    queryFn: () => api.get(`/api/pets/${selectedPetId}`).then(r => r.data.data as Pet),
    enabled: !!selectedPetId,
  })

  // Medical records for selected pet
  const { data: recordsData, refetch: refetchRecords } = useQuery({
    queryKey: ['records', selectedPetId],
    queryFn: () => api.get('/api/medical-records', { params: { petId: selectedPetId, limit: 5 } }).then(r => r.data.data),
    enabled: !!selectedPetId,
  })

  // Current record detail
  const { data: recordData, refetch: refetchRecord } = useQuery({
    queryKey: ['record', selectedRecordId],
    queryFn: () => api.get(`/api/medical-records/${selectedRecordId}`).then(r => r.data.data as MedicalRecord),
    enabled: !!selectedRecordId && !isNewRecord,
  })

  const pet = petData
  const records: MedicalRecord[] = recordsData?.records ?? []
  const record = recordData

  // Load existing record into form
  useEffect(() => {
    if (record && !isNewRecord) {
      setSubjective(record.subjective ?? '')
      setObjective(record.objective ?? '')
      setAssessment(record.assessment ?? '')
      setPlan(record.plan ?? '')
      setWeightKg(record.weightKg ? Number(record.weightKg) : null)
      setTempC(record.temperatureC ? Number(record.temperatureC) : null)
      setHeartRate(record.heartRateBpm ?? null)
      setRespRate(record.respRateRpm ?? null)
      setAnatomy(record.anatomyAnnotation ?? null)
    }
  // record intentionally excluded — effect re-runs only when the record ID changes, not on field updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, isNewRecord])

  const resetForm = () => {
    setSubjective(''); setObjective(''); setAssessment(''); setPlan('')
    setWeightKg(null); setTempC(null); setHeartRate(null); setRespRate(null); setAnatomy(null)
    setSoapTab('Subjective')
  }

  const newRecord = () => {
    resetForm()
    setSelectedRecordId(null)
    setIsNewRecord(true)
  }

  const saveRecord = async () => {
    if (!selectedPetId || !pet) return
    setSaving(true)
    setSaveMsg('')
    try {
      const body = { petId: selectedPetId, doctorId: userId, subjective, objective, assessment, plan, weightKg, temperatureC: tempC, heartRateBpm: heartRate, respRateRpm: respRate, anatomyAnnotation: anatomy }

      if (isNewRecord) {
        const res = await api.post('/api/medical-records', body)
        setSelectedRecordId(res.data.data.id)
        setIsNewRecord(false)
      } else if (selectedRecordId) {
        await api.put(`/api/medical-records/${selectedRecordId}`, body)
      }

      refetchRecords()
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (err) {
      setSaveMsg((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar: patient selection ── */}
      <div className="w-56 flex-shrink-0 border-r border-outline-variant bg-surface flex flex-col overflow-hidden">
        <div className="p-md border-b border-outline-variant">
          <p className="text-body-sm font-semibold text-on-surface-variant mb-sm">Find Patient</p>
          <div className="relative">
            <MaterialIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              className="w-full bg-surface-container-low rounded-lg py-sm pl-9 pr-md min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Pet or owner…"
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
            />
          </div>
          {searchData && searchData.length > 0 && (
            <div className="mt-sm bg-surface border border-outline-variant rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {searchData.map((r: SearchResult) => (
                <button key={r.petId} onClick={() => { setSelectedPetId(r.petId); setPatientSearch(''); setSelectedRecordId(null); setIsNewRecord(false); resetForm() }}
                  className="w-full text-left px-md py-sm text-body-sm hover:bg-surface-container-low min-h-[44px] border-b border-outline-variant/50 last:border-0">
                  <p className="font-medium">{r.petName}</p>
                  <p className="text-on-surface-variant text-label-md">{r.ownerName}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {pet && (
          <div className="p-md border-b border-outline-variant">
            <div className="flex items-center gap-sm mb-md">
              {pet.photoUrl
                ? <img src={pet.photoUrl} alt={pet.name} className="w-10 h-10 rounded-full object-cover" />
                : <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center"><MaterialIcon name="pets" size={20} className="text-on-surface-variant" /></div>
              }
              <div>
                <p className="text-body-sm font-bold">{pet.name}</p>
                <p className="text-label-md text-on-surface-variant capitalize">{pet.species}</p>
              </div>
            </div>
            <button onClick={newRecord} className="w-full min-h-[44px] flex items-center justify-center gap-sm bg-primary text-primary-on rounded-lg text-body-sm font-semibold hover:bg-primary/90 transition-colors">
              <MaterialIcon name="add" size={18} />{t('clinic.emr.newRecord')}
            </button>
          </div>
        )}

        {/* Recent visits */}
        <div className="flex-1 overflow-y-auto">
          {records.map(r => (
            <button key={r.id} onClick={() => { setSelectedRecordId(r.id); setIsNewRecord(false) }}
              className={`w-full text-left px-md py-sm min-h-[52px] border-b border-outline-variant/50 transition-colors ${selectedRecordId === r.id ? 'bg-surface-container-low border-l-4 border-primary' : 'hover:bg-surface-container-low border-l-4 border-transparent'}`}>
              <p className="text-body-sm font-medium truncate">{r.assessment ?? 'Visit'}</p>
              <p className="text-label-md text-on-surface-variant">{new Date(r.createdAt).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Center: SOAP editor ── */}
      {selectedPetId && (isNewRecord || selectedRecordId) ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Patient header bar */}
          {pet && (
            <div className="bg-surface-container-low border-b border-outline-variant px-lg py-md flex items-center gap-md flex-shrink-0">
              <p className="text-body-md font-bold">{pet.name}</p>
              <p className="text-body-sm text-on-surface-variant">·</p>
              <p className="text-body-sm text-on-surface-variant">{pet.owner?.firstName} {pet.owner?.lastName}</p>
              {pet.owner?.phone && <><span className="text-on-surface-variant">·</span><p className="text-body-sm text-on-surface-variant">{pet.owner.phone}</p></>}
              {pet.allergies && (
                <span className="ml-auto px-md py-xs rounded-full bg-error-container text-error text-label-md font-medium">
                  <MaterialIcon name="warning" size={14} className="inline mr-xs" />Allergy: {pet.allergies}
                </span>
              )}
            </div>
          )}

          {/* SOAP Tab bar */}
          <div className="flex border-b border-outline-variant bg-surface flex-shrink-0">
            {SOAP_TABS.map(t => (
              <button key={t} onClick={() => setSoapTab(t)}
                className={`px-lg py-sm text-body-sm font-semibold min-h-[44px] transition-colors ${soapTab === t ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-lg flex flex-col gap-lg">
            {soapTab === 'Subjective' && (
              <textarea
                className="w-full bg-surface-container-low rounded-xl px-lg py-md text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary min-h-[200px] resize-none"
                placeholder={t('clinic.emr.notes')}
                value={subjective}
                onChange={e => setSubjective(e.target.value)}
              />
            )}

            {soapTab === 'Objective' && (
              <div className="flex flex-col gap-lg">
                {/* Vital signs */}
                <div>
                  <p className="text-body-sm font-semibold text-on-surface-variant mb-md">Vital Signs</p>
                  <div className="flex flex-wrap gap-md">
                    <VitalStepper label={t('clinic.emr.weight')} unit="kg" value={weightKg} onChange={setWeightKg} step={0.1} />
                    <VitalStepper label={t('clinic.emr.temperature')} unit="°C" value={tempC} onChange={setTempC} step={0.1} />
                    <VitalStepper label="Heart Rate" unit="bpm" value={heartRate} onChange={setHeartRate} step={1} min={1} />
                    <VitalStepper label="Resp Rate" unit="rpm" value={respRate} onChange={setRespRate} step={1} min={1} />
                  </div>
                </div>

                {/* Objective notes */}
                <div>
                  <p className="text-body-sm font-semibold text-on-surface-variant mb-md">Physical Examination Notes</p>
                  <textarea
                    className="w-full bg-surface-container-low rounded-xl px-lg py-md text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary min-h-[120px] resize-none"
                    placeholder="Physical findings, auscultation, palpation…"
                    value={objective}
                    onChange={e => setObjective(e.target.value)}
                  />
                </div>

                {/* Anatomy canvas */}
                <div>
                  <p className="text-body-sm font-semibold text-on-surface-variant mb-md">Anatomy Annotation</p>
                  <AnatomyCanvas value={anatomy} onChange={setAnatomy} />
                </div>
              </div>
            )}

            {soapTab === 'Assessment' && (
              <textarea
                className="w-full bg-surface-container-low rounded-xl px-lg py-md text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary min-h-[200px] resize-none"
                placeholder={t('clinic.emr.diagnosis')}
                value={assessment}
                onChange={e => setAssessment(e.target.value)}
              />
            )}

            {soapTab === 'Plan' && (
              <textarea
                className="w-full bg-surface-container-low rounded-xl px-lg py-md text-body-md border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary min-h-[200px] resize-none"
                placeholder={t('clinic.emr.treatment')}
                value={plan}
                onChange={e => setPlan(e.target.value)}
              />
            )}
          </div>

          {/* Sticky save bar */}
          <div className="border-t border-outline-variant bg-surface px-lg py-md flex items-center gap-md flex-shrink-0">
            {saveMsg && <span className={`text-body-sm font-medium ${saveMsg === 'Saved' ? 'text-success' : 'text-error'}`}>{saveMsg}</span>}
            <div className="flex-1" />
            <button onClick={saveRecord} disabled={saving}
              className="min-h-[44px] px-xl bg-primary text-primary-on rounded-lg text-body-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-sm">
              <MaterialIcon name="save" size={18} />
              {saving ? 'Saving…' : t('clinic.emr.saveRecord')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-xl text-on-surface-variant">
          <MaterialIcon name="medical_services" size={64} className="mb-lg opacity-20" />
          <p className="text-headline-sm font-headline font-bold mb-sm">EMR Editor</p>
          <p className="text-body-md">Search for a patient to start or continue a medical record.</p>
        </div>
      )}

      {/* ── Right panel: attachments + prescriptions ── */}
      {(selectedRecordId || isNewRecord) && (
        <div className="w-72 flex-shrink-0 border-l border-outline-variant bg-surface flex flex-col overflow-hidden">
          {/* Attachments */}
          <div className="p-lg border-b border-outline-variant">
            <h4 className="text-body-sm font-semibold text-on-surface-variant mb-md">Attachments</h4>
            {record?.attachments?.length ? record.attachments.map(a => (
              <div key={a.id} className="flex items-center gap-sm min-h-[44px] border-b border-outline-variant/50 py-xs">
                <MaterialIcon name="attach_file" size={16} className="text-on-surface-variant flex-shrink-0" />
                <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-body-sm text-primary truncate hover:underline">{a.fileName}</a>
                {a.fileType && <span className="text-label-md bg-surface-container px-sm py-xs rounded-full">{a.fileType}</span>}
              </div>
            )) : <p className="text-label-md text-on-surface-variant">No attachments yet.</p>}
          </div>

          {/* Prescriptions */}
          <div className="flex-1 overflow-y-auto p-lg">
            {selectedRecordId && !isNewRecord ? (
              <PrescriptionPanel
                recordId={selectedRecordId}
                prescriptions={record?.prescriptions ?? []}
                onRefresh={() => refetchRecord()}
              />
            ) : (
              <p className="text-label-md text-on-surface-variant">Save the EMR first to add prescriptions.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
