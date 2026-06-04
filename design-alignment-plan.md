# Design Alignment Plan — Compassionate Care System
> **Status:** PLAN ONLY — Do not implement until approved  
> **Created:** 2026-06-04  
> **Source designs:** `stitch_vet_clinic_design_system/` (8 screens, read-only)  
> **Design tokens:** `stitch_vet_clinic_design_system/compassionate_care_system/DESIGN.md`

---

## 1. Objective

Align every layer of the VetClinic SaaS codebase — design tokens, component library, screen implementations, agent instructions, and phase roadmaps — with the **Compassionate Care System** design language from Stitch. The Stitch folder is the single source of truth for visual output. Nothing in that folder is modified.

---

## 2. Gap Analysis: Current vs. Target

### 2.1 Design Token Gaps

| Area | Current | Target (Stitch) | Fix |
|---|---|---|---|
| Primary color | `#0f172a` (config) | `#000000` (design HTMLs) | Update `primary.DEFAULT` |
| Secondary color | `#059669` (config) | `#006c4a` (design HTMLs) | Update `secondary.DEFAULT` |
| Brand indigo palette | `brand: { 700: '#4338ca', … }` — used in components | **Not in design system** | Remove `brand`; replace usages with `primary`/`secondary` |
| Sidebar background | `bg-brand-700` (indigo) | `bg-surface` (white) | Component reskin |
| Active nav indicator | Left fill `bg-brand-500` | Right border `border-r-4 border-primary bg-surface-container-low` | Layout update |
| Icon system | Emoji (🐾 📅 💊) | **Material Symbols Outlined** font | All nav + status icons |
| Google Fonts | Not loaded in `index.html` | Plus Jakarta Sans + DM Sans + Fira Code + Material Symbols | Add to `index.html` |

### 2.2 Sidebar Structure Gap

| | Current | Target |
|---|---|---|
| Background | `bg-brand-700` dark indigo | `bg-surface` white, `shadow-sm` |
| Icons | Emoji | Material Symbols Outlined |
| Active state | Filled indigo tab | Right border strip: `border-r-4 border-primary bg-surface-container-low` |
| Nav labels | `text-brand-100` | `text-on-surface-variant` inactive / `text-primary font-bold` active |
| Width | `w-52` expanded / `w-14` collapsed | `w-56` (keep collapse — product feature) |

> The Stitch prototypes show a fixed-wide sidebar. We keep the existing collapsible toggle feature but re-skin to Compassionate Care System colors and icons.

### 2.3 Top Nav Bar Gap

Current: No persistent top bar  
Target: Fixed `h-16` bar (`bg-surface border-b border-outline-variant`) with search center, notification bell, help icon, user avatar right. All page content offset: `pt-16 pl-56`.

### 2.4 Per-Screen Gaps

| Screen | Current | Design HTML | Key changes |
|---|---|---|---|
| Login | Indigo gradient, emoji | `login_page/code.html` | Split layout (hero image left / form right), Material icons, white form |
| Dashboard | Emoji stat cards | `dashboard_overview_1024x768/code.html` | 12-col bento grid, glass-card, appointments table, isolation alert panel |
| Appointments | Stub | `appointment_scheduling_1024x768/code.html` | Week calendar grid, doctor filter chips, booking form panel |
| Pet & Owner | Stub | `pet_owner_management_1024x768/code.html` | Split list+detail, filter chips, patient cards |
| EMR | Stub | `emr_1024x768/code.html` | SOAP tabs, vital steppers, anatomy canvas, timeline |
| Inventory | Stub | `inventory_management_1024x768/code.html` | Stock table, alert badges, barcode scanner CTA |
| Billing/POS | Stub | `billing_pos_1024x768/code.html` | Cart left + payment panel right, success modal |
| Admin | Blue-tinted | `admin_control_center_1024x768/code.html` | Subscription banner, users table, settings form |

---

## 3. Files to Create / Update

### 3.1 UPDATE (existing files)

