# QA Sign-off — Backend ESLint Setup

**Branch:** `chore/backend-eslint-setup`
**Merge-base:** `b1cc638`  ·  **HEAD:** `df23bc4`
**Date:** 2026-08-27
**Reviewer:** @qa-agent (Standard Pipeline Step 7)
**Worktree:** `D:\Development\Anemal-eslint-review`

> **Process note.** This branch was built outside the normal pipeline (no BA sign-off,
> no `/grill-with-docs`) and was retroactively approved by @ponytail-agent (7/7) on the
> human's explicit decision. This sign-off reviews **what was built**, not the process
> deviation. The deviation itself is recorded here for the audit trail and is not
> re-litigated. Context: the round-1 sign-off of `fix/role-service-tenant-scope`
> (`2026-08-27-role-service-tenant-scope-qa-signoff.md` §3 B-3) flagged exactly this
> work riding uncommitted on that branch and required it be split onto its own branch.
> That is this branch. The split was done correctly — the role branch's final diff
> carries none of it.

# QA-Agent Approval: ✅ APPROVED

The change is **behaviour-preserving, and I proved it rather than sampling it**: every
changed `.ts` file parses to a byte-identical AST modulo exactly 21 removed
`EmptyStatement` nodes (§2.2). Full backend suite is green and attributable to
`df23bc4`. No STOP-and-escalate condition tripped.

---

## 1. Baseline

| Check | Result |
|---|---|
| Full backend suite (`npm test`, `--runInBand --forceExit`) | ✅ **91 suites / 1295 tests passed**, 0 failed, exit 0 |
| Suite attributable to `df23bc4` | ✅ HEAD + `git status --short` + `git ls-files --others --exclude-standard` captured **before, during and after** the run — empty every time, no concurrent writer |
| `npm run lint` | ✅ exit 0 — **0 errors**, 6 warnings |
| `npx tsc --noEmit` | ✅ clean, exit 0 |
| Scope | 10 files: 1 new config, 5 test files, 2 production files (1 line each), `package.json`, `package-lock.json` |

1295/1295 is the correct expected number for **this** branch: its merge-base is
`b1cc638`, which predates the `fix/role-service-tenant-scope` merge (`2601f28`). The
93-suite/1309-test figure in the role-service sign-off is post-merge and does not apply
here. See §4 for the merge check.

### ⚠️ Environment gap found while establishing the baseline (not a code defect)

The first two suite runs came back **75 of 91 suites failing** — a false red. A fresh
git worktree does not carry the gitignored env files, and `config/env.ts:5` resolves its
`.env` from the **repo root** (`path.resolve(__dirname, '../../../.env')`), not from
`src/backend/`. Three files are required and all three are `.gitignore`d (`.env*`, line 12):

| File | Supplies |
|---|---|
| `<repo-root>/.env` | `SETTINGS_ENCRYPTION_KEY`, `CRON_SECRET` (+ AWS/OAuth) |
| `src/backend/.env` | dev DB / JWT |
| `src/backend/.env.test` | test DB (`vetclinic_test`), loaded `override: true` by `jest.setup-env.js` |

Copied from the main checkout, after which the suite went green. Recorded because
**any worktree-based QA or CI run will hit this**, and a naive reading of the first
failure ("75 suites red") would have wrongly blocked a clean branch. Filed as F-6.

---

## 2. What I verified — proven, not taken on report

### 2.1 `tenant-settings.service.ts` — the only production logic file touched

```
services/tenant-settings.service.ts:123
-      ;(updated as Record<string, unknown>)[field] = maskSecret(safeDecrypt(stored, field, tenantId))
+      (updated as Record<string, unknown>)[field] = maskSecret(safeDecrypt(stored, field, tenantId))
```

The preceding line is `if (typeof stored === 'string' && stored) {` — ends in `{`, so
the leading `;` was an `EmptyStatement`, not an ASI guard. The expression statement is
untouched. **Style-only, zero behaviour change.** This is the secret-masking loop, so
it got the closest read: `SECRET_FIELDS`, `maskSecret`, `safeDecrypt` and the `tenantId`
argument are all unchanged. The three suites that exercise it — `settings.test.ts`,
`settings-api.test.ts`, `adminSettings.test.ts` — all pass.

