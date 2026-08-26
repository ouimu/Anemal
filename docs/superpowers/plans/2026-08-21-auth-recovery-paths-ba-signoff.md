# Auth Recovery Paths — BA Sign-off (Step 3)

**Branch:** `fix/auth-recovery-paths`
**Author:** @ba-agent
**Date:** 2026-08-25
**Reviews:** `docs/superpowers/plans/2026-08-21-auth-recovery-paths-pm-tasks.md` (Step 1+2 — 15 AC, 14 tasks)
**Skills applied:** `anemal-ba-toolkit`, `anemal-rbac-matrix`, `anemal-functional-reqs`

---

# VERDICT: **APPROVED WITH CONDITIONS**

The three defects are correctly identified and correctly scoped as one branch. **A1 and A2 are both
upheld as requirements**, A2 with a strengthening. PM's recommended *implementation* of A1 — the
"smart" `ForbiddenView`, shape (b) — is **REJECTED** and replaced with shape (a). Nine acceptance
criteria are added, two existing ones are restated, one is withdrawn as designing for an
unreachable state. Eleven conditions (**C-1 … C-11**) must be closed before `/write-plan` (Step 4).

**Objective this branch serves:** *an authenticated clinic user is never left in a state they
cannot leave, and is never told something succeeded when it did not.* Every ruling below is
measured against that objective, not against file counts.

---

## 0. Evidence base

All findings below were read from source on this branch, not inherited from the brief.

| File | Read | Why it matters |
|---|---|---|
| `src/frontend/src/App.tsx` | L64-73, L90-189 | Route tree, `/403` placement, four trees, catch-all |
| `src/frontend/src/store/authStore.ts` | full | `refreshPermissions` exit paths, INV-PERM-1 |
| `src/frontend/src/guards/{RequireAuth,RequirePlane,RequirePermission}.tsx` | full | Guard order, `permissionsLoaded` handling |
| `src/frontend/src/layouts/{Clinic,Admin,Settings}Layout.tsx` | full / nav+redirect | **Nav-vs-guard divergence (F-3)** |
| `src/frontend/src/components/roles/RoleList.tsx` | L140-186 | `handleSave`, toast, 4s auto-dismiss |
| `src/frontend/src/views/LoginView.tsx` | L1-105 | Authenticated bounce, `?reason=idle` precedent |
| `src/frontend/src/utils/api.ts` | interceptor | **Second, dominant 401 path (F-4)** |
| `src/frontend/src/store/platformAuthStore.ts` | full | Plane isolation |
| `src/frontend/src/hooks/useAuth.ts` | `useLogout` | Exit path from `/403` |

---

## 1. Ruling 1 — Assumptions A1 and A2

### A1 — "403 renders inside the authenticated shell + explicit logout": **UPHELD**, premise corrected

The requirement is right and the branch needs it. One clause of it is factually wrong.

**Right, and free:** PM is correct that the logout affordance costs nothing.
`ClinicLayout.tsx:103-109` and `AdminLayout.tsx:104` render the sign-out button in the sidebar
footer **unconditionally** — not permission-gated, not dependent on the nav list being non-empty.
Wiring the shell into the 403 render path delivers AUTH-BL-3's logout requirement with zero new UI.

**Wrong:** the assumption says "sidebar works". It does not, in the sense that matters here. The
sidebars do **not** reflect what the user can actually reach:

> **F-3 (nav-vs-guard divergence) — all three clinic shells**
> - `ClinicLayout.tsx:11` — the Dashboard nav item is declared `perm: undefined`, so it renders
>   for **every** clinic user, while the route behind it (`App.tsx:139`) is gated on
>   `dashboard.view`. A user lacking `dashboard.view` is shown a Dashboard link that returns them
>   to 403.
> - `AdminLayout.tsx:76` — `{NAV.map(...)}` with **no permission filter at all**. Every admin nav
>   item renders regardless of the user's permission set, while 8 of the routes behind them are
>   `RequirePermission`-gated.
> - `SettingsLayout.tsx:41` — filters by **role string** (`item.roles.includes(role)`), not by
>   permission. Under `anemal-rbac-matrix`, custom roles decouple role-string from permission set,
>   so this filter is structurally unable to stay aligned with the route guards.

**Consequence:** PM's AC **AUTH-403-02** asserts a zero-permission user's sidebar "renders empty
(no items)". That is **false as written** — `ClinicLayout` will render exactly one item, Dashboard,
and it is a trap straight back to 403. And **AUTH-403-01** asserts nav shows items "the user *does*
hold permission for" — false for `AdminLayout`, which filters nothing.

Embedding a shell whose menu is mostly traps is not a recovery path; it is a hall of mirrors. A1 is
therefore **restated**:

> **A1' (binding).** The 403 state must render inside the originating tree's authenticated shell,
> and every destination it offers must be one the user can actually enter. A destination that
> returns the user to 403 is not a recovery affordance.

**Scope control on F-3.** A1' does *not* require redesigning all three nav models — that would be
scope creep and Ponytail would rightly reject it. The minimum satisfying change is two edits:
give `ClinicLayout`'s dashboard item `perm: 'dashboard.view'` (one word), and give `AdminLayout`
the same `.filter(item => !item.perm || hasPermission(item.perm))` that `ClinicLayout:76` already
has (one line + `perm` keys on its NAV array). `SettingsLayout`'s role-string filter is deferred to
backlog (**B-2**) — its nav items are admin-scoped anyway, so the trap surface is small.

### A2 — "replace the premature success toast with an honest warning": **UPHELD, and strengthened**

I was asked to pressure-test this specifically: is "saved but your session is stale" the right
severity, given the user just changed their own authority?

**Severity analysis — what is and is not at risk:**

- **This is not a privilege-escalation hole, and the branch must not be justified as if it were.**
  The server re-derives permissions per request from `user_roles`; a stale client array grants
  nothing. Per the project rule *"server is the security boundary; UI gating is UX only"*, a
  divergent client array is a **correctness and honesty** failure, not an access-control failure.
  Bounding it this way matters — it is what makes force-logout the wrong remedy (below).
- **Direction (i) — admin removed permissions from their own role.** Client still shows them.
  The UI now *asserts* an authority the user does not hold: menu items, `Can`-gated buttons, and
  `RequirePermission` all decide on data known to be wrong. Clicks fail server-side with
  unexplained errors. This is the harmful direction.
- **Direction (ii) — admin added permissions.** Client hides them. Merely annoying.

**Ruling:** the copy must be honest (**A2 upheld**), *and* the app must stop pretending. Two
strengthenings, because a dismissible sentence does not clear the bar:

1. **The remediation must be an action, not an instruction.** PM's copy ends "…reload to see your
   updated permissions." Telling a user to reload while the app keeps running on knowingly-wrong
   authorization data leaves the divergent state resident indefinitely. The warning must carry a
   **reload control** the user can press.
2. **The warning must not auto-dismiss.** `RoleList.tsx` `showToast` hard-codes a 4-second
   `setTimeout` dismissal (L161-164). A warning about known-divergent authorization state that
   erases itself after four seconds is the *same failure mode* as the false-success toast this
   branch exists to remove — it just fails four seconds later. The failure branch must persist
   until the user acts.

**Rejected alternative — force-logout on refresh failure.** Considered and ruled out. A transient
network blip would then eject a clinic admin mid-administration, and the ejection lands them at
`/login`, which for a now-zero-permission user bounces straight into the AUTH-BL-3 trap this same
branch is fixing. Escalating a UX-honesty failure into a self-inflicted denial of service is worse
than the disease. **Persistent, action-bearing warning is the correct severity.**

> **B-1 (backlog, not this branch).** `RoleList.tsx:176` refreshes only when
> `userRoleIds.includes(role.id)` — i.e. only when the admin edited a role they themselves hold.
> Every **other** user holding that role keeps a stale permission array with no notification, and
> the client never checks `permSetVersion` against the server. AUTH-BL-2 closes the
> self-edit case only. The general case needs a server-driven `permSetVersion` invalidation and is
> a separate requirement — recorded so the branch does not appear to have closed a class of bug it
> only closed one instance of.

---

## 2. Ruling 2 — The architectural crux: smart `/403` (b) vs per-tree `403` child (a)

### Ruling: **shape (a).** PM's shape-(b) recommendation is rejected.

Judged on the three axes I was asked to judge on.

#### Axis 1 — plane isolation: **(a) wins decisively**

Under (a) the 403 for `/clinic/*` renders inside `ClinicLayout`, which already sits behind
`RequirePlane plane="clinic"`. Plane isolation is enforced **structurally, by the route tree and a
guard that already exists**. Under (b) a single component reads `plane` from the store and branches
in application code to decide which plane's chrome to draw. That demotes a guard-enforced,
routing-level boundary to a runtime `if` — and produces exactly the artefact my own decision rules
name as an anti-pattern: **one component that knows about both planes and can render either.**

PM's own **AUTH-403-04** proves the point: shape (b) *requires* writing cross-plane branching code
("must not crash if ever reached with `plane==='platform'`") for a case that shape (a) makes
structurally unreachable. **(b) forces you to write plane-fusing code to defend against a state
(a) cannot enter.**

That state is also unreachable today — see Ruling 7, F-6: no production code ever sets
`authStore.plane = 'platform'`. So **AUTH-403-04 is withdrawn**, not implemented (§5).

