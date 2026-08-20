# Ponytail Gate — Branch-Select Login Flash / Delayed Dashboard Redirect

**Pipeline step:** STEP 5 (@ponytail-agent — 7-criteria simplicity gate)
**Reviews:** `docs/superpowers/plans/2026-08-19-branch-select-login-flash.md` (@pm-agent, Step 4)
**Reviewer:** @ponytail-agent
**Date:** 2026-08-19

---

## VERDICT: ✅ APPROVE — all 7 criteria pass. Proceed to `/execute-plan` (STEP 6).

---

## 1. Per-criterion verdicts

| # | Criterion | Verdict | One-line why |
|---|---|---|---|
| 1 | Over-engineering? | **NO** | Every added construct is 1–4 lines and each maps to a locked upstream decision; nothing approaches the "40% simpler" threshold. Two micro-simplifications noted below as non-blocking. |
| 2 | Duplicate work? | **NO** | Nothing is reimplemented — the plan *removes* duplication (the second `GET /auth/me`) and reuses the existing error box, `isPending`, `isError`, and `useT` rather than rebuilding them. |
| 3 | Existing solution? | **NO** | TanStack Query v5 already provides the atomicity, pending state, error channel, and retry; the plan leans on the framework instead of hand-rolling a state machine, toast layer, or error boundary. |
| 4 | Scope too large? | **NO** | 1 subsystem (frontend clinic auth), 9 files touched, largest source delta ≈ 60 LOC. Gate is >3 subsystems / >10 files / >500 LOC. |
| 5 | Too many deps? | **NO** | Zero new dependencies, direct or transitive. |
| 6 | Too many files? | **NO** | 1 new file (`LoginView.errorMessages.test.tsx`). Gate is >15. |
| 7 | Too many APIs? | **NO** | 0 new endpoints, 0 new hooks, 0 new mutations. Consumer-facing signatures of `useLogin`/`useSwitchBranch` are unchanged. |

---

## 2. The 2.5x task inflation — attributed, not waved through

The flagged concern (8 tasks/~32 min → 20 tasks/~85 min on a render-ordering bug)
is real growth, so I attributed each added task rather than accepting the plan's
one-line explanation.

| Added work | Traceable to | Locked? |
|---|---|---|
| T1, T2 (`permissionsLoaded` required on `AuthData`) | BA C2 + grill §1 C2 + ADR-0024 §4 | **Locked** |
| T6 (parameterised `fetchMe` failure matrix) | BA AC-9, AC-12 | **Locked** |
| T8 (re-tap retry) | grill G1 — "the write-plan must add a frontend test asserting the retry path" | **Locked** |
| T9 (direct/admin failure half) | BA C3 / AC-10 | **Locked** |
| T11, T12 (`useSwitchBranch` guard) | BA R-1 / AC-11 | **Locked** |
| T13 (200 + `permissions: []`) | BA AC-13 | **Locked** |
| T15 (i18n key, en + th) | human ruling, grill §1 C1 + G3 | **Locked** |
| T16, T17, T18 (LoginView) | consequence of the same human ruling — see §3 | **Locked** |
| T3, T14 (pure "re-run the test you just wrote") | nothing upstream | **not attributable** |

11 of 12 added tasks are downstream of decisions I am not permitted to reopen.
The important reframing: the gate measures the **change**, not the task ceremony.
Step 2 → Step 4 is 2.5x in task *rows* (the `/write-plan` format mandates 2–5 min
granularity, so the same work yields more rows) but roughly **1.3x in source
diff** — ~60 net LOC across 4 files, versus Step 2's 3 files. That is not the
shape of scope creep.

---

## 3. Scrutiny of the four flagged items

### 3.1 `IdentityLoadError` — earns its place

`export class IdentityLoadError extends Error {}` is one line and is the minimal
type-safe discriminator available in TypeScript. The UI must distinguish exactly
two cases, and the plan uses it for exactly those two:

- `POST /auth/select-branch` failed → `login.selectBranchError`
- `POST` succeeded, `GET /auth/me` failed → `login.selectBranchIdentityError`

Alternatives considered and rejected as **not simpler**: a string sentinel
(`error.message === 'IDENTITY_LOAD_FAILED'`) trades a class for an exported
constant and loses type-narrowing; fabricating an axios-shaped
`{ response: { data: { error } } }` to slip through the existing extraction path
would hide translated UI copy inside the hook and lie about the error's origin.
No finding.

### 3.2 The discriminated union on `loginMutation.mutationFn` — minimum, not decoration

The union is forced by the shape of the problem: the branch-selection response
has no token (nothing to resolve), the direct response has one (must resolve
now), and `fetchMe` has to live inside `mutationFn` for C3's atomic-failure
guarantee. The response type is *already* a union
(`LoginStep1Response | LoginStep2Response`), so the fair objection is that the
explicit `kind` duplicates the existing `requiresBranchSelection` discriminant.

