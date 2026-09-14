/**
 * tenantRelationConformance.test.ts — XTI-1 (W0), the conformance-test analyzer.
 *
 * Per arch §6.2/§6.2.1 (`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md`,
 * rev 3) and ADR-0027's enforcement paragraph: this is the mechanical, fail-closed check that a
 * tenant-scoped relation is only ever followed — or written — with a tenant predicate attached at
 * the point of traversal (XTI-INV, restated as a code rule in arch §3.1).
 *
 * Unit tier — no database, no network (`architecture-rules.md` §8.1). Pure source analysis:
 *   1. The relation map is DERIVED at runtime from `Prisma.dmmf.datamodel.models` — never
 *      hand-maintained (arch A-5).
 *   2. The source set is `src/backend/models/*.repository.ts`, parsed with the TypeScript
 *      compiler API (`ts.createSourceFile` per file — no `ts.createProgram`, no type-checker,
 *      per arch §6.2.1 "resolution scope equals analysis scope").
 *
 * The resolution model (arch §6.2.1) is bounded, and the boundary is published rather than left
 * implicit — that omission is exactly what sent the first draft of this design back at Step 3.4b:
 *   (a) same-module call expression whose body ends in a single terminal `return <object literal>`
 *   (b) same-module `const X = <object literal>` (a `let`, or a non-literal initializer, is NOT this)
 *   (c) cross-module identifier, but ONLY if the import resolves to another `models/*.repository.ts`
 *       file in the analyzed set — an import from anywhere else fails closed
 *   (d) a conditional spread (`...(x ? {y} : {})`) is additive-only: a guard found literally passes
 *       regardless of a spread, UNLESS the guard is absent (might be hiding in an unresolvable
 *       spread) or an unresolvable spread sits positionally AFTER the guard key (might override it)
 *   (e) a conditional *value* (`cond ? A : B`) — both branches are checked independently; any
 *       failing branch is a violation
 *   (f) a mutable accumulator (`where['k'] = v`) is UNRESOLVABLE — fails closed, named cost (arch
 *       §6.2.1, "the fail-closed consequences")
 *
 * The six fixtures below (arch §6.3) prove the detector detects: two unguarded (exactly 1 violation
 * each, on the correct rule), two guarded (0 violations — without these, a detector that always
 * reports a violation would pass), one proving the resolver actually resolves shapes (a)+(b), and
 * one proving it fails closed on shapes (e)+(f) rather than silently passing what it cannot read.
 *
 * The "current models/" block at the bottom is NOT an assertion of zero violations — W1 has not run
 * yet. It is the analyzer's first real output, and per the plan (§0), that printout IS W1's work
 * order, not an estimate.
 */

import * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Public types — the frozen seam other tooling (e.g. a future ESLint rule,
// per arch §6.1) would import against.
// ---------------------------------------------------------------------------

export interface SourceFileInput {
  fileName: string
  sourceText: string
}

export interface RelationInfo {
  name: string
  isList: boolean
  targetModel: string
  targetHasTenantId: boolean
}

export type RelationMap = Map<string, RelationInfo[]>

export interface Violation {
  file: string
  fn: string
  line: number
  rule: 'R-1' | 'R-2' | 'R-3' | 'R-4'
  relationPath: string
  message: string
}

// ---------------------------------------------------------------------------
// Resolution model (arch §6.2.1) — internal
// ---------------------------------------------------------------------------

type ResolvedNode =
  | { kind: 'object'; obj: ResolvedObject }
  | { kind: 'array'; elements: ResolvedNode[] }
  | { kind: 'true' }
  | { kind: 'other' }
  | { kind: 'conditional'; branches: ResolvedNode[] }
  | { kind: 'unresolved' }

interface ResolvedObject {
  props: Map<string, { node: ts.Expression; index: number; resolved: ResolvedNode }>
  unresolvedSpreadIndices: number[]
}

interface ModuleSymbols {
  functions: Map<string, ts.FunctionDeclaration>
  consts: Map<string, ts.Expression>
  imports: Map<string, { modulePath: string; importedName: string }>
}

interface AnalysisContext {
  symbolsByFile: Map<string, ModuleSymbols>
  sourceFilesByBasename: Map<string, string>
}

interface FunctionWhereCapture {
  fileName: string
  fnName: string
  line: number
  whereResolved: ResolvedNode
}

const EMPTY_OBJECT_RESOLVED: ResolvedNode = { kind: 'object', obj: { props: new Map(), unresolvedSpreadIndices: [] } }

// ---------------------------------------------------------------------------
// Symbol table construction — flat, keyed by file, over the analyzed set only
// (arch §6.2.1: "resolution scope equals analysis scope").
// ---------------------------------------------------------------------------

function buildSymbolTable(files: { fileName: string; sf: ts.SourceFile }[]): AnalysisContext {
  const symbolsByFile = new Map<string, ModuleSymbols>()
  const sourceFilesByBasename = new Map<string, string>()

  for (const { fileName, sf } of files) {
    const mod: ModuleSymbols = { functions: new Map(), consts: new Map(), imports: new Map() }
    sf.forEachChild((stmt) => collectTopLevelDeclaration(stmt, mod))
    symbolsByFile.set(fileName, mod)
    sourceFilesByBasename.set(path.basename(fileName), fileName)
  }

  return { symbolsByFile, sourceFilesByBasename }
}

function collectTopLevelDeclaration(stmt: ts.Node, mod: ModuleSymbols): void {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    mod.functions.set(stmt.name.text, stmt)
    return
  }
  if (ts.isVariableStatement(stmt)) {
    const isConst = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0
    if (!isConst) return
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) mod.consts.set(decl.name.text, decl.initializer)
    }
    return
  }
  if (ts.isImportDeclaration(stmt)) collectImport(stmt, mod)
}

