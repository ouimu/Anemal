# DESIGN.md — Compassionate Care System
> Single source of truth for VetClinic SaaS design tokens, component rules, and layout constraints.  
> **Stitch prototypes are read-only reference:** `stitch_vet_clinic_design_system/<screen>/code.html`  
> **Full token cheat-sheet:** `.claude/specs/design-system-tokens.md`  
> Last updated: 2026-06-04

---

## Color Tokens

| Token | Tailwind class | Hex | Usage |
|---|---|---|---|
| Primary | `bg-primary` / `text-primary` | `#000000` | CTAs, headings, active nav, borders |
| Primary container | `bg-primary-container` | `#131b2e` | Dark container bg, icon zone on login |
| On-primary | `text-on-primary` | `#ffffff` | Text/icons on primary bg |
| On-primary-container | `text-on-primary-container` | `#7c839b` | Muted text on dark container |
| Secondary (Sage) | `bg-secondary` / `text-secondary` | `#006c4a` | Care actions, active toggles, success accent |
| Secondary container | `bg-secondary-container` | `#82f5c1` | Light chip/tag backgrounds |
| On-secondary-container | `text-on-secondary-container` | `#00714e` | Text on secondary-container |
| Background | `bg-background` | `#f7f9fb` | Page background |
| Surface | `bg-surface` | `#ffffff` | Cards, sidebar, TopNav |
| Surface container low | `bg-surface-container-low` | `#f2f4f6` | Active nav bg, input bg |
| Surface container | `bg-surface-container` | `#eceef0` | Hover states |
| Surface container high | `bg-surface-container-high` | `#e6e8ea` | Toggle off-state |
| On-surface | `text-on-surface` | `#191c1e` | Primary body text |
| On-surface-variant | `text-on-surface-variant` | `#45464d` | Labels, inactive nav, placeholders |
| Outline | `border-outline` | `#76777d` | Dividers |
| Outline-variant | `border-outline-variant` | `#c6c6cd` | Subtle borders, sidebar footer |
| Error | `text-error` / `bg-error` | `#EF4444` | Error states |
| Error container | `bg-error-container` | `#ffdad6` | Error tint backgrounds |
| On-error-container | `text-on-error-container` | `#93000a` | Error text on light bg |
| Success | `text-success` | `#22C55E` | Positive trends, check marks |
| Info | `text-info` | `#0EA5E9` | Informational |
| Warning | `text-warning` | `#EAB308` | Warnings, low-stock |

> **Rule:** Never use raw hex values or Tailwind gray-* / indigo-* in component files.  
> Use only the tokens above. The `brand` indigo palette has been removed.

---

## Typography

| Scale | Tailwind class | Size / Weight | Font |
|---|---|---|---|
| Headline LG | `text-headline-lg font-headline` | 32px / 700 | Plus Jakarta Sans |
| Headline MD | `text-headline-md font-headline` | 24px / 600 | Plus Jakarta Sans |
| Headline SM | `text-headline-sm font-headline` | 20px / 600 | Plus Jakarta Sans |
| Headline XS | `text-headline-xs font-headline` | 16px / 500 | Plus Jakarta Sans |
| Body MD | `text-body-md font-sans` | 16px / 400 | DM Sans |
| Body SM | `text-body-sm font-sans` | 14px / 400 | DM Sans |
| Label MD | `text-label-md` | 12px / 500, 0.5px tracking | DM Sans |
| Code | `font-code` | 14px / 400 | Fira Code |

Google Fonts loaded in `src/frontend/index.html`:
- Plus Jakarta Sans (400–800)
- DM Sans (400–700)
- Fira Code
- Material Symbols Outlined (icon font)

---

## Spacing (8px base scale)

| Token | Tailwind | Value |
|---|---|---|
| XS | `p-xs` / `gap-xs` / `m-xs` | 4px |
| SM | `p-sm` / `gap-sm` | 8px |
| MD | `p-md` / `gap-md` | 16px |
| LG | `p-lg` / `gap-lg` | 24px |
| XL | `p-xl` / `gap-xl` | 32px |
| 2XL | `p-2xl` | 48px |
| 3XL | `p-3xl` | 64px |
| Margin desktop | `p-margin-desktop` | 32px |

---

## Elevation / Shadow

| Level | Tailwind | Usage |
|---|---|---|
| 0 | (none) | Flat surfaces |
| 1 | `shadow-lvl1` | Cards, inputs at rest |
| 2 | `shadow-lvl2` | Hover states, dropdowns |
| 3 | `shadow-lvl3` | Modals, urgent alerts |

---

## Touch & Accessibility

- **Minimum tap target:** `min-h-[44px] min-w-[44px]` on ALL interactive elements
- **Table/list row minimum:** `min-h-[48px]`
- **Tap gap:** ≥ 8px between adjacent interactive elements
- **Keyboard-free:** All clinic workflows completable without physical keyboard
- **WCAG AA contrast** required on all text/background combinations

---

## Icon System

All icons use **Material Symbols Outlined** — never emoji in navigation or UI.

```tsx
// Via MaterialIcon component (preferred)
import MaterialIcon from '@/components/MaterialIcon'
<MaterialIcon name="dashboard" />
<MaterialIcon name="pets" fill={1} size={28} className="text-secondary" />

// Inline (matches Stitch HTML exactly)
<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
  pets
</span>
```

### Standard nav icons

| Module | Icon name |
|---|---|
| Dashboard | `dashboard` |
| Pets & Owners | `pets` |
| Schedule | `calendar_today` |
| EMR | `medical_services` |
| Inventory | `inventory_2` |
| Billing | `payments` |
| Admin / Settings | `settings` |
| Users | `group` |
| Clinic Profile | `business` |
| Usage | `bar_chart` |
| Subscription | `credit_card` |

