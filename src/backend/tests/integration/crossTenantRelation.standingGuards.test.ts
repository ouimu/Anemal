/**
 * XTI-13 standing guards — the criteria that are not "one shape of read", and that
 * have to keep holding after this branch ships:
 *
 *   AC-5 (read half)  the conformance analyzer FAILS on a repository read added later
 *                     that follows a tenant-scoped relation without a guard
 *   AC-6              the reminder background dispatcher's deliberate cross-tenant scan
 *                     still works — the exemption was not "fixed" by mistake in W1/W2
 *   AC-10             no comment in vaccination.repository.ts claims findDueSoonWorklist
 *                     is tenant-guarded unless it is
 *
 * WHY AC-5's ENFORCEMENT ASSERTION LIVES HERE AND NOT IN XTI-1's OWN SUITE
 * `tenantRelationConformance.test.ts` was written in W0, before any repository was
 * fixed, so its real-models case deliberately only PRINTS the violation list — its
 * closing assertion is `expect(Array.isArray(violations)).toBe(true)`, which cannot
 * fail. That was correct in W0 (the list was the W1 work order) and is exactly what
 * the W1 exit checkpoint says must now read zero. Nothing in the plan assigns the
 * flip, so the "enforcement point" AC-5 names would today accept a brand-new unguarded
 * read: it would be printed and the suite would stay green. The assertion below closes
 * that, in QA's own file rather than by editing another task's exclusive scope.
 *
 * The analyzer is imported from XTI-1's test module (arch §6.1 froze it as one exported
 * function so exactly this kind of reuse is possible). Its own `describe` blocks are
 * suppressed during the require so they do not re-register — and therefore re-run —
 * inside this file.
 */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import {
  TENANT_RELATION_EXEMPTIONS, partitionExemptFindings, checkExemptionRegistryHygiene,
} from '../../config/tenant-relation-exemptions'
import * as reminderRepo from '../../models/reminder.repository'
import prisma from '../../config/db'

// --- analyzer import without re-registering XTI-1's suite -------------------------
type Violation = { file: string; fn: string; relationPath: string; rule: string; line: number; message: string }
type SourceFileInput = { fileName: string; sourceText: string }
/* eslint-disable @typescript-eslint/no-explicit-any */
const analyzerModule = (() => {
  const g = global as any
  const realDescribe = g.describe
  g.describe = () => undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../unit/tenantRelationConformance.test')
  } finally {
    g.describe = realDescribe
  }
})()
const analyze = analyzerModule.analyzeTenantRelationConformance as
  (files: SourceFileInput[], relationMap: unknown) => Violation[]
const buildRelationMapFromDmmf = (() => {
  // buildRelationMap is module-private in XTI-1's file; rebuild the same structure from
  // Prisma.dmmf here rather than loosening that module's exports.
  return () => {
    const map = new Map<string, { name: string; isList: boolean; targetModel: string; targetHasTenantId: boolean }[]>()
    const dmmf = Prisma.dmmf as any
    const byName = new Map<string, any>(dmmf.datamodel.models.map((m: any) => [m.name, m]))
    for (const model of dmmf.datamodel.models) {
      const relations: { name: string; isList: boolean; targetModel: string; targetHasTenantId: boolean }[] = []
      for (const field of model.fields) {
        if (field.kind !== 'object') continue
        const target = byName.get(field.type)
        if (!target) continue
        relations.push({
          name: field.name,
          isList: field.isList,
          targetModel: field.type,
          targetHasTenantId: target.fields.some((f: any) => f.kind === 'scalar' && f.name === 'tenantId'),
        })
      }
      map.set(model.name.charAt(0).toLowerCase() + model.name.slice(1), relations)
    }
    return map
  }
})()
/* eslint-enable @typescript-eslint/no-explicit-any */

const relationMap = buildRelationMapFromDmmf()
const MODELS_DIR = path.join(__dirname, '../../models')

