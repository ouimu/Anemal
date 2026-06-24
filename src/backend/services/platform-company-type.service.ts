/**
 * Platform company-type service — business logic for managing the
 * company_types reference table on the platform plane.
 *
 * Company types are global reference data (no tenant scope). Platform admins
 * create and maintain these; tenants reference them via companyTypeId.
 *
 * @module platform-company-type.service
 */

import { AppError } from '../utils/errors'
import * as companyTypeRepo from '../models/company-type.repository'
import type {
  CompanyTypeRow,
  CreateCompanyTypeData,
  UpdateCompanyTypeData,
} from '../models/company-type.repository'

/** Thrown when a requested company type does not exist. */
export class CompanyTypeNotFoundError extends AppError {
  constructor() {
    super(404, 'Company type not found', 'COMPANY_TYPE_NOT_FOUND')
  }
}

/** Thrown when a key is already taken. */
export class CompanyTypeKeyConflictError extends AppError {
  constructor() {
    super(409, 'A company type with this key already exists', 'COMPANY_TYPE_KEY_CONFLICT')
  }
}

/** Thrown when attempting to delete a type that is still in use. */
export class CompanyTypeInUseError extends AppError {
  constructor(count: number) {
    super(409, `Cannot delete: ${count} tenant(s) still use this company type`, 'COMPANY_TYPE_IN_USE')
  }
}

/**
 * Return all company types (active and inactive) for the platform admin view.
 */
export async function listCompanyTypes(): Promise<CompanyTypeRow[]> {
  return companyTypeRepo.getAllCompanyTypes()
}

/**
 * Create a new company type.
 * Validates key uniqueness before inserting.
 *
 * @param data - Key, nameEn, nameTh, and optional sortOrder.
 */
export async function createCompanyType(data: CreateCompanyTypeData): Promise<CompanyTypeRow> {
  const existing = await companyTypeRepo.findCompanyTypeByKey(data.key)
  if (existing) throw new CompanyTypeKeyConflictError()
  return companyTypeRepo.createCompanyType(data)
}

/**
 * Update an existing company type's metadata.
 * Validates that the record exists before updating.
 *
 * @param id   - Company type primary key.
 * @param data - Partial update fields.
 */
export async function updateCompanyType(id: number, data: UpdateCompanyTypeData): Promise<CompanyTypeRow> {
  const existing = await companyTypeRepo.findCompanyTypeById(id)
  if (!existing) throw new CompanyTypeNotFoundError()
  return companyTypeRepo.updateCompanyType(id, data)
}

/**
 * Soft-delete a company type.
 * Rejects with 409 if any tenants are still assigned to this type.
 *
 * @param id - Company type primary key.
 */
export async function deleteCompanyType(id: number): Promise<void> {
  const existing = await companyTypeRepo.findCompanyTypeById(id)
  if (!existing) throw new CompanyTypeNotFoundError()

  const count = await companyTypeRepo.countTenantsWithType(id)
  if (count > 0) throw new CompanyTypeInUseError(count)

  await companyTypeRepo.softDeleteCompanyType(id)
}