---

## Component Specs

### Sidebar (both layouts)

```
Position: fixed left-0 top-0 h-screen z-50
Width:     w-56 (expanded) | w-14 (collapsed)
BG:        bg-surface shadow-sm

Header: border-b border-outline-variant min-h-[64px]
  Brand: text-headline-sm font-headline font-bold text-primary
  Toggle: menu_open / menu icon, min-h-[44px] min-w-[44px]

Nav item — inactive (expanded):
  flex items-center gap-md px-lg min-h-[44px] mx-sm rounded-lg
  text-on-surface-variant hover:bg-surface-container

Nav item — active (expanded):
  flex items-center gap-md px-lg min-h-[44px]
  border-r-4 border-primary bg-surface-container-low text-primary font-bold
  (no rounded, no mx — full-width strip)

Footer: border-t border-outline-variant
  Avatar: w-10 h-10 rounded-full bg-primary text-on-primary
  Logout: border border-outline-variant rounded-lg min-h-[44px]
```

### TopNav

```
Position: fixed top-0 right-0 h-16 z-40
Left:     left-56 (expanded) | left-14 (collapsed) — from uiStore.sidebarOpen
BG:       bg-surface border-b border-outline-variant

Left:   Page title — text-headline-sm font-semibold text-primary
Center: Search — w-80 min-h-[44px] rounded-full bg-surface-container-low
                 border-outline-variant pl-10 (search icon prefix)
                 focus:border-primary focus:ring-2 focus:ring-primary/20
Right:  notifications + help_outline icon buttons (min-h-[44px] min-w-[44px])
        User avatar: w-9 h-9 rounded-full bg-primary text-on-primary (initial)
```

Content offset: `ml-56 pt-16` (expanded) or `ml-14 pt-16` (collapsed)

### Buttons

```
Primary CTA:    bg-primary hover:bg-primary/90 text-on-primary
                rounded-lg min-h-[44px] (login CTA: min-h-[48px]) font-semibold
Secondary:      border border-primary text-primary rounded-lg
                hover:bg-surface-container-low min-h-[44px]
Danger:         bg-error text-on-primary hover:bg-error/90
Disabled:       opacity-50 cursor-not-allowed
```

### Inputs

```
Height:   min-h-[44px] (or py-[14px] inline)
BG:       bg-surface-container-low
Border:   border border-outline-variant rounded-lg
Focus:    focus:border-secondary focus:ring-1 focus:ring-secondary
          (or focus:border-primary focus:ring-2 focus:ring-primary/20)
Icon prefix: absolute left-md material-symbols-outlined text-outline
             → on focus: color changes to secondary (#006c4a)
```

### Cards

```
Standard:  bg-surface border border-outline-variant rounded-xl shadow-lvl1
Glass:     .glass-card rounded-xl shadow-lvl1
           (bg: rgba(255,255,255,0.85), backdrop-blur-md, border #e2e8f0)
Bento:     .bento-grid (12-col, 16px gap) — dashboard layout
Border accent: border-l-4 border-secondary (stat cards)
```

### Toggle

```
Width: w-11  Height: h-6  Border-radius: rounded-full
On:  bg-secondary  Off: bg-surface-container-high
Thumb: w-4 h-4 bg-surface rounded-full
Translate: translate-x-6 (on) / translate-x-1 (off)
```

### Status chips / badges

```
Success:  bg-secondary-container text-on-secondary-container rounded-full
Warning:  bg-yellow-100 text-yellow-800 rounded-full
Error:    bg-error-container text-on-error-container rounded-full
Role — admin:  bg-red-100 text-red-700 border-red-200
Role — doctor: bg-blue-100 text-blue-700 border-blue-200
Role — staff:  bg-green-100 text-green-700 border-green-200
```

---

## Screen Layout Specs

| Screen | Prototype | React component | Spec file |
|---|---|---|---|
| Login | `login_page/code.html` | `LoginView.tsx` | `.claude/specs/screen-specs/01-login.md` |
| Dashboard | `dashboard_overview_1024x768/code.html` | `ClinicDashboard.tsx` | `.claude/specs/screen-specs/02-dashboard.md` |
| Appointments | `appointment_scheduling_1024x768/code.html` | `ClinicAppointments.tsx` | `.claude/specs/screen-specs/03-appointments.md` |
| Pet & Owner | `pet_owner_management_1024x768/code.html` | `ClinicPets.tsx` | `.claude/specs/screen-specs/04-pet-owner.md` |
| EMR | `emr_1024x768/code.html` | `ClinicEMR.tsx` | `.claude/specs/screen-specs/05-emr.md` |
| Inventory | `inventory_management_1024x768/code.html` | `ClinicInventory.tsx` | `.claude/specs/screen-specs/06-inventory.md` |
| Billing/POS | `billing_pos_1024x768/code.html` | `ClinicBilling.tsx` | `.claude/specs/screen-specs/07-billing-pos.md` |
| Admin | `admin_control_center_1024x768/code.html` | `AdminView.tsx` | `.claude/specs/screen-specs/08-admin.md` |

> **Rule:** Before implementing any screen, open the corresponding `code.html` and copy its exact Tailwind classes. Never modify files inside `stitch_vet_clinic_design_system/`.

---

## Breakpoints

| Breakpoint | Width | Notes |
|---|---|---|
| Tablet portrait | 768px | Primary target — test all screens |
| Tablet landscape | 1024px | Sidebar expands to w-56 |
| Desktop | 1280px+ | Reception counter |
