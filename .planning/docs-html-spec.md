# docs/index.html — HTML Structure Spec
**Owner:** @uiux-agent  
**Consumer:** @dev-agent  
**Source analysed:** `docs/index.html` (4 124 lines, pure HTML/CSS/JS — not a React component)

---

## 1. CSS Classes Inventory

### 1.1 CSS Custom Properties (`:root`)

```css
:root {
  --brand:      #0369a1;   /* blue — primary text/border accent */
  --brand-l:    #e0f2fe;   /* light blue — phase badge bg */
  --brand-d:    #075985;   /* dark blue — h1 colour, phase-header gradient start */
  --accent:     #0ea5e9;   /* link / .info callout border */
  --bg:         #f8fafc;   /* page background */
  --sidebar-bg: #0f172a;   /* dark navy sidebar */
  --sidebar-w:  270px;
  --text:       #1e293b;   /* body text */
  --muted:      #64748b;   /* secondary text, dates */
  --border:     #e2e8f0;   /* dividers */
  --code-bg:    #1e293b;
  --code-text:  #e2e8f0;
  --green:      #16a34a;   /* success / .ok callout / .cl-entry.new */
  --red:        #dc2626;   /* error / .danger callout / .cl-entry.fix */
  --yellow:     #d97706;   /* warn callout border */
}
```

**Note:** This is a standalone dark-sidebar documentation portal. It does NOT use Tailwind or the React Compassionate Care token set. Raw hex values are acceptable here — this is intentional per project design.

---

### 1.2 Existing CSS Class Catalogue

| Category | Classes | Notes |
|---|---|---|
| Layout | `.page`, `.page.active` | display:none / display:block toggle |
| Typography | `.page h1–h4`, `.page p`, `.page ul/ol/li`, `.page a`, `.page strong/em` | Scoped to `.page` |
| Tables | `.tbl-wrap` | overflow-x:auto wrapper; `<table>` unstyled (inherits body) |
| Callouts | `.callout`, `.callout.warn`, `.callout.danger`, `.callout.info`, `.callout.ok`, `.callout-icon` | flex row with left border |
| Badges | `.badge`, `.badge.agent-db`, `.badge.agent-dev`, `.badge.agent-qa`, `.badge.agent-pm`, `.badge.agent-ui`, `.badge.phase`, `.badge.new`, `.badge.fix` | pill shape, border-radius:999px |
| Phase header | `.phase-header`, `.phase-header h2`, `.phase-header p` | gradient banner used on roadmap pages |
| Step UI | `.step-header`, `.step-num` | numbered circle (32×32px, green) + flex row |
| Guide pages | `.guide-page`, `.guide-hero`, `.hero-howto`, `.hero-manual`, `.hero-admin` | hero gradient banner per page |
| Guide hero parts | `.guide-hero .sub`, `.guide-hero .meta`, `.guide-hero .tag` | role label, tag row, pill tags |
| Blockquotes | `.guide-page blockquote`, `.guide-page blockquote.tip`, `.blockquote.note`, `.blockquote.warning` | left border colour variants |
| Changelog | `.cl-entry`, `.cl-entry.new`, `.cl-entry.fix`, `.cl-date` | border-left timeline entries |
| Misc | `.tbl-wrap`, `mark` (search highlight), `.stat`, `.stat .l` | |

### 1.3 Classes Used in Guide Pages That Are NOT Defined in the Stylesheet

After audit, no dangling class references were found. All classes used in the three guide pages (`page-howtorun`, `page-usermanual`, `page-adminsetup`) resolve to definitions in the `<style>` block.

One inconsistency: `page-howtorun` does **not** use a `.sub` or `.meta`/`.tag` structure inside the hero (bare `<h1>` + `<p>` only). `page-usermanual` adds `.meta` + `.tag` spans. `page-adminsetup` uses `.sub` + `<h1>` + `<p>`. The Changelog page should follow the `page-usermanual` pattern (`.meta` + `.tag` rows) as it has multiple role audiences.

---

## 2. Structural Analysis of the 3 Existing Guide Pages

### 2.1 Pattern: Standard guide page shell

Each guide page follows this outer structure:

```html
<div class="page guide-page" id="page-{key}">
  <div class="guide-hero hero-{key}">
    <!-- optional: <div class="sub">Audience label</div> -->
    <!-- optional: <div class="meta"><span class="tag">…</span></div> -->
    <h1>Page Title</h1>
    <p>Short description</p>
  </div>

  <!-- content sections: h2 > h3 > p / ol / ul / table / blockquote / pre -->

</div><!-- /page-{key} -->
```