| File | What changes | Phase |
|---|---|---|
| `DESIGN.md` (root) | Replace old blue-brand tokens with Compassionate Care System spec + Tailwind class cheat-sheet | 1 |
| `src/frontend/tailwind.config.js` | Remove `brand` indigo; `primary.DEFAULT='#000000'`; `secondary.DEFAULT='#006c4a'` | 1 |
| `src/frontend/index.html` | Add `<link>` for Google Fonts + Material Symbols Outlined | 1 |
| `src/frontend/src/index.css` | Add `.material-symbols-outlined` rendering fix; `.glass-card`; `.bento-grid` | 1 |
| `src/frontend/src/layouts/ClinicLayout.tsx` | Reskin sidebar (white bg, Material icons, right-border active); add TopNav | 1 |
| `src/frontend/src/layouts/AdminLayout.tsx` | Same reskin + `settings` nav item | 1 |
| `src/frontend/src/views/LoginView.tsx` | Full redesign: split layout, Material icons, white form surface | 1 |
| `src/frontend/src/views/clinic/ClinicDashboard.tsx` | Full redesign: bento grid, glass-card stat cards, appointments table | 1 |
| `src/frontend/src/views/admin/*.tsx` | Remove `brand-*` class references → use `primary`/`secondary` | 1 |
| `src/frontend/src/views/clinic/ClinicAppointments.tsx` | New UI per design spec | 2 |
| `src/frontend/src/views/clinic/ClinicPets.tsx` | New UI per design spec | 2 |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | New UI per design spec | 2 |
| `src/frontend/src/views/clinic/ClinicInventory.tsx` | New UI per design spec | 3 |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | New UI per design spec | 3 |
| `.claude/agents/uiux-agent.md` | Add icon system, screen spec paths, sidebar/topnav specs, design token reference | 1 |
| `.claude/roadmap/phase1-tasks.md` | Add "Design Reference" to Tasks 1.4.1 and 1.4.2 | 1 |
| `.claude/roadmap/phase2-tasks.md` | Add "Design Reference" to Tasks 2.1.4, 2.2.2, 2.3.2 | 2 |
| `.claude/roadmap/phase3-tasks.md` | Add "Design Reference" to Tasks 3.1.3, 3.2.x | 3 |
| `docs/index.html` | Add design alignment status column to progress tracker | 1 |

### 3.2 CREATE (new files)

| File | Purpose | Phase |
|---|---|---|
| `.claude/specs/design-system-tokens.md` | Developer cheat-sheet: every token → Tailwind class → hex value | 1 |
| `.claude/specs/screen-specs/00-shared-layout.md` | Sidebar + TopNav spec shared by all screens | 1 |
| `.claude/specs/screen-specs/01-login.md` | Login screen spec | 1 |
| `.claude/specs/screen-specs/02-dashboard.md` | Dashboard screen spec | 1 |
| `.claude/specs/screen-specs/08-admin.md` | Admin control center spec | 1 |
| `.claude/specs/screen-specs/03-appointments.md` | Appointments spec | 2 |
| `.claude/specs/screen-specs/04-pet-owner.md` | Pet & Owner spec | 2 |
| `.claude/specs/screen-specs/05-emr.md` | EMR spec | 2 |
| `.claude/specs/screen-specs/06-inventory.md` | Inventory spec | 3 |
| `.claude/specs/screen-specs/07-billing-pos.md` | Billing & POS spec | 3 |
| `src/frontend/src/components/MaterialIcon.tsx` | Wrapper: `<span class="material-symbols-outlined">` with fill/weight props | 1 |

---

## 4. Exact Token Delta

### tailwind.config.js

```diff
primary: {
- DEFAULT: '#0f172a',
+ DEFAULT: '#000000',
  container: '#131b2e',     // unchanged
  on: '#ffffff',            // unchanged
},
secondary: {
- DEFAULT: '#059669',
+ DEFAULT: '#006c4a',
  container: '#82f5c1',     // unchanged
},
- brand: {                  // DELETE — entire indigo palette
-   50: '#eef2ff', ... 900: '#312e81'
- },
```

### index.html — add to `<head>`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&family=Fira+Code&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
```

### index.css — add to `@layer base`

```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
  line-height: 1;
}
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid #E2E8F0;
}
```

---

## 5. Shared Layout Specs

### Sidebar

```
position: fixed left-0 top-0 h-screen z-50
width: w-56 expanded | w-14 collapsed (keep existing toggle)
bg: bg-surface  shadow-sm
flex: flex-col py-lg

HEADER (px-lg mb-xl):
  "VetClinic Pro"  — font-headline-sm text-primary font-bold
  Branch name      — font-label-md text-on-surface-variant