function readAllModels(): SourceFileInput[] {
  return fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.repository.ts'))
    .map((f) => ({ fileName: path.join(MODELS_DIR, f), sourceText: fs.readFileSync(path.join(MODELS_DIR, f), 'utf8') }))
}

/** Analyzes an in-memory source — a "repository read someone adds tomorrow". */
function analyzeSnippet(sourceText: string): Violation[] {
  return analyze([{ fileName: path.join(MODELS_DIR, 'future.repository.ts'), sourceText }], relationMap)
}

describe('XTI-13 standing guard — AC-5: the analyzer fails a NEW unguarded repository read', () => {
  it('is actually wired up — the imported analyzer runs and XTI-1\'s own suite did not re-register', () => {
    expect(typeof analyze).toBe('function')
    expect(relationMap.size).toBeGreaterThan(10)
  })

  it('a new UNGUARDED forward (to-one) read is reported', () => {
    const violations = analyzeSnippet(`
      import prisma from '../config/db'
      export function findVaccinationsTomorrow(tenantId: number) {
        return prisma.vaccination.findMany({ where: { tenantId }, include: { pet: true } })
      }
    `)
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.some((v) => v.relationPath === 'pet' && v.rule === 'R-2')).toBe(true)
  })

  it('a new UNGUARDED reverse (to-many) read is reported', () => {
    const violations = analyzeSnippet(`
      import prisma from '../config/db'
      export function findPetTomorrow(tenantId: number, id: number) {
        return prisma.pet.findFirst({ where: { id, tenantId }, include: { vaccinations: true } })
      }
    `)
    expect(violations.some((v) => v.relationPath === 'vaccinations' && v.rule === 'R-1')).toBe(true)
  })

  it('DOCUMENTED GAP — the analyzer does NOT see a relation nested inside a to-many include', () => {
    // This is the shape that actually shipped a leak. `medical-record.repository.ts` wrote
    // `prescriptions: { where: { tenantId }, include: { drug: true } }` — the to-many WAS
    // guarded, but the to-one hanging off it was not, and a corrupt prescription returned
    // another tenant's whole InventoryItem row. Fixed in the real file (drug's tenantId now
    // mirrors into prescriptions's own `where`, per ADR-0027 dialect 1 one level deeper) —
    // see crossTenantRelation.nonPiiT4.test.ts, which proves the fix over real HTTP responses
    // and is the actual regression guard for this vulnerability class.
    //
    // This test exists to record, not to enforce: the STATIC analyzer (XTI-1) does not
    // currently walk into a relation nested inside an already-guarded to-many's own include.
    // AC-5 ("a new unguarded read added later fails the analyzer") does NOT hold for this
    // specific shape — a second occurrence of "to-many include hiding an unguarded to-one"
    // would ship silently past XTI-1's mechanism, the same way this one did. The HTTP-level
    // test is the only thing currently catching this class; it catches known shapes, not new
    // ones. Extending the analyzer to walk to-many includes recursively is real, scoped
    // follow-up work (arch/XTI-1 owns it) — out of scope for this already-large change to
    // reopen (the analyzer's resolution model was already through two ponytail gate rounds).
    // If this assertion ever flips to catching it, update this test's title and comment —
    // don't just delete it.
    const violations = analyzeSnippet(`
      import prisma from '../config/db'
      export function findRecordTomorrow(tenantId: number, id: number) {
        return prisma.medicalRecord.findFirst({
          where: { id, tenantId },
          include: { prescriptions: { where: { tenantId }, include: { drug: true } } },
        })
      }
    `)
    const paths = violations.map((v) => v.relationPath)
    expect(paths.some((p) => p.includes('drug'))).toBe(false)
  })

  it('the GUARDED equivalents are not reported — the detector is not a blanket "always fail"', () => {
    expect(analyzeSnippet(`
      import prisma from '../config/db'
      export function findVaccinationsTomorrow(tenantId: number) {
        return prisma.vaccination.findMany({ where: { tenantId, pet: { is: { tenantId } } }, include: { pet: true } })
      }
    `)).toHaveLength(0)
    expect(analyzeSnippet(`
      import prisma from '../config/db'
      export function findPetTomorrow(tenantId: number, id: number) {
        return prisma.pet.findFirst({ where: { id, tenantId }, include: { vaccinations: { where: { tenantId } } } })
      }
    `)).toHaveLength(0)
  })

  it('ENFORCEMENT: current models/ has zero violations that the exemption registry does not excuse', () => {
    const violations = analyzeSnippet('') && analyze(readAllModels(), relationMap)
    const { remaining, exempted } = partitionExemptFindings(violations)
    if (remaining.length) {
      // eslint-disable-next-line no-console
      console.error('\nUNEXCUSED tenant-relation violations in models/:\n'
        + remaining.map((v) => `  ${path.basename(v.file)}:${v.line} [${v.rule}] ${v.fn}() -> ${v.relationPath}`).join('\n'))
    }
    expect(remaining.map((v) => `${path.basename(v.file)}#${v.fn}->${v.relationPath}`)).toEqual([])
    expect(exempted.length).toBe(violations.length)
  })

  it('R-5 registry hygiene: no empty reason, and no entry that has gone stale', () => {
    const violations = analyze(readAllModels(), relationMap)
    const report = checkExemptionRegistryHygiene(TENANT_RELATION_EXEMPTIONS, violations)
    expect(report.emptyReason).toEqual([])
    expect(report.stale.map((e) => `${e.file}#${e.fn}->${e.relationPath}`)).toEqual([])
  })
})

