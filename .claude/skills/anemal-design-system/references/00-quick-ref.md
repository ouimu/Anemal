# Design System Quick Reference

> **For full definitions:** See [Tokens](01-tokens.md)  
> **For component specs:** See [Sidebar Spec](02-sidebar-spec.md)

---

## Color Tokens

| Token | Hex | Usage | Tailwind |
|-------|-----|-------|----------|
| Primary | `#000000` | Headlines, active states, primary buttons | `text-primary`, `bg-primary` |
| Secondary | `#006c4a` | Secondary buttons, accents | `text-secondary`, `bg-secondary` |
| Error | `#EF4444` | Error messages, destructive actions | `text-error`, `bg-error` |
| Success | `#22C55E` | Success states, confirmations | `text-success`, `bg-success` |
| Surface | `#FFFFFF` | Backgrounds, cards, containers | `bg-surface` |
| Border | `#E5E7EB` | Lines, dividers, outlines | `border-border` |

---

## Typography

| Token | Font | Usage | Tailwind |
|-------|------|-------|----------|
| Headline | Plus Jakarta Sans | Page titles, section headers | `font-headline` |
| Body | DM Sans | Paragraphs, form labels, body text | `font-sans` |
| Code | Fira Code | Code blocks, technical text | `font-code` |

---

## Spacing & Components

| Component | Min Size | Rule | Tailwind |
|-----------|----------|------|----------|
| Touch target | 44×44px | WCAG 2.5.5 — mandatory | `min-h-[44px] min-w-[44px]` |
| Sidebar | 224px wide | Fixed left sidebar | `w-56` |
| Top nav | 64px tall | Fixed top navigation | `h-16` |
| Content offset | Sidebar + nav | Prevent overlap | `pt-16 pl-56` |

---

## Icons & Imagery

- **Icon system:** Material Symbols Outlined
- **No emoji in navigation** (use icons instead)
- **Pet photos/X-rays:** Stored in S3, never embedded
- **Max file size:** 20 MB (JPEG, PNG, WebP, PDF)

---

## Layout Rules

**Sidebar:**
- Fixed left: 224px wide (`w-56`)
- Active item: `border-r-4 border-primary`
- Background: `bg-surface` (white)
- Shadow: `shadow-sm`

**Top Navigation:**
- Fixed top: 64px height (`h-16`)
- Background: `bg-surface` (white)
- Content below: offset with `pt-16 pl-56`

**Main Content:**
- Scrollable: everything except sidebar + nav
- Padding: use consistent spacing
- Responsive: stack on narrow screens

---

## Dark Mode & Accessibility

- **Dark mode:** Not yet supported (planned Phase 9)
- **Contrast:** All text meets WCAG AA (4.5:1 minimum)
- **Touch-first:** Design for 44×44px targets
- **Keyboard:** All interactive elements keyboard-accessible

---

## Common Patterns

**Button:**
```html
<button class="bg-primary text-white min-h-[44px] px-4 rounded">
  Click me
</button>
```

**Card:**
```html
<div class="bg-surface border border-border shadow-sm rounded p-4">
  Content here
</div>
```

**Form Input:**
```html
<input
  type="text"
  class="border border-border rounded p-2 min-h-[44px]"
  placeholder="Enter text"
/>
```

---

**Need detailed specs?** See [Token Definitions](01-tokens.md)