NAV (flex-grow, space-y-xs):
  Inactive: flex items-center gap-md px-lg py-md rounded-lg
            text-on-surface-variant hover:bg-surface-container
            min-h-[44px]
  Active:   flex items-center gap-md px-lg py-md
            text-primary font-bold border-r-4 border-primary bg-surface-container-low
            (no rounded — full-width strip)
  Icon: <span class="material-symbols-outlined">{icon}</span>
  Label: <span class="font-body-md text-body-md">{label}</span>

CLINIC NAV ITEMS:
  dashboard        → Dashboard   → /clinic/dashboard
  pets             → Pets        → /clinic/pets
  calendar_today   → Schedule    → /clinic/appointments
  medical_services → EMR         → /clinic/emr
  inventory_2      → Inventory   → /clinic/inventory
  payments         → Billing     → /clinic/billing

ADMIN NAV ITEMS (add):
  settings         → Admin       → /admin/dashboard

FOOTER (border-t border-outline-variant p-lg):
  User avatar (rounded-full 40px bg-primary text-on-primary) + name + role
  Logout icon button: min-h-[44px] min-w-[44px]
```

### TopNav

```
position: fixed top-0 z-40
left: pl-56 (or pl-14 when sidebar collapsed)
height: h-16
bg: bg-surface  border-b border-outline-variant
flex: flex items-center justify-between px-lg

LEFT:   Page title (font-headline-sm text-primary)
CENTER: Search input (rounded-full bg-surface-container-low border border-outline-variant
         w-80 min-h-[44px] px-md — prefix icon: search)
RIGHT:  notifications icon btn (min-h-[44px] min-w-[44px])
        help_outline icon btn
        User avatar (rounded-full 36px w-9 h-9)

Page content offset: pt-16 pl-56 p-lg
```

---

## 6. Screen-by-Screen Layout Specs

### 01 — Login (`login_page/code.html`)

```
Full-screen flex min-h-screen
  Left panel (md:w-3/5, hidden mobile):
    bg-primary-container, overflow-hidden
    Hero image: absolute inset-0 w-full h-full object-cover
    Overlay card (absolute bottom): bg-surface/90 backdrop-blur-md p-lg rounded-xl
      "Professional Excellence" label (text-secondary font-bold uppercase label-md)
      H2 headline + body text
  Right panel (md:w-2/5, flex-grow):
    bg-surface, flex flex-col justify-center items-center p-margin-desktop
    max-w container inner: w-full max-w-sm
    Branding:
      pets icon (FILL=1) in bg-primary-container rounded-lg w-10 h-10
      "VetClinic Pro" font-headline-sm font-bold text-primary
    H1 "Welcome back" font-headline-lg text-on-surface
    Subtitle text-on-surface-variant font-body-md
    Form (space-y-lg):
      Label: font-label-md text-on-surface-variant uppercase
      Input: bg-surface-container-low border border-outline-variant rounded-lg
             pl-[48px] py-[14px]  (icon prefix absolute left-md)
             focus:border-primary focus:ring-2 focus:ring-primary/20
      Submit: bg-primary text-on-primary rounded-lg min-h-[48px] font-semibold
```

### 02 — Dashboard (`dashboard_overview_1024x768/code.html`)

```
pt-16 pl-56 p-lg

PAGE HEADER:
  H2 "Clinic Overview" font-headline-lg text-primary
  Date p text-on-surface-variant font-body-md
  "New Appointment" button: bg-primary text-on-primary rounded-lg px-lg py-sm
                            flex items-center gap-sm (icon: add)

BENTO GRID (.bento-grid gap-md):
  [col-span-3] Revenue card:
    glass-card rounded-xl shadow-sm border-l-4 border-secondary p-md
    Chip: bg-secondary-container text-on-secondary-container rounded-full text-label-md
    Value: font-headline-md text-primary
    Trend: text-success + trending_up icon

  [col-span-3] Visits card:
    glass-card rounded-xl shadow-sm border-l-4 border-info p-md

  [col-span-6] Isolation Alerts:
    glass-card rounded-xl bg-error-container/20 border border-error/20 p-md
    Header: bg-error rounded-lg p-sm warning icon + H3 text-error + subtitle
    Alert rows: bg-surface rounded-lg p-sm flex justify-between min-h-[48px]
    Status badge: bg-error-container text-on-error-container rounded text-[10px] uppercase

  [col-span-8] Today's Appointments:
    glass-card rounded-xl overflow-hidden
    Table header: bg-primary text-on-primary p-lg
    Table: thead bg-surface-container-low, tr hover:bg-surface-container min-h-[48px]
    Status chips: rounded-full label-md uppercase

  [col-span-4] Waiting Queue:
    glass-card rounded-xl p-md
    Queue list rows: min-h-[48px] flex items-center justify-between

  [col-span-12] Quick Actions:
    Grid of 4 buttons: glass-card rounded-xl p-md flex flex-col items-center gap-sm
    Icon: material-symbols-outlined text-primary
    Label: font-label-md text-on-surface-variant