describe('XTI-13 standing guard — AC-6: the reminder dispatcher\'s cross-tenant scan still works', () => {
  const created: number[] = []
  let tenantIds: number[] = []

  beforeAll(async () => {
    // Two throwaway tenants, each with one pending reminder due today. listAllDue() is
    // system-context and must see BOTH — that is the E-1 exemption's whole point.
    const stamp = Date.now().toString(36)
    for (const tag of ['r1', 'r2']) {
      const tenant = await prisma.tenant.create({ data: { name: `XTI13 rem ${tag}`, subdomain: `xti13-rem-${tag}-${stamp}` } })
      const owner = await prisma.owner.create({ data: { tenantId: tenant.id, firstName: `Rem${tag}`, lastName: 'Owner', phone: `09${tag}${stamp}`.slice(0, 20) } })
      const pet = await prisma.pet.create({ data: { tenantId: tenant.id, ownerId: owner.id, name: `RemPet${tag}`, species: 'Dog' } })
      const rem = await prisma.petReminder.create({
        data: { tenantId: tenant.id, petId: pet.id, reminderType: 'vaccination', message: `due ${tag}`, dueDate: new Date(), status: 'pending' },
      })
      created.push(rem.id)
      tenantIds.push(tenant.id)
    }
  }, 120_000)

  afterAll(async () => {
    if (!tenantIds.length) return
    const w = { where: { tenantId: { in: tenantIds } } }
    await prisma.petReminder.deleteMany(w)
    await prisma.pet.deleteMany(w)
    await prisma.owner.deleteMany(w)
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    tenantIds = []
  }, 120_000)

  it('listAllDue() returns pending reminders from MORE THAN ONE tenant', async () => {
    const due = await reminderRepo.listAllDue()
    const ids = due.map((r) => r.id)
    for (const id of created) expect(ids).toContain(id)
    const distinctTenants = new Set(due.map((r) => r.tenantId))
    expect(distinctTenants.size).toBeGreaterThan(1)
  })

  it('the exemption registry still covers it — the scan is deliberate, not forgotten', () => {
    const entry = TENANT_RELATION_EXEMPTIONS.find(
      (e) => e.file === 'reminder.repository.ts' && e.fn === 'listAllDue' && e.relationPath === 'pet',
    )
    expect(entry).toBeDefined()
    expect(entry!.reason.trim().length).toBeGreaterThan(0)
  })

  it('every dispatcher WRITE is still pinned to the reminder\'s own tenantId', async () => {
    // claimPending on the WRONG tenant must not claim the row (HI-02).
    const [first, second] = created
    const wrongTenant = tenantIds[1]
    const row = await prisma.petReminder.findUniqueOrThrow({ where: { id: first }, select: { tenantId: true } })
    expect(row.tenantId).not.toBe(wrongTenant)

    const stolen = await reminderRepo.claimPending(wrongTenant, first)
    expect(stolen).toBeFalsy()
    const afterSteal = await prisma.petReminder.findUniqueOrThrow({ where: { id: first }, select: { status: true } })
    expect(afterSteal.status).toBe('pending')

    // and the correct tenant still can
    const claimed = await reminderRepo.claimPending(row.tenantId, first)
    expect(claimed).toBeTruthy()
    expect(second).toBeGreaterThan(0)
  })
})

