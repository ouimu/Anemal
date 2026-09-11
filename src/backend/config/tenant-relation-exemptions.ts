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
