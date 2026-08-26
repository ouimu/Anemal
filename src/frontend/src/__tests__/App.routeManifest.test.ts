/**
 * Route-manifest parity guard (ADR-0026 decision 4).
 *
 * WHY THIS EXISTS — it is not belt-and-braces.
 *
 * @qa-agent's Step 7 mutation battery stripped `RequirePermission` off
 * `/clinic-admin/users` and off `/settings/storage` and the whole frontend
 * suite stayed GREEN. ADR-0026 decision 4 says nav hiding is cosmetic and the
 * route guard is the only authorization boundary — but nothing enforced that,
 * so a guard could be deleted and shipped with a green suite.
 *
 * The rendering tests in App.realRouting.test.tsx cover behaviour, but they can
 * only assert routes they actually visit; the `/settings/storage` strip slipped
 * past them. This asserts the *whole* manifest at once, so removing, renaming,
 * or weakening ANY guard fails here regardless of whether a rendering test
 * happens to visit it.
 *
 * Deliberately source-level rather than render-level. A denial is a routing
 * declaration, and the declaration is what a careless edit deletes.
 *
 * WHEN THIS FAILS: do not "fix" it by pasting the new value in. Confirm the
 * change was intended, and that removing a guard is not being justified by a
 * nav entry now being hidden — that is the exact reasoning decision 4 forbids.
 */
import { describe, it, expect } from 'vitest'
// Vite's ?raw import, not node:fs — the frontend tsconfig has no Node types, so
// readFileSync/fileURLToPath fail `tsc --noEmit` even though vitest runs them.
// vite/client (referenced in vite-env.d.ts) declares the ?raw module shape.
import appSource from '../App.tsx?raw'

/**
 * Ordered, not keyed: `dashboard` appears in two trees with DIFFERENT
 * permissions (`clinic.profile.view` under /clinic-admin, `dashboard.view`
 * under /clinic). A path-keyed map silently collides them and would let one of
 * the two be changed undetected.
 */
const EXPECTED_GUARDS: readonly string[] = [
  // /clinic-admin
  'dashboard => clinic.profile.view',
  'users => staff.view',
  'usage => clinic.profile.view',
  'settings => clinic.profile.view',
  'subscription => clinic.profile.view',
  'blood-bank => bloodbank.view',
  'audit => audit.view',
  'roles => roles.view',
  // /clinic
  'dashboard => dashboard.view',
  'appointments => appointments.view',
  'pets => crm.view',
  'emr => emr.view',
  'inventory => inventory.view',
  'billing => billing.create',
  'transactions => billing.view',
  'vaccinations-due => emr.view',
  'vaccinations-due/record => vaccination.create',
  'inpatient => inpatient.view',
  'grooming => grooming.view',
  // /settings
  'clinic-profile => clinic.profile.view',
  'hours => clinic.hours.edit',
  'notifications => clinic.integrations.edit',
  'payment => clinic.payment.edit',
  'integrations => clinic.integrations.edit',
  'storage => clinic.integrations.edit',
  'storage/connecting => clinic.integrations.edit',
  'branches => clinic.branch.view',
]

function extractGuards(source: string): string[] {
  const re = /<Route\s+path="([^"]+)"\s+element=\{<RequirePermission\s+perm="([^"]+)"/g
  const found: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) found.push(`${m[1]} => ${m[2]}`)
  return found
}

describe('App.tsx route manifest — every guard is declared and unchanged', () => {
  const source = appSource

  it('declares exactly the expected permission guards, in order', () => {
    expect(extractGuards(source)).toEqual([...EXPECTED_GUARDS])
  })

  it('has not lost any guard (count parity — catches a silent strip)', () => {
    expect(extractGuards(source)).toHaveLength(EXPECTED_GUARDS.length)
  })

  it('the extractor itself is falsifiable — it detects a stripped guard', () => {
    // Guards the guard: if the regex silently stopped matching, every
    // assertion above would pass vacuously against an empty list.
    const stripped = source.replace(
      '<Route path="storage"       element={<RequirePermission perm="clinic.integrations.edit"><StoragePage/></RequirePermission>}/>',
      '<Route path="storage"       element={<StoragePage/>}/>',
    )
    expect(stripped).not.toBe(source) // the anchor still exists
    expect(extractGuards(stripped)).not.toEqual([...EXPECTED_GUARDS])
    expect(extractGuards(stripped)).toHaveLength(EXPECTED_GUARDS.length - 1)
  })

  it('no standalone /403 route exists (ADR-0026: denials render in-shell)', () => {
    expect(source).not.toMatch(/path="\/403"/)
  })

  it('each of the three clinic trees declares a nested 403 child route', () => {
    expect(source.match(/path="403"/g) ?? []).toHaveLength(3)
  })
})