function collectImport(stmt: ts.ImportDeclaration, mod: ModuleSymbols): void {
  const bindings = stmt.importClause?.namedBindings
  if (!bindings || !ts.isNamedImports(bindings)) return
  const modulePath = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : ''
  for (const el of bindings.elements) {
    const importedName = (el.propertyName ?? el.name).text
    mod.imports.set(el.name.text, { modulePath, importedName })
  }
}

// ---------------------------------------------------------------------------
// Expression resolution — shapes (a)-(f)
// ---------------------------------------------------------------------------

function unwrapParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

function resolveExpr(exprIn: ts.Expression, fileName: string, ctx: AnalysisContext, depth = 0): ResolvedNode {
  if (depth > 12) return { kind: 'unresolved' } // bounded resolution — not a general data-flow analysis
  const expr = unwrapParens(exprIn)

  if (ts.isObjectLiteralExpression(expr)) return { kind: 'object', obj: resolveObjectLiteral(expr, fileName, ctx, depth) }
  if (ts.isArrayLiteralExpression(expr)) {
    return { kind: 'array', elements: expr.elements.map((el) => resolveExpr(el, fileName, ctx, depth + 1)) }
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true' }
  if (ts.isConditionalExpression(expr)) {
    return {
      kind: 'conditional',
      branches: [resolveExpr(expr.whenTrue, fileName, ctx, depth + 1), resolveExpr(expr.whenFalse, fileName, ctx, depth + 1)],
    }
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) return resolveCall(expr.expression.text, fileName, ctx, depth)
  if (ts.isIdentifier(expr)) return resolveIdentifier(expr.text, fileName, ctx, depth)
  return { kind: 'other' }
}

/** Shape (a) — resolves only a same-module function ending in a single terminal `return <object literal>`. */
function resolveCall(calleeName: string, fileName: string, ctx: AnalysisContext, depth: number): ResolvedNode {
  const body = ctx.symbolsByFile.get(fileName)?.functions.get(calleeName)?.body
  if (!body) return { kind: 'unresolved' }
  const last = body.statements[body.statements.length - 1]
  if (last && ts.isReturnStatement(last) && last.expression && ts.isObjectLiteralExpression(last.expression)) {
    return resolveExpr(last.expression, fileName, ctx, depth + 1)
  }
  return { kind: 'unresolved' } // multiple returns, a non-literal return, or a mutated accumulator
}

/** Shapes (b) and (c) — same-module const, or a const imported from another file in the analyzed set. */
function resolveIdentifier(name: string, fileName: string, ctx: AnalysisContext, depth: number): ResolvedNode {
  const mod = ctx.symbolsByFile.get(fileName)
  if (!mod) return { kind: 'unresolved' }
  const localConst = mod.consts.get(name)
  if (localConst) return resolveExpr(localConst, fileName, ctx, depth + 1)
  const imported = resolveImportedConst(name, mod, ctx)
  if (imported) return resolveExpr(imported.node, imported.fileName, ctx, depth + 1)
  return { kind: 'unresolved' } // import from outside the analyzed set (utils/, config/, @prisma/client, ...)
}

function resolveImportedConst(name: string, mod: ModuleSymbols, ctx: AnalysisContext): { node: ts.Expression; fileName: string } | null {
  const imp = mod.imports.get(name)
  if (!imp) return null
  const targetFile = ctx.sourceFilesByBasename.get(`${path.basename(imp.modulePath)}.ts`)
  if (!targetFile) return null
  const targetConst = ctx.symbolsByFile.get(targetFile)?.consts.get(imp.importedName)
  return targetConst ? { node: targetConst, fileName: targetFile } : null
}

function resolveObjectLiteral(node: ts.ObjectLiteralExpression, fileName: string, ctx: AnalysisContext, depth: number): ResolvedObject {
  const props: ResolvedObject['props'] = new Map()
  const unresolvedSpreadIndices: number[] = []
  let index = 0

  for (const element of node.properties) {
    if (ts.isPropertyAssignment(element)) {
      addProperty(props, element.name, element.initializer, index, fileName, ctx, depth)
    } else if (ts.isShorthandPropertyAssignment(element)) {
      if (!props.has(element.name.text)) props.set(element.name.text, { node: element.name, index, resolved: { kind: 'other' } })
    } else if (ts.isSpreadAssignment(element)) {
      if (resolveSpreadInto(props, element.expression, index, fileName, ctx, depth)) unresolvedSpreadIndices.push(index)
    }
    index += 1
  }
  return { props, unresolvedSpreadIndices }
}

function addProperty(
  props: ResolvedObject['props'], nameNode: ts.PropertyName, initializer: ts.Expression,
  index: number, fileName: string, ctx: AnalysisContext, depth: number,
): void {
  const key = ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) ? nameNode.text : null
  if (key === null) return
  props.set(key, { node: initializer, index, resolved: resolveExpr(initializer, fileName, ctx, depth + 1) })
}

