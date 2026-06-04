// ==============================================
// models/pets.repository.ts
// ALL queries MUST include tenant_id — no exceptions
// ==============================================

import { prisma } from '../config/database';

export interface PetCreateInput {
  tenantId: number;
  ownerId: number;
  name: string;
  species: string;
  breed?: string;
  birthDate?: Date;
  gender?: string;
  color?: string;
  microchipId?: string;
  photoUrl?: string;
  notes?: string;
}

export interface PetSearchOptions {
  tenantId: number;
  query?: string;
  page?: number;
  limit?: number;
}

export class PetsRepository {

  /**
   * Find all pets for a tenant (paginated)
   * ✅ tenant_id enforced
   */
  async findAll(tenantId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [pets, total] = await Promise.all([
      prisma.pets.findMany({
        where: {
          tenant_id: tenantId,  // ✅ MANDATORY
          is_deceased: false,
        },
        include: {
          owners: {
            select: { id: true, first_name: true, last_name: true, phone: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.pets.count({
        where: { tenant_id: tenantId, is_deceased: false },  // ✅ MANDATORY
      }),
    ]);

    return { pets, total };
  }

  /**
   * Find pet by ID — BOTH tenant_id AND pet id required
   * Returns null (not throws) if not found or belongs to another tenant
   * ✅ tenant_id enforced — cross-tenant access returns null (shown as 404)
   */
  async findById(tenantId: number, petId: number) {
    return prisma.pets.findFirst({
      where: {
        id: petId,
        tenant_id: tenantId,  // ✅ MANDATORY — prevents cross-tenant access
      },
      include: {
        owners: true,
        vaccinations: {
          orderBy: { administered_date: 'desc' },
        },
      },
    });
  }

  /**
   * Quick search across name, owner phone, microchip
   * ✅ tenant_id enforced
   */
  async search({ tenantId, query = '', page = 1, limit = 10 }: PetSearchOptions) {
    return prisma.pets.findMany({
      where: {
        tenant_id: tenantId,  // ✅ MANDATORY
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { microchip_id: { contains: query } },
          { breed: { contains: query, mode: 'insensitive' } },
          {
            owners: {
              OR: [
                { phone: { contains: query } },
                { first_name: { contains: query, mode: 'insensitive' } },
                { last_name: { contains: query, mode: 'insensitive' } },
              ],
            },
          },
        ],
      },
      include: {
        owners: {
          select: { id: true, first_name: true, last_name: true, phone: true },
        },
      },
      take: limit,
      skip: (page - 1) * limit,
    });
  }

  /**
   * Create a new pet
   * ✅ tenant_id injected server-side from auth token — never from client input
   */
  async create(data: PetCreateInput) {
    return prisma.pets.create({
      data: {
        tenant_id:    data.tenantId,    // ✅ From token, not request body
        owner_id:     data.ownerId,
        name:         data.name,
        species:      data.species,
        breed:        data.breed,
        birth_date:   data.birthDate,
        gender:       data.gender,
        color:        data.color,
        microchip_id: data.microchipId,
        photo_url:    data.photoUrl,
        notes:        data.notes,
      },
    });
  }

  /**
   * Update pet — tenant_id guard ensures cross-tenant update is impossible
   * ✅ tenant_id enforced via findFirst before update
   */
  async update(tenantId: number, petId: number, data: Partial<PetCreateInput>) {
    // First verify pet belongs to this tenant
    const existing = await this.findById(tenantId, petId);
    if (!existing) return null;

    return prisma.pets.update({
      where: { id: petId },
      data: {
        name:         data.name,
        breed:        data.breed,
        birth_date:   data.birthDate,
        gender:       data.gender,
        color:        data.color,
        microchip_id: data.microchipId,
        photo_url:    data.photoUrl,
        notes:        data.notes,
        updated_at:   new Date(),
      },
    });
  }
}

export const petsRepository = new PetsRepository();
