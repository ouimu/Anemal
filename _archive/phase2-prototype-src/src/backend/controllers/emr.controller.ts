// emr.controller.ts — SOAP notes, prescriptions, anatomy annotation
import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/tenant.middleware';
import { emrRepository } from '../models/emr.repository';
import { successResponse, errorResponse, paginationMeta } from '../middlewares/response.util';

const CreateEMRSchema = z.object({
  petId:             z.number().int().positive(),
  appointmentId:     z.number().int().positive().optional(),
  subjective:        z.string().optional(),
  objective:         z.string().optional(),
  assessment:        z.string().optional(),
  plan:              z.string().optional(),
  weightKg:          z.number().min(0).max(999).optional(),
  temperatureC:      z.number().min(30).max(45).optional(),
  heartRateBpm:      z.number().int().min(0).max(500).optional(),
  respRateRpm:       z.number().int().min(0).max(200).optional(),
  anatomyAnnotation: z.record(z.unknown()).optional(),
  anatomySpecies:    z.string().optional(),
});

const PrescriptionSchema = z.object({
  productId:          z.number().int().positive(),
  qty:                z.number().positive(),
  dosageInstructions: z.string().min(1),
  durationDays:       z.number().int().min(1).optional().default(7),
});

export const emrController = {

  // GET /api/medical-records?petId=&page=&limit=
  async listByPet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const petId = parseInt(req.query.petId as string);
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!petId) return res.status(400).json(errorResponse('petId is required'));

      const { records, total } = await emrRepository.findByPet(req.tenantId, petId, page, limit);
      return res.json(successResponse(records, 'Records retrieved', paginationMeta(page, limit, total)));
    } catch (err) { next(err); }
  },

  // GET /api/medical-records/:id
  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const record = await emrRepository.findById(req.tenantId, parseInt(req.params.id));
      if (!record) return res.status(404).json(errorResponse('Record not found', 'NOT_FOUND'));
      return res.json(successResponse(record));
    } catch (err) { next(err); }
  },

  // POST /api/medical-records
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input = CreateEMRSchema.parse(req.body);
      const record = await emrRepository.create({
        ...input,
        tenantId: req.tenantId,
        doctorId: req.userId,
      });
      return res.status(201).json(successResponse(record, 'Medical record created'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  // PUT /api/medical-records/:id
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input  = CreateEMRSchema.partial().parse(req.body);
      const result = await emrRepository.update(req.tenantId, parseInt(req.params.id), input);
      if (!result) return res.status(404).json(errorResponse('Record not found', 'NOT_FOUND'));
      if ('error' in result && result.error === 'LOCKED') {
        return res.status(409).json(errorResponse(result.message as string, 'RECORD_LOCKED'));
      }
      return res.json(successResponse(result, 'Record updated'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  // POST /api/medical-records/:id/complete
  async markComplete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const record = await emrRepository.markComplete(req.tenantId, parseInt(req.params.id));
      if (!record) return res.status(404).json(errorResponse('Record not found', 'NOT_FOUND'));
      return res.json(successResponse(record, 'Record marked as complete'));
    } catch (err) { next(err); }
  },

  // POST /api/medical-records/:id/prescriptions
  async addPrescription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input  = PrescriptionSchema.parse(req.body);
      const result = await emrRepository.addPrescription(
        req.tenantId, parseInt(req.params.id),
        input.productId, input.qty,
        input.dosageInstructions, input.durationDays,
        req.userId
      );
      if (!result) return res.status(404).json(errorResponse('Record not found', 'NOT_FOUND'));
      if ('error' in result) {
        if (result.error === 'INSUFFICIENT_STOCK') {
          return res.status(409).json(errorResponse(
            `Insufficient stock. Available: ${result.available}`, 'INSUFFICIENT_STOCK'
          ));
        }
        return res.status(404).json(errorResponse('Product not found', 'PRODUCT_NOT_FOUND'));
      }
      return res.status(201).json(successResponse(result, 'Prescription added, stock deducted'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  // DELETE /api/medical-records/:id/prescriptions/:prescriptionId
  async removePrescription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await emrRepository.removePrescription(
        req.tenantId, parseInt(req.params.prescriptionId), req.userId
      );
      if (!result) return res.status(404).json(errorResponse('Prescription not found', 'NOT_FOUND'));
      return res.json(successResponse(null, 'Prescription removed, stock restored'));
    } catch (err) { next(err); }
  },
};