/** Shape (d) — additive-only. Returns true if this spread could not be fully read (fail-closed marker). */
function resolveSpreadInto(
  props: ResolvedObject['props'], spreadExpr: ts.Expression, index: number,
  fileName: string, ctx: AnalysisContext, depth: number,
): boolean {
  const expr = unwrapParens(spreadExpr)
  if (ts.isConditionalExpression(expr)) {
    const trueOk = mergeBranchIfObject(props, expr.whenTrue, index, fileName, ctx, depth)
    const falseOk = mergeBranchIfObject(props, expr.whenFalse, index, fileName, ctx, depth)
    return !trueOk || !falseOk
  }
  const resolved = resolveExpr(expr, fileName, ctx, depth + 1)
  if (resolved.kind !== 'object') return true
  mergeProps(props, resolved.obj.props, index)
  return false
}

function mergeBranchIfObject(
  props: ResolvedObject['props'], branch: ts.Expression, index: number,
  fileName: string, ctx: AnalysisContext, depth: number,
): boolean {
  const b = unwrapParens(branch)
  if (!ts.isObjectLiteralExpression(b)) return false
  mergeProps(props, resolveObjectLiteral(b, fileName, ctx, depth + 1).props, index)
  return true
}

function mergeProps(target: ResolvedObject['props'], source: ResolvedObject['props'], index: number): void {
  for (const [k, v] of source) {
    if (!target.has(k)) target.set(k, { node: v.node, index, resolved: v.resolved })
  }
}

/**
 * A key is 'present' only if literal AND no unresolvable spread sits after it (could override it).
 * Absent with an unresolvable spread anywhere ⇒ 'unresolved' (might be hiding inside it). This is
 * shape (d)'s two fail-closed cases (arch §6.2.1), in one place.
 */
function getKeyState(obj: ResolvedObject, key: string): 'present' | 'absent' | 'unresolved' {
  const found = obj.props.get(key)
  if (found) return obj.unresolvedSpreadIndices.some((i) => i > found.index) ? 'unresolved' : 'present'
  return obj.unresolvedSpreadIndices.length > 0 ? 'unresolved' : 'absent'
}

