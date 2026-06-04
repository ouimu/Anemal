# Component Spec: AppSidebar
**Owner:** @uiux-agent  
**Consumed by:** @dev-agent (Task 1.5 — Responsive Shell Layout)  
**Device:** Tablet (touch-first) + Web

---

## 1. Component Overview

The `AppSidebar` is a collapsible navigation panel that anchors the app shell. It supports:
- Full label mode (expanded) and icon-only mode (collapsed)
- Left-hand and right-hand placement toggle (persisted to `localStorage`)
- Active route highlighting
- Responsive behaviour at 768 px (portrait) and 1024 px (landscape)

---

## 2. Props

```ts
interface AppSidebarProps {
  currentPath: string;          // Active route, e.g. '/dashboard'
  role: 'admin' | 'doctor' | 'staff';
  collapsed?: boolean;          // Controlled — parent owns state
  onToggleCollapse: () => void;
  side?: 'left' | 'right';      // Default: 'left'
  onToggleSide: () => void;
}
```

---

## 3. States

| State | Visual |
|-------|--------|
| **Expanded** | 240 px wide; icon + label visible |
| **Collapsed** | 64 px wide; icon only; labels in tooltip on hover |
| **Active item** | Accent background pill on nav item |
| **Disabled item** (role-gated) | 40% opacity, pointer-events: none |
| **Mobile overlay** | Full-width drawer over content; backdrop closes it |

---

## 4. Navigation Items (role-gated)

| Icon | Label | Route | Min Role |
|------|-------|-------|----------|
| 📅 | Dashboard | `/dashboard` | staff |
| 🗓 | Appointments | `/appointments` | staff |
| 🐾 | Patients | `/patients` | staff |
| 📋 | EMR | `/emr` | doctor |
| 💊 | Inventory | `/inventory` | staff |
| 🧾 | Billing | `/billing` | staff |
| ⚙️ | Settings | `/settings` | admin |

Items the user's role cannot access are hidden entirely (not disabled), to avoid confusing clinic staff.

---

## 5. Size & Touch Constraints

- **Nav item tap target:** minimum `44 × 44 px` (height enforced via `min-h-[44px]`)
- **Gap between items:** `8 px` (`gap-2` in Tailwind)
- **Toggle button (collapse/expand):** `44 × 44 px` circle button at bottom of sidebar
- **Side-swap button:** `44 × 44 px`, appears below toggle
- **Icon size:** `24 × 24 px` (`w-6 h-6`)

---

## 6. Responsive Behaviour

| Viewport | Sidebar Behaviour |
|----------|-------------------|
| `≥ 1280 px` (desktop) | Expanded by default; collapse is optional |
| `1024 px` (tablet landscape) | Collapsed by default; toggle available |
| `768 px` (tablet portrait) | Hidden; hamburger in top bar opens as overlay drawer |
| `< 768 px` | Same as 768 — overlay drawer only |

The sidebar **never causes horizontal scroll** at 768 px. When collapsed, main content fills the remaining viewport with `ml-16` (64 px offset).

---

## 7. Left / Right-Hand Mode

- Toggle button swaps `left-0` ↔ `right-0` positioning on the sidebar, and `ml-64`/`ml-16` ↔ `mr-64`/`mr-16` on the main content wrapper.
- Persisted to `localStorage` under the key `vetclinic_sidebar_side`.
- Collapsed state is also persisted under `vetclinic_sidebar_collapsed`.

---

## 8. Tailwind Class Suggestions for @dev-agent

### Sidebar container
```
fixed top-0 bottom-0 z-40 flex flex-col bg-white border-r border-gray-200
transition-all duration-200 ease-in-out
w-64 (expanded) | w-16 (collapsed)
left-0 (left-hand) | right-0 (right-hand)
```

### Nav item (active)
```
flex items-center gap-3 px-3 min-h-[44px] rounded-lg
bg-blue-50 text-blue-700 font-medium
```

### Nav item (default)
```
flex items-center gap-3 px-3 min-h-[44px] rounded-lg
text-gray-600 hover:bg-gray-100 hover:text-gray-900
```

### Collapse toggle button
```
flex items-center justify-center w-11 h-11 rounded-full
bg-gray-100 hover:bg-gray-200 text-gray-600
mt-auto mb-4 mx-auto
```

### Overlay backdrop (mobile)
```
fixed inset-0 z-30 bg-black/40 md:hidden
```

---

## 9. User Flow — Collapse

1. User taps the collapse toggle button (bottom of sidebar).
2. Sidebar animates from `w-64` → `w-16` over 200 ms.
3. Labels fade out; only icons remain visible.
4. Main content area adjusts offset from `ml-64` → `ml-16`.
5. State saved to `localStorage`.

## 10. User Flow — Side Swap

1. User taps the side-swap button below the collapse toggle.
2. Sidebar slides from left edge to right edge (or vice versa).
3. Main content padding mirrors the change.
4. State saved to `localStorage`.

---

## 11. Acceptance Criteria (aligns with Task 1.5)

- [ ] Sidebar collapses to icon-only mode; labels hidden, tooltips shown on hover
- [ ] Left/right-hand mode toggle works and persists across page reload
- [ ] All nav items pass 44 × 44 px tap target check
- [ ] Minimum 8 px gap between adjacent nav items
- [ ] No horizontal scroll at 768 px viewport
- [ ] At 768 px, sidebar is hidden and accessible via hamburger menu
- [ ] Active route item visually distinct from inactive items
- [ ] Role-gated items not rendered for unauthorised roles