### 2.2 AST equivalence — the decisive check

Rather than spot-check 21 edits, I parsed **both** revisions of every changed `.ts` file
with the repo's own TypeScript compiler and compared full AST walks with `EmptyStatement`
nodes elided and identifier/literal text included (so a rename or reorder would surface):

| File | AST identical | EmptyStatements |
|---|---|---|
| `__tests__/account-id-hash.test.ts` | ✅ | 4 → 0 |
| `__tests__/tenant-storage-config.repository.onedrive.test.ts` | ✅ | 2 → 0 |
| `services/tenant-settings.service.ts` | ✅ | 1 → 0 |
| `tests/unit/authService.test.ts` | ✅ | 5 → 0 |
| `tests/unit/middlewares.test.ts` | ✅ | 1 → 0 |
| `tests/unit/permission.service.test.ts` | ✅ | 8 → 0 |
| `types/index.ts` | ✅ | 0 → 0 (comment-only) |

**All ASTs identical modulo `EmptyStatement`. Exactly 21 removed. Zero parse errors.**

This is what closes the "did the mechanical fix silently break a test?" question for
all five test files at once: if any `mockResolvedValue` line had been swallowed into the
line above, the AST would differ. It does not. The assertions, `describe`/`it` structure,
and mock wiring are byte-identical.

### 2.3 Independent ASI audit

Separately from the AST proof, I checked each of the 21 de-semicoloned lines against its
preceding non-empty line: **21/21 follow a line ending in `{`** — no ASI hazard. I then
swept **every** `.ts` file in `src/backend` for a line starting with `(` whose previous
line does *not* end in `{`/`}`/`;`: **0 hits**, so no latent hazard was introduced
anywhere, including in files this branch did not touch.

### 2.4 `types/index.ts`

Adds only `// eslint-disable-next-line @typescript-eslint/no-namespace` above
`namespace Express`. `declare global { namespace Express }` is the standard Express
`Request` augmentation and has no ES2015-module equivalent — the suppression is correct
and currently load-bearing. AST unchanged.

### 2.5 Supply chain / secrets — `package-lock.json` (+1414 lines)

Parsed both lockfile revisions and diffed structurally:

| Check | Result |
|---|---|
| Secret-pattern hits in the diff (tokens, keys, `_auth`, `AKIA…`, PEM headers) | ✅ **0** |
| `resolved` hosts on added entries | ✅ **100/100 `registry.npmjs.org`** — no git/file/http sources |
| Existing packages whose **version changed** | ✅ **0** — no hidden dependency drift |
| Packages removed | ✅ **0** |
| Added packages **not** marked `dev: true` | ✅ **0** — nothing reaches a prod bundle |
| Added packages with install scripts | ✅ **0** — no postinstall execution |
| Root `dependencies` block | ✅ byte-identical |
| `devDependencies` delta | ✅ exactly the 3 declared; none changed or removed |

95 lockfile entries / 78 package names added, all recognisable eslint + `@typescript-eslint`
transitives. **No secrets and no unintended files leaked.**

### 2.6 Tenant isolation / RBAC

This branch adds **no route, no controller, no repository, no middleware, and no
permission code**. The single production logic line changed is AST-proven identical
(§2.1). The RBAC and isolation surface is therefore unchanged, and the standing
regression suites are the guard — all green in the attributable run:

`roleRouteMatrix` · `rbac-regression` · `tenantIsolation` · `platformAuth` ·
`permission.middleware` · `roleManagement` · `roleEditor-t5f01` ·
`hospitalization-branch-isolation` · `platformConsole`

**QA stop criteria: none triggered.** No query returns another tenant's data; no
sub-`clinic_admin` financial read introduced; no offline/conflict path touched; no PII
in logs (the one file touched *masks* secrets and its behaviour is unchanged).

---

## 3. `/code-review` — run and triaged (Step 7 gate)

`/code-review` was run on the diff at medium effort and returned **11 findings, zero
correctness defects**. It independently reproduced lint (0 errors / 6 warnings), `tsc`
(clean), and confirmed the 21 removals safe — additionally noting the ASI hazard remains
caught by `no-unexpected-multiline` (error, in `eslint:recommended`) *and* by `tsc`
(TS2349) should a statement ever be inserted above one of them.