#### Axis 2 — degradation for a zero-permission user: **(a) wins, and (b) can manufacture a new infinite loop**

This is the decisive finding.

> **F-1 (severity: high) — shape (b) with literal layout reuse creates a true infinite redirect loop.**
> `ClinicLayout.tsx:31` — `if (role === 'admin') return <Navigate to="/clinic-admin/dashboard" replace/>`
> `AdminLayout.tsx:33`  — `if (role !== 'admin') return <Navigate to="/clinic/dashboard" replace/>`
>
> The cheapest reading of PM's "reuse the existing sidebar chrome" is to render `<ClinicLayout/>`
> from the smart `ForbiddenView`. Do that, and an **admin** who lands on the absolute `/403`
> hits `ClinicLayout:31` → `/clinic-admin/dashboard` → `RequirePermission clinic.profile.view` →
> denied → `/403` → `ClinicLayout:31` → **cycle, unbounded**. The fix for the dead-end bug would
> ship a genuine hang.

Shape (b) therefore forks, and **both prongs are unacceptable**:
- *Literal reuse* → the loop above.
- *Re-composition* (rebuild the chrome standalone to dodge the redirects) → ~70 lines of sidebar,
  header, footer, collapse toggle and `TopNav` duplicated per shell, which then drifts from the
  real layouts. That is Ponytail criterion **#2 (duplicate work)** — the very gate PM invoked to
  justify (b).

Under (a) the loop is **structurally impossible**: a `403` child nested at `/clinic/403` is only
ever reached by a non-admin, so `ClinicLayout:31` is a guaranteed no-op. Correct by construction,
not by remembering to special-case it.

#### Axis 3 — honesty about what the user can reach: **neither, as specified — but (a) is strictly better**

Per F-3, *neither* shape is honest today, because the nav lists diverge from the route guards.
The difference is where the fix lands: under (a), fixing the layout's nav filter makes the normal
page **and** the 403 page honest simultaneously, from one edit. Under (b) you must fix the layout
filter *and* the duplicated 403 chrome, and the two can silently diverge — reintroducing F-3 in a
place nobody is looking.

#### Answering PM's Ponytail argument head-on

PM chose (b) on scope grounds ("(a) ripples into 4 route trees"). **That estimate is wrong, and it
is the load-bearing premise of PM's recommendation.** The real cost of (a):

- **`/preferences`** (`App.tsx:168-175`) contains **no `RequirePermission`** — it can never emit a
  403. It needs no `403` child.
- **`/platform/*`** (`App.tsx:126-134`) contains **zero `RequirePermission`** (verified by grep).
  It needs no `403` child.
- That collapses "four trees" to **three**: `/clinic-admin`, `/clinic`, `/settings`.

So (a) costs **three route lines in one file** (`App.tsx`), plus one line in `RequirePermission`,
plus keeping the existing absolute `/403` as a fallback. That is **smaller** than (b)'s duplicated
chrome, and it *deletes* an AC (AUTH-403-04) instead of implementing one. **(a) is the
Ponytail-preferred shape once the tree count is counted correctly.**

#### One honest caveat on mechanism

I rule on the **requirement** — *the 403 must render within the originating tree's shell* — not on
the exact react-router incantation. A relative redirect (`<Navigate to="403" relative="path"/>`)
should resolve `/clinic/billing` → `/clinic/403` and keep `RequirePermission` free of any per-tree
knowledge, but I am **not** asserting that API behaviour as verified fact. **C-4** requires
@dev-agent to verify it against the installed react-router version and fall back to an explicit
tree-prefix map if it does not hold. I will not hand Step 4 a plan resting on an API detail I have
not run.

#### Keep the absolute `/403`

Retain `<Route path="/403">` as a plane-agnostic, shell-less last-resort fallback — for stale
bookmarks and any future `RequirePermission` mount that resolves unexpectedly. But it **must
itself be recoverable** (logout + a `/preferences` link), not the current dead-end div. This is
belt-and-braces at a cost of one route line; flagged as a judgement call Ponytail may trim.

---

## 3. Ruling 3 — The zero-permission session (INV-PERM-1) is preserved

**Confirmed distinction, and it is load-bearing here.** Per PR #54 AC-13 and INV-PERM-1
(`authStore.ts:25-30`):

| State | Meaning | Guard behaviour (`RequirePermission.tsx`) |
|---|---|---|
| `permissionsLoaded: true`, `permissions: []` | **No permissions** — a real, authorized session | L57-61 → deny → 403. Correct. |
| `permissionsLoaded: false` | **Permissions unknown** | L49-55 → spinner. Does **not** deny. Correct. |
| `token === ''` | **Unauthenticated** | L45-47 → `/login`. Correct. |

