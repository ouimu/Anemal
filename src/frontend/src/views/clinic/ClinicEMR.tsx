import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import MaterialIcon from '../../components/MaterialIcon'
import AuthedPetImage from '../../components/AuthedPetImage'
import { VitalStepper } from '../../components/VitalStepper'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n'
import { useEmrAttachmentUpload } from '../../hooks/useEmrAttachmentUpload'
import Can from '../../components/Can'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pet { id: number; name: string; species: string; photoUrl?: string; allergies?: string; underlyingConditions?: string; owner?: { firstName: string; lastName: string; phone: string } }
interface MedicalRecord { id: number; petId: number; createdAt: string; assessment?: string; subjective?: string; objective?: string; plan?: string; weightKg?: number; temperatureC?: number; heartRateBpm?: number; respRateRpm?: number; anatomyAnnotation?: AnatomyAnnotation; prescriptions?: Prescription[]; attachments?: Attachment[] }
interface Prescription { id: number; quantity: number; unit?: string; dosageInstruction?: string; drug: { id: number; name: string; unit?: string; stockQuantity: number } }
interface Attachment {
  id: number
  fileName: string
  fileUrl?: string
  fileType?: string
  mimeType?: string
  fileSize?: number
  storageKey?: string
  uploadedByUser?: { id: number; name: string }
  createdAt?: string
}
interface Drug { id: number; name: string; unit?: string; stockQuantity: number; barcode?: string }
interface SearchResult { petId: number; petName: string; species: string; ownerName: string; phone: string }
interface AnatomyAnnotation { template: string; imageData: string }

// ─── Attachment upload constants ──────────────────────────────────────────────
// Client-side allow-list — UX pre-check only, not the security boundary (the
// server re-validates via emr-attachment.constants.ts). Kept as a small local
// constant rather than shared with the backend module since it's cross-package.
const CLIENT_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])
const CLIENT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
// Soft OS-picker filter (not the security boundary). Derived from the allow-list.
const ATTACHMENT_ACCEPT = Array.from(CLIENT_ATTACHMENT_TYPES).join(',')
// Human-readable supported-types hint shown under the Upload control.
const ATTACHMENT_TYPES_LABEL = 'JPG, PNG, GIF, WebP, PDF, Word, Excel · max 25 MB'

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

/** Minimum characters before triggering drug search */
const DRUG_SEARCH_MIN_CHARS = 2

/** Debounce delay in milliseconds before firing the drug search query */
const DRUG_SEARCH_DEBOUNCE_MS = 300