I did **not** relay its findings unchecked. One was presented as blocker-class and
**does not survive verification**:

> *Claim:* the config comment citing "§3 of anemal-coding-rules" points at a retired doc.
> *Verified:* `anemal-coding-rules/SKILL.md:39` — the **live** skill file — itself says
> "No `any` TypeScript types (§ 3)". The citation matches the skill's own current
> numbering. The real (pre-existing, not introduced here) defect is that `SKILL.md` uses
> §-numbers only `coding-rules.md.old` defines. **Not a blocker; filed as F-5.**

**No finding blocks this sign-off.** All 11 are lint-setup *depth* items — the config
could do more — not defects in what was built. Lint exits 0, so the Step 8 gate passes.
The 6 warnings were surfaced to and accepted by the human at Ponytail approval.

---

## 4. Merge check — branch is 7 commits behind `main`

Merge-base `b1cc638`; `main` is at `2601f28`. Because the new lint config never saw the
files `main` added since (`role.repository.ts`, `role.service.ts`, `role.service.test.ts`,
`role.repository.test.ts`, `role-tenant-fixtures.ts`, `roleEditor-t5f01.test.ts`), a
post-merge lint break was a live risk. I tested it rather than assuming:

1. `git merge main --no-commit --no-ff` → **clean, zero conflicts**
2. On the merged tree: `npm run lint` → **exit 0, 0 errors, 6 warnings** (unchanged)
3. On the merged tree: `npx tsc --noEmit` → **clean, exit 0**
4. `git merge --abort` → tree verified pristine at `df23bc4`

**Merging to `main` will not break lint or types.** `main`'s current suite is green
(role-service merged under its own round-2 sign-off), so the CLAUDE.md red-suite ship
gate is satisfied.

---

## 5. Findings — all non-blocking, for backlog

### 🟡 F-1 — MEDIUM · the config's own `^_` convention doesn't cover 5 of its 6 warnings

`.eslintrc.cjs:19` sets `argsIgnorePattern: '^_'`, which matches **parameters only**.
Five of the six day-one warnings are `_`-prefixed *destructured/rest-omit bindings*
(`user.service.ts:67` `_pw`; `invoice.repository.ts:267` `_method`/`_receivedById`;
`product.repository.ts:28,91` `_bi`/`_drop`) — the escape hatch the config declares never
applies to them. **I tested the fix:**

```js
'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
```

→ **6 warnings drop to 1**, and the survivor (`__tests__/oauth-state.test.ts:16` `body`)
is a genuine unused variable, not a false positive. Config reverted; tree left pristine.
Not blocking (lint exits 0 either way) but worth doing before warning-blindness sets in
on a brand-new gate.

### 🟡 F-2 — MEDIUM · nothing automated runs this lint

There is **no `.github/workflows/` directory at all** and no root `lint` script (root
`package.json` has only `dev` and `vercel-build`), while
`anemal-coding-rules/references/06-github-workflow.md:96` documents a CI pipeline whose
step 1 is "Lint (ESLint + TypeScript) — zero errors". `anemal-finish-branch/SKILL.md:51-52`
tells the Step 8 agent to run `npm run lint`; from the repo root that finds no script and
silently no-ops — only `npm --prefix src/backend run lint` works. Installing the linter is
necessary but not sufficient; the gate it is supposed to feed does not exist yet.

### 🟡 F-3 — MEDIUM · `no-extra-semi` is deprecated in the very version installed

`node_modules/eslint/lib/rules/no-extra-semi.js` carries `@deprecated in ESLint v8.53.0`
(`deprecated: true, replacedBy: []`) under the installed 8.57.1, and ESLint 9 drops it
from `recommended`. So the 21 source edits — including one in production
secret-masking code — were driven by a rule that disappears on the eventual v9/flat-config
migration; a single `'no-extra-semi': 'off'` in the config being authored in the same
commit would have avoided all of it. The edits are proven safe (§2.2), so this is churn
and forward-compat, not breakage. It also leaves style inconsistent *within* a block —
`authService.test.ts:130-132`: line 130 has no leading `;`, lines 131-132 do, because
only the block-initial semicolon is an `EmptyStatement`. That asymmetry is now
linter-enforced and will read as an error to the next person.