function clientAccessor(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

// ---------------------------------------------------------------------------
// R-1 (to-many) / R-2 (to-one) — evaluated per include/select key, never per
// arbitrary `where`-clause scalar (plan §3.1's binding instruction for XTI-1).
// ---------------------------------------------------------------------------

function checkIncludeSelect(
  node: ResolvedNode, relations: RelationInfo[], fullMap: RelationMap, whereRoot: ResolvedNode,
  pathPrefix: string[], fileName: string, fn: string, line: number, violations: Violation[],
): void {
  if (node.kind === 'unresolved') {
    for (const rel of relations) {
      if (rel.targetHasTenantId) pushViolation(violations, fileName, fn, line, rel.isList ? 'R-1' : 'R-2', [...pathPrefix, rel.name], 'include/select value is unresolvable')
    }
    return
  }
  if (node.kind !== 'object') return
  for (const rel of relations) {
    if (rel.targetHasTenantId) checkOneRelation(rel, node.obj, fullMap, whereRoot, pathPrefix, fileName, fn, line, violations)
  }
}

function checkOneRelation(
  rel: RelationInfo, includeObj: ResolvedObject, fullMap: RelationMap, whereRoot: ResolvedNode,
  pathPrefix: string[], fileName: string, fn: string, line: number, violations: Violation[],
): void {
  const state = getKeyState(includeObj, rel.name)
  if (state === 'absent') return
  const relPath = [...pathPrefix, rel.name]
  if (state === 'unresolved') {
    pushViolation(violations, fileName, fn, line, rel.isList ? 'R-1' : 'R-2', relPath, 'relation key may be hidden behind an unresolvable spread')
    return
  }
  const value = includeObj.props.get(rel.name)!.resolved
  if (rel.isList) {
    checkR1(value, relPath, fileName, fn, line, violations)
    return
  }
  checkR2(whereRoot, relPath, fileName, fn, line, violations)
  recurseNested(value, rel, fullMap, whereRoot, relPath, fileName, fn, line, violations)
}

function recurseNested(
  value: ResolvedNode, rel: RelationInfo, fullMap: RelationMap, whereRoot: ResolvedNode,
  relPath: string[], fileName: string, fn: string, line: number, violations: Violation[],
): void {
  const nestedRelations = fullMap.get(clientAccessor(rel.targetModel))
  if (!nestedRelations) return
  const branches = value.kind === 'conditional' ? value.branches : [value]
  for (const branch of branches) {
    if (branch.kind !== 'object') continue
    const nested = branch.obj.props.get('include') ?? branch.obj.props.get('select')
    if (nested) checkIncludeSelect(nested.resolved, nestedRelations, fullMap, whereRoot, relPath, fileName, fn, line, violations)
  }
}

/** R-1 — shape (e): both branches of a conditional value are checked independently. */
function checkR1(value: ResolvedNode, relPath: string[], fileName: string, fn: string, line: number, violations: Violation[]): void {
  const branches = value.kind === 'conditional' ? value.branches : [value]
  for (const branch of branches) checkR1Branch(branch, relPath, fileName, fn, line, violations)
}

function checkR1Branch(branch: ResolvedNode, relPath: string[], fileName: string, fn: string, line: number, violations: Violation[]): void {
  if (branch.kind === 'unresolved') {
    pushViolation(violations, fileName, fn, line, 'R-1', relPath, 'to-many include has an unresolvable value')
    return
  }
  if (branch.kind === 'true') {
    pushViolation(violations, fileName, fn, line, 'R-1', relPath, 'to-many include is `true` — no nested `where` at all')
    return
  }
  if (branch.kind !== 'object') {
    pushViolation(violations, fileName, fn, line, 'R-1', relPath, 'to-many include value is not an object literal')
    return
  }
  const wp = branch.obj.props.get('where')
  const tenantState = wp && wp.resolved.kind === 'object' ? getKeyState(wp.resolved.obj, 'tenantId') : 'absent'
  if (tenantState !== 'present') pushViolation(violations, fileName, fn, line, 'R-1', relPath, 'nested `where` has no `tenantId` predicate')
}

/** R-2 — the guard lives in the root `where`, mirroring the include path; the include VALUE is irrelevant. */
function checkR2(whereRoot: ResolvedNode, relPath: string[], fileName: string, fn: string, line: number, violations: Violation[]): void {
  if (hasGuardAtPath(whereRoot, relPath) !== 'present') {
    pushViolation(violations, fileName, fn, line, 'R-2', relPath, `root \`where\` has no mirrored tenant predicate at ${relPath.join('.')}`)
  }
}

function hasGuardAtPath(whereRoot: ResolvedNode, relPath: string[]): 'present' | 'absent' | 'unresolved' {
  if (whereRoot.kind === 'unresolved') return 'unresolved'
  if (whereRoot.kind !== 'object') return 'absent'
  let cur = whereRoot.obj

  for (let i = 0; i < relPath.length; i++) {
    const segment = relPath[i]
    const literalState = getKeyState(cur, segment)

    if (literalState === 'unresolved') return 'unresolved'

    if (literalState === 'absent') {
      // Only the FIRST segment may be satisfied via the nullable-FK OR fallback
      // (E-4/AC-7): `OR: [{ seg: { is: null } }, { seg: { is: { tenantId, ... } } }]` at
      // the root — a segment beyond index 0 has no equivalent OR-at-this-level escape.
      if (i !== 0) return 'absent'
      const orMatch = checkOrFallback(cur, segment)
      if (orMatch === 'absent' || orMatch === 'unresolved') return orMatch
      if (i === relPath.length - 1) return getKeyState(orMatch, 'tenantId')
      cur = orMatch
      continue
    }

    const relProp = cur.props.get(segment)!
    if (relProp.resolved.kind !== 'object') return 'absent'
    const isState = getKeyState(relProp.resolved.obj, 'is')
    if (isState !== 'present') return isState
    const isValue = relProp.resolved.obj.props.get('is')!.resolved
    if (isValue.kind !== 'object') return isValue.kind === 'unresolved' ? 'unresolved' : 'absent'
    if (i === relPath.length - 1) return getKeyState(isValue.obj, 'tenantId')
    cur = isValue.obj
  }
  return 'absent'
}

/**
 * Nullable-FK fallback (E-4/AC-7): `OR: [{ seg: { is: null } }, { seg: { is: { tenantId, ... } } }]`
 * at the root. Returns the matched branch's inner `is` object — not just a boolean — so
 * `hasGuardAtPath` can keep walking a further-nested relation mirrored inside that same OR branch
 * (the two-level T1 sites, e.g. `pet: { is: { tenantId, owner: { is: { tenantId } } } }`, need this;
 * collapsing straight to a 'present'/'absent' verdict here would silently stop checking the nested
 * segment instead of reporting it missing).
 */
function checkOrFallback(rootObj: ResolvedObject, segment: string): 'absent' | 'unresolved' | ResolvedObject {
  if (getKeyState(rootObj, 'OR') !== 'present') return 'absent'
  const orResolved = rootObj.props.get('OR')!.resolved
  if (orResolved.kind === 'unresolved') return 'unresolved'
  if (orResolved.kind !== 'array') return 'absent'
  for (const el of orResolved.elements) {
    if (el.kind !== 'object') continue
    const matched = orBranchGuardsSegment(el.obj, segment)
    if (matched) return matched
  }
  return 'absent'
}

function orBranchGuardsSegment(branchObj: ResolvedObject, segment: string): ResolvedObject | null {
  if (getKeyState(branchObj, segment) !== 'present') return null
  const segResolved = branchObj.props.get(segment)!.resolved
  if (segResolved.kind !== 'object' || getKeyState(segResolved.obj, 'is') !== 'present') return null
  const isVal = segResolved.obj.props.get('is')!.resolved
  if (isVal.kind !== 'object' || getKeyState(isVal.obj, 'tenantId') !== 'present') return null
  return isVal.obj
}

function pushViolation(
  violations: Violation[], file: string, fn: string, line: number,
  rule: Violation['rule'], relPath: string[], message: string,
): void {
  violations.push({ file, fn, line, rule, relationPath: relPath.join('.'), message })
}

// ---------------------------------------------------------------------------
// R-3 — raw SQL. Regex over the template literal text, not a SQL parser
// (arch §6.2.1: over-reporting is the correct failure direction here).
// ---------------------------------------------------------------------------

function checkRawSql(
  templateText: string, fileName: string, fn: string, line: number,
  tableToModel: Map<string, { hasTenantId: boolean }>, violations: Violation[],
): void {
  const joinRegex = /\bJOIN\s+"?(\w+)"?\s+(?:AS\s+)?(\w+)\s+ON\s+([\s\S]*?)(?=\bJOIN\b|\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|`)/gi
  let match: RegExpExecArray | null
  while ((match = joinRegex.exec(templateText)) !== null) {
    const tableName = match[1].toLowerCase()
    const onClause = match[3]
    const info = tableToModel.get(tableName)
    if (info?.hasTenantId && !/tenantid/i.test(onClause)) {
      pushViolation(violations, fileName, fn, line, 'R-3', [tableName], `raw-SQL JOIN ${tableName} has no tenantId predicate in its ON clause`)
    }
  }
}

// ---------------------------------------------------------------------------
// R-4 — findX/countX pairing, narrowed (arch §5): each query is checked
// against its OWN resolved `where`; no shared builder expression is required.
// ---------------------------------------------------------------------------

function applyR4(captures: FunctionWhereCapture[], violations: Violation[]): void {
  const byFile = new Map<string, FunctionWhereCapture[]>()
  for (const c of captures) byFile.set(c.fileName, [...(byFile.get(c.fileName) ?? []), c])

  for (const list of byFile.values()) {
    const finds = list.filter((c) => /^find/i.test(c.fnName))
    const counts = list.filter((c) => /^count/i.test(c.fnName))
    for (const f of finds) checkFindCountPair(f, counts, violations)
  }
}

function checkFindCountPair(find: FunctionWhereCapture, counts: FunctionWhereCapture[], violations: Violation[]): void {
  const suffix = find.fnName.replace(/^find/i, '').toLowerCase()
  const pairedCount = counts.find((c) => c.fnName.replace(/^count/i, '').toLowerCase() === suffix)
  if (!pairedCount) return
  const findKeys = relationFilterKeys(find.whereResolved)
  const countKeys = relationFilterKeys(pairedCount.whereResolved)
  for (const key of findKeys) {
    if (!countKeys.has(key)) {
      pushViolation(
        violations, pairedCount.fileName, pairedCount.fnName, pairedCount.line, 'R-4', [key],
        `${find.fnName} guards relation '${key}' in its root where, but ${pairedCount.fnName} does not carry an equivalent predicate`,
      )
    }
  }
}

function relationFilterKeys(node: ResolvedNode): Set<string> {
  const keys = new Set<string>()
  if (node.kind === 'object') {
    for (const [k, v] of node.obj.props) {
      if (v.resolved.kind === 'object' && getKeyState(v.resolved.obj, 'is') === 'present') keys.add(k)
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// AST walk — one Prisma call expression / raw-SQL template at a time.
// ---------------------------------------------------------------------------

function functionNameOf(node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  return null
}

function handlePrismaCall(
  node: ts.CallExpression, sf: ts.SourceFile, fileName: string, fn: string, ctx: AnalysisContext,
  relationMap: RelationMap, violations: Violation[], whereCaptures: FunctionWhereCapture[],
): void {
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee) || !ts.isPropertyAccessExpression(callee.expression)) return
  const modelAccessor = callee.expression.name.text
  const receiver = callee.expression.expression
  if (!ts.isIdentifier(receiver) || !['prisma', 'tx', 'client'].includes(receiver.text)) return
  const relations = relationMap.get(modelAccessor)
  const arg = node.arguments[0]
  if (!relations || !arg || !ts.isObjectLiteralExpression(arg)) return

  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  const resolvedArg = resolveObjectLiteral(arg, fileName, ctx, 0)
  const whereProp = resolvedArg.props.get('where')
  const includeProp = resolvedArg.props.get('include') ?? resolvedArg.props.get('select')
  const whereResolved = whereProp ? whereProp.resolved : EMPTY_OBJECT_RESOLVED

  if (includeProp) checkIncludeSelect(includeProp.resolved, relations, relationMap, whereResolved, [], fileName, fn, line, violations)
  whereCaptures.push({ fileName, fnName: fn, line, whereResolved })
}

function handleRawSqlTemplate(
  node: ts.TaggedTemplateExpression, sf: ts.SourceFile, fileName: string, fn: string,
  tableToModel: Map<string, { hasTenantId: boolean }>, violations: Violation[],
): void {
  const tag = node.tag
  if (!ts.isPropertyAccessExpression(tag) || !/^\$(queryRaw|executeRaw)/.test(tag.name.text)) return
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  checkRawSql(node.template.getText(sf), fileName, fn, line, tableToModel, violations)
}

function walkFile(
  sf: ts.SourceFile, fileName: string, ctx: AnalysisContext, relationMap: RelationMap,
  tableToModel: Map<string, { hasTenantId: boolean }>, violations: Violation[], whereCaptures: FunctionWhereCapture[],
): void {
  const fnStack: string[] = []
  const currentFn = (): string => fnStack[fnStack.length - 1] ?? '(module)'

  function visit(node: ts.Node): void {
    let pushedFn = false
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const name = functionNameOf(node)
      if (name) { fnStack.push(name); pushedFn = true }
    }
    if (ts.isCallExpression(node)) handlePrismaCall(node, sf, fileName, currentFn(), ctx, relationMap, violations, whereCaptures)
    if (ts.isTaggedTemplateExpression(node)) handleRawSqlTemplate(node, sf, fileName, currentFn(), tableToModel, violations)
    ts.forEachChild(node, visit)
    if (pushedFn) fnStack.pop()
  }

  visit(sf)
}

// ---------------------------------------------------------------------------
// DMMF-derived inputs (arch A-5) — never hand-maintained.
// ---------------------------------------------------------------------------

interface DmmfField { name: string; kind: string; type: string; isList: boolean }
interface DmmfModel { name: string; dbName: string | null; fields: DmmfField[] }
interface DmmfLike { datamodel: { models: DmmfModel[] } }

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

function buildTableToModelMap(dmmf: DmmfLike): Map<string, { hasTenantId: boolean }> {
  const map = new Map<string, { hasTenantId: boolean }>()
  for (const model of dmmf.datamodel.models) {
    const table = (model.dbName ?? model.name).toLowerCase()
    map.set(table, { hasTenantId: model.fields.some((f) => f.kind === 'scalar' && f.name === 'tenantId') })
  }
  return map
}

// ---------------------------------------------------------------------------
// The one exported function — `(sourceFiles, relationMap) => Violation[]`.
// The signature is frozen (arch §6.1): a future ESLint rule can import it
// with no redesign, if CI is ever introduced. Not built now.
// ---------------------------------------------------------------------------

/**
 * Analyze `sourceFiles` for R-1…R-4 violations of XTI-INV (a tenant-scoped relation is only
 * followed, or written, with a tenant predicate attached at the point of traversal).
 *
 * Pure function: no DB, no network, no filesystem access. `relationMap` is derived once by the
 * caller from `Prisma.dmmf` (see `buildRelationMap` usage below) so this function never needs a
 * live Prisma client. R-3's raw-SQL table→model mapping is read directly from `Prisma.dmmf`
 * (the only other permitted input, per arch §6.1 — "TS compiler API + Prisma.dmmf only").
 */
export function analyzeTenantRelationConformance(sourceFiles: SourceFileInput[], relationMap: RelationMap): Violation[] {
  const violations: Violation[] = []
  const whereCaptures: FunctionWhereCapture[] = []
  const parsed = sourceFiles.map((f) => ({ fileName: f.fileName, sf: ts.createSourceFile(f.fileName, f.sourceText, ts.ScriptTarget.ES2020, true) }))
  const ctx = buildSymbolTable(parsed)
  const tableToModel = buildTableToModelMap(Prisma.dmmf as unknown as DmmfLike)

  for (const { fileName, sf } of parsed) walkFile(sf, fileName, ctx, relationMap, tableToModel, violations, whereCaptures)
  applyR4(whereCaptures, violations)
  return violations
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, '../fixtures/tenant-conformance')
const MODELS_DIR = path.join(__dirname, '../../models')

function readFixture(name: string): SourceFileInput {
  const fileName = path.join(FIXTURES_DIR, name)
  return { fileName, sourceText: fs.readFileSync(fileName, 'utf8') }
}

function readAllModels(): SourceFileInput[] {
  return fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.repository.ts'))
    .map((f) => ({ fileName: path.join(MODELS_DIR, f), sourceText: fs.readFileSync(path.join(MODELS_DIR, f), 'utf8') }))
}

describe('tenantRelationConformance analyzer (XTI-1)', () => {
  const relationMap = buildRelationMap(Prisma.dmmf as unknown as DmmfLike)

  describe('fixtures — proving the detector detects (arch §6.3)', () => {
    it('unguarded-forward: exactly 1 violation, rule R-2, relation "pet"', () => {
      const violations = analyzeTenantRelationConformance([readFixture('unguarded-forward.fixture.ts')], relationMap)
      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('R-2')
      expect(violations[0].relationPath).toBe('pet')
    })

    it('unguarded-reverse: exactly 1 violation, rule R-1, relation "vaccinations"', () => {
      const violations = analyzeTenantRelationConformance([readFixture('unguarded-reverse.fixture.ts')], relationMap)
      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('R-1')
      expect(violations[0].relationPath).toBe('vaccinations')
    })

    it('guarded-forward: 0 violations', () => {
      const violations = analyzeTenantRelationConformance([readFixture('guarded-forward.fixture.ts')], relationMap)
      expect(violations).toHaveLength(0)
    })

    it('guarded-reverse: 0 violations', () => {
      const violations = analyzeTenantRelationConformance([readFixture('guarded-reverse.fixture.ts')], relationMap)
      expect(violations).toHaveLength(0)
    })

    it('guarded-via-builder: 0 violations — proves the resolver resolves shapes (a) and (b)', () => {
      const violations = analyzeTenantRelationConformance([readFixture('guarded-via-builder.fixture.ts')], relationMap)
      expect(violations).toHaveLength(0)
    })

    it('unresolvable-accumulator: exactly 2 violations — proves the resolver fails closed on shapes (e) and (f)', () => {
      const violations = analyzeTenantRelationConformance([readFixture('unresolvable-accumulator.fixture.ts')], relationMap)
      expect(violations).toHaveLength(2)
      expect(violations.map((v) => v.rule).sort()).toEqual(['R-1', 'R-2'])
    })
  })

  describe('zero false positives on scalar-only where clauses (plan §3.1 binding instruction)', () => {
    // R-1/R-2 are evaluated per relation field on an include/select object, never per arbitrary
    // identifier or scalar expression inside a `where` — by construction, this analyzer never
    // even looks at a scalar filter like `data.petId` unless it is also a literal relation key.
    // Spot-checked here against a representative sample of the ~20 known scalar-only sites.
    const modelsViolations = analyzeTenantRelationConformance(readAllModels(), relationMap)

    it.each([
      ['owner.repository.ts', 'findOwnerByPhone'],
      ['owner.repository.ts', 'findOwnerByIdCard'],
      ['owner.repository.ts', 'countActivePetsForOwner'],
      ['owner.repository.ts', 'deactivateOwner'],
      ['vaccination.repository.ts', 'findPet'],
      ['vaccination.repository.ts', 'createVaccination'],
      ['pet.repository.ts', 'updatePetPhotoUrl'],
    ])('%s#%s never registers a violation for a scalar-only filter', (file, fn) => {
      const hit = modelsViolations.find((v) => v.file.endsWith(file) && v.fn === fn)
      expect(hit).toBeUndefined()
    })
  })

  describe('current models/ — the W0 → W1 integration checkpoint', () => {
    it('prints the full violation list against current models/ (this IS the W1 work order, not an assertion of zero)', () => {
      const violations = analyzeTenantRelationConformance(readAllModels(), relationMap)
      const report = violations
        .map((v) => `  ${path.basename(v.file)}:${v.line} [${v.rule}] ${v.fn}() -> ${v.relationPath} (${v.message})`)
        .join('\n')
      // eslint-disable-next-line no-console -- required output for the W0->W1 checkpoint (plan §5, XTI-1 AC)
      console.log(`\ntenantRelationConformance: ${violations.length} violation(s) against current models/\n${report}\n`)
      expect(Array.isArray(violations)).toBe(true)
    })
  })
})
