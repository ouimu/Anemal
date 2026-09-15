/**
 * tenant-integrity-scan.ts — XTI-6 (arch §7, grill decision #3; BA sign-off §18, AC-4).
 *
 * The rest of this change (XTI-1..XTI-13) closes the cross-tenant relation leak on the READ side:
 * every relation traversal is now guarded by a tenant predicate, so a corrupt row (one whose own
 * `tenantId` differs from the `tenantId` of the parent row its FK points to) can no longer surface
 * in a response. Arch §7's "invisible-row consequence": that guard also means the corrupt row stops
 * being visible to ANYONE, including its own tenant — a confidentiality fix, not an integrity one.
 * This script is the integrity side: it finds every such row so a human can decide, case by case,
 * what to do about it. It is NOT wired into any request path (arch §7: a read-time signal was
 * rejected at the Step 3.5 grill on performance grounds — see the grill decision recorded in BA
 * sign-off §18 and the plan's XTI-6 task block).
 *
 * Usage (operator, manual/periodic — on demand and after any seed, backfill or restore):
 *   npm run db:integrity-scan
 *
 * Contract (plan XTI-6 acceptance criteria):
 *   - AC-4: reports a known-corrupt row by table/id/tenant pair; the output never contains a PII
 *     field value. This is structural, not disciplinary — the query below never selects anything
 *     but the two id/tenantId columns on each side (arch §7's stated goal for XTI-INV-b).
 *   - Read-only. Never deletes, quarantines, or reassigns a row (grill decision #2 — production-
 *     data remediation is a human, per-row, case-by-case action, not automation).
 *   - The relation list is derived from `Prisma.dmmf`, not hand-maintained, so a model added
 *     tomorrow is covered without editing this file.
 *
 * Relation derivation duplicates the small DMMF-walking helper that XTI-1's analyzer
 * (`tests/unit/tenantRelationConformance.test.ts`) and XTI-2's exemption-registry test
 * (`tests/unit/tenantRelationExemptions.test.ts`) each already carry their own copy of — see the
 * latter's file header: "XTI-6's integrity-scan script derives its own relation map from the same
 * Prisma.dmmf the same way ... established pattern for a second artefact, not a shortcut invented
 * here." This copy additionally needs each relation's actual FK/PK column names
 * (`relationFromFields` / `relationToFields` / the child's own primary key) to build real SQL,
 * which the other two callers never needed.
 */
import { Prisma } from '@prisma/client'
import prisma from '../config/db'

// ---------------------------------------------------------------------------
// DMMF-derived relation discovery (arch A-5 / plan XTI-6 AC: never hand-maintained).
// ---------------------------------------------------------------------------

interface DmmfField {
  name: string
  kind: string
  type: string
  isList: boolean
  isId?: boolean
  isRequired?: boolean
  relationFromFields?: string[]
  relationToFields?: string[]
}
interface DmmfModel {
  name: string
  dbName: string | null
  fields: DmmfField[]
  primaryKey: { fields: string[] } | null
}
interface DmmfLike { datamodel: { models: DmmfModel[] } }

/**
 * One tenant-scoped forward relation to scan: a child model's own FK to a parent model, where
 * both models carry their own `tenantId` scalar column.
 */
export interface ScannedRelation {
  childModel: string
  childTable: string
  childPkColumns: string[]
  fkColumn: string
  parentModel: string
  parentTable: string
  parentPkColumn: string
  relationName: string
}

function hasOwnTenantId(model: DmmfModel): boolean {
  return model.fields.some((f) => f.kind === 'scalar' && f.name === 'tenantId')
}

function tableName(model: DmmfModel): string {
  return model.dbName ?? model.name
}

/**
 * A model's own primary-key column(s) — the composite `@@id` fields when present, otherwise the
 * single scalar field marked `isId`. Needed because not every tenant-scoped model uses `id` as its
 * primary key: some are keyed by `tenantId` itself (excluded below, see next paragraph) and some
 * junction tables (e.g. `UserRole`) use a composite key with no `id` column at all.
 */
function primaryKeyColumns(model: DmmfModel): string[] {
  if (model.primaryKey && model.primaryKey.fields.length > 0) return model.primaryKey.fields
  const idField = model.fields.find((f) => f.isId)
  return idField ? [idField.name] : []
}

/**
 * Every forward relation, derived from `dmmf`, where the child model owns the FK
 * (`relationFromFields` is non-empty on its side) and BOTH the child and the parent model carry
 * their own `tenantId` scalar column — the shape that can go corrupt per arch §7.
 *
 * A relation to a model with no `tenantId` of its own (e.g. `Tenant` itself, or a platform-plane
 * model) is out of scope: there is no "tenantId mismatch" to detect there. This is also why the
 * one-to-one settings tables keyed by `tenantId` itself (`TenantSettings`, `TenantStorageConfig`,
 * `TenantQuota`, `TenantProvisioning`) never reach the composite-PK branch below in practice —
 * their only forward relation is to `Tenant`, which fails the "parent has its own tenantId" test.
 *
 * Pure function of `dmmf` — no DB, no network — so a unit test can assert its output without a
 * live database.
 *
 * @throws if a relation's FK or PK is composite in a shape this script cannot express (none exist
 *   in the schema at the time this was written; fails loudly rather than silently skipping a
 *   relation, per this codebase's fail-closed convention for this analysis class).
 */