describe('XTI-13 standing guard — AC-10: no comment claims findDueSoonWorklist is guarded unless it is', () => {
  const VAX = path.join(MODELS_DIR, 'vaccination.repository.ts')
  const source = fs.readFileSync(VAX, 'utf8')

  /**
   * Returns whole comment BLOCKS, not single lines. Contiguous `//` lines are one
   * comment and have to be judged together: read line by line, the XTI-4 correction
   * paragraph — which quotes the false claim in order to retract it — looks like it is
   * still making the claim.
   */
  function commentsOf(text: string): string[] {
    const blocks: string[] = []
    let current: string[] = []
    for (const line of text.split('\n')) {
      const lineComment = line.match(/\/\/.*$/)
      if (lineComment) { current.push(lineComment[0]); continue }
      if (current.length) { blocks.push(current.join('\n')); current = [] }
    }
    if (current.length) blocks.push(current.join('\n'))
    const blockComments: string[] = text.match(/\/\*[\s\S]*?\*\//g) ?? []
    return blocks.concat(blockComments)
  }

  it('the function IS in fact tenant-guarded — both raw-SQL variants carry the predicate', () => {
    const fnStart = source.indexOf('export function findDueSoonWorklist')
    expect(fnStart).toBeGreaterThan(-1)
    const body = source.slice(fnStart)
    // Two `$queryRaw` template literals (branch-pinned and all-branches).
    const rawCount = (body.match(/\$queryRaw</g) ?? []).length
    expect(rawCount).toBe(2)
    // Every JOIN onto a tenant-scoped table must carry a tenantId predicate in its ON clause.
    const joins = body.match(/JOIN\s+(pets|owners)\s+\w+\s+ON[^\n]*/g) ?? []
    expect(joins.length).toBeGreaterThanOrEqual(4)
    for (const join of joins) expect(join).toMatch(/"tenantId"\s*=\s*\$\{tenantId\}/)
  })

  it('no comment asserts the function is guarded by something it is not', () => {
    const suspect = commentsOf(source).filter((c) =>
      /findDueSoonWorklist/.test(c) && /guard|tenantId join|explicit tenant/i.test(c))
    for (const comment of suspect) {
      // The false claim BA F-1 caught was "the explicit tenantId join guards in
      // findDueSoonWorklist" written while those joins had no predicate. A comment may
      // reference the guard only alongside the correction that records the history.
      expect(comment).toMatch(/XTI-4|XTI-8|CORRECTION|was false|not tenant-guarded/)
    }
  })

  it('the comment does not leave the reader with a stale "not yet guarded" claim either', () => {
    // The inverse of F-1: the W0 correction said "until XTI-8 lands, do not assume this
    // function is tenant-guarded". XTI-8 has landed (asserted above), so a comment still
    // telling the reader it is unguarded is now the misleading one.
    const stale = commentsOf(source).filter((c) =>
      /until that lands|do not assume this function is tenant-guarded|have no tenantId predicate/i.test(c))
    expect(stale).toEqual([])
  })
})
