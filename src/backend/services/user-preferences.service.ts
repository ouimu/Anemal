// Personal preferences service (Phase 1.5-B, Task S2.3).
// Per-user settings: UI language and default calendar view. Tenant-scoped reads
// and writes — userId AND tenantId both come from the verified JWT.

import * as userRepo from '../models/user.repository'
import { NotFoundError } from '../utils/errors'

export interface PersonalPreferences {
  language:            string
  defaultCalendarView: string
}

export interface PersonalPreferencesInput {
  language?:            string
  defaultCalendarView?: string
}

export async function getPreferences(tenantId: number, userId: number): Promise<PersonalPreferences> {
  const prefs = await userRepo.getPreferences(tenantId, userId)
  if (!prefs) throw new NotFoundError('User')
  return prefs
}

export async function updatePreferences(
  tenantId: number,
  userId: number,
  data: PersonalPreferencesInput,
): Promise<PersonalPreferences> {
  const { count } = await userRepo.updatePreferences(tenantId, userId, data)
  if (count === 0) throw new NotFoundError('User')
  return getPreferences(tenantId, userId)
}
