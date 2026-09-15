// Tenant-relation exemption registry (XTI-2, W0) — arch §4.5, FROZEN shape.
//
// Deliberately outside `src/backend/models/` — that directory holds only `*.repository.ts` and is
// exactly the glob `tenantRelationConformance.test.ts` (XTI-1) scans as its analyzed source set
// (arch §6.2). An exemption registered inside that glob would itself become part of the analyzed
// set; `config/` sits outside it on purpose.
//
// Each entry documents one traversal the analyzer would otherwise report as an unguarded
// cross-tenant relation (R-1/R-2), together with why it is deliberately unguarded. Three rules are
// enforced on this registry itself (arch §6.2.1's rules table, R-5 "registry hygiene"), implemented
// below as pure, independently-testable functions rather than folded into the analyzer's own file:
//   1. An entry with an empty `reason` fails the build.
//   2. An entry that no longer matches a real violation fails the build (stale-exemption guard) —
//      otherwise the registry rots into a permanent allowlist nobody re-checks.
//   3. Adding an entry is the only way to pass with an unguarded traversal, and it shows up in the
//      diff — there is no other escape hatch.

/** One exemption entry. All four fields are required and must be non-empty — enforced by
 * `checkExemptionRegistryHygiene` below, not by the type system (a `""` is a valid `string`). */
export interface TenantRelationExemption {
  file: string
  fn: string
  relationPath: string
  reason: string
}

/**
 * The minimal shape of an analyzer finding this registry can be matched against. Deliberately
 * duck-typed rather than importing `Violation` from `tests/unit/tenantRelationConformance.test.ts`:
 * that keeps this `config/` module free of any dependency on a test file, so it stays usable from
 * production code (a future ESLint rule, per arch §6.1) without pulling test-only wiring along.
 * `analyzeTenantRelationConformance`'s real `Violation` values satisfy this shape structurally.
 */
export interface ExemptableFinding {
  file: string
  fn: string
  relationPath: string
}

/**
 * The single known exemption (E-1, arch §4.5): `reminder.repository.ts`'s `listAllDue` is the
 * background dispatcher's deliberate system-context scan across all tenants' due reminders. Every
 * *write* the dispatcher performs afterwards (`markSent`, `claimPending`) is still pinned to the
 * reminder's own `tenantId`, so the exemption covers only this one read traversal, never a write.
 */