// ─── Prescription form ────────────────────────────────────────────────────────
function PrescriptionPanel({ recordId, prescriptions, onRefresh }: {
  recordId: number
  prescriptions: Prescription[]
  onRefresh: () => void
}) {
  const [drugSearch, setDrugSearch]     = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [selectedDrug, setDrug]         = useState<Drug | null>(null)
  const [qty, setQty]                   = useState(1)
  const [instruction, setInstruction]   = useState('')
  const [error, setError]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Debounce drugSearch → debouncedSearch so the query fires at most every 300 ms */
  const handleDrugSearchChange = useCallback((value: string) => {
    setDrugSearch(value)
    setShowDropdown(true)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebounced(value)
    }, DRUG_SEARCH_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  /** Search products by name/barcode — enabled only when >= 2 chars typed */
  const { data: drugResults, isFetching: searchingDrugs } = useQuery({
    queryKey: ['drug-search', debouncedSearch],
    queryFn: () =>
      api.get('/api/products', { params: { search: debouncedSearch, limit: 10 } })
        .then(r => (r.data.data as { products: Drug[] }).products),
    enabled: debouncedSearch.length >= DRUG_SEARCH_MIN_CHARS,
    staleTime: 30_000,
  })

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
            <button
              type="button"
              aria-label="Clear selected drug"
              onClick={() => { setDrug(null); setDrugSearch(''); setDebounced('') }}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center text-on-surface-variant"
            >
              <MaterialIcon name="close" size={16} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              className="w-full bg-surface-container-low rounded-lg px-md py-sm min-h-[44px] text-body-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Search drug by name or barcode…"
              value={drugSearch}
              onChange={e => handleDrugSearchChange(e.target.value)}
              onFocus={() => drugSearch.length >= DRUG_SEARCH_MIN_CHARS && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              autoComplete="off"
            />
            {showDropdown && debouncedSearch.length >= DRUG_SEARCH_MIN_CHARS && (
              <div className="absolute left-0 right-0 top-full mt-xs z-10 bg-surface shadow-lvl2 rounded-md border border-outline-variant max-h-48 overflow-y-auto">
                {searchingDrugs ? (
                  <div className="flex items-center justify-center min-h-[44px] text-body-sm text-on-surface-variant">
                    Searching…
                  </div>
                ) : drugResults && drugResults.length > 0 ? (
                  drugResults.map((drug: Drug) => (
                    <button
                      key={drug.id}
                      type="button"
                      onMouseDown={() => {
                        setDrug(drug)
                        setDrugSearch('')
                        setDebounced('')
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-md flex items-center justify-between min-h-[44px] hover:bg-surface-container-low transition-colors border-b border-outline-variant/50 last:border-0"
                    >
                      <span className="text-body-sm font-medium truncate">{drug.name}</span>
                      <span className={`ml-sm text-label-md font-medium px-sm py-xs rounded-full flex-shrink-0 ${Number(drug.stockQuantity) > 0 ? 'bg-success/10 text-success' : 'bg-error-container text-error'}`}>
                        {Number(drug.stockQuantity)} {drug.unit}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="flex items-center justify-center min-h-[44px] text-body-sm text-on-surface-variant">
                    No results
                  </div>
                )}
              </div>
            )}
          </div>
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
  const queryClient = useQueryClient()
  const { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError } = useEmrAttachmentUpload()
  const [attachmentUiError, setAttachmentUiError] = useState<string | null>(null)

  // Patient selection state
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const petId = searchParams.get('petId')
    if (petId) setSelectedPetId(parseInt(petId, 10))
  }, [searchParams])

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

  const handleAttachmentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setAttachmentUiError(null)
    clearUploadError()

    if (!selectedRecordId) {
      setAttachmentUiError('Save the record before attaching files.')
      return
    }

    if (file.size > CLIENT_MAX_ATTACHMENT_BYTES) {
      setAttachmentUiError('File is too large — the limit is 25 MB.')
      return
    }
    if (!CLIENT_ATTACHMENT_TYPES.has(file.type)) {
      setAttachmentUiError('This file type is not supported.')
      return
    }

    try {
      await uploadAttachment(selectedRecordId, file)
      refetchRecord()
    } catch {
      // uploadError from the hook already carries the server-side message
    }
  }

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
      queryClient.invalidateQueries({ queryKey: ['pet-emr', selectedPetId] })
      queryClient.invalidateQueries({ queryKey: ['pet', selectedPetId] })
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
                ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-10 h-10 rounded-full object-cover" iconSize={20} />
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
                    <VitalStepper label={t('clinic.emr.weight')} unit="kg" value={weightKg} onChange={setWeightKg} step={0.1} max={999.99} />
                    <VitalStepper label={t('clinic.emr.temperature')} unit="°C" value={tempC} onChange={setTempC} step={0.1} max={999.9} />
                    <VitalStepper label="Heart Rate" unit="bpm" value={heartRate} onChange={setHeartRate} step={1} min={1} max={3000} />
                    <VitalStepper label="Resp Rate" unit="rpm" value={respRate} onChange={setRespRate} step={1} min={1} max={3000} />
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
            <div className="flex items-center justify-between mb-md">
              <h4 className="text-body-sm font-semibold text-on-surface-variant">Attachments</h4>
              <Can perm="emr.attach">
                <label className="min-h-[36px] px-md flex items-center gap-xs rounded-lg bg-surface-container text-label-md font-medium text-on-surface-variant hover:bg-surface-container-high cursor-pointer transition-colors">
                  <MaterialIcon name="upload_file" size={16} />
                  {isUploading ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    data-testid="emr-attachment-file-input"
                    className="hidden"
                    accept={ATTACHMENT_ACCEPT}
                    disabled={isUploading}
                    onChange={handleAttachmentFileChange}
                  />
                </label>
              </Can>
            </div>

            <Can perm="emr.attach">
              <p className="text-label-md text-on-surface-variant mb-sm">{ATTACHMENT_TYPES_LABEL}</p>
            </Can>

            {(attachmentUiError || uploadError) && (
              <p className="text-label-md text-error mb-sm">{attachmentUiError ?? uploadError}</p>
            )}

            {record?.attachments?.length ? record.attachments.map(a => (
              <div key={a.id} className="flex items-center gap-sm min-h-[44px] border-b border-outline-variant/50 py-xs">
                <MaterialIcon name="attach_file" size={16} className="text-on-surface-variant flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {a.storageKey ? (
                    <button
                      type="button"
                      onClick={() => downloadAttachment(selectedRecordId!, a.id)}
                      className="text-body-sm text-primary truncate hover:underline text-left"
                    >
                      {a.fileName}
                    </button>
                  ) : (
                    <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-body-sm text-primary truncate hover:underline">{a.fileName}</a>
                  )}
                  <p className="text-label-md text-on-surface-variant">
                    <span>{formatFileSize(a.fileSize)}</span>
                    {a.fileSize && a.uploadedByUser ? ' · ' : ''}
                    {a.uploadedByUser && <span>{a.uploadedByUser.name}</span>}
                  </p>
                </div>
                {a.fileType && <span className="text-label-md bg-surface-container px-sm py-xs rounded-full flex-shrink-0">{a.fileType}</span>}
                <Can perm="emr.attach">
                  <button
                    type="button"
                    aria-label="Delete attachment"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${a.fileName}"? This cannot be undone.`)) return
                      try {
                        await api.delete(`/api/medical-records/${selectedRecordId}/attachments/${a.id}`)
                        setAttachmentUiError(null)
                        refetchRecord()
                      } catch (err) {
                        const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                        setAttachmentUiError(message ?? 'Failed to delete attachment.')
                      }
                    }}
                    className="w-[36px] h-[36px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors flex-shrink-0"
                  >
                    <MaterialIcon name="delete" size={16} />
                  </button>
                </Can>
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
