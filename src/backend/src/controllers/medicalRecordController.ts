import { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../utils/errors'
import {
  listMedicalRecords, getMedicalRecord, createMedicalRecord, updateMedicalRecord, addAttachment,
} from '../services/medicalRecordService'

export async function handleListMedicalRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const petId = parseInt(String(req.query.petId ?? '0'))
    if (!petId) throw new ValidationError({ petId: ['petId is required'] })
    const page  = parseInt(String(req.query.page  ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '10'))
    const data  = await listMedicalRecords(req.context!.tenantId, petId, page, limit)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetMedicalRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getMedicalRecord(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleCreateMedicalRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createMedicalRecord(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleUpdateMedicalRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await updateMedicalRecord(req.context!.tenantId, parseInt(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleAddAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await addAttachment(req.context!.tenantId, parseInt(req.params.id), req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}
