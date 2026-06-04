import { Request, Response } from 'express'
import {
  createMedicalRecordSchema, updateMedicalRecordSchema, addAttachmentSchema,
  listMedicalRecords, getMedicalRecord, createMedicalRecord, updateMedicalRecord, addAttachment,
  MedicalRecordError,
} from '../services/medicalRecordService'

function handleError(res: Response, err: unknown) {
  if (err instanceof MedicalRecordError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleListMedicalRecords(req: Request, res: Response) {
  try {
    const petId = parseInt(String(req.query.petId ?? '0'))
    if (!petId) return res.status(400).json({ success: false, error: 'petId is required' })
    const page  = parseInt(String(req.query.page  ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '10'))
    const data  = await listMedicalRecords(req.context!.tenantId, petId, page, limit)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleGetMedicalRecord(req: Request, res: Response) {
  try {
    const data = await getMedicalRecord(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleCreateMedicalRecord(req: Request, res: Response) {
  const parsed = createMedicalRecordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createMedicalRecord(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleUpdateMedicalRecord(req: Request, res: Response) {
  const parsed = updateMedicalRecordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await updateMedicalRecord(req.context!.tenantId, parseInt(req.params.id), parsed.data)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleAddAttachment(req: Request, res: Response) {
  const parsed = addAttachmentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await addAttachment(req.context!.tenantId, parseInt(req.params.id), parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}
