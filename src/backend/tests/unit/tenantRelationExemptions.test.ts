/**
 * tenantRelationExemptions.test.ts — XTI-2 (W0): proves the exemption registry
 * (`src/backend/config/tenant-relation-exemptions.ts`) actually wires into XTI-1's analyzer output,
 * per arch §4.5 and the plan's XTI-2 acceptance criteria.
 *
 * Split into two halves:
 *   1. Registry-hygiene rules (R-5, arch §6.2.1's rules table) tested against synthetic findings —
 *      no dependency on the analyzer, so these are exact and fast.
 *   2. A live wiring test against the REAL `analyzeTenantRelationConformance` (XTI-1) output for
 *      today's `models/`, proving the registry's one seeded entry (E-1, `reminder.repository.ts`
 *      `listAllDue`) actually matches and suppresses a real finding — not a finding invented for
 *      this test.
 *
 * Note on the import below: `analyzeTenantRelationConformance` is exported from
 * `tenantRelationConformance.test.ts` itself (arch §6.1 — "the exported signature
 * `(sourceFiles, relationMap) => Violation[]` is unchanged", explicitly meant to be reusable). This
 * file imports only that function and its published types — it does not modify that file. Because
 * that module is itself a Jest test file, importing it re-registers its own `describe`/`it` blocks
 * under this file's run too (a Jest quirk of importing one test file from another); those 14 tests
 * are pure and deterministic, so they simply pass twice — once under their own file, once nested
 * here — with no effect on correctness. This file does not touch XTI-1's fixtures or resolver.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Prisma } from '@prisma/client'
import {
  analyzeTenantRelationConformance,
  type SourceFileInput,
  type RelationInfo,
  type RelationMap,
  type Violation,
} from './tenantRelationConformance.test'
import {
  TENANT_RELATION_EXEMPTIONS,
  isExempted,
  partitionExemptFindings,
  checkExemptionRegistryHygiene,
  isExemptionRegistryHealthy,
  type TenantRelationExemption,
} from '../../config/tenant-relation-exemptions'

// ---------------------------------------------------------------------------
// Minimal, independent DMMF-derived relation map (arch A-5: never hand-maintained).
// Duplicated rather than imported from tenantRelationConformance.test.ts because that file does
// not export `buildRelationMap` — it is not part of the frozen public seam (arch §6.1 freezes only
// `analyzeTenantRelationConformance`'s signature). XTI-6's integrity-scan script derives its own
// relation map from the same `Prisma.dmmf` the same way, so this duplication is the established
// pattern for a second artefact, not a shortcut invented here.
// ---------------------------------------------------------------------------

interface DmmfField { name: string; kind: string; type: string; isList: boolean }
interface DmmfModel { name: string; dbName: string | null; fields: DmmfField[] }
interface DmmfLike { datamodel: { models: DmmfModel[] } }

function clientAccessor(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

function buildRelationMap(dmmf: DmmfLike): RelationMap {
  const byName = new Map(dmmf.datamodel.models.map((m) => [m.name, m]))
  const map: RelationMap = new Map()
  for (const model of dmmf.datamodel.models) {
    const relations: RelationInfo[] = []
    for (const field of model.fields) {
      if (field.kind !== 'object') continue
      const target = byName.get(field.type)
      if (!target) continue
      const targetHasTenantId = target.fields.some((f) => f.kind === 'scalar' && f.name === 'tenantId')
      relations.push({ name: field.name, isList: field.isList, targetModel: field.type, targetHasTenantId })
    }
    map.set(clientAccessor(model.name), relations)
  }
  return map
}

const MODELS_DIR = path.join(__dirname, '../../models')

function readAllModels(): SourceFileInput[] {
  return fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.repository.ts'))
    .map((f) => ({ fileName: path.join(MODELS_DIR, f), sourceText: fs.readFileSync(path.join(MODELS_DIR, f), 'utf8') }))
}

describe('tenant-relation-exemptions registry (XTI-2)', () => {
  describe('registry hygiene (R-5, arch §6.2.1) — synthetic findings, no analyzer dependency', () => {
    const validFinding: Violation = {
      file: 'reminder.repository.ts',
      fn: 'listAllDue',
      line: 43,
      rule: 'R-2',
      relationPath: 'pet',
      message: 'root `where` has no mirrored tenant predicate at pet',
    }

    it('a well-formed registry with a matching finding is healthy', () => {
      // Local single-entry registry, not the real TENANT_RELATION_EXEMPTIONS — this block tests
      // hygiene RULES in isolation (arch §6.2.1's rule table), so it must not depend on how many
      // real entries the actual registry happens to hold today. Checking the real registry against
      // only one synthetic finding would flag every other real entry as "stale" (no matching finding
      // passed), which is a test-isolation bug, not a registry defect — the real registry's own
      // health is proved separately below in "the registry is healthy against today's real findings".
      const localRegistry: TenantRelationExemption[] = [
        { file: 'reminder.repository.ts', fn: 'listAllDue', relationPath: 'pet', reason: 'E-1: deliberate cross-tenant background dispatcher read' },
      ]
      const report = checkExemptionRegistryHygiene(localRegistry, [validFinding])
      expect(report.emptyReason).toHaveLength(0)
      expect(report.stale).toHaveLength(0)
      expect(isExemptionRegistryHealthy(localRegistry, [validFinding])).toBe(true)
    })

    it('an entry with an empty reason fails the hygiene check', () => {
      const withEmptyReason: TenantRelationExemption[] = [
        { file: 'reminder.repository.ts', fn: 'listAllDue', relationPath: 'pet', reason: '' },
      ]
      const report = checkExemptionRegistryHygiene(withEmptyReason, [validFinding])
      expect(report.emptyReason).toHaveLength(1)
      expect(isExemptionRegistryHealthy(withEmptyReason, [validFinding])).toBe(false)
    })

    it('a whitespace-only reason also fails the hygiene check', () => {
      const withBlankReason: TenantRelationExemption[] = [
        { file: 'reminder.repository.ts', fn: 'listAllDue', relationPath: 'pet', reason: '   ' },
      ]
      expect(checkExemptionRegistryHygiene(withBlankReason, [validFinding]).emptyReason).toHaveLength(1)
    })

    it('an entry that matches no real finding is stale and fails the hygiene check', () => {
      const staleEntry: TenantRelationExemption[] = [
        { file: 'nothing.repository.ts', fn: 'doesNotExist', relationPath: 'nowhere', reason: 'no longer applies' },
      ]
      const report = checkExemptionRegistryHygiene(staleEntry, [validFinding])
      expect(report.stale).toHaveLength(1)
      expect(isExemptionRegistryHealthy(staleEntry, [validFinding])).toBe(false)
    })

    it('isExempted matches by basename, so an absolute file path is accepted', () => {
      const absoluteFinding: Violation = { ...validFinding, file: 'C:\\repo\\src\\backend\\models\\reminder.repository.ts' }
      expect(isExempted(absoluteFinding, TENANT_RELATION_EXEMPTIONS)).toBe(true)
    })

    it('isExempted does not match a different function or relation path on the same file', () => {
      expect(isExempted({ ...validFinding, fn: 'list' }, TENANT_RELATION_EXEMPTIONS)).toBe(false)
      expect(isExempted({ ...validFinding, relationPath: 'owner' }, TENANT_RELATION_EXEMPTIONS)).toBe(false)
    })
  })

  describe('live wiring against the real analyzer (arch §6.1 seam, current models/)', () => {
    const relationMap = buildRelationMap(Prisma.dmmf as unknown as DmmfLike)
    const violations = analyzeTenantRelationConformance(readAllModels(), relationMap)

    it('the real analyzer still reports the E-1 traversal as a violation before any exemption is applied', () => {
      // Grounds the rest of this block in a real, not invented, finding — reminder.repository.ts's
      // listAllDue is R-2-flagged on `pet` today (verified: 138 total baseline violations at time
      // of writing), which is exactly what the E-1 entry exists to exempt.
      const hit = violations.find(
        (v) => v.file.endsWith('reminder.repository.ts') && v.fn === 'listAllDue' && v.relationPath === 'pet',
      )
      expect(hit).toBeDefined()
      expect(hit?.rule).toBe('R-2')
    })

    it('the E-1 entry suppresses that finding: it lands in `exempted`, not `remaining`', () => {
      const { remaining, exempted } = partitionExemptFindings(violations, TENANT_RELATION_EXEMPTIONS)
      const suppressed = exempted.some(
        (v) => v.file.endsWith('reminder.repository.ts') && v.fn === 'listAllDue' && v.relationPath === 'pet',
      )
      const stillEnforced = remaining.some(
        (v) => v.file.endsWith('reminder.repository.ts') && v.fn === 'listAllDue' && v.relationPath === 'pet',
      )
      expect(suppressed).toBe(true)
      expect(stillEnforced).toBe(false)
      expect(remaining.length).toBe(violations.length - exempted.length)
    })

    it('the registry is healthy against today\'s real findings (no stale entries, no empty reasons)', () => {
      expect(isExemptionRegistryHealthy(TENANT_RELATION_EXEMPTIONS, violations)).toBe(true)
    })
  })
})