```

### 03 — Appointments (`appointment_scheduling_1024x768/code.html`)

```
pt-16 pl-56 p-lg

HEADER ROW:
  H2 "Clinic Schedule" + date nav (chevron_left / Today / chevron_right)
  View toggle: Day | Week  (rounded-full chips)
  Doctor filter chips (scrollable row)

SPLIT LAYOUT:
  Left col (col-span-8): Calendar grid
    Time column (left, text-label-md text-on-surface-variant)
    Doctor columns — time slot rows (min-h: 15min proportional)
    Appointment block: rounded p-sm text-xs colored by status
      Confirmed: bg-secondary-container
      Pending: bg-primary-fixed
      Urgent: bg-error-container

  Right col (col-span-4): Booking form panel
    H3 "Book New Appointment" font-headline-sm
    Pet search (autocomplete, pets icon prefix)
    Doctor selector (dropdown with avatar)
    Date picker + Time picker (touch-friendly)
    Visit type dropdown
    Notes textarea (small)
    Buttons: "Book Appointment" bg-primary / "Cancel" outline
```

### 04 — Pet & Owner (`pet_owner_management_1024x768/code.html`)

```
pt-16 pl-56 p-lg flex gap-lg

LIST PANEL (w-72 flex-shrink-0):
  Search: bg-surface-container-low rounded-full px-md min-h-[44px] (search icon prefix)
  filter_list button
  Filter chips row: All | Canine | Feline | Other (rounded-full)
  Patient cards (min-h-[72px] flex items-center gap-md px-md):
    Avatar: rounded-full 48px bg-primary-container text-on-primary-container
    Pet name: font-headline-xs text-on-surface
    Owner name: text-body-sm text-on-surface-variant
    Species chip: rounded-full text-label-md
    Active: bg-surface-container-low border-l-4 border-primary
    chevron_right icon

DETAIL PANEL (flex-1):
  Pet hero row:
    Photo: rounded-xl max-w-[120px] aspect-square object-cover
    Name: font-headline-md text-primary
    Species/breed/age chips: rounded-full bg-surface-container text-label-md
    Owner name with open_in_new link
  Owner card: bg-surface-container-low rounded-xl p-md
    Avatar + name + phone + email + ios_share button
  Tab bar: Overview | Medical History | Vaccinations | Prescriptions
    Active tab: border-b-2 border-primary text-primary
  Tab content: tables or timeline rows (min-h-[48px])
```

### 05 — EMR (`emr_1024x768/code.html`)

```
pt-16 pl-56 p-lg

3-COLUMN GRID:
  Left (col-span-2): Patient sidebar
    Current patient card: photo + name + species
    Recent visits mini-list (min-h-[48px] rows)

  Main (col-span-6): SOAP panel
    Patient header bar: bg-surface-container-low rounded-xl
      Avatar + H2 pet name + age + weight + visit date
    SOAP Tab bar: Subjective | Objective | Assessment | Plan
    Vital signs row (stepper buttons):
      Each metric: label + minus button + value display + plus button
      Buttons: min-h-[44px] min-w-[44px] rounded-lg bg-surface-container
    Text area per SOAP section: bg-surface-container-low rounded-lg min-h-[100px]
    Anatomy canvas section:
      Template selector: canine-lateral | canine-dorsal | feline-lateral
      Canvas: Konva.js on SVG body outline
      Tool row: pen (colors: red/black/blue) + eraser (min-h-[44px])

  Right (col-span-4): Info panel
    Lab Results section:
      Upload button (description icon + "Add Result")
      File list rows (min-h-[48px])
    Visit Timeline:
      Chronological list, each row: date chip + visit type + doctor
    Active Prescriptions:
      Mini-list: drug name + dosage + duration
      print button