**Confirmed closers:**
- `page-howtorun` — closes at L3205 with bare `</div>` (correct, div count balanced: 2 open / 2 close)
- `page-usermanual` — closes at L3708 with bare `</div>` (correct, 6 open / 6 close)
- `page-adminsetup` — **BROKEN** (see Section 2.2 below)

---

### 2.2 Bug: `page-adminsetup` Broken Close Tags (L3997–3998)

**Symptom:** The div stack goes to -1 after the guide pages end, meaning one `</div><!-- /main -->` at L4001 is closing the wrong ancestor.

**Root cause (two defects on adjacent lines):**

**L3997:** `<blockquote>` is opened but never closed.
```html
<!-- Current (broken) -->
    <blockquote class="note"><p>This guide is written for <strong>Anemal Phase 9</strong>…</p>
    </section><!-- /usermanual -->
```

**L3998:** `</section><!-- /usermanual -->` is wrong in two ways:
1. There is no opening `<section>` anywhere in `page-adminsetup` — this tag is an orphan.
2. The comment says `/usermanual` but this is inside `page-adminsetup` — a copy-paste residue.

**Fix spec — replace L3997–3998 with:**
```html
    <blockquote class="note"><p>This guide is written for <strong>Anemal Phase 9</strong> (i18n complete rollout complete). Feature availability may differ in earlier or later versions. If you are unsure which version your clinic is running, check <strong>Settings → About</strong> or contact your administrator.</p></blockquote>

</div><!-- /page-adminsetup -->
```

**Exact old string to match (for Edit tool):**
```
    <blockquote class="note"><p>This guide is written for <strong>Anemal Phase 9</strong> (i18n complete rollout complete). Feature availability may differ in earlier or later versions. If you are unsure which version your clinic is running, check <strong>Settings → About</strong> or contact your administrator.</p>
    </section><!-- /usermanual -->
```

**Exact new string:**
```
    <blockquote class="note"><p>This guide is written for <strong>Anemal Phase 9</strong> (i18n complete rollout complete). Feature availability may differ in earlier or later versions. If you are unsure which version your clinic is running, check <strong>Settings → About</strong> or contact your administrator.</p></blockquote>

</div><!-- /page-adminsetup -->
```

**After fix:** div balance for `page-adminsetup` will be 3 open / 3 close (balanced). The `</div><!-- /content -->` at L4000 and `</div><!-- /main -->` at L4001 will close their correct ancestors.

---

### 2.3 Other Structural Notes for Existing Guide Pages

1. `page-howtorun` hero has no `.sub` or `.meta` — bare `<h1>` + `<p>` directly inside `.guide-hero`. This is fine; the hero CSS supports either pattern.

2. All three guide pages use `<table>` without `.tbl-wrap` in several places inside content sections. For consistency with the rest of `docs/index.html`, table elements inside `.guide-page` sections that may overflow on narrow viewports should be wrapped with `<div class="tbl-wrap">`. This is a low-priority improvement — not a bug.

3. `page-usermanual` and `page-adminsetup` both use `onclick="show('…')"` cross-links. This pattern is correct — the `show()` function is defined in the inline `<script>` block at L4003+.

---

## 3. New CSS Required for Changelog Page

The existing `.cl-entry`, `.cl-entry.new`, `.cl-entry.fix`, `.cl-date` classes cover basic changelog entries but are designed for small inline entries (e.g. a git-style list). For a full phase-level timeline the following additional classes are needed.

Add to the `<style>` block, after the `/* ── Changelog ── */` block:

```css
/* ── Changelog timeline (phase-level) ── */
.hero-changelog { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); }

.cl-phase-block { margin: 0 0 32px; }
.cl-phase-header {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px; border-radius: 10px 10px 0 0;
  background: linear-gradient(135deg, var(--brand-d) 0%, var(--brand) 100%);
  color: #fff;
}
.cl-phase-num {
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255,255,255,.2); color: #fff;
  font-size: 15px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cl-phase-title { font-size: 17px; font-weight: 700; margin: 0; }
.cl-phase-subtitle { font-size: 12px; opacity: .8; margin-top: 2px; }
.cl-phase-meta { margin-left: auto; text-align: right; }
.cl-phase-date { font-size: 12px; opacity: .75; }
.cl-status {
  display: inline-block; padding: 2px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 700; margin-top: 4px;
}
.cl-status.complete { background: #dcfce7; color: #166534; }
.cl-status.paused   { background: #fef9c3; color: #713f12; }
.cl-status.active   { background: #dbeafe; color: #1e40af; }

.cl-phase-body {
  border: 1px solid var(--border); border-top: none;
  border-radius: 0 0 10px 10px; padding: 16px 20px;
}
.cl-deliverables { padding-left: 20px; margin: 8px 0 0; }
.cl-deliverables li { font-size: 13.5px; line-height: 1.7; color: #334155; margin: 3px 0; }
.cl-test-count {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--green);
  margin-top: 10px; padding: 4px 10px;
  background: #dcfce7; border-radius: 999px;
}
```