export const TENANT_RELATION_EXEMPTIONS: TenantRelationExemption[] = [
  {
    file: 'reminder.repository.ts',
    fn: 'listAllDue',
    relationPath: 'pet',
    reason:
      "E-1: background dispatcher system-context scan, deliberately cross-tenant; every write is " +
      "pinned to the reminder's own tenantId (markSent/claim). Covered by AC-6.",
  },
  // platform-plane repository reads: no tenantId in the plane by design (E-5) — entries added in W0
  // (none needed yet — platform-plane R-1/R-2 findings surfaced so far are all `unresolvable spread`
  // shape-(f) findings on models with no tenantId, i.e. never fire under R-1/R-2 by construction;
  // see arch §6.2.1's `platform-audit.listPlatformAuditLogs` note for the one that will need an
  // entry, resolved in W1d, not here).

  // --- XTI-10 (W1d) ---------------------------------------------------------
  // E-6: `ClinicRole.tenantId` is NULLABLE BY DESIGN — system roles (clinic_admin/doctor/
  // clinic_staff, the seeded default for nearly every user) are stored with `tenantId = NULL`
  // and are shared across every tenant (arch §A.3(c), the "B-4 case": `User.roleRef` and
  // `UserRole.role` are explicitly named there as blocked by this same nullable parent). A
  // literal `roleRef: { is: { tenantId } }` / `role: { is: { tenantId } }` mirror would exclude
  // every user whose primary role is a system template (i.e. almost all users), so it cannot be
  // added without a functional regression. CORRECTED TWICE (XTI-14 @db-agent veto, 2nd pass):
  // the previous version of this comment claimed "`roleRef`/`role` are non-nullable relations...
  // there is no guard shape that expresses [the nullable-tenantId case]" — both false, checked
  // against the schema and the live analyzer. `User.roleRef` IS a nullable relation field
  // (`schema.prisma:229`, `ClinicRole?`) — it is simply never null AT RUNTIME because the backing
  // scalar `User.roleId` is `Int` NOT NULL (`schema.prisma:213`). And a guard shape DOES exist and
  // IS accepted by the analyzer today: `OR: [{ roleRef: { is: { tenantId: null } } }, { roleRef:
  // { is: { tenantId } } }]` (an explicit `tenantId: null` literal — not a null relation check —
  // passes `getKeyState`'s key-presence test, verified against `tenantRelationConformance.test.ts`).
  // CORRECTED A THIRD TIME (XTI-14 @db-agent veto, 3rd pass) — the tally and the grouping
  // above were both wrong. There are **8** E-6 sites below, not 9, and they split into three
  // groups, not two:
  //   - **6 sites take the OR guard mechanically, today, with no analyzer change**:
  //     `findUserById`, `updateUser` (the `findFirst` at line ~105, not the sibling
  //     `updateMany`), `findUserRolesWithDetails`, `updateUserBranch`,
  //     `auth.findUserByTenantUsername`, `auth.findUserById`. One of these — `findUserByTenantUsername`
  //     — is the LOGIN path: filtering out a corrupt-role row turns a corrupt `roleId` into a
  //     failed sign-in instead of a leaked role name. That is a product decision (fail closed
  //     on login), not a mechanical edit, and must be surfaced when this ships, not silently
  //     folded into "apply the guard".
  //   - **`findUsers` is NOT blocked** (an earlier version of this comment wrongly said it
  //     was, needing `checkOrFallback` to recognize `OR` nested inside `AND`). Its existing
  //     branch filter (`OR: [{ userBranches: { some: { branchId } } }, { userBranches: { none: {} } }]`)
  //     can move inside `AND: [{ OR: [...branch...] }]`, freeing the root `OR` for the tenant
  //     guard — a one-line restructure, zero analyzer change, lands today like the other 6.
  //   - **`createUserWithRoleTx` is the one site genuinely blocked**, and for a different
  //     reason than "the analyzer can't see it": it is a `prisma.user.create(...)`, and a
  //     Prisma `create` call has no `where` clause at all — there is nowhere to attach an OR
  //     guard, mechanical or otherwise. Its remedy is a different shape entirely (drop
  //     `include: { roleRef: true }` from the create and re-read the role separately, or trust
  //     the already-validated `roleId` from the write-path guarantee below).
  // A corrupt `roleId` pointing at ANOTHER TENANT'S CUSTOM role (not a system template) is a
  // real residual leak at all 8 sites today — held shut only by `User.roleId`/`UserRole.roleId`
  // being set exclusively via role.repository.ts writes that already scope custom roles to
  // tenantId (`createRole`) or resolve system roles by key (`findSystemRoleByKey`): a
  // write-path guarantee, not a read-side one. E-6 is scheduled follow-up work (apply the
  // guard to the 6, restructure `findUsers`, redesign `createUserWithRoleTx`'s read), not a
  // clean structural exemption — track it as its own backlog item, separate from the
  // analyzer's to-many-nesting gap (that one is a detection blind spot; this one is a live
  // data-isolation leak, a different risk class).
  {
    file: 'user.repository.ts', fn: 'findUsers', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },
  {
    file: 'user.repository.ts', fn: 'findUserById', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },
  {
    file: 'user.repository.ts', fn: 'createUserWithRoleTx', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },
  {
    file: 'user.repository.ts', fn: 'updateUser', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },
  {
    file: 'user.repository.ts', fn: 'findUserRolesWithDetails', relationPath: 'role',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above ' +
      '(this is the UserRole.role case arch §A.3(c) names explicitly).',
  },
  {
    file: 'user.repository.ts', fn: 'updateUserBranch', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },
  {
    file: 'auth.repository.ts', fn: 'findUserByTenantUsername', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role (this is the login path — it would break ' +
      'sign-in for every user on a default role). See the E-6 block comment above.',
  },
  {
    file: 'auth.repository.ts', fn: 'findUserById', relationPath: 'roleRef',
    reason: 'E-6: ClinicRole.tenantId is nullable for shared system-role templates; a literal ' +
      'mirror would exclude every user on a system role. See the E-6 block comment above.',
  },

  // E-7: `platform-customers.repository.ts#getTenantWithPlanAndQuota` reads a single tenant's own
  // optional 1:1 `TenantSettings`/`TenantQuota` row (`TenantSettings.tenantId` and
  // `TenantQuota.tenantId` are each `@unique`/`@id` on the SAME `id` this function already filters
  // `where: { id }` by, so the related row — when it exists — cannot belong to any tenant other
  // than this one; there is no traversal to a different tenant to guard against). Both relations
  // are optional (a newly-provisioned tenant may not have a settings/quota row yet), so the guard
  // shape would be the nullable-relation OR-fallback (`OR: [{ settings: { is: null } }, { settings:
  // { is: { tenantId: id } } }]`) — this one COULD be expressed that way (unlike E-6's roleRef/role,
  // `settings`/`quota` genuinely are nullable relations), but it would be pure ceremony: the related
  // row is keyed on the same `id` this function already filters by, so `settings.tenantId` can only
  // ever equal `id` or not exist — there is no OTHER tenant's row it could possibly resolve to.
  // Exempted as a real no-tenant-to-check case, not a workaround. Most of the other ~60 findings
  // originally reported against this file (every
  // other `Tenant` relation — users/owners/pets/appointments/…) were a SEPARATE, now-fixed defect
  // (the analyzer's resolver didn't unwrap `as const`, so `TENANT_SELECT`'s spread read as
  // unresolvable and every Tenant relation was flagged as "possibly hidden" even though none of
  // them are actually selected) — see the `TENANT_SELECT`/`ADMIN_USER_SELECT` comments in
  // platform-customers.repository.ts; only these two genuine, harmless findings remain.
  {
    file: 'platform-customers.repository.ts', fn: 'getTenantWithPlanAndQuota', relationPath: 'settings',
    reason: 'E-7: optional 1:1 TenantSettings row keyed on the SAME tenant id this function already ' +
      'filters by; cannot belong to another tenant. See the E-7 block comment above.',
  },
  {
    file: 'platform-customers.repository.ts', fn: 'getTenantWithPlanAndQuota', relationPath: 'quota',
    reason: 'E-7: optional 1:1 TenantQuota row keyed on the SAME tenant id this function already ' +
      'filters by; cannot belong to another tenant. See the E-7 block comment above.',
  },
]

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1]
}