```

### 06 — Inventory (`inventory_management_1024x768/code.html`)

```
pt-16 pl-56 p-lg

HEADER ROW:
  H2 "Medical Inventory" font-headline-lg
  Search input (rounded-full bg-surface-container-low min-h-[44px])
  Category filter (dropdown or chips)
  "Add Product" button (bg-primary text-on-primary, add_circle icon)
  qr_code_scanner button (outlined)

ALERT STRIP (conditional, above table):
  Low Stock card: bg-yellow-50 border-yellow-200 rounded-xl p-md warning icon + count
  Expiring Soon card: bg-error-container/20 rounded-xl p-md + count

TABLE (glass-card rounded-xl overflow-hidden):
  thead: bg-surface-container-low text-label-md text-on-surface-variant uppercase
  Columns: Product | Category | Stock Qty | Min Stock | Expiry | Status | ⋮
  Row min-height: 48px, hover:bg-surface-container
  Status chip:
    In Stock: bg-secondary-container text-on-secondary-container
    Low Stock: bg-yellow-100 text-yellow-800 + warning icon
    Out of Stock: bg-error-container text-on-error-container
  Actions: more_vert → Edit | Stock In | Deactivate

STOCK IN DRAWER (slide-in from right):
  Product name (read-only)
  Lot number input
  Quantity stepper (+ / –)
  Expiry date picker
  Supplier notes
  Save button: bg-secondary text-on-secondary
```

### 07 — Billing & POS (`billing_pos_1024x768/code.html`)

```
pt-16 pl-56 p-lg

SPLIT LAYOUT:
  Left col (col-span-7): Invoice
    Patient header: name + visit date + visit type chip + save icon btn
    Line items table:
      Columns: Service/Product | Qty (stepper) | Unit Price | Total | ✕
      Row min-height: 48px
      Footer row: "Add Service" + "Add Product" (outlined buttons)
    Summary block (bg-surface-container-low rounded-xl p-md):
      Subtotal / Discount / Tax (7%) / Total Due (font-headline-md)
    Print Invoice: outlined button (print icon)

  Right col (col-span-5): Payment
    "Total Due" label (font-headline-lg text-primary, large)
    Payment method tabs (rounded-full chips, tab state):
      Cash: Amount tendered input + Change display (auto-calc)
      Credit Card: card type selector + "Swipe/Insert card" instruction
      QR PromptPay: QR code image (128px) + confirmation amount
    "Process Payment" button:
      bg-secondary text-on-secondary rounded-lg min-h-[56px] full-width font-semibold

  Success Modal (overlay):
    bg-surface rounded-xl p-xl shadow-lvl3 max-w-sm
    check_circle icon (text-success, 64px)
    "Payment Successful!" font-headline-md
    Amount + method summary
    "Print Receipt" outlined btn + "Done" primary btn
```

### 08 — Admin (`admin_control_center_1024x768/code.html`)

```
pt-16 pl-64 p-lg  (admin sidebar may be w-64)

SUBSCRIPTION BANNER:
  bg-primary-container rounded-xl p-lg
  workspace_premium icon + Plan name (font-headline-md text-on-primary-container)
  Renewal date + usage stats (progress bar: bg-secondary on bg-surface-container)
  "Upgrade Plan" button: bg-secondary text-on-secondary rounded-lg

TAB BAR: Overview | Users | Branches | Settings
  Active: border-b-2 border-primary text-primary font-semibold
  Inactive: text-on-surface-variant hover:bg-surface-container

USERS TAB (table):
  thead: bg-surface-container-low text-label-md uppercase
  Columns: User | Email | Role | Status | Last Active | Actions
  Row min-height: 48px hover:bg-surface-container
  Role badge:
    admin: bg-error-container text-on-error-container
    doctor: bg-primary-fixed text-on-primary-fixed
    staff: bg-secondary-container text-on-secondary-container
  Status chip: active=success-tinted, inactive=surface-container-high
  Actions: edit icon btn + toggle active btn (min-h-[44px] min-w-[44px])

SETTINGS TAB (form):
  Sections with font-headline-xs labels, divider lines
  Inputs: bg-surface-container-low border border-outline-variant rounded-lg
          focus:border-primary focus:ring-2 focus:ring-primary/20 min-h-[44px]
  Save section button: bg-primary text-on-primary rounded-lg
