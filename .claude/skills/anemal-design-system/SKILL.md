---
name: anemal-design-system
description: >
  Anemal Compassionate Care System design tokens, Tailwind class mapping, icon system,
  and AppSidebar component spec for @uiux-agent and @dev-agent. Use this skill whenever
  working on any frontend file — React components, views, layouts, Tailwind classes,
  sidebar or TopNav changes, or any visual element. Also trigger when choosing colors,
  typography, spacing, shadows, icons, or touch targets. If the task involves a .tsx
  file, CSS, or any mention of Tailwind, this skill should be active.
---

# Anemal Design System — Compassionate Care System

## Hard Rules (check before writing any JSX)

- **No raw hex colors** — token names only (`text-primary`, not `#000000`)
- **No generic Tailwind color utilities** — tokens only (`bg-secondary`, not `bg-green-600`)
- **No emoji in navigation or UI** — Material Symbols Outlined exclusively
- **Touch targets** — all interactive elements `min-h-[44px] min-w-[44px]`; table rows `min-h-[48px]`
- **Fonts loaded in `index.html`** — Plus Jakarta Sans (headline) + DM Sans (body) + Fira Code (code)

## Token Quick Reference

| Token | Tailwind class | Hex |
|---|---|---|
| Primary | `bg-primary` / `text-primary` | `#000000` |
| Secondary (Sage) | `bg-secondary` / `text-secondary` | `#006c4a` |
| Background | `bg-background` | `#f7f9fb` |
| Surface | `bg-surface` | `#ffffff` |
| Surface container low | `bg-surface-container-low` | `#f2f4f6` |
| On-surface | `text-on-surface` | `#191c1e` |
| On-surface-variant | `text-on-surface-variant` | `#45464d` |
| Outline-variant | `border-outline-variant` | `#c6c6cd` |
| Error | `text-error` / `bg-error` | `#EF4444` |
| Success | `text-success` | `#22C55E` |

## Common Nav Icons (Material Symbols Outlined)

`dashboard` · `pets` · `calendar_today` · `medical_services` · `inventory_2` · `payments` · `settings` · `group` · `business` · `bar_chart` · `credit_card`

## Reference files

- Full color, typography, spacing, shadow, icon token tables + DO/DON'T: `references/tokens.md`
- AppSidebar props, states, responsive behavior, Tailwind class suggestions, acceptance criteria: `references/sidebar-spec.md`

Read the relevant reference file before implementing or reviewing any UI component.