**Rationale for `hero-changelog` gradient:** uses indigo (`#1e1b4b → #312e81`) to distinguish it visually from the three existing heroes (howto=navy, manual=blue, admin=green). Indigo reads as "history/archive."

---

## 4. Changelog Page HTML Template

Insert this div immediately after `</div><!-- /page-adminsetup -->` (after the fix above is applied), before `</div><!-- /content -->`.

```html
<div class="page guide-page" id="page-changelog">
  <div class="guide-hero hero-changelog">
    <div class="meta">
      <span class="tag">All Roles</span>
      <span class="tag">Phase History</span>
    </div>
    <h1>Anemal — Project Changelog</h1>
    <p>Complete release history by phase. Deliverables, test counts, and status for each development phase.</p>
  </div>

  <h2 id="changelog-overview">Release Overview</h2>
  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>Phase</th>
          <th>Focus</th>
          <th>Status</th>
          <th>Tests</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>
        <!-- PHASE_SUMMARY_ROWS — one <tr> per phase, generated from CLAUDE.md phases table -->
        <tr><td><span class="badge phase">Phase 1–7</span></td><td>Foundation → UI redesign sign-off</td><td><span class="cl-status complete">Complete</span></td><td>226</td><td>2025</td></tr>
        <tr><td><span class="badge phase">Phase 8</span></td><td>RBAC + Platform Console</td><td><span class="cl-status complete">Complete</span></td><td>~394</td><td>2026-Q1</td></tr>
        <tr><td><span class="badge phase">Phase 9</span></td><td>i18n Thai/English rollout</td><td><span class="cl-status complete">Complete</span></td><td>95 frontend</td><td>2026-06</td></tr>
        <tr><td><span class="badge phase">Phase 10</span></td><td>Payment gateway + SaaS billing</td><td><span class="cl-status paused">Paused</span></td><td>—</td><td>Needs credentials</td></tr>
        <tr><td><span class="badge phase">Phase 11</span></td><td>LINE/SMS dispatch</td><td><span class="cl-status paused">Paused</span></td><td>—</td><td>Needs credentials</td></tr>
      </tbody>
    </table>
  </div>

  <hr/>

  <!-- PHASE_9_BLOCK -->
  <div class="cl-phase-block" id="cl-phase-9">
    <div class="cl-phase-header">
      <div class="cl-phase-num">9</div>
      <div>
        <div class="cl-phase-title">i18n Rollout — Thai &amp; English</div>
        <div class="cl-phase-subtitle">Phases 9.01–9.08 · 16 clinic screens translated</div>
      </div>
      <div class="cl-phase-meta">
        <div class="cl-phase-date">Completed: 2026-06-18</div>
        <span class="cl-status complete">Complete</span>
      </div>
    </div>
    <div class="cl-phase-body">
      <p>260+ EN/TH key pairs. Custom lightweight i18n (no external library). Language toggle via Zustand <code>uiStore.language</code>. Platform Console excluded.</p>
      <ul class="cl-deliverables">
        <li>Custom <code>useTranslation()</code> hook + <code>locales/en.ts</code> / <code>locales/th.ts</code></li>
        <li>Language toggle in TopNav (flag pill, persists to localStorage)</li>
        <li>All 16 clinic screens: Dashboard, Appointments, Pets, EMR, Inventory, Billing, Inpatient, Grooming, Admin sections</li>
        <li>Role Editor + RBAC component strings (EN/TH)</li>
        <li>common.done key added; SuccessModal Done button wired</li>
        <li>ClinicBilling, ClinicInventory, ClinicDashboard remaining strings pass</li>
      </ul>
      <span class="cl-test-count">95 frontend tests passing</span>
    </div>
  </div>
  <!-- /PHASE_9_BLOCK -->

  <!-- PHASE_8_BLOCK -->
  <div class="cl-phase-block" id="cl-phase-8">
    <div class="cl-phase-header">
      <div class="cl-phase-num">8</div>
      <div>
        <div class="cl-phase-title">RBAC + Platform Console Restructure</div>
        <div class="cl-phase-subtitle">Tasks T-5A through T-5F · Two-plane authorization</div>
      </div>
      <div class="cl-phase-meta">
        <div class="cl-phase-date">Completed: 2026-Q2</div>
        <span class="cl-status complete">Complete</span>
      </div>
    </div>
    <div class="cl-phase-body">
      <p>Full two-plane auth: clinic plane (<code>/clinic/*</code>) and platform plane (<code>/platform/*</code>). Deny-by-default. Clinic Role Editor, Platform Console UI, multi-role assignment.</p>
      <ul class="cl-deliverables">
        <li>T-5A/B/C: Clinic plane middleware, permission catalogue, route guards</li>
        <li>T-5D-02–05: Platform plane isolation, <code>requirePlane()</code>, platform user seeding</li>
        <li>T-5E: Platform Console UI — tenant list, plan management, usage quotas</li>
        <li>T-5F: Clinic Role Editor, multi-role assignment, custom role CRUD</li>
        <li><code>&lt;Can&gt;</code> / <code>RequirePermission</code> guard components</li>
        <li>All nav items hidden when user lacks permission</li>
      </ul>
      <span class="cl-test-count">~394 tests passing</span>
    </div>
  </div>
  <!-- /PHASE_8_BLOCK -->

  <!-- PHASE_1_7_BLOCK -->
  <div class="cl-phase-block" id="cl-phase-1-7">
    <div class="cl-phase-header">
      <div class="cl-phase-num">1–7</div>
      <div>
        <div class="cl-phase-title">Foundation through UI Redesign Sign-off</div>
        <div class="cl-phase-subtitle">Core SaaS scaffold, multi-tenancy, all clinic modules, Compassionate Care design system</div>
      </div>
      <div class="cl-phase-meta">
        <div class="cl-phase-date">Completed: 2025</div>
        <span class="cl-status complete">Complete</span>
      </div>
    </div>
    <div class="cl-phase-body">
      <p>Multi-tenant PostgreSQL foundation with <code>tenant_id</code> on every table. All eight clinic modules implemented (Login, Dashboard, Appointments, Pets, EMR, Inventory, Billing/POS, Admin). Compassionate Care design system applied.</p>
      <ul class="cl-deliverables">
        <li>Phase 1: Project scaffold, Docker Postgres, Prisma, JWT auth</li>
        <li>Phase 2: Tenant isolation middleware, branch model</li>
        <li>Phase 3–4: Core clinic modules (Appointments, Pets, EMR, Inventory)</li>
        <li>Phase 4.5 / 1.5: Settings shell, clinic profile, AES-256-GCM secrets</li>
        <li>Phase 5–6: Billing/POS, Admin centre, blood bank</li>
        <li>Phase 7: Full UI redesign — Compassionate Care System tokens applied to all screens</li>
      </ul>
      <span class="cl-test-count">226 tests passing</span>
    </div>
  </div>
  <!-- /PHASE_1_7_BLOCK -->

  <div class="callout info">
    <span class="callout-icon">ℹ</span>
    <div>Phase 10 (Payment Gateway) and Phase 11 (LINE/SMS) are paused pending third-party credentials. They are scoped and ready to implement when credentials are available.</div>
  </div>

</div><!-- /page-changelog -->
```

---

## 5. JavaScript Integration — `pages` Config

The `pages` object in the inline `<script>` at L4004+ already has a `changelog` entry:

```js
changelog: { title: 'Changelog', badge: 'History' },
```

The page will be routable via `show('changelog')` and via `#changelog` URL hash with no JS changes needed. The nav item for Changelog is also already present in the sidebar nav groups (confirmed in the `pages` config object). No script changes required.

---

## 6. Summary: Dev-Agent Action List

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Fix `page-adminsetup` broken close (Section 2.2) | L3997–3998 | **Must fix** |
| 2 | Add new CSS classes for changelog timeline (Section 3) | `<style>` block, after `/* ── Changelog ── */` | Required for Changelog page |
| 3 | Insert Changelog page HTML (Section 4) | After `</div><!-- /page-adminsetup -->`, before `</div><!-- /content -->` | Required |
| 4 | Wrap bare `<table>` elements in `.guide-page` with `.tbl-wrap` | Inside all 3 guide pages | Low priority / nice-to-have |

**No changes needed to:** the `pages` JS config, the sidebar nav HTML, or any other page.