`isAuthenticated()` is `token !== ''` (`authStore.ts:138`) — **independent of permissions**. A
zero-permission user is authenticated. The rework must never conflate the two. Three specific
traps, one of which PM missed:

- **Trap 1 — `RequireAuth` on `/403`.** AUTH-7 wraps `/403` in `RequireAuth`, which checks
  `isAuthenticated()` only. A zero-permission user passes. Correct — and it must **not** be
  "improved" into a permission check (**C-6**). *Bonus:* wrapping also closes a small leak —
  today an unauthenticated user can render `/403` and, under a shell, would see the previous
  user's `name`/`companyName` in the sidebar footer.
- **Trap 2 — failure must not touch state.** PM's **AUTH-INV-PERM-01** already requires that a
  failed refresh leave `permissionsLoaded` and `permissions` untouched. **Upheld as written** —
  it is the sharpest AC in the PM set.
- **Trap 3 — PM missed this one.** The **success** path fabricates a zero-permission state out of
  a malformed response:

> **F-2 (severity: high) — `refreshPermissions` conflates "server says none" with "server sent garbage".**
> `authStore.ts:167` — `permissions: Array.isArray(body.permissions) ? body.permissions : []`,
> then L178 — `set({ ...patch, permissionsLoaded: true })`.
> A 200 response whose `permissions` field is missing or not an array yields
> `permissions: []` + `permissionsLoaded: true` — i.e. **"you authoritatively have no
> permissions"** manufactured from **"we could not tell"**. That is precisely the distinction
> INV-PERM-1 exists to protect, collapsed on the happy path.
>
> Combined with the new shell-embedded 403, a single malformed server response now drops a fully
> privileged admin into the zero-permission state. This is the same malformed-body class PM is
> already fixing in `fetchMe` (N-1) — but `refreshPermissions` was not audited for it.

Fix: a malformed/absent `permissions` field must take the **failure** path (warning), never the
authoritative-empty path. New AC **AUTH-REFRESH-04**.

---

## 4. Ruling 4 — Redirect-loop analysis (exhaustive)

### 4.1 Framing correction — there is no infinite loop today, and the AC must not claim there is

The brief describes `/403` as a loop the user "cannot leave". Precisely: **every exit the user
knows about returns them to 403, but nothing cycles unboundedly.** `/403` is a *terminal render*,
not a redirect. The trap is a dead end, not a hang.

This matters for testability. PM's **AUTH-403-03** checkbox — *"does not flicker or bounce
repeatedly between `/login` and `/403`"* — asserts the absence of something that does not happen
today. It would pass against the **current broken code**. That is a **vacuous assertion**, the
exact defect class this branch is also fixing in F-5. Restated in §5 as a positive, falsifiable
claim.

### 4.2 Every entry into the 403 state

| # | Path | Terminates? |
|---|---|---|
| E1 | `RequirePermission` deny on any gated route — 8 in `/clinic-admin/*`, 11 in `/clinic/*`, 8 in `/settings/*` | Yes — single `<Navigate replace>`, then render |
| E2 | Direct navigation / stale bookmark to `/403` | Yes |
| E3 | `*` catch-all (`App.tsx:185`) → `/login` → authenticated bounce → dashboard → E1 | Yes — chain length 3 |
| E4 | Legacy `/admin/*` (`App.tsx:114-123`) → `/clinic-admin/*` → E1. Worst case `/admin/profile` → `/clinic-admin/profile` → `/settings/clinic-profile` → E1 | Yes — 3-hop chain, all `replace`, no cycle |
| E5 | `/dashboard` (`App.tsx:183`) → `/clinic/dashboard` → E1 | Yes |
| E6 | `/` (`App.tsx:184`) → `/login` → bounce → E1 | Yes |
| E7 | Index redirects: `/clinic`→`dashboard`, `/clinic-admin`→`dashboard`, `/settings`→`clinic-profile` — all gated | Yes |

All entries use `replace`, so the history stack collapses rather than accumulating.

### 4.3 The nastiest case (named in the brief), traced

Zero-permission user, currently at the 403 state, manually navigates to `/login`:

```
/login  → LoginView:42 isAuthenticated → <Navigate to='/clinic/dashboard' replace>
        → RequirePermission perm='dashboard.view' → lacks it
        → <Navigate to='/clinic/403' replace>   [shape (a)]
        → ClinicLayout renders (role !== 'admin' → L31 no-op) → 403 body in shell
```
**Chain length 3, terminates.** Confirmed no cycle. The defect is the *terminal state's* lack of
controls — which A1' fixes — not a cycle.

### 4.4 Every exit from the 403 state

