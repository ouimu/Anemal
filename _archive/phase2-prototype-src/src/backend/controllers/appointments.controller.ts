// appointments.controller.ts
import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/tenant.middleware';
import { appointmentsRepository } from '../models/appointments.repository';
import { successResponse, errorResponse } from '../middlewares/response.util';

const CreateSchema = z.object({
  petId:           z.number().int().positive(),
  doctorId:        z.number().int().positive().optional(),
  room:            z.string().max(100).optional(),
  appointmentDate: z.string().datetime(),
  durationMin:     z.number().int().min(10).max(240).default(30),
  reason:          z.string().max(500).optional(),
  isWalkIn:        z.boolean().default(false),
  notes:           z.string().optional(),
});

const StatusSchema = z.object({
  status: z.enum(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
});

export const appointmentsController = {

  async calendar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const startDate = new Date(req.query.startDate as string || new Date().toISOString());
      const endDate   = new Date(req.query.endDate   as string || new Date().toISOString());
      const doctorId  = req.query.doctorId ? parseInt(req.query.doctorId as string) : undefined;
      const list = await appointmentsRepository.findByDateRange(req.tenantId, startDate, endDate, doctorId);
      return res.json(successResponse(list));
    } catch (err) { next(err); }
  },

  async todaySchedule(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const doctorId = req.query.doctorId ? parseInt(req.query.doctorId as string) : req.userId;
      const schedule = await appointmentsRepository.getTodayForDoctor(req.tenantId, doctorId);
      return res.json(successResponse(schedule));
    } catch (err) { next(err); }
  },

  async walkInQueue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const queue = await appointmentsRepository.getWalkInQueue(req.tenantId);
      return res.json(successResponse(queue));
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input = CreateSchema.parse(req.body);
      const appointmentDate = new Date(input.appointmentDate);

      if (!input.isWalkIn && appointmentDate < new Date(Date.now() - 5 * 60000)) {
        return res.status(400).json(errorResponse('Cannot book appointments in the past', 'PAST_DATE'));
      }

      if (input.doctorId) {
        const conflict = await appointmentsRepository.hasConflict(
          req.tenantId, input.doctorId, appointmentDate, input.durationMin
        );
        if (conflict) {
          return res.status(409).json(errorResponse('Doctor already booked at this time', 'DOUBLE_BOOKING'));
        }
      }

      const apt = await appointmentsRepository.create({
        ...input, tenantId: req.tenantId, createdBy: req.userId, appointmentDate,
      });
      return res.status(201).json(successResponse(apt, 'Appointment created'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status } = StatusSchema.parse(req.body);
      const updated = await appointmentsRepository.updateStatus(
        req.tenantId, parseInt(req.params.id), status
      );
      if (!updated) return res.status(404).json(errorResponse('Appointment not found', 'NOT_FOUND'));
      return res.json(successResponse(updated, `Status updated to ${status}`));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Invalid status', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },
};