### 🟢 F-4 — LOW · lint script has no `--max-warnings`, and `no-unused-vars` overlaps tsconfig

`"lint": "eslint . --ext .ts"` exits 0 at 6 warnings and will still exit 0 at 60, so the
only `warn`-level rule can never fail the Step 8 gate. Separately, `tsconfig.json:9-10`
already sets `noUnusedLocals`/`noUnusedParameters` (build-breaking), which the ESLint rule
duplicates more weakly. Ratchet with `--max-warnings 0` after F-1, or drop the rule.

### 🟢 F-5 — LOW · `§3` citations survive only in the retired `coding-rules.md.old`

`anemal-coding-rules/SKILL.md:39` cites "§ 3", but §3 (`## 3. TypeScript Rules (Strict
Mode)`) exists only in `references/coding-rules.md.old:166`; the live home is
`05-security-rules.md:21`. **Pre-existing, not introduced by this branch** — the
`.eslintrc.cjs:26` comment simply inherited the live skill's numbering. Fix the skill,
not the config. Related: the test-file `no-explicit-any` carve-out is a real policy
relaxation (`00-index.md:46` and `06-github-workflow.md:79` state the no-`any` rule
unscoped) recorded only in a lint-config comment — it should be written into the
coding-rules reference.

### 🟢 F-6 — LOW · worktree QA runs need three gitignored env files

See §1. Worth a line in the QA protocol or a `.env.example` at the repo root, so the next
worktree-based review does not read a false 75-suite red as a branch defect.

### 🟢 F-7 — LOW · lint toolchain sits on the production install path; ESLint 8 is EOL

Root `vercel-build` runs `npm --prefix src/backend install --include=dev` (dev deps are
genuinely needed there for `prisma generate`/`tsc`), so every deploy now unpacks ~100
extra eslint packages; hoisting the lint toolchain to the root `package.json` would keep
it off that path. Separately, eslint 8.57.1 is the final release of an EOL major — matching
the frontend is a defensible deliberate choice (and is what Ponytail approved), but it
should be recorded as a known deferral with a flat-config migration item while only two
configs exist. Also consider `reportUnusedDisableDirectives: true`, so this PR's first
suppression (§2.4) cannot rot silently. Two of the five `ignorePatterns` (`.claude/worktrees`,
`prisma/migrations`) match nothing `eslint . --ext .ts` collects and can be trimmed.

---

## 6. Acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | Full backend suite passes in the worktree | ✅ PASS — 91 suites / 1295 tests, 0 failed, exit 0, attributable to `df23bc4` |
| 2 | `tenant-settings.service.ts` diff is style-only, no behaviour change | ✅ PASS — AST-proven identical (§2.1, §2.2) |
| 3 | The 5 mechanically-edited test files still test what they tested | ✅ PASS — AST-proven identical; all 5 suites green (§2.2) |
| 4 | No secrets or unintended files in `package-lock.json` / the diff | ✅ PASS — 0 secret hits, 0 version drift, 0 prod deps, 0 install scripts (§2.5) |
| 5 | `npm run lint` works (the branch's stated goal) | ✅ PASS — exit 0, 0 errors |
| 6 | Tenant isolation / RBAC unaffected | ✅ PASS — no route/middleware/repo change; 9 isolation+RBAC suites green (§2.6) |
| 7 | `/code-review` run and findings triaged | ✅ PASS — 11 findings, 0 correctness defects, 0 blockers (§3) |

**7/7 pass. 0 blockers. 7 non-blocking findings → backlog.**

---

## 7. Approval

- [x] ✅ Approved for Staging
- [x] ✅ Approved for Production

**QA-Agent Approval: ✅ APPROVED**

Step 8 (`/anemal-finish-branch`) may proceed against `df23bc4`. Recommend merging `main`
into the branch first (verified clean and lint-green in §4). F-1 is a one-line config fix
already tested and would be cheap to fold in before shipping; F-2…F-7 belong in
`phase-history.md` Backlog → Actionable.