| # | Exit | Available to zero-permission user? | Terminates? |
|---|---|---|---|
| X1 | Sidebar logout → `useLogout` → `clearServerState()` → `clearAuth()` → `navigate('/login')` → unauthenticated → login form renders | **Yes** (footer button is unconditional) | Yes |
| X2 | A nav item the user actually holds | No (by definition) | Yes |
| X3 | **`/preferences`** — `RequireAuth` + `RequirePlane` only, **no permission gate** → renders for *any* authenticated clinic user | **Yes — the only guaranteed non-logout exit** | Yes |
| X4 | Browser Back → the denied route → 403 again | n/a | Stuck-in-place, not a cycle. Acceptable. |

**X3 is the key asset and it is currently hard to reach.** `/preferences` is linked only from
`ProfileMenu.tsx:151`, rendered inside `TopNav`. If the 403 shell renders `TopNav`, a
zero-permission user gets *two* recovery affordances (preferences + logout). If it does not, they
get logout only. New AC **AUTH-403-07** makes this explicit rather than accidental.

### 4.5 Loops that must not be introduced

- **F-1** (shape (b) + `ClinicLayout:31`) — eliminated by ruling (a). **C-3** forbids the
  re-composition workaround as well.
- **Invariant:** the 403 state must **render, never redirect** — no `RequirePermission`, no
  `RequirePlane`, no role-based `<Navigate>` on the 403 route itself. Any "improvement" that makes
  403 redirect somewhere reopens the whole class. New AC **AUTH-403-06**.
- `SettingsLayout` verified: contains **no** `<Navigate>` role redirect, so `/settings/403` is
  safe under (a).
- `/preferences` (standalone) and `/platform/*` emit no 403 — no child route, nothing to check.

---

## 5. Ruling 5 — `refreshPermissions()` signature change

### PM's single-caller assumption: **RE-VERIFIED BY GREP — IT HOLDS.**

Production callers of `refreshPermissions`, scoped to `src/frontend/src`, excluding tests:

```
src/frontend/src/components/roles/RoleList.tsx:155   ← the only one
```

### But the signature change ripples to **five** files PM does not enumerate

PM's AUTH-2 says only "change the return type". These break on a `Promise<void>` →
`Promise<{ok:boolean}>` change and must be named in the plan:

| # | File | What breaks |
|---|---|---|
| 1 | `src/frontend/src/store/authStore.ts:47` | The interface declaration itself |
| 2 | `src/frontend/src/components/roles/RoleList.tsx:155,177` | The production caller |
| 3 | `src/frontend/src/__tests__/RoleList.test.tsx:6,7` | Types **and** mocks `async () => {}`. **Renders `RoleList`** → reading `.ok` off `undefined` throws at runtime |
| 4 | `src/frontend/src/__tests__/RoleEditorView.test.tsx:49,55,103,258,278` | Same — types `() => Promise<void>`, mocks `async () => {}`, **renders `RoleList`** |
| 5 | `src/frontend/src/hooks/useAuth.test.ts:37` | `vi.fn().mockResolvedValue(undefined)` in the store mock |

> **Correction to PM's AUTH-10.** It instructs "*write/extend `authStore.test.ts` (create if it
> doesn't exist)*". **It exists** — `src/frontend/src/store/__tests__/authStore.test.ts`, already
> carrying the F-1/INV-PERM-1 regression guards (L67-112). The task must say *extend*, not
> *create*; creating a second file would fragment the INV-PERM-1 suite.

> **Grep hazard for @dev-agent.** An untracked local worktree copy of the whole frontend exists at
> `src/backend/.claude/worktrees/exciting-volhard-2256e8/src/frontend/...` (0 files tracked in
> git). A naive `grep -r refreshPermissions src/` returns **doubled** hits and will make the
> single-caller check look like a two-caller check. Scope greps to `src/frontend/src`.

### The contract must be **total** — PM's version has a type hole

`refreshPermissions` has **five** exit paths. PM's AUTH-1/AUTH-2 address two.

| # | Line | Path | PM's plan | Ruling |
|---|---|---|---|---|
| 1 | L144 | `if (!token) return` | **Not mentioned** | Must return failure. Neither success nor a server error. |
| 2 | — | `fetch` rejects (network) | AUTH-1 ✓ | Failure |
| 3 | L151-155 | 401 → `clearAuth()` + `location.href` | *"terminal action, no return value needed"* | **Wrong — see F-5** |
| 4 | L157 | `!res.ok` | AUTH-2 ✓ | Failure |
| 5 | L159-178 | Success | ✓ | Success — **unless malformed body, see F-2** |