function matchesExemption(exemption: TenantRelationExemption, finding: ExemptableFinding): boolean {
  return (
    basename(finding.file) === exemption.file &&
    finding.fn === exemption.fn &&
    finding.relationPath === exemption.relationPath
  )
}

/** True when `finding` is covered by at least one registry entry. `finding.file` may be an absolute
 * path or a bare filename — matched by basename, since the analyzer reports absolute paths. */
export function isExempted(
  finding: ExemptableFinding,
  exemptions: TenantRelationExemption[] = TENANT_RELATION_EXEMPTIONS,
): boolean {
  return exemptions.some((exemption) => matchesExemption(exemption, finding))
}

/** The shape of the split a caller (the analyzer's checkpoint, or any future ESLint rule per arch
 * §6.1) applies on top of the analyzer's raw output: findings the registry excuses, and everything
 * still enforced. */
export interface ExemptionPartition<T extends ExemptableFinding> {
  remaining: T[]
  exempted: T[]
}

/** Splits `findings` into [remaining, exempted] against the registry. */
export function partitionExemptFindings<T extends ExemptableFinding>(
  findings: T[],
  exemptions: TenantRelationExemption[] = TENANT_RELATION_EXEMPTIONS,
): ExemptionPartition<T> {
  const remaining: T[] = []
  const exempted: T[] = []
  for (const finding of findings) {
    if (isExempted(finding, exemptions)) exempted.push(finding)
    else remaining.push(finding)
  }
  return { remaining, exempted }
}

/** R-5 registry hygiene (arch §6.2.1 rules table): every entry must carry a non-empty `reason`, and
 * must still match at least one finding in `currentFindings` — an entry matching nothing is stale
 * and must be deleted rather than left as a permanent allowlist. */
export interface ExemptionHygieneReport {
  emptyReason: TenantRelationExemption[]
  stale: TenantRelationExemption[]
}

export function checkExemptionRegistryHygiene<T extends ExemptableFinding>(
  exemptions: TenantRelationExemption[],
  currentFindings: T[],
): ExemptionHygieneReport {
  const emptyReason = exemptions.filter((exemption) => exemption.reason.trim().length === 0)
  const stale = exemptions.filter(
    (exemption) => !currentFindings.some((finding) => matchesExemption(exemption, finding)),
  )
  return { emptyReason, stale }
}

/** True only when the registry passes both hygiene rules against `currentFindings`. */
export function isExemptionRegistryHealthy<T extends ExemptableFinding>(
  exemptions: TenantRelationExemption[],
  currentFindings: T[],
): boolean {
  const report = checkExemptionRegistryHygiene(exemptions, currentFindings)
  return report.emptyReason.length === 0 && report.stale.length === 0
}
