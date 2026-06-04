# Design System Tokens — Compassionate Care System
> Developer cheat-sheet: every token → Tailwind class → hex value  
> Source: `stitch_vet_clinic_design_system/compassionate_care_system/DESIGN.md`  
> Config: `src/frontend/tailwind.config.js`

---

## Color Tokens

| Token name | Tailwind class | Hex value | Usage |
|---|---|---|---|
| Primary | `bg-primary` / `text-primary` | `#000000` | CTAs, headings, active nav, borders |
| Primary container | `bg-primary-container` | `#131b2e` | Dark container backgrounds |
| On-primary | `text-on-primary` | `#ffffff` | Text on primary bg |
| Secondary (Sage) | `bg-secondary` / `text-secondary` | `#006c4a` | Health/care actions, active toggles, accent |
| Secondary container | `bg-secondary-container` | `#82f5c1` | Light tag/chip backgrounds |
| On-secondary-container | `text-on-secondary-container` | `#00714e` | Text on secondary-container bg |
| Background | `bg-background` | `#f7f9fb` | Page background |
| Surface | `bg-surface` | `#ffffff` | Cards, sidebar, top nav |
| Surface container low | `bg-surface-container-low` | `#f2f4f6` | Active nav bg, input bg |
| Surface container | `bg-surface-container` | `#eceef0` | Hover states |
| Surface container high | `bg-surface-container-high` | `#e6e8ea` | Elevated containers |
| On-surface | `text-on-surface` | `#191c1e` | Primary body text |
| On-surface-variant | `text-on-surface-variant` | `#45464d` | Secondary/label text, inactive nav |
| Outline | `border-outline` | `#76777d` | Dividers |
| Outline-variant | `border-outline-variant` | `#c6c6cd` | Subtle borders, sidebar footer |
| Error | `text-error` / `bg-error` | `#EF4444` | Error states |
| Error container | `bg-error-container` | `#ffdad6` | Error backgrounds |
| On-error-container | `text-on-error-container` | `#93000a` | Error text on light bg |
| Success | `text-success` | `#22C55E` | Positive trends, success states |
| Info | `text-info` | `#0EA5E9` | Informational |

---

## Typography Tokens

| Token | Tailwind class | Size / Weight |
|---|---|---|
| Headline LG | `text-headline-lg font-headline` | 32px / 700 |
| Headline MD | `text-headline-md font-headline` | 24px / 600 |
| Headline SM | `text-headline-sm font-headline` | 20px / 600 |
| Headline XS | `text-headline-xs font-headline` | 16px / 500 |
| Body MD | `text-body-md` | 16px / 400 |
| Body SM | `text-body-sm` | 14px / 400 |
| Label MD | `text-label-md` | 12px / 500, 0.5px tracking |
| Headline font | `font-headline` | Plus Jakarta Sans |
| Body font | `font-sans` | DM Sans |
| Code font | `font-code` | Fira Code |

---

## Spacing Tokens

| Token | Tailwind class | Value |
|---|---|---|
| XS | `p-xs` / `gap-xs` | 4px |
| SM | `p-sm` / `gap-sm` | 8px |
| MD | `p-md` / `gap-md` | 16px |
| LG | `p-lg` / `gap-lg` | 24px |
| XL | `p-xl` / `gap-xl` | 32px |
| 2XL | `p-2xl` | 48px |
| Margin desktop | `p-margin-desktop` | 32px |

---

## Shadow Tokens

| Token | Tailwind class | Usage |
|---|---|---|
| Level 1 | `shadow-lvl1` | Cards, inputs at rest |
| Level 2 | `shadow-lvl2` | Hover states, dropdowns |
| Level 3 | `shadow-lvl3` | Modals, alerts |

---

## Touch Target Rules

| Rule | Class |
|---|---|
| Minimum interactive tap target | `min-h-[44px] min-w-[44px]` |
| Table/list row minimum | `min-h-[48px]` |

---

## Icon System

All icons use **Material Symbols Outlined** (never emoji in UI).

```tsx
import MaterialIcon from '@/components/MaterialIcon'

// Basic
<MaterialIcon name="dashboard" />

// Filled, heavier weight
<MaterialIcon name="pets" fill={1} weight={500} size={28} />

// With Tailwind color class
<MaterialIcon name="logout" size={18} className="text-on-surface-variant" />
```

Font loaded in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
```

---

## Common Nav Icons

| Screen | Material icon name |
|---|---|
| Dashboard | `dashboard` |
| Pets & Owners | `pets` |
| Schedule / Appointments | `calendar_today` |
| EMR | `medical_services` |
| Inventory | `inventory_2` |
| Billing | `payments` |
| Admin / Settings | `settings` |
| Users | `group` |
| Clinic Profile | `business` |
| Usage Stats | `bar_chart` |
| Subscription | `credit_card` |

---

## DO / DON'T

| DO | DON'T |
|---|---|
| `text-primary` | `text-black` / raw hex `#000000` |
| `bg-secondary` | `bg-green-600` |
| `border-outline-variant` | `border-gray-200` |
| `bg-surface-container-low` | `bg-gray-50` |
| `text-on-surface-variant` | `text-gray-500` |
| `focus:ring-primary/20` | `focus:ring-blue-500` |
| Material Symbols icon | Emoji in navigation |