> **F-5 (severity: medium) — the 401 branch is not terminal.**
> PM's AUTH-2 states the 401 branch needs no return value because the redirect ends execution.
> **It does not.** Assigning `window.location.href` does not halt the current JS task — in a real
> browser the navigation is asynchronous, and **in jsdom it does nothing at all**. So:
> (a) under TS strict, `return;` in a `Promise<{ok:boolean}>` function is a type error; and
> (b) at runtime the caller resumes and reads `.ok` off `undefined` → `TypeError` inside
> `onSuccess`, in **every test** and in the real-browser window before unload. The 401 branch must
> return an explicit failure outcome like every other path.

---

## 6. Ruling 6 — Gap analysis on the 15 AC

### 6.1 Upheld as written
`AUTH-403-01` (subject to A1'/F-3), `AUTH-REFRESH-01`, `AUTH-REFRESH-02`, `AUTH-REFRESH-03`,
**`AUTH-INV-PERM-01`** (sharpest AC in the set), `AUTH-401-01`, `AUTH-TEST-F5`, `AUTH-TEST-N1`.

### 6.2 Restated

**AUTH-403-02 (restated)** — zero-permission user, recovery from 403
- [ ] The sidebar renders **no nav item whose route the user would be denied** (not "renders
      empty" — see F-3; `ClinicLayout`'s ungated Dashboard item makes the original wording false)
- [ ] The footer logout button is present and clickable
- [ ] Logout → `useLogout()` → `clearServerState()` → `clearAuth()` → `/login` renders the **login
      form** (not a bounce), and no clinic route is reachable without re-authenticating **(neg)**

**AUTH-403-03 (restated)** — no dead end (replaces the vacuous "does not flicker")
- [ ] From the 403 state, a zero-permission user has **≥1 non-logout affordance that reaches a
      route which renders** (`/preferences` — see X3), asserted by navigation, not by absence of flicker
- [ ] The `/login` → dashboard → 403 chain settles in **≤3 navigations** and the final render is
      the 403 shell — asserted as an exact chain, not as "no repeated bouncing"
- [ ] **Mutation check:** reverting the AUTH-7 change must make this test **fail**. An AC that
      passes against the pre-fix code is vacuous (F-5 class)

### 6.3 Withdrawn

**AUTH-403-04 — WITHDRAWN.** It designs for a state that cannot occur (F-6, Ruling 7) and, under
shape (a), for a component that will not exist. Do not implement; do not test.

### 6.4 New acceptance criteria (9)

**AUTH-403-05 | any clinic role | Both | Nav honesty (F-3)**
- [ ] `ClinicLayout` NAV dashboard entry carries `perm: 'dashboard.view'`
- [ ] `AdminLayout` filters NAV by `hasPermission`, matching `ClinicLayout:76`
- [ ] **(neg)** A user lacking permission X sees **no** nav item leading to the route gated on X

**AUTH-403-06 | (invariant) | — | The 403 state renders, never redirects**
- [ ] No `RequirePermission`, `RequirePlane`, or role-based `<Navigate>` on any 403 route
- [ ] **(neg)** Rendering 403 as `role === 'admin'` under a clinic tree produces **no** navigation
      (direct regression guard for **F-1**)

**AUTH-403-07 | zero-permission clinic user | Both | `/preferences` is reachable from 403**
- [ ] The 403 shell exposes a route to `/preferences` (via `TopNav`/`ProfileMenu`, or an explicit link)
- [ ] A zero-permission user reaches `/preferences` from 403 and it **renders** (no permission gate — X3)

**AUTH-REFRESH-04 | Clinic Admin | Both | Malformed refresh body ≠ zero permissions (F-2)**
- [ ] 200 with `permissions` missing / not an array → **failure** path (warning), not success
- [ ] `permissionsLoaded` and `permissions` are **unchanged** — no fabricated authoritative empty set
- [ ] **(neg)** Asserts an admin with 30 permissions does **not** end up with `[]` + `permissionsLoaded: true`

**AUTH-REFRESH-05 | Clinic Admin | Both | The warning persists and offers the remedy**
- [ ] The failure warning does **not** auto-dismiss (the 4s `showToast` timeout must not apply to it)
- [ ] It carries a **reload control**, not prose instructing the user to reload
- [ ] The success toast's existing 4s auto-dismiss is unchanged **(neg — regression)**

**AUTH-REFRESH-06 | (contract) | — | `refreshPermissions` is total (F-5)**
- [ ] All five exits return a defined outcome: `!token`, network throw, 401, non-ok, success
- [ ] The 401 branch returns an explicit failure — execution after `location.href` is proven to
      continue (jsdom does not navigate), and the caller never reads a property off `undefined`
- [ ] All five files in §5's ripple table compile and pass

**AUTH-401-02 | any clinic user | Both | The dominant 401 path also explains itself (F-4)**
- [ ] `api.ts:31-35` interceptor's `window.location.href = '/login'` carries the same
      `?reason=session-expired`
- [ ] `skipAuthRedirect` requests are unaffected **(neg — regression,** `api.test.ts:33` **)**

**AUTH-401-03 | platform user | Web | 401 recovery respects plane isolation (F-7)**
- [ ] A platform-plane 401 lands on `/platform/login`, **not** the clinic `/login`
- [ ] **(neg)** No platform session is ever redirected to a clinic-plane URL by a recovery path

**AUTH-401-04 | any user | Both | Unknown `?reason=` degrades safely**
- [ ] `?reason=<unknown>` renders **no** banner (not an empty or broken one)
- [ ] The raw `reason` value is **never** reflected into the DOM — banner copy is selected from a
      fixed allow-list of known reasons, never interpolated from the query string

### 6.5 The `?reason=` collision question (asked explicitly)

**No collision, low risk — with one required change.** `reason=idle` is consumed in two places:
`RequireAuth.tsx:40` (clinic, → `/login?reason=idle`) and `PlatformLayout.tsx:48` (platform, →
`/platform/login?reason=idle`). `LoginView.tsx:13` reads it as a strict equality
(`=== 'idle'`), so adding a second `session-expired` const cannot disturb it, and the existing
i18n test (`LoginView.i18n.test.tsx:44-47`) pins the idle copy.

Required change: as the set grows past one, replace the ad-hoc equality checks with a **fixed
allow-list map** `reason → copy key`. That satisfies AUTH-401-04's no-reflection requirement in
the same edit and prevents a third reason from being bolted on as a third boolean.

**Semantic caution:** `idle` and `session-expired` are close enough that identical-sounding copy
would make the distinction worthless. `idle` = "we logged you out for inactivity" (our decision);
`session-expired` = "the server no longer accepts your token" (not our decision). The copy must
make that difference legible. PM's AUTH-401-01 already pins the idle regression — **upheld**.

---

## 7. Ruling 7 — Plane isolation

### Confirmed: the platform plane is structurally unaffected — with two defects found in the recovery path

**Clean, as PM assumed:**
- `platformAuthStore.ts` is a **separate store** with shape
  `{ token, platformUserId, role, name, plane }` — **no `permissions` array, no
  `permissionsLoaded`**. INV-PERM-1 has no platform analogue and nothing in this branch creates one.
- `/platform/*` (`App.tsx:126-134`) contains **zero `RequirePermission`** — verified by grep. It
  cannot emit a 403 and needs no 403 route.
- Nothing in AUTH-1…AUTH-12 touches `platformAuthStore`, `PlatformLoginView`, or platform routing.

> **F-6 — `authStore.plane === 'platform'` is unreachable.**
> No production code ever sets `plane: 'platform'` on the **clinic** `authStore` — grep finds it
> only inside `platformAuthStore.ts:16,54`. Consequences:
> (a) `authStore.ts:146`'s `/platform/auth/me` branch in `refreshPermissions` is **dead code**;
> (b) **AUTH-403-04 designs for an unreachable state** → withdrawn (§6.3).
> Do not delete the dead branch in this branch — out of scope, recorded as **B-3**.

> **F-7 (severity: medium) — a platform session's 401 recovery lands on the clinic plane.**
> Both 401 handlers hard-code the **clinic** login: `authStore.ts:153` and `api.ts:35` each set
> `window.location.href = '/login'` with no plane branch. A platform-plane session whose token
> dies is therefore ejected onto the clinic login page. Pre-existing — but AUTH-3 would **cement**
> it by appending `?reason=session-expired` to a wrong-plane destination, making the branch ship a
> plane-crossing recovery path under the banner of fixing recovery paths. Covered by
> **AUTH-401-03**; one `plane === 'platform' ? '/platform/login' : '/login'` at each site.

**Observation (not a finding for this branch):** `<Route path="/platform">` carries **no**
`RequireAuth`/`RequirePlane` wrapper in `App.tsx` — `PlatformLayout` gates itself internally.
Different from the clinic trees' route-level guarding. Out of scope; noted for whoever next audits
the platform plane.

---

## 8. Conditions on this approval

`/write-plan` (Step 4) is blocked until all eleven are satisfied.

| # | Condition | Owner |
|---|---|---|
| **C-1** | Build **shape (a)** — a `403` child route under `/clinic-admin`, `/clinic`, `/settings` (three, not four). Shape (b) is rejected. | @pm-agent → plan |
| **C-2** | Keep the absolute `/403` as a shell-less fallback, made recoverable (logout + `/preferences` link). Flagged as trimmable by Ponytail. | @pm-agent |
| **C-3** | The plan must **forbid** re-composing sidebar chrome into a standalone 403 component (duplication, Ponytail #2) **and** forbid rendering `ClinicLayout`/`AdminLayout` from a 403 component (**F-1** loop). | @pm-agent |
| **C-4** | @dev-agent must **verify** the relative-redirect mechanism against the installed react-router version before relying on it; fall back to an explicit tree-prefix map. Not asserted as fact here. | @dev-agent |
| **C-5** | Add the 9 new AC (§6.4); apply the 2 restatements (§6.2); remove `AUTH-403-04` (§6.3). | @pm-agent |
| **C-6** | `RequireAuth` on the 403 route must check `isAuthenticated()` **only** — never permissions. Zero-permission ≠ unauthenticated (Ruling 3). | @dev-agent |
| **C-7** | AUTH-2 must specify a **total** contract over all five exits, including `!token` and an explicit 401 return (**F-5**). | @pm-agent |
| **C-8** | AUTH-2 must name all **five** ripple files from §5's table; AUTH-10 corrected from *create* to *extend* `store/__tests__/authStore.test.ts`. | @pm-agent |
| **C-9** | Scope AUTH-BL-1 to include the `api.ts` interceptor (**F-4**) and the plane-correct destination (**F-7**). Fixing `refreshPermissions` alone leaves the dominant 401 path unexplained. | @pm-agent |
| **C-10** | Add the two nav-filter edits (**F-3**): `ClinicLayout` dashboard `perm`, `AdminLayout` `hasPermission` filter. `SettingsLayout` → backlog **B-2**. | @pm-agent |
| **C-11** | Every new AC must be **falsifiable against pre-fix code** — reverting the fix makes the test fail. No repeat of the F-5 vacuous-assertion class. | @qa-agent |

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Ponytail rejects (a) on file count | Step 5 blocked | §2 pre-empts it: 3 route lines in 1 file, deletes an AC, avoids ~70 duplicated lines. (a) is the *smaller* change. |
| C-9 grows scope beyond the brief | Ponytail #4 | Two one-line changes at two existing redirect sites. Without it AUTH-BL-1's own AC is false for ~95% of real 401s. |
| Relative-redirect API doesn't behave as expected | AUTH-7 rework | C-4 requires verification first, with a named fallback. |
| F-3 fix drifts into a nav redesign | Ponytail #4 | C-10 caps it at two edits; `SettingsLayout` explicitly deferred to B-2. |
| Warning-toast persistence needs a new component | Ponytail #6/#7 | Reuse the existing `ToastState` variant plus suppression of the 4s timeout. If a new component is needed, @uiux-agent's Step 6 pass rules — not @dev-agent unilaterally. |

## 10. Backlog raised (not this branch)

- **B-1** — Other users holding an edited role keep stale permissions; no client `permSetVersion`
  check. Needs server-driven invalidation. (Ruling 1/A2.)
- **B-2** — `SettingsLayout.tsx:41` filters nav by role string, not permission — structurally
  misaligned with custom roles. (F-3.)
- **B-3** — Dead `/platform/auth/me` branch in `authStore.refreshPermissions`. (F-6.)
- **B-4** — `/platform` route tree has no route-level `RequireAuth`/`RequirePlane`, unlike the
  clinic trees. (Ruling 7 observation.)

---

## 11. Definition of Ready — hand-off to @pm-agent

| Criterion | Status |
|---|---|
| Objective stated | ✅ §0 header |
| Actors & roles named | ✅ clinic roles, zero-permission custom-role user, platform user |
| Permission codes assigned | ✅ `dashboard.view`, `clinic.profile.view`, `billing.create`, `roles.view` |
| Exception cases listed | ✅ §4 (entries/exits), §5 (five exits), §6.4 |
| NFR impact noted | ✅ No new endpoint, no new dependency, no DB change, no server authz change. Frontend-only. Security posture **unchanged** — server remains the boundary throughout. |
| Acceptance criteria testable | ✅ 22 AC (15 − 1 withdrawn + 9 new), 2 restated for falsifiability |
| Dependencies & risks recorded | ✅ §9, §5 ripple table |

**Ready for Step 3.5 (`/grill-with-docs`) once C-1…C-11 are folded into the PM task list.**
Per CLAUDE.md, `/grill-with-docs` is mandatory and `/write-plan` stays blocked until it runs and
its findings are resolved. Recommended grill targets: **F-1** (the loop shape (b) would have
shipped), **F-2** (malformed body → fabricated zero-permission), and **A2's severity ruling**
(persistent warning vs force-logout).

---

*@ba-agent — Step 3 complete. Verdict: APPROVED WITH CONDITIONS.*
