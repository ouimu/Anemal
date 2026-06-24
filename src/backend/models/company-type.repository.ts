/**
 * Company-type repository — Prisma access for the company_types reference table.
 *
 * company_types is global reference data: no tenant_id. Platform admins manage
 * these records; clinic operators read them when creating or filtering tenants.
 *
 * @module company-type.repository
 */

import prisma from '../config/db'

/** Full company-type row returned to callers. */
export interface CompanyTypeRow {
  id:        number
  key:       string
  nameEn:    string
  nameTh:    string
  isActive:  boolean
  sortOrder: number
  createdAt: Date
}

/** Input for creating a company type. */
export interface CreateCompanyTypeData {
  key:       string
  nameEn:    string
  nameTh:    string
  sortOrder?: number
}

/** Input for updating a company type. */
export interface UpdateCompanyTypeData {
  nameEn?:    string
  nameTh?:    string
  sortOrder?: number
  isActive?:  boolean
}

/**
 * Return all company types ordered by sortOrder ascending, then name.
 */
export function getAllCompanyTypes(): Promise<CompanyTypeRow[]> {
  return prisma.companyType.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  })
}

/**
 * Find a single company type by primary key.
 *
 * @param id - Company type primary key.
 */
export function findCompanyTypeById(id: number): Promise<CompanyTypeRow | null> {
  return prisma.companyType.findUnique({ where: { id } })
}

/**
 * Find a company type by its unique key.
 *
 * @param key - Unique slug key (e.g. 'general_practice').
 */
export function findCompanyTypeByKey(key: string): Promise<CompanyTypeRow | null> {
  return prisma.companyType.findUnique({ where: { key } })
}

/**
 * Create a new company type.
 *
 * @param data - Fields for the new record.
 */
export function createCompanyType(data: CreateCompanyTypeData): Promise<CompanyTypeRow> {
  return prisma.companyType.create({
    data: {
      key:       data.key,
      nameEn:    data.nameEn,
      nameTh:    data.nameTh,
      sortOrder: data.sortOrder ?? 0,
    },
  })
}

/**
 * Update an existing company type's editable fields.
 *
 * @param id   - Company type primary key.
 * @param data - Fields to update (partial).
 */
export function updateCompanyType(id: number, data: UpdateCompanyTypeData): Promise<CompanyTypeRow> {
  return prisma.companyType.update({ where: { id }, data })
}

/**
 * Soft-delete a company type by setting isActive = false.
 *
 * @param id - Company type primary key.
 */
export function softDeleteCompanyType(id: number): Promise<CompanyTypeRow> {
  return prisma.companyType.update({ where: { id }, data: { isActive: false } })
}

/**
 * Count how many tenants are currently assigned to this company type.
 * Used before deletion to enforce the "in-use" guard (409 if > 0).
 *
 * @param typeId - Company type primary key.
 */
export function countTenantsWithType(typeId: number): Promise<number> {
  return prisma.tenant.count({ where: { companyTypeId: typeId } })
}
