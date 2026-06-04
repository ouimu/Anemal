// ==============================================
// controllers/pets.controller.ts
// Uses req.tenantId from tenantGuard middleware
// ==============================================

import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/tenant.middleware';
import { petsRepository } from '../models/pets.repository';
import { successResponse, errorResponse, paginationMeta } from '../middlewares/response.util';

// Input validation schemas (Zod)
const CreatePetSchema = z.object({
  ownerId:     z.number().int().positive(),
  name:        z.string().min(1).max(100),
  species:     z.enum(['Dog','Cat','Rabbit','Bird','Reptile','Hamster','Other']),
  breed:       z.string().max(100).optional(),
  birthDate:   z.string().datetime().optional(),
  gender:      z.enum(['Male','Female','Unknown']).optional(),
  color:       z.string().max(100).optional(),
  microchipId: z.string().max(100).optional(),
  notes:       z.string().optional(),
});

export const petsController = {

  /**
   * GET /api/pets
   * List all pets for current tenant (paginated)
   */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page  = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const { pets, total } = await petsRepository.findAll(req.tenantId, page, limit);

      return res.json(
        successResponse(pets, 'Pets retrieved', paginationMeta(page, limit, total))
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/pets/search?q=
   * Quick search across name, phone, microchip
   */
  async search(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q as string) || '';
      if (query.length < 2) {
        return res.json(successResponse([], 'Query too short'));
      }

      const results = await petsRepository.search({ tenantId: req.tenantId, query });
      return res.json(successResponse(results));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/pets/:id
   * Get single pet — 404 if not found OR belongs to another tenant
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const petId = parseInt(req.params.id);
      const pet = await petsRepository.findById(req.tenantId, petId);

      if (!pet) {
        // Return 404 — do NOT reveal whether pet exists in another tenant
        return res.status(404).json(errorResponse('Pet not found', 'NOT_FOUND'));
      }

      return res.json(successResponse(pet));
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/pets
   * Create a new pet
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input = CreatePetSchema.parse(req.body);

      const pet = await petsRepository.create({
        ...input,
        tenantId:  req.tenantId,  // ✅ Always from token
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      });

      return res.status(201).json(successResponse(pet, 'Pet created'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  /**
   * PUT /api/pets/:id
   * Update pet details
   */
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const petId = parseInt(req.params.id);
      const input = CreatePetSchema.partial().parse(req.body);

      const pet = await petsRepository.update(req.tenantId, petId, {
        ...input,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      });

      if (!pet) {
        return res.status(404).json(errorResponse('Pet not found', 'NOT_FOUND'));
      }

      return res.json(successResponse(pet, 'Pet updated'));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },
};