```

---

## 7. Implementation Order (Claude Code Sessions)

### Phase 1 — Foundation & Core Shell

> **Status: COMPLETE** (2026-06-04) — P1-04 and P1-14/P1-15 are doc-only tasks, deferred.

| # | Target file | Status |
|---|---|---|
| P1-01 | `src/frontend/index.html` | ✅ Done |
| P1-02 | `src/frontend/tailwind.config.js` | ✅ Done |
| P1-03 | `src/frontend/src/index.css` | ✅ Done |
| P1-04 | `DESIGN.md` (root) | ✅ Done |
| P1-05 | `.claude/specs/design-system-tokens.md` | ✅ Done |
| P1-06 | `.claude/specs/screen-specs/00-shared-layout.md` | ✅ Done |
| P1-07 | `src/frontend/src/components/MaterialIcon.tsx` | ✅ Done |
| P1-08 | `src/frontend/src/layouts/ClinicLayout.tsx` | ✅ Done |
| P1-09 | `src/frontend/src/layouts/AdminLayout.tsx` | ✅ Done |
| P1-10 | `src/frontend/src/components/TopNav.tsx` | ✅ Done |
| P1-11 | `src/frontend/src/views/LoginView.tsx` | ✅ Done |
| P1-12 | `src/frontend/src/views/clinic/ClinicDashboard.tsx` | ✅ Done |
| P1-13 | `src/frontend/src/views/admin/*.tsx` | ✅ Done (all brand-* removed) |
| P1-14 | `.claude/agents/uiux-agent.md` | ✅ Done |
| P1-15 | `.claude/roadmap/phase1-tasks.md` | ✅ Done |
| P1-16 | `.claude/specs/screen-specs/01-login.md` | ✅ Done |
| P1-17 | `.claude/specs/screen-specs/02-dashboard.md` | ✅ Done |
| P1-18 | `.claude/specs/screen-specs/08-admin.md` | ✅ Done |
| P1-19 | `docs/index.html` | ✅ Done |

### Phase 2 — Before Phase 2 UI work begins

| # | Target file | Instruction |
|---|---|---|
| P2-01 | `.claude/specs/screen-specs/03-appointments.md` | Create |
| P2-02 | `.claude/specs/screen-specs/04-pet-owner.md` | Create |
| P2-03 | `.claude/specs/screen-specs/05-emr.md` | Create |
| P2-04 | `.claude/roadmap/phase2-tasks.md` | Add design references |
| P2-05 | `src/frontend/src/views/clinic/ClinicAppointments.tsx` | Redesign per spec |
| P2-06 | `src/frontend/src/views/clinic/ClinicPets.tsx` | Redesign per spec |
| P2-07 | `src/frontend/src/views/clinic/ClinicEMR.tsx` | Redesign per spec |

### Phase 3 — Before Phase 3 UI work begins

| # | Target file | Instruction |
|---|---|---|
| P3-01 | `.claude/specs/screen-specs/06-inventory.md` | Create |
| P3-02 | `.claude/specs/screen-specs/07-billing-pos.md` | Create |
| P3-03 | `.claude/roadmap/phase3-tasks.md` | Add design references |
| P3-04 | `src/frontend/src/views/clinic/ClinicInventory.tsx` | Redesign per spec |
| P3-05 | `src/frontend/src/views/clinic/ClinicBilling.tsx` | Redesign per spec |

---

## 8. Rules for Claude Code

1. Never modify `stitch_vet_clinic_design_system/` — read-only reference.
2. Before implementing any screen, open the corresponding `code.html` and extract exact Tailwind classes.
3. Use Material Symbols Outlined for all icons — no emoji in navigation or UI elements.
4. All interactive elements must remain ≥ 44×44px (`min-h-[44px] min-w-[44px]`).
5. Keep the collapsible sidebar toggle — reskin only, do not remove the feature.
6. No raw hex values in component files — all colors use token names from `tailwind.config.js`.
7. After each layout file change, verify render at 768px and 1024px widths.
8. Run `npm run lint` from `src/frontend/` after every file change.

---

## 9. What This Plan Does NOT Change

- All backend source files (`src/backend/`)
- Database schema + functional requirements specs
- System specification documents
- `CLAUDE.md`
- Phase 4 roadmap
- Multi-tenancy or RBAC architecture