It does not, in practice: TypeScript narrows a union by a discriminant **directly
on the union members**, not by a nested one, so `if (result.data.requiresBranchSelection)`
would not narrow `result` and `me` would need `MeResponse | null` plus a non-null
assertion in `onSuccess`. The plan's version costs ~2 tokens per return and buys
exhaustive narrowing. No finding.

### 3.3 `LoginView.tsx` entering scope — the argument is sound, verified against source

I checked the two sites rather than taking §0 on faith:

- `LoginView.tsx:157` renders `{t('login.selectBranchError')}` **unconditionally**
  inside the `selectBranchMutation.isError` block.
- `LoginView.tsx:57–59` falls back to `t('login.invalidCredentials')`.

A *distinct* message (locked human choice) is therefore unimplementable without
either the component branching, or the hook returning a pre-resolved message
string. The second option still changes `LoginView` (it must read the new field)
**and** additionally moves i18n resolution into the hook — strictly worse. The
file is genuinely forced into scope, and it is a ~8-line delta. No finding.

### 3.4 19 named tests — proportionate

13 AC → 13 named tests, zero orphaned AC, and 6 of the 13 AC were added by
upstream gates (BA AC-9…13, grill G1). The parameterised T6 matrix (network throw
/ 401 / 404 / 5xx) is not framework testing — it is the BA's verified failure
taxonomy, and the 404 case exists specifically because a disabled user returns
404 rather than 401 (`auth.service.ts:253`), which is the case today's code
mishandles. T13 is the only test with no expected implementation change, and it
guards a genuinely load-bearing distinction ("no permissions" ≠ "permissions
unknown"). Keep it.

---

## 4. Non-blocking notes for @dev-agent (recommendations, NOT gate conditions)

These do not block execution and do not require resubmission. Take them if they
survive contact with the code; skip them if they do not.

1. **`fetchMe` / `fetchMeOrThrow` can be one function.** Once `applyLogin` is
   deleted (T7), `fetchMe`'s only remaining caller is `fetchMeOrThrow` — the
   wrapper has no second consumer. Folding them removes the `| null` return
   union, the swallowing `catch { return null }` (a network throw should now
   propagate — that is the desired behaviour), and one function:
   `if (!res.ok) throw new IdentityLoadError(...)`. This stays on raw `fetch`,
   so BA Assumption 1 (no axios 401 interceptor) is preserved. I did not reject
   on this: it is ~4 lines against a ~60-line diff, far below criterion 1's
   magnitude bar.
2. **T3 and T14 fold into T2 and T13.** Both are pure "run the test you just
   wrote" rows; running is part of the red→green step. Saves 2 rows / 4 min.
3. **@qa-agent's call, not mine:** `authStore.ts:158`
   (`const next: AuthData = { ...get(), ...patch }` in `refreshPermissions`)
   persists the *pre-update* `permissionsLoaded` alongside the new permissions.
   Benign under this design — every session established after the fix already
   carries `true` — but it interacts with `normalise()` newly trusting the
   persisted value, so it is worth one assertion during T19 rather than a
   surprise later.

---

## 5. Claims verified against source (not accepted on assertion)

| Plan claim | Result |
|---|---|
| `LoginView.tsx` is the only place the picker's error message is chosen | **Confirmed** — `LoginView.tsx:157`, hardcoded key |
| No `setAuth`/`AuthData` call site exists outside `useAuth.ts` + `authStore.test.ts` | **Confirmed** — `PlatformLoginView.tsx:34` does call a `setAuth`, but it is `usePlatformAuthStore` with `PlatformAuthPayload`, a separate store and type. No fifth source file. (The grill record's §1 C2 aside listing "platform login" as a forced call site is the loose statement; the plan is right.) |
| `guards.test.tsx` needs no edit | **Confirmed** — it declares its own `MockStoreState`, does not import `AuthData` |
| `authStore.test.ts:16` `sampleAuth: AuthData` will fail to compile | **Confirmed** — it is a bare `AuthData` literal |
| i18n insertion points | **Confirmed** — `i18n/index.ts:128` (en), `:458` (th) |
| 1 new test file | **Confirmed** — existing frontend test files are 51–305 lines; one ~40–60 line addition is unremarkable |

---

## 6. Gate output

```
@pm-agent — Ponytail gate ✅ APPROVE — all 7 pass. Proceed to execute-plan.
```

**Next step:** `/superpowers:execute-plan` (STEP 6) — @dev-agent implements T1–T19
task-by-task with `/tdd`; T20 is @qa-agent's manual tablet smoke. Then STEP 7
`/code-review` (@qa-agent), then STEP 8 `/anemal-finish-branch` (@pm-agent).