export function buildTenantScopedForwardRelations(dmmf: DmmfLike): ScannedRelation[] {
  const byName = new Map(dmmf.datamodel.models.map((m) => [m.name, m]))
  const relations: ScannedRelation[] = []

  for (const model of dmmf.datamodel.models) {
    if (!hasOwnTenantId(model)) continue

    for (const field of model.fields) {
      if (field.kind !== 'object' || field.isList) continue
      const fromFields = field.relationFromFields ?? []
      if (fromFields.length === 0) continue // this side does not own the FK

      const target = byName.get(field.type)
      if (!target || !hasOwnTenantId(target)) continue

      const toFields = field.relationToFields ?? []
      if (fromFields.length !== 1 || toFields.length !== 1) {
        throw new Error(
          `tenant-integrity-scan: composite FK on ${model.name}.${field.name} is not supported`,
        )
      }

      const childPkColumns = primaryKeyColumns(model)
      if (childPkColumns.length === 0) {
        throw new Error(`tenant-integrity-scan: could not resolve a primary key for ${model.name}`)
      }

      relations.push({
        childModel: model.name,
        childTable: tableName(model),
        childPkColumns,
        fkColumn: fromFields[0],
        parentModel: target.name,
        parentTable: tableName(target),
        parentPkColumn: toFields[0],
        relationName: field.name,
      })
    }
  }

  return relations
}

// ---------------------------------------------------------------------------
// Scan execution
// ---------------------------------------------------------------------------

/** One corrupt row: table + row id + both tenant ids. Never a PII field (AC-4). */
export interface IntegrityViolation {
  table: string
  relation: string
  rowId: string
  childTenantId: number
  parentTable: string
  parentTenantId: number
}

interface RawScanRow { rowId: string; childTenantId: number; parentTenantId: number }

/** `c."a"` for a single-column PK, `CONCAT(c."a", ':', c."b")` for a composite one — always a text
 * expression so both shapes fit the same `IntegrityViolation.rowId: string` field. */
function rowIdExpression(alias: string, pkColumns: string[]): string {
  const parts = pkColumns.map((column) => `${alias}."${column}"`)
  return parts.length === 1 ? `${parts[0]}::text` : `CONCAT(${parts.join(", ':', ")})`
}

/**
 * One SELECT per relation (arch §7). Every identifier interpolated here comes from `Prisma.dmmf`,
 * never from a caller — there is no user-controlled value anywhere in this query, so
 * `$queryRawUnsafe` is used only because the identifiers are dynamic, not because any value is.
 *
 * The `IS NOT NULL` guard on both sides matters: `ClinicRole.tenantId`, `SettingsAuditLog.tenantId`
 * and `RefreshToken.tenantId` are nullable by design (a NULL means "shared / not tenant-scoped",
 * e.g. a system role every tenant's users legitimately reference). Comparing a real tenantId
 * against a NULL one with a plain `<>` or `IS DISTINCT FROM` would flag every one of those
 * legitimate references as corrupt. Only a NOT-NULL-vs-NOT-NULL mismatch is an actual violation.
 */
function buildScanQuery(rel: ScannedRelation): string {
  const rowId = rowIdExpression('c', rel.childPkColumns)
  return `
    SELECT ${rowId} AS "rowId", c."tenantId" AS "childTenantId", p."tenantId" AS "parentTenantId"
    FROM "${rel.childTable}" c
    JOIN "${rel.parentTable}" p ON p."${rel.parentPkColumn}" = c."${rel.fkColumn}"
    WHERE c."tenantId" IS NOT NULL
      AND p."tenantId" IS NOT NULL
      AND c."tenantId" <> p."tenantId"
  `
}

type ScanClient = Pick<typeof prisma, '$queryRawUnsafe'>

/**
 * Run the full cross-tenant integrity scan against `client`. One SELECT per tenant-scoped forward
 * relation (derived from `Prisma.dmmf`); reports every child row whose `tenantId` differs from its
 * FK parent's, by table + row id + both tenant ids only. Read-only: never deletes, quarantines, or
 * reassigns anything — remediation is a human, case-by-case, per-row decision (grill decision #2).
 *
 * @param client - Prisma client to scan. Defaults to the shared app instance; a test passes its
 *   own connection to the test database.
 * @returns Every corrupt row found, across every scanned relation. Empty when the database is clean.
 */
export async function scanTenantIntegrity(client: ScanClient = prisma): Promise<IntegrityViolation[]> {
  const relations = buildTenantScopedForwardRelations(Prisma.dmmf as unknown as DmmfLike)
  const violations: IntegrityViolation[] = []

  for (const rel of relations) {
    const rows = await client.$queryRawUnsafe<RawScanRow[]>(buildScanQuery(rel))
    for (const row of rows) {
      violations.push({
        table: rel.childTable,
        relation: rel.relationName,
        rowId: String(row.rowId),
        childTenantId: Number(row.childTenantId),
        parentTable: rel.parentTable,
        parentTenantId: Number(row.parentTenantId),
      })
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// CLI entry point — npm run db:integrity-scan
// ---------------------------------------------------------------------------

function formatViolation(v: IntegrityViolation): string {
  return `  [${v.table}] id=${v.rowId} relation="${v.relation}" childTenantId=${v.childTenantId}` +
    ` -> ${v.parentTable}.tenantId=${v.parentTenantId}`
}

if (require.main === module) {
  const relationCount = buildTenantScopedForwardRelations(Prisma.dmmf as unknown as DmmfLike).length
  scanTenantIntegrity()
    .then((violations) => {
      if (violations.length === 0) {
        console.log(`tenant-integrity-scan: 0 corrupt row(s) found across ${relationCount} relation(s).`)
        return
      }
      console.log(`tenant-integrity-scan: ${violations.length} corrupt row(s) found across ${relationCount} relation(s):`)
      violations.forEach((v) => console.log(formatViolation(v)))
      console.log('\nThis script does not remediate. Each row above needs a human, case-by-case review.')
      process.exitCode = 1
    })
    .catch((err) => { console.error(err); process.exitCode = 1 })
    .finally(async () => { await prisma.$disconnect() })
}
