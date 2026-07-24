# T-5F-02 — Platform Console Screen Specs
**Routes:** `/platform/customers`, `/platform/customers/:id`, `/platform/plans`, `/platform/settings`, `/platform/audit`
**Auth guard:** `<RequireAuth>` + `<RequirePlane plane="platform">` ONLY — NO `<RequirePermission>` or `<Can>` anywhere under `/platform/*` (AC-P8)
**Agent:** @uiux-agent
**Breakpoints validated:** 768 px (portrait tablet) + 1024 px (landscape tablet)
**Design system:** Compassionate Care System (CCS)

---

## 0. Platform Shell (shared across all platform screens)

The platform plane uses its own shell, separate from the clinic shell. No clinic-side sidebar nav
items appear here. The platform shell is visually distinct to signal operator context.

### 0a. Platform Shell Layout

```
┌──────────────────────────────────────────────────────────┐
│  TopNav  (fixed h-16 bg-primary-container text-on-primary│
│           z-40)  — DARK top bar for platform distinction │
├─────────┬────────────────────────────────────────────────┤
│         │                                                │
│Platform │  Content area                                  │
│Sidebar  │  pt-16 pl-64 (left-hand)                      │
│w-64     │  or pt-16 pr-64 (right-hand)                  │
│(fixed)  │  bg-background                                │
│         │                                                │
└─────────┴────────────────────────────────────────────────┘
```

### 0b. Platform TopNav

```
fixed top-0 right-0 left-64 h-16 z-40
bg-primary-container text-on-primary
flex justify-between items-center px-margin-desktop
shadow-sm
```

**Left:** Wordmark `Anemal Platform` (`font-headline-sm text-headline-sm text-on-primary font-bold`)
with a `domain` Material Symbol to the left at 20 px.

**Right (actions — all `min-h-[44px] min-w-[44px]`):**
- Notifications bell: `hover:bg-primary/20 rounded-full p-2` with `notifications` icon `text-on-primary`
- Logged-in platform user name + avatar initials chip:
  `flex items-center gap-sm px-md py-xs bg-primary/30 rounded-full text-on-primary text-label-md`
- Logout button: `hover:bg-primary/20 rounded-full p-2` with `logout` icon `text-on-primary`

At 768 px: `left-0` (sidebar is overlay). Wordmark shortened to `Platform`.

### 0c. Platform Sidebar

```
fixed top-0 bottom-0 left-0 z-40 w-64
bg-surface shadow-sm flex flex-col py-lg
```

**Top section — branding:**
```html
<div class="px-lg mb-xl">
  <div class="flex items-center gap-sm">
    <span class="material-symbols-outlined text-primary text-[20px]">domain</span>
    <h1 class="font-headline-sm text-headline-sm text-primary font-bold">Platform</h1>
  </div>
  <p class="font-label-md text-label-md text-on-surface-variant mt-xs">Super Admin Console</p>
</div>
```

**Nav items** (`<nav class="flex-1 space-y-xs px-md">`):

| Icon | Label | Route |
|------|-------|-------|
| `group` | Customers | `/platform/customers` |
| `workspace_premium` | Plans | `/platform/plans` |
| `settings` | Settings | `/platform/settings` |
| `policy` | Audit | `/platform/audit` |

**Active item:**
```
flex items-center gap-md px-md py-base rounded-lg
text-primary font-bold border-r-4 border-primary bg-surface-container-low
min-h-[44px]
```
Active icon: FILL=1 (`style="font-variation-settings: 'FILL' 1;"`)

**Inactive item:**
```
flex items-center gap-md px-md py-base rounded-lg
text-on-surface-variant hover:bg-surface-container transition-colors
min-h-[44px]
```

**Footer — operator identity:**
```html
<div class="px-md mt-auto">
  <div class="flex items-center gap-md p-md bg-surface-container-low rounded-xl">
    <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center
                text-on-primary font-bold text-label-md">SA</div>
    <div>
      <p class="font-label-md text-on-surface font-bold truncate">Platform Admin</p>
      <p class="font-label-md text-on-surface-variant">Super Admin</p>
    </div>
  </div>
</div>
```

**Collapse toggle (bottom of nav, above footer):**
```html
<button class="flex items-center justify-center w-11 h-11 rounded-full
               bg-surface-container hover:bg-surface-container-high
               text-on-surface-variant mx-auto mb-md min-h-[44px] min-w-[44px]">
  <span class="material-symbols-outlined">menu_open</span>
</button>
```

At 768 px: sidebar hidden, hamburger in TopNav opens overlay drawer with `fixed inset-0 z-30 bg-black/40` backdrop.

### 0d. Content Area Shell

```
ml-64 min-h-screen bg-background
```
Inner wrapper: `pt-16 p-margin-desktop space-y-xl`

At 768 px: `ml-0 p-gutter`

**Right-hand mode** (when `uiStore.side === 'right'`):
- Sidebar: `right-0` instead of `left-0`
- TopNav: `right-64 left-0`
- Content: `mr-64 ml-0`

---

## 1. Customers List — `/platform/customers`

### 1a. Page Header

```html
<div class="flex justify-between items-end">
  <div>
    <h2 class="font-headline-lg text-headline-lg text-primary">Customers</h2>
    <p class="font-body-md text-on-surface-variant">All tenants on the Anemal platform.</p>
  </div>
  <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg shadow-sm
                 hover:opacity-90 transition-opacity flex items-center gap-xs
                 min-h-[44px] min-w-[44px]">
    <span class="material-symbols-outlined text-[20px]">add</span>
    Add Customer
  </button>
</div>
```

### 1b. Search + Filter Bar

```html
<div class="flex items-center gap-md bg-surface rounded-xl shadow-sm
            border border-outline-variant px-md py-sm flex-wrap">
  <!-- Search -->
  <div class="relative flex-1 min-w-[200px]">
    <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2
                 text-outline text-[20px]">search</span>
    <input type="text" placeholder="Search by name or subdomain…"
           class="w-full pl-xl pr-md py-xs bg-surface-container-low rounded-full
                  border-none focus:ring-2 focus:ring-primary/20 text-body-sm
                  min-h-[44px]" />
  </div>
  <!-- Status filter dropdown -->
  <select class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                 bg-surface text-on-surface focus:ring-2 focus:ring-primary/20
                 min-h-[44px] min-w-[44px]">
    <option value="">All statuses</option>
    <option value="active">Active</option>
    <option value="trial">Trial</option>
    <option value="suspended">Suspended</option>
  </select>
  <!-- Plan filter dropdown -->
  <select class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                 bg-surface text-on-surface focus:ring-2 focus:ring-primary/20
                 min-h-[44px] min-w-[44px]">
    <option value="">All plans</option>
    <!-- populated from GET /platform/plans -->
  </select>
</div>
```

### 1c. Customers Table

Full-width card: `bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden`

```html
<table class="w-full text-left">
  <thead>
    <tr class="text-label-md text-on-surface-variant border-b border-outline-variant
               bg-surface-container-lowest">
      <th class="px-lg py-md font-bold uppercase tracking-wider">Clinic Name</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Subdomain</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Plan</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Status</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Users</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider text-right">Actions</th>
    </tr>
  </thead>
  <tbody class="divide-y divide-outline-variant">
    <!-- Row -->
    <tr class="hover:bg-surface-container-low transition-colors cursor-pointer min-h-[48px]">
      <td class="px-lg py-md">
        <div class="flex items-center gap-md">
          <div class="w-10 h-10 rounded-full bg-secondary-container flex items-center
                      justify-center text-secondary font-bold text-label-md flex-shrink-0">VC</div>
          <div>
            <p class="font-bold text-on-surface">VetCare Downtown</p>
            <!-- Over-plan flag (R6 grandfathering) -->
            <span class="px-xs py-[2px] bg-error-container text-on-error-container
                         rounded text-label-md font-bold hidden [.over-plan_&]:flex
                         items-center gap-xs">
              <span class="material-symbols-outlined text-[12px]">warning</span>
              Over plan
            </span>
          </div>
        </div>
      </td>
      <td class="px-lg py-md">
        <span class="font-code text-body-sm text-on-surface-variant">vetcare-dt</span>
      </td>
      <td class="px-lg py-md">
        <span class="px-md py-xs bg-surface-container-high rounded-full
                     text-label-md font-bold">Professional</span>
      </td>
      <td class="px-lg py-md">
        <!-- Status badge — see StatusBadge component section 1d -->
        <StatusBadge status="active" />
      </td>
      <td class="px-lg py-md">
        <span class="text-body-sm text-on-surface">12</span>
      </td>
      <td class="px-lg py-md text-right">
        <button class="text-primary font-bold hover:underline text-body-sm
                       min-h-[44px] min-w-[44px] px-md">View</button>
      </td>
    </tr>
  </tbody>
</table>
```

### 1d. StatusBadge Component

Used in both the customers list and customer detail.

| Status | Classes |
|--------|---------|
| `active` | `px-md py-xs bg-sage-light text-on-secondary-container rounded-full text-label-md font-bold flex items-center gap-xs w-fit` + dot `w-2 h-2 bg-success rounded-full` |
| `trial` | `px-md py-xs bg-secondary-container text-on-secondary-container rounded-full text-label-md font-bold flex items-center gap-xs w-fit` + dot `w-2 h-2 bg-secondary rounded-full` |
| `suspended` | `px-md py-xs bg-error-container text-on-error-container rounded-full text-label-md font-bold flex items-center gap-xs w-fit` + dot `w-2 h-2 bg-error rounded-full` |

### 1e. Loading State

```html
<!-- Skeleton table rows × 5 -->
<tr class="animate-pulse border-b border-outline-variant">
  <td class="px-lg py-md"><div class="h-5 bg-surface-container-high rounded w-40"></div></td>
  <td class="px-lg py-md"><div class="h-4 bg-surface-container rounded w-28"></div></td>
  <td class="px-lg py-md"><div class="h-5 bg-surface-container-high rounded w-24"></div></td>
  <td class="px-lg py-md"><div class="h-5 bg-surface-container-high rounded w-20"></div></td>
  <td class="px-lg py-md"><div class="h-4 bg-surface-container rounded w-8"></div></td>
  <td class="px-lg py-md"><div class="h-4 bg-surface-container rounded w-10 ml-auto"></div></td>
</tr>
```

### 1f. Empty State

```html
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-outline">group</span>
  <p class="font-headline-xs text-on-surface-variant">No customers yet</p>
  <p class="text-body-sm text-on-surface-variant">Add your first customer to get started.</p>
  <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg
                 hover:opacity-90 min-h-[44px] flex items-center gap-xs">
    <span class="material-symbols-outlined text-[20px]">add</span>
    Add Customer
  </button>
</div>
```

### 1g. Error State

```html
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-error">error_outline</span>
  <p class="font-headline-xs text-error">Failed to load customers</p>
  <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                 font-bold hover:bg-surface-container min-h-[44px] flex items-center gap-xs">
    <span class="material-symbols-outlined text-[16px]">refresh</span>
    Retry
  </button>
</div>
```

### 1h. "Add Customer" Modal (AC-P2)

Triggered by "Add Customer" button. Modal overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/40`

```html
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[560px] max-w-[calc(100vw-32px)] space-y-lg">
  <div class="flex items-center justify-between">
    <h3 class="font-headline-sm text-headline-sm text-primary">Add Customer</h3>
    <button class="min-h-[44px] min-w-[44px] flex items-center justify-center
                   hover:bg-surface-container rounded-full">
      <span class="material-symbols-outlined text-on-surface-variant">close</span>
    </button>
  </div>

  <div class="grid grid-cols-2 gap-md">
    <!-- Clinic Name -->
    <div class="col-span-2 space-y-xs">
      <label class="font-label-md text-primary font-bold">Clinic Name <span class="text-error">*</span></label>
      <input type="text" placeholder="e.g. Downtown Vet Clinic"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 focus:border-transparent
                    text-body-md min-h-[44px]" />
    </div>
    <!-- Subdomain -->
    <div class="col-span-2 space-y-xs">
      <label class="font-label-md text-primary font-bold">Subdomain <span class="text-error">*</span></label>
      <div class="flex">
        <input type="text" placeholder="downtown-vet"
               class="flex-1 px-md py-base border border-outline-variant rounded-l-lg
                      focus:ring-2 focus:ring-primary/20 focus:border-transparent
                      text-body-md min-h-[44px] font-code" />
        <span class="px-md py-base bg-surface-container-high border-y border-r
                     border-outline-variant rounded-r-lg text-on-surface-variant text-body-sm
                     flex items-center">.anemal.app</span>
      </div>
    </div>
    <!-- Plan dropdown — REQUIRED (AC-P2, D-1) -->
    <div class="col-span-2 space-y-xs">
      <label class="font-label-md text-primary font-bold">Plan <span class="text-error">*</span></label>
      <select class="w-full px-md py-base border border-outline-variant rounded-lg
                     focus:ring-2 focus:ring-primary/20 focus:border-transparent
                     text-body-md min-h-[44px] bg-surface text-on-surface">
        <option value="" disabled selected>Select a plan…</option>
        <!-- populated from GET /platform/plans -->
        <option value="starter">Starter — 1 branch / 5 staff / 500 owners</option>
        <option value="professional">Professional — 3 branches / 20 staff / 5,000 owners</option>
        <option value="clinic_plus">Clinic+ — 10 branches / 100 staff / Unlimited owners</option>
      </select>
      <!-- Guard: plans table empty edge case -->
      <!-- shown only when GET /platform/plans returns [] -->
      <p class="text-label-md text-error hidden [.no-plans_&]:block">
        No plans available. Create a plan first before adding a customer.
      </p>
    </div>
    <!-- Trial toggle -->
    <div class="col-span-2 flex items-center justify-between p-md
                bg-surface-container-low rounded-lg min-h-[44px]">
      <div>
        <p class="font-headline-xs text-on-surface">Trial period</p>
        <p class="text-label-md text-on-surface-variant">Use platform default trial days</p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer min-h-[44px] min-w-[44px]
                    items-center justify-end">
        <input type="checkbox" class="sr-only peer" />
        <div class="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer
                    peer-checked:after:translate-x-full peer-checked:after:border-white
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                    after:bg-white after:border-gray-300 after:border after:rounded-full
                    after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
      </label>
    </div>
  </div>

  <div class="flex gap-md justify-end pt-md border-t border-outline-variant">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px] flex items-center gap-xs
                   disabled:opacity-40 disabled:cursor-not-allowed">
      <span class="material-symbols-outlined text-[16px]">add</span>
      Create Customer
    </button>
  </div>
</div>
```

**Validation:** "Create Customer" button is disabled until Clinic Name, Subdomain, and Plan are all non-empty. Plan field renders disabled state `opacity-50 cursor-not-allowed` if plans list is empty (redirect to plan creation).

**API:** `POST /platform/customers` with `{ name, subdomain, planId (required), trial: boolean }`

---

## 2. Customer Detail — `/platform/customers/:id` (4 Tabs)

### 2a. Page Header

```html
<div class="flex items-center gap-md mb-xl">
  <!-- Back breadcrumb -->
  <button class="flex items-center gap-xs text-on-surface-variant hover:text-primary
                 transition-colors min-h-[44px]">
    <span class="material-symbols-outlined text-[20px]">arrow_back</span>
    <span class="text-body-sm font-bold">Customers</span>
  </button>
  <span class="text-outline">/</span>
  <span class="text-body-sm text-on-surface font-bold">VetCare Downtown</span>
</div>

<div class="flex justify-between items-end">
  <div class="flex items-center gap-md">
    <div class="w-12 h-12 rounded-full bg-secondary-container flex items-center
                justify-center text-secondary font-bold">VC</div>
    <div>
      <h2 class="font-headline-lg text-headline-lg text-primary">VetCare Downtown</h2>
      <div class="flex items-center gap-md">
        <span class="font-code text-body-sm text-on-surface-variant">vetcare-dt.anemal.app</span>
        <StatusBadge status="active" />
      </div>
    </div>
  </div>
  <!-- Suspend / Reactivate CTA (AC-P3) — rendered based on current status -->
  <!-- When status = active or trial: -->
  <button class="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                 hover:opacity-90 transition-opacity flex items-center gap-xs
                 min-h-[44px]">
    <span class="material-symbols-outlined text-[20px]">block</span>
    Suspend
  </button>
  <!-- When status = suspended: -->
  <button class="px-lg py-base bg-secondary text-on-primary font-bold rounded-lg
                 hover:opacity-90 transition-opacity flex items-center gap-xs
                 min-h-[44px]">
    <span class="material-symbols-outlined text-[20px]">check_circle</span>
    Reactivate
  </button>
</div>
```

### 2b. Tab Bar

```html
<div class="flex border-b border-outline-variant bg-surface rounded-t-xl overflow-x-auto">
  <!-- Active tab -->
  <button class="px-xl py-lg font-bold text-primary border-b-2 border-primary
                 whitespace-nowrap min-h-[44px]">Overview</button>
  <!-- Inactive tabs -->
  <button class="px-xl py-lg font-medium text-on-surface-variant hover:text-primary
                 transition-colors whitespace-nowrap min-h-[44px]">Plan & Quota</button>
  <button class="px-xl py-lg font-medium text-on-surface-variant hover:text-primary
                 transition-colors whitespace-nowrap min-h-[44px]">Provisioning</button>
  <button class="px-xl py-lg font-medium text-on-surface-variant hover:text-primary
                 transition-colors whitespace-nowrap min-h-[44px]">Usage</button>
</div>
```

At 768 px: tabs bar scrolls horizontally with `overflow-x-auto -mx-gutter px-gutter`.

---

### 2c. Tab 1 — Overview

Card: `bg-surface rounded-b-xl shadow-sm border border-t-0 border-outline-variant p-lg`

```
┌─────────────────────────────────────────────────────────────┐
│  DETAILS                                                     │
│  ┌──────────────────┬────────────────────────────────────┐  │
│  │ Clinic Name      │ VetCare Downtown                    │  │
│  │ Subdomain        │ vetcare-dt.anemal.app               │  │
│  │ Plan             │ Professional                        │  │
│  │ Status           │ [Active badge]                      │  │
│  │ Created          │ 12 Jan 2026                         │  │
│  │ Trial ends       │ — (not on trial)                    │  │
│  └──────────────────┴────────────────────────────────────┘  │
│                                                              │
│  ── DANGER ZONE ────────────────────────────────────────── │
│  [Suspend Customer] (destructive, requires confirm dialog)   │
└─────────────────────────────────────────────────────────────┘
```

**Detail rows:**
```html
<div class="space-y-lg">
  <h3 class="font-headline-xs text-headline-xs text-on-surface-variant
             uppercase tracking-wider pb-xs border-b border-outline-variant">Details</h3>
  <dl class="grid grid-cols-[180px_1fr] gap-md text-body-sm">
    <dt class="text-on-surface-variant font-bold">Clinic Name</dt>
    <dd class="text-on-surface">VetCare Downtown</dd>

    <dt class="text-on-surface-variant font-bold">Subdomain</dt>
    <dd class="font-code text-on-surface">vetcare-dt.anemal.app</dd>

    <dt class="text-on-surface-variant font-bold">Plan</dt>
    <dd>
      <span class="px-md py-xs bg-surface-container-high rounded-full
                   text-label-md font-bold">Professional</span>
    </dd>

    <dt class="text-on-surface-variant font-bold">Status</dt>
    <dd><StatusBadge status="active" /></dd>

    <dt class="text-on-surface-variant font-bold">Created</dt>
    <dd class="text-on-surface">12 Jan 2026</dd>

    <dt class="text-on-surface-variant font-bold">Trial ends</dt>
    <dd class="text-on-surface-variant">—</dd>
  </dl>

  <!-- Danger Zone -->
  <div class="mt-xl p-lg border border-error rounded-xl space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-error">Danger Zone</h3>
    <div class="flex items-center justify-between flex-wrap gap-md">
      <div>
        <p class="font-bold text-on-surface text-body-sm">Suspend this customer</p>
        <p class="text-label-md text-on-surface-variant">
          Immediately blocks all clinic logins for this tenant.
        </p>
      </div>
      <button class="px-lg py-base border border-error text-error font-bold rounded-lg
                     hover:bg-error-container transition-colors min-h-[44px]
                     flex items-center gap-xs">
        <span class="material-symbols-outlined text-[18px]">block</span>
        Suspend Customer
      </button>
    </div>
  </div>
</div>
```

**Suspended state note:** When `status === 'suspended'`, the entire tab content renders with a top banner:
```html
<div class="flex items-center gap-md p-md bg-error-container rounded-lg mb-lg">
  <span class="material-symbols-outlined text-on-error-container">warning</span>
  <p class="text-body-sm text-on-error-container font-bold">
    This tenant is suspended. All clinic logins are blocked.
  </p>
</div>
```
And the Danger Zone shows a "Reactivate" CTA instead of Suspend.

---

### 2d. Tab 2 — Plan & Quota (AC-P4)

Shows effective quota = tenant override ?? plan default. Editable fields write to `tenant_quotas`.

```html
<div class="bg-surface rounded-b-xl shadow-sm border border-t-0 border-outline-variant p-lg
            space-y-xl">

  <!-- Current plan section -->
  <div class="space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant
               uppercase tracking-wider pb-xs border-b border-outline-variant">Current Plan</h3>
    <div class="flex items-center justify-between p-lg bg-surface-container-low rounded-xl">
      <div class="flex items-center gap-lg">
        <span class="material-symbols-outlined text-secondary text-[32px]">workspace_premium</span>
        <div>
          <p class="font-headline-sm text-headline-sm text-on-surface">Professional</p>
          <p class="text-body-sm text-on-surface-variant">Default plan quotas below</p>
        </div>
      </div>
      <!-- Plan change dropdown -->
      <select class="px-md py-base border border-outline-variant rounded-lg text-body-sm
                     bg-surface text-on-surface focus:ring-2 focus:ring-primary/20
                     min-h-[44px] min-w-[44px]">
        <option>Starter</option>
        <option selected>Professional</option>
        <option>Clinic+</option>
      </select>
    </div>
  </div>

  <!-- Quota overrides section -->
  <div class="space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant
               uppercase tracking-wider pb-xs border-b border-outline-variant">
      Quota Overrides
    </h3>
    <p class="text-body-sm text-on-surface-variant">
      Leave blank to use the plan default. Set a value to override for this customer only.
    </p>

    <!-- QuotaField component × 3 -->
    <div class="grid grid-cols-1 gap-md">

      <!-- Branches quota -->
      <div class="flex items-center justify-between p-md bg-surface-container-low
                  rounded-xl min-h-[44px] gap-md flex-wrap">
        <div class="flex items-center gap-md">
          <div class="w-10 h-10 bg-surface rounded-lg shadow-sm flex items-center
                      justify-center">
            <span class="material-symbols-outlined text-primary text-[20px]">business</span>
          </div>
          <div>
            <p class="font-bold text-on-surface text-body-sm">Max Branches</p>
            <p class="text-label-md text-on-surface-variant">Plan default: <strong>3</strong></p>
          </div>
        </div>
        <div class="flex items-center gap-md">
          <span class="text-label-md text-on-surface-variant">Override:</span>
          <input type="number" min="1" placeholder="—"
                 class="w-24 px-md py-xs border border-outline-variant rounded-lg
                        focus:ring-2 focus:ring-primary/20 text-body-sm text-center
                        min-h-[44px]" />
        </div>
      </div>

      <!-- Staff quota -->
      <div class="flex items-center justify-between p-md bg-surface-container-low
                  rounded-xl min-h-[44px] gap-md flex-wrap">
        <div class="flex items-center gap-md">
          <div class="w-10 h-10 bg-surface rounded-lg shadow-sm flex items-center
                      justify-center">
            <span class="material-symbols-outlined text-primary text-[20px]">group</span>
          </div>
          <div>
            <p class="font-bold text-on-surface text-body-sm">Max Staff / Users</p>
            <p class="text-label-md text-on-surface-variant">Plan default: <strong>20</strong></p>
          </div>
        </div>
        <div class="flex items-center gap-md">
          <span class="text-label-md text-on-surface-variant">Override:</span>
          <input type="number" min="1" placeholder="—"
                 class="w-24 px-md py-xs border border-outline-variant rounded-lg
                        focus:ring-2 focus:ring-primary/20 text-body-sm text-center
                        min-h-[44px]" />
        </div>
      </div>

      <!-- Owners (customers) quota -->
      <div class="flex items-center justify-between p-md bg-surface-container-low
                  rounded-xl min-h-[44px] gap-md flex-wrap">
        <div class="flex items-center gap-md">
          <div class="w-10 h-10 bg-surface rounded-lg shadow-sm flex items-center
                      justify-center">
            <span class="material-symbols-outlined text-primary text-[20px]">pets</span>
          </div>
          <div>
            <p class="font-bold text-on-surface text-body-sm">Max Pet Owners</p>
            <p class="text-label-md text-on-surface-variant">Plan default: <strong>5,000</strong></p>
          </div>
        </div>
        <div class="flex items-center gap-md">
          <span class="text-label-md text-on-surface-variant">Override:</span>
          <input type="number" min="1" placeholder="—"
                 class="w-24 px-md py-xs border border-outline-variant rounded-lg
                        focus:ring-2 focus:ring-primary/20 text-body-sm text-center
                        min-h-[44px]" />
          <span class="text-label-md text-on-surface-variant">(blank = unlimited)</span>
        </div>
      </div>

    </div><!-- end grid -->

    <!-- Over-plan grandfather warning (R6) -->
    <div class="flex items-center gap-md p-md bg-error-container rounded-lg
                hidden [.over-plan_&]:flex">
      <span class="material-symbols-outlined text-on-error-container">warning</span>
      <p class="text-body-sm text-on-error-container font-bold">
        This tenant is currently over plan on one or more quotas. Existing data is
        grandfathered — new creates are blocked at the quota limit.
      </p>
    </div>

    <div class="flex justify-end pt-md border-t border-outline-variant">
      <button class="px-xl py-base bg-primary text-on-primary font-bold rounded-lg
                     shadow-sm hover:opacity-90 transition-opacity min-h-[44px]
                     flex items-center gap-xs">
        <span class="material-symbols-outlined text-[16px]">save</span>
        Save Quota
      </button>
    </div>
  </div>
</div>
```

**API:** `GET /platform/customers/:id/quota` on tab load, `PUT /platform/customers/:id/quota` on save.
Response shape includes `{ planDefault: { maxBranches, maxUsers, maxOwners }, override: { ... } }`.

---

### 2e. Tab 3 — Provisioning (AC-P5)

All secret fields are **write-only** — value is never echoed back. Show a masked placeholder `••••••••` for secret inputs that have been set, or empty for unset.

```html
<div class="bg-surface rounded-b-xl shadow-sm border border-t-0 border-outline-variant p-lg
            space-y-xl">

  <!-- S3 Storage -->
  <section class="space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant uppercase
               tracking-wider pb-xs border-b border-outline-variant">
      S3 Storage
    </h3>
    <div class="grid grid-cols-2 gap-md">
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Bucket Name</label>
        <input type="text" placeholder="my-clinic-bucket"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Prefix / Path</label>
        <input type="text" placeholder="tenants/vetcare-dt/"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">
          Access Key ID <span class="text-label-md text-on-surface-variant">(write-only)</span>
        </label>
        <input type="password" placeholder="••••••••"
               autocomplete="new-password"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">
          Secret Access Key <span class="text-label-md text-on-surface-variant">(write-only)</span>
        </label>
        <input type="password" placeholder="••••••••"
               autocomplete="new-password"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
    </div>
  </section>

  <!-- SMTP -->
  <section class="space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant uppercase
               tracking-wider pb-xs border-b border-outline-variant">
      SMTP (Email)
    </h3>
    <div class="grid grid-cols-2 gap-md">
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">SMTP Host</label>
        <input type="text" placeholder="smtp.example.com"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Port</label>
        <input type="number" placeholder="587"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">From Address</label>
        <input type="email" placeholder="noreply@clinic.com"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">
          SMTP Password <span class="text-label-md text-on-surface-variant">(write-only)</span>
        </label>
        <input type="password" placeholder="••••••••"
               autocomplete="new-password"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
    </div>
  </section>

  <!-- Base Providers -->
  <section class="space-y-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant uppercase
               tracking-wider pb-xs border-b border-outline-variant">
      Base Providers
    </h3>
    <div class="grid grid-cols-1 gap-md">
      <div class="flex items-center justify-between p-md bg-surface-container-low rounded-xl
                  gap-md flex-wrap min-h-[44px]">
        <div>
          <p class="font-bold text-on-surface text-body-sm">Lab Integration Provider</p>
          <p class="text-label-md text-on-surface-variant">Base lab system endpoint</p>
        </div>
        <input type="text" placeholder="https://lab-api.example.com"
               class="w-64 px-md py-xs border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm
                      font-code" />
      </div>
    </div>
  </section>

  <div class="flex justify-end pt-md border-t border-outline-variant">
    <button class="px-xl py-base bg-primary text-on-primary font-bold rounded-lg
                   shadow-sm hover:opacity-90 transition-opacity min-h-[44px]
                   flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">save</span>
      Save Provisioning
    </button>
  </div>
</div>
```

**API:** `GET /platform/customers/:id/provisioning` on tab load (secret fields return `null` — render `••••••••` as placeholder only, not pre-filled value). `PUT /platform/customers/:id/provisioning` on save. If a secret field is left blank on save, omit the key from the request body (do not send empty string to overwrite a set secret).

---

### 2f. Tab 4 — Usage (AC-P2b)

Live counts from `GET /platform/customers/:id/usage`. Shows current count vs effective cap, with over-plan flag.

```html
<div class="bg-surface rounded-b-xl shadow-sm border border-t-0 border-outline-variant p-lg
            space-y-lg">

  <div class="flex items-center justify-between mb-md">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant
               uppercase tracking-wider">Live Usage</h3>
    <button class="flex items-center gap-xs text-on-surface-variant hover:text-primary
                   transition-colors min-h-[44px] px-md text-body-sm">
      <span class="material-symbols-outlined text-[18px]">refresh</span>
      Refresh
    </button>
  </div>

  <!-- UsageBar component × 3 -->
  <!-- Branches -->
  <div class="space-y-sm">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-md">
        <div class="w-10 h-10 bg-surface-container-high rounded-lg flex items-center
                    justify-center">
          <span class="material-symbols-outlined text-primary text-[20px]">business</span>
        </div>
        <div>
          <p class="font-bold text-on-surface text-body-sm">Branches</p>
          <p class="text-label-md text-on-surface-variant">
            Effective cap: <strong>3</strong> (plan default)
          </p>
        </div>
      </div>
      <div class="text-right">
        <p class="font-headline-sm text-headline-sm text-on-surface">2 <span class="text-on-surface-variant font-body-md">/ 3</span></p>
        <!-- Over-plan badge -->
        <span class="px-xs py-[2px] bg-error-container text-on-error-container rounded
                     text-label-md font-bold hidden [.over-plan_&]:inline-flex
                     items-center gap-xs">
          <span class="material-symbols-outlined text-[12px]">warning</span>
          Over plan
        </span>
      </div>
    </div>
    <!-- Progress bar -->
    <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
      <div class="bg-secondary h-full transition-all duration-300 rounded-full"
           style="width: 67%">
        <!-- width = (current / effective_cap) * 100%, capped at 100% visual -->
        <!-- When over plan: bg-error instead of bg-secondary -->
      </div>
    </div>
  </div>

  <!-- Staff / Users -->
  <div class="space-y-sm">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-md">
        <div class="w-10 h-10 bg-surface-container-high rounded-lg flex items-center
                    justify-center">
          <span class="material-symbols-outlined text-primary text-[20px]">group</span>
        </div>
        <div>
          <p class="font-bold text-on-surface text-body-sm">Staff / Users</p>
          <p class="text-label-md text-on-surface-variant">
            Effective cap: <strong>20</strong> (plan default)
          </p>
        </div>
      </div>
      <div class="text-right">
        <p class="font-headline-sm text-headline-sm text-on-surface">12 <span class="text-on-surface-variant font-body-md">/ 20</span></p>
      </div>
    </div>
    <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
      <div class="bg-secondary h-full rounded-full" style="width: 60%"></div>
    </div>
  </div>

  <!-- Pet Owners -->
  <div class="space-y-sm">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-md">
        <div class="w-10 h-10 bg-surface-container-high rounded-lg flex items-center
                    justify-center">
          <span class="material-symbols-outlined text-primary text-[20px]">pets</span>
        </div>
        <div>
          <p class="font-bold text-on-surface text-body-sm">Pet Owners</p>
          <p class="text-label-md text-on-surface-variant">
            Effective cap: <strong>5,000</strong> (plan default)
          </p>
          <!-- For Clinic+ (unlimited): show "Unlimited" instead of a number cap -->
        </div>
      </div>
      <div class="text-right">
        <p class="font-headline-sm text-headline-sm text-on-surface">432 <span class="text-on-surface-variant font-body-md">/ 5,000</span></p>
      </div>
    </div>
    <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
      <div class="bg-secondary h-full rounded-full" style="width: 9%"></div>
    </div>
  </div>

  <!-- Loading state for this tab -->
  <!-- Shown while GET /platform/customers/:id/usage is in flight -->
  <!-- Skeleton version: three animate-pulse usage bar placeholders -->

  <!-- Error state for this tab -->
  <div class="hidden [.usage-error_&]:flex flex-col items-center justify-center
              py-xl gap-md text-center">
    <span class="material-symbols-outlined text-[40px] text-error">error_outline</span>
    <p class="text-body-sm text-error font-bold">Could not load usage data</p>
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Retry</button>
  </div>

</div>
```

**Progress bar colour logic:**
- `current / effective_cap < 0.8`: `bg-secondary`
- `0.8 ≤ ratio < 1.0`: `bg-warning`
- `ratio ≥ 1.0` (over plan): `bg-error`

**Unlimited owners (Clinic+):** Show `Unlimited` in the cap position; omit progress bar, show count only.

**API:** `GET /platform/customers/:id/usage` — fetched fresh on tab activation (not cached).

---

### 2g. Suspend / Reactivate Confirm Dialog (AC-P3)

Modal: `fixed inset-0 z-50 flex items-center justify-center bg-black/40`

**Suspend:**
```html
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[440px] max-w-[calc(100vw-32px)] space-y-lg">
  <div class="flex items-center gap-md">
    <span class="material-symbols-outlined text-error text-[28px]">warning</span>
    <h3 class="font-headline-sm text-headline-sm text-error">Suspend Customer</h3>
  </div>
  <div class="p-md bg-error-container rounded-lg">
    <p class="text-body-sm text-on-error-container font-bold">
      This will immediately block all clinic logins for VetCare Downtown.
      The tenant's data is preserved.
    </p>
  </div>
  <div class="flex gap-md justify-end">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px] flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">block</span>
      Suspend
    </button>
  </div>
</div>
```

**Reactivate:** Same dialog shape with `bg-secondary` CTA and `check_circle` icon instead of error styling.

**API:** `POST /platform/customers/:id/suspend` / `POST /platform/customers/:id/reactivate` — both write to `audit_logs` server-side.

---

## 3. Plans CRUD — `/platform/plans` (AC-P6)

### 3a. Page Header

```html
<div class="flex justify-between items-end">
  <div>
    <h2 class="font-headline-lg text-headline-lg text-primary">Plans</h2>
    <p class="font-body-md text-on-surface-variant">Manage subscription plans and quotas.</p>
  </div>
  <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg shadow-sm
                 hover:opacity-90 transition-opacity flex items-center gap-xs
                 min-h-[44px]">
    <span class="material-symbols-outlined text-[20px]">add</span>
    New Plan
  </button>
</div>
```

### 3b. Plans Table

Card: `bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden`

```html
<table class="w-full text-left">
  <thead>
    <tr class="text-label-md text-on-surface-variant border-b border-outline-variant
               bg-surface-container-lowest">
      <th class="px-lg py-md font-bold uppercase tracking-wider">Plan Name</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Max Branches</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Max Staff</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Max Owners</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Price (THB)</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Customers</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider text-right">Actions</th>
    </tr>
  </thead>
  <tbody class="divide-y divide-outline-variant">
    <!-- Plan row -->
    <tr class="hover:bg-surface-container-low transition-colors min-h-[48px]">
      <td class="px-lg py-md">
        <div class="flex items-center gap-md">
          <span class="material-symbols-outlined text-secondary text-[20px]">workspace_premium</span>
          <div>
            <p class="font-bold text-on-surface">Professional</p>
            <p class="font-code text-label-md text-on-surface-variant">professional</p>
          </div>
        </div>
      </td>
      <td class="px-lg py-md text-on-surface">3</td>
      <td class="px-lg py-md text-on-surface">20</td>
      <td class="px-lg py-md text-on-surface">5,000</td>
      <td class="px-lg py-md text-on-surface font-bold">฿2,500</td>
      <td class="px-lg py-md">
        <span class="text-label-md text-on-surface-variant">14 customers</span>
      </td>
      <td class="px-lg py-md text-right">
        <div class="flex items-center justify-end gap-md">
          <button class="text-primary font-bold hover:underline text-body-sm
                         min-h-[44px] min-w-[44px] px-sm">Edit</button>
          <!-- Retire button — disabled when customers > 0 -->
          <button class="text-error font-bold hover:underline text-body-sm
                         min-h-[44px] min-w-[44px] px-sm
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                  title="14 customers are on this plan — cannot retire"
                  disabled>Retire</button>
        </div>
      </td>
    </tr>
    <!-- Retired plan row -->
    <tr class="opacity-50 min-h-[48px]">
      <td class="px-lg py-md">
        <div class="flex items-center gap-md">
          <span class="material-symbols-outlined text-outline text-[20px]">workspace_premium</span>
          <div>
            <p class="font-bold text-on-surface-variant line-through">Legacy Starter</p>
            <span class="px-xs py-[2px] bg-surface-container-high rounded text-label-md
                         text-on-surface-variant font-bold">RETIRED</span>
          </div>
        </div>
      </td>
      <!-- ... remaining cells with text-on-surface-variant -->
      <td class="px-lg py-md" colspan="6">
        <p class="text-label-md text-on-surface-variant">No active customers. Retired plan.</p>
      </td>
    </tr>
  </tbody>
</table>
```

**Retire logic (AC-P6):**
- `customerCount > 0` → Retire button is `disabled` with `title` tooltip showing count
- `customerCount === 0` → Retire button enabled; clicking opens confirm dialog
- Retire action: `DELETE /platform/plans/:id` (soft-retire — sets `retired_at`; existing tenants keep their effective quota, no cascade)

### 3c. Create / Edit Plan Modal

Shared modal for both create (`POST /platform/plans`) and edit (`PUT /platform/plans/:id`).

```html
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[520px] max-w-[calc(100vw-32px)] space-y-lg">
  <div class="flex items-center justify-between">
    <h3 class="font-headline-sm text-headline-sm text-primary">New Plan</h3>
    <!-- or "Edit Plan" for edit mode -->
    <button class="min-h-[44px] min-w-[44px] flex items-center justify-center
                   hover:bg-surface-container rounded-full">
      <span class="material-symbols-outlined text-on-surface-variant">close</span>
    </button>
  </div>

  <div class="grid grid-cols-2 gap-md">
    <!-- Plan name -->
    <div class="col-span-2 space-y-xs">
      <label class="font-label-md text-primary font-bold">Plan Name <span class="text-error">*</span></label>
      <input type="text" placeholder="e.g. Enterprise"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
    </div>
    <!-- Plan key (slug) -->
    <div class="col-span-2 space-y-xs">
      <label class="font-label-md text-primary font-bold">Plan Key</label>
      <input type="text" placeholder="enterprise"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      <p class="text-label-md text-on-surface-variant">Lowercase, no spaces. Used internally.</p>
    </div>
    <!-- Quotas -->
    <div class="space-y-xs">
      <label class="font-label-md text-primary font-bold">Max Branches <span class="text-error">*</span></label>
      <input type="number" min="1" placeholder="1"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
    </div>
    <div class="space-y-xs">
      <label class="font-label-md text-primary font-bold">Max Staff <span class="text-error">*</span></label>
      <input type="number" min="1" placeholder="5"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
    </div>
    <div class="space-y-xs">
      <label class="font-label-md text-primary font-bold">Max Owners</label>
      <input type="number" min="1" placeholder="Unlimited (blank)"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
      <p class="text-label-md text-on-surface-variant">Leave blank for unlimited.</p>
    </div>
    <div class="space-y-xs">
      <label class="font-label-md text-primary font-bold">Price (THB/month)</label>
      <input type="number" min="0" placeholder="0"
             class="w-full px-md py-base border border-outline-variant rounded-lg
                    focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
    </div>
  </div>

  <div class="flex gap-md justify-end pt-md border-t border-outline-variant">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-primary text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px] flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">save</span>
      Save Plan
    </button>
  </div>
</div>
```

### 3d. Retire Confirm Dialog

```html
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[400px] max-w-[calc(100vw-32px)] space-y-lg">
  <h3 class="font-headline-sm text-headline-sm text-error">Retire Plan</h3>
  <p class="text-body-sm text-on-surface-variant">
    Are you sure you want to retire <strong>[plan name]</strong>?
    Existing customers keep their current quota — this plan won't be available for new customers.
  </p>
  <div class="flex gap-md justify-end">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px]">Retire</button>
  </div>
</div>
```

### 3e. Plans Loading / Empty / Error States

**Loading:** 3 skeleton rows (animate-pulse, same column structure).

**Empty:**
```html
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-outline">workspace_premium</span>
  <p class="font-headline-xs text-on-surface-variant">No plans yet</p>
  <p class="text-body-sm text-on-surface-variant">Create your first plan to enable customer onboarding.</p>
</div>
```

**Error:** Same pattern as Customers error state with `workspace_premium` icon.

---

## 4. Platform Settings — `/platform/settings` (AC-P7)

### 4a. Page Header

```html
<div>
  <h2 class="font-headline-lg text-headline-lg text-primary">Platform Settings</h2>
  <p class="font-body-md text-on-surface-variant">
    Global application configuration. Changes affect all tenants.
  </p>
</div>
```

### 4b. Settings Layout (sections)

Card: `bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden`

Sections are stacked vertically with `divide-y divide-outline-variant`:

```html
<div class="bg-surface rounded-xl shadow-sm border border-outline-variant divide-y
            divide-outline-variant">

  <!-- Section: General -->
  <div class="p-lg space-y-lg">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant
               uppercase tracking-wider">General</h3>
    <div class="grid grid-cols-2 gap-md">
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">App Name</label>
        <input type="text" value="Anemal"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Base URL</label>
        <input type="url" value="https://anemal.app"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Trial Days (default)</label>
        <input type="number" min="0" max="365" value="14"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-md" />
        <p class="text-label-md text-on-surface-variant">Applied to new customers with trial enabled.</p>
      </div>
    </div>
  </div>

  <!-- Section: Maintenance Mode (AC-P7) -->
  <div class="p-lg">
    <div class="flex items-center justify-between flex-wrap gap-md min-h-[44px]">
      <div>
        <h3 class="font-headline-xs text-headline-xs text-on-surface">Maintenance Mode</h3>
        <p class="text-body-sm text-on-surface-variant mt-xs">
          Blocks all clinic logins with a maintenance notice. Platform console remains accessible.
        </p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer min-h-[44px] min-w-[44px]
                    items-center justify-end">
        <input type="checkbox" class="sr-only peer" />
        <div class="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer
                    peer-checked:after:translate-x-full peer-checked:after:border-white
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                    after:bg-white after:border-gray-300 after:border after:rounded-full
                    after:h-5 after:w-5 after:transition-all peer-checked:bg-error"></div>
        <!-- Toggle uses bg-error (red) to signal danger when ON -->
      </label>
    </div>
    <!-- Active maintenance banner — shown when toggle is ON -->
    <div class="mt-md p-md bg-error-container rounded-lg flex items-center gap-md
                hidden [.maintenance-on_&]:flex">
      <span class="material-symbols-outlined text-on-error-container">warning</span>
      <p class="text-body-sm text-on-error-container font-bold">
        Maintenance mode is active. All clinic logins are blocked across all tenants.
      </p>
    </div>
  </div>

  <!-- Section: SMTP -->
  <div class="p-lg space-y-lg">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant uppercase tracking-wider">
      Platform SMTP
    </h3>
    <div class="grid grid-cols-2 gap-md">
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">SMTP Host</label>
        <input type="text" placeholder="smtp.sendgrid.net"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">Port</label>
        <input type="number" placeholder="587"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">From Address</label>
        <input type="email" placeholder="platform@anemal.app"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] text-body-sm" />
      </div>
      <div class="space-y-xs">
        <label class="font-label-md text-primary font-bold">
          SMTP Password <span class="text-label-md text-on-surface-variant">(write-only)</span>
        </label>
        <input type="password" placeholder="••••••••" autocomplete="new-password"
               class="w-full px-md py-base border border-outline-variant rounded-lg
                      focus:ring-2 focus:ring-primary/20 min-h-[44px] font-code text-body-sm" />
      </div>
    </div>
  </div>

  <!-- Section: Feature Flags -->
  <div class="p-lg space-y-lg">
    <h3 class="font-headline-xs text-headline-xs text-on-surface-variant uppercase tracking-wider">
      Feature Flags
    </h3>
    <p class="text-body-sm text-on-surface-variant">
      Enable or disable features globally across all tenants.
    </p>
    <div class="space-y-md">
      <!-- Feature flag row (repeating pattern) -->
      <div class="flex items-center justify-between p-md bg-surface-container-low rounded-xl
                  min-h-[44px]">
        <div class="flex items-center gap-lg">
          <div class="p-md bg-surface rounded-lg shadow-sm">
            <span class="material-symbols-outlined text-primary text-[20px]">videocam</span>
          </div>
          <div>
            <p class="font-bold text-on-surface text-body-sm">Tele-Health Consultations</p>
            <p class="text-label-md text-on-surface-variant font-code">feature.telehealth</p>
          </div>
        </div>
        <label class="relative inline-flex items-center cursor-pointer min-h-[44px] min-w-[44px]
                      items-center justify-end">
          <input type="checkbox" class="sr-only peer" />
          <div class="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer
                      peer-checked:after:translate-x-full peer-checked:after:border-white
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                      after:bg-white after:border-gray-300 after:border after:rounded-full
                      after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
        </label>
      </div>
      <!-- Additional feature flag rows rendered from GET /platform/settings response -->
    </div>
  </div>

  <!-- Save bar (sticky at bottom) -->
  <div class="p-lg flex justify-end bg-surface-container-low">
    <button class="px-xl py-base bg-primary text-on-primary font-bold rounded-lg
                   shadow-sm hover:opacity-90 transition-opacity min-h-[44px]
                   flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">save</span>
      Save Settings
    </button>
  </div>

</div>
```

**Maintenance mode toggle:** Uses `bg-error` (not `bg-secondary`) on the checked state to visually warn the operator. Toggling ON triggers a confirm dialog before committing.

**Maintenance mode confirm:**
```html
<div class="bg-surface rounded-xl shadow-lvl3 p-xl w-[440px] max-w-[calc(100vw-32px)] space-y-lg">
  <div class="flex items-center gap-md">
    <span class="material-symbols-outlined text-error text-[28px]">warning</span>
    <h3 class="font-headline-sm text-headline-sm text-error">Enable Maintenance Mode?</h3>
  </div>
  <div class="p-md bg-error-container rounded-lg">
    <p class="text-body-sm text-on-error-container font-bold">
      All clinic logins will be immediately blocked across every tenant.
      Only the platform console will remain accessible.
    </p>
  </div>
  <div class="flex gap-md justify-end">
    <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px]">Cancel</button>
    <button class="px-lg py-base bg-error text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px]">Enable Maintenance</button>
  </div>
</div>
```

**API:** `GET /platform/settings` on mount. `PUT /platform/settings` on "Save Settings". Secret fields (SMTP password) omitted from request if left blank.

**Loading state:** Skeleton with `animate-pulse` blocks matching each input field.

---

## 5. Usage & Audit — `/platform/audit` (AC-P2c)

### 5a. Page Header

```html
<div>
  <h2 class="font-headline-lg text-headline-lg text-primary">Audit Log</h2>
  <p class="font-body-md text-on-surface-variant">
    All platform mutations across tenants — tenant lifecycle, plan changes, provisioning, settings.
  </p>
</div>
```

### 5b. Filter Bar

```html
<div class="bg-surface rounded-xl shadow-sm border border-outline-variant p-md
            flex flex-wrap gap-md items-end">
  <!-- Date range -->
  <div class="space-y-xs">
    <label class="font-label-md text-primary font-bold">From</label>
    <input type="date"
           class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                  bg-surface text-on-surface focus:ring-2 focus:ring-primary/20 min-h-[44px]" />
  </div>
  <div class="space-y-xs">
    <label class="font-label-md text-primary font-bold">To</label>
    <input type="date"
           class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                  bg-surface text-on-surface focus:ring-2 focus:ring-primary/20 min-h-[44px]" />
  </div>
  <!-- Action type filter -->
  <div class="space-y-xs">
    <label class="font-label-md text-primary font-bold">Action</label>
    <select class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                   bg-surface text-on-surface focus:ring-2 focus:ring-primary/20 min-h-[44px]">
      <option value="">All actions</option>
      <option value="tenant.created">Tenant created</option>
      <option value="tenant.suspended">Tenant suspended</option>
      <option value="tenant.reactivated">Tenant reactivated</option>
      <option value="plan.created">Plan created</option>
      <option value="plan.updated">Plan updated</option>
      <option value="plan.retired">Plan retired</option>
      <option value="quota.updated">Quota updated</option>
      <option value="provisioning.updated">Provisioning updated</option>
      <option value="settings.updated">Settings updated</option>
    </select>
  </div>
  <!-- Tenant filter (cross-tenant, AC-P2c) -->
  <div class="space-y-xs flex-1 min-w-[180px]">
    <label class="font-label-md text-primary font-bold">Tenant</label>
    <input type="text" placeholder="Search tenant name or subdomain…"
           class="w-full px-md py-xs border border-outline-variant rounded-lg text-body-sm
                  bg-surface focus:ring-2 focus:ring-primary/20 min-h-[44px]" />
  </div>
  <!-- Apply / Clear -->
  <div class="flex gap-md items-end">
    <button class="px-lg py-xs border border-outline-variant rounded-lg text-on-surface
                   font-bold hover:bg-surface-container min-h-[44px] text-body-sm">
      Clear
    </button>
    <button class="px-lg py-xs bg-primary text-on-primary font-bold rounded-lg
                   hover:opacity-90 min-h-[44px] text-body-sm flex items-center gap-xs">
      <span class="material-symbols-outlined text-[16px]">filter_list</span>
      Apply
    </button>
  </div>
</div>
```

### 5c. Audit Log Table

Card: `bg-surface rounded-xl shadow-sm border border-outline-variant overflow-hidden`

```html
<table class="w-full text-left">
  <thead>
    <tr class="text-label-md text-on-surface-variant border-b border-outline-variant
               bg-surface-container-lowest">
      <th class="px-lg py-md font-bold uppercase tracking-wider">Timestamp</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Action</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Actor</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Tenant Affected</th>
      <th class="px-lg py-md font-bold uppercase tracking-wider">Details</th>
    </tr>
  </thead>
  <tbody class="divide-y divide-outline-variant">
    <!-- Audit log row -->
    <tr class="hover:bg-surface-container-low transition-colors min-h-[48px]">
      <td class="px-lg py-md">
        <p class="text-body-sm text-on-surface font-code whitespace-nowrap">2026-06-17 10:31</p>
      </td>
      <td class="px-lg py-md">
        <!-- Action chip — colour by severity -->
        <span class="px-md py-xs rounded-full text-label-md font-bold
                     bg-sage-light text-on-secondary-container">
          tenant.created
        </span>
      </td>
      <td class="px-lg py-md">
        <div class="flex items-center gap-sm">
          <div class="w-7 h-7 rounded-full bg-primary flex items-center justify-center
                      text-on-primary text-label-md font-bold flex-shrink-0">SA</div>
          <span class="text-body-sm text-on-surface">platform@anemal.app</span>
        </div>
      </td>
      <td class="px-lg py-md">
        <span class="font-code text-body-sm text-on-surface-variant">vetcare-dt</span>
      </td>
      <td class="px-lg py-md">
        <!-- Expandable details — truncated, click to expand -->
        <button class="text-body-sm text-primary hover:underline min-h-[44px] px-xs
                       text-left max-w-[200px] truncate">
          Plan: Professional, Trial: false
        </button>
      </td>
    </tr>
  </tbody>
</table>
```

**Action chip colour mapping:**

| Action pattern | Badge classes |
|---|---|
| `*.created` / `*.reactivated` | `bg-sage-light text-on-secondary-container` |
| `*.suspended` / `*.retired` | `bg-error-container text-on-error-container` |
| `*.updated` / `*.changed` | `bg-secondary-container text-on-secondary-container` |
| All others | `bg-surface-container-high text-on-surface-variant` |

### 5d. Expandable Row Details

Clicking the details cell expands a sub-row beneath:

```html
<tr class="bg-surface-container-low">
  <td colspan="5" class="px-lg py-md">
    <pre class="font-code text-label-md text-on-surface whitespace-pre-wrap break-all
                bg-surface-container-high p-md rounded-lg">
{
  "planId": "professional",
  "trial": false,
  "subdomain": "vetcare-dt"
}
    </pre>
  </td>
</tr>
```

### 5e. Audit Log Pagination

```html
<div class="flex items-center justify-between px-lg py-md border-t border-outline-variant
            bg-surface">
  <p class="text-label-md text-on-surface-variant">Showing 1–25 of 142 entries</p>
  <div class="flex gap-md">
    <button class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                   font-bold hover:bg-surface-container min-h-[44px]
                   disabled:opacity-40" disabled>
      Previous
    </button>
    <button class="px-md py-xs border border-outline-variant rounded-lg text-body-sm
                   font-bold hover:bg-surface-container min-h-[44px]">
      Next
    </button>
  </div>
</div>
```

### 5f. Audit Loading / Empty / Error States

**Loading:** 10 skeleton rows `animate-pulse` matching table column widths.

**Empty:**
```html
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-outline">policy</span>
  <p class="font-headline-xs text-on-surface-variant">No audit entries found</p>
  <p class="text-body-sm text-on-surface-variant">
    Try adjusting the date range or action filters.
  </p>
</div>
```

**Error:**
```html
<div class="flex flex-col items-center justify-center py-2xl gap-md text-center">
  <span class="material-symbols-outlined text-[48px] text-error">error_outline</span>
  <p class="font-headline-xs text-error">Failed to load audit log</p>
  <button class="px-lg py-base border border-outline-variant rounded-lg text-on-surface
                 font-bold hover:bg-surface-container min-h-[44px]">Retry</button>
</div>
```

**API:** `GET /platform/audit?from=&to=&action=&tenantId=&page=1&limit=25`

---

## 6. API Endpoint Summary

| Screen | Action | Method + Path | Called when |
|--------|--------|---------------|-------------|
| Customers list | Load list | `GET /platform/customers` | On mount, on filter change |
| Customers list | Create customer | `POST /platform/customers` | Add Customer modal confirm |
| Customer detail | Load detail | `GET /platform/customers/:id` | On mount |
| Customer detail | Suspend | `POST /platform/customers/:id/suspend` | Suspend confirm |
| Customer detail | Reactivate | `POST /platform/customers/:id/reactivate` | Reactivate confirm |
| Plan & Quota tab | Load quota | `GET /platform/customers/:id/quota` | Tab activation |
| Plan & Quota tab | Save quota | `PUT /platform/customers/:id/quota` | Save Quota click |
| Provisioning tab | Load provisioning | `GET /platform/customers/:id/provisioning` | Tab activation |
| Provisioning tab | Save provisioning | `PUT /platform/customers/:id/provisioning` | Save Provisioning click |
| Usage tab | Load usage | `GET /platform/customers/:id/usage` | Tab activation + Refresh click |
| Plans list | Load plans | `GET /platform/plans` | On mount |
| Plans list | Create plan | `POST /platform/plans` | New Plan modal confirm |
| Plans list | Edit plan | `PUT /platform/plans/:id` | Edit Plan modal confirm |
| Plans list | Retire plan | `DELETE /platform/plans/:id` | Retire confirm dialog |
| Platform settings | Load settings | `GET /platform/settings` | On mount |
| Platform settings | Save settings | `PUT /platform/settings` | Save Settings click |
| Audit | Load audit log | `GET /platform/audit?from&to&action&tenantId&page&limit` | On mount, filter Apply |

---

## 7. Breakpoint Layouts

### 7a. 768 px — Portrait Tablet

- Platform sidebar: hidden; hamburger `menu` icon at left of TopNav opens overlay drawer
- TopNav: `left-0` full-width; wordmark "Platform"; platform user name hidden (show initials only)
- Content area: `ml-0 p-gutter`
- **Customers list:** "Users" column hidden; Status + Plan columns retained; "View" link visible
- **Customer Detail tabs:** `overflow-x-auto` horizontal scroll on tab bar; tab labels retained
- **Plan & Quota tab QuotaFields:** override inputs stack below the label/icon row (`flex-col`)
- **Plans table:** Price and Customer count columns hidden at 768 px; show in expanded row detail
- **Settings:** grid switches to `grid-cols-1`; SMTP fields single column
- **Audit filters:** all filters stack vertically (`flex-col`); date pickers full-width
- **Audit table:** Details column hidden; Actor truncated; Action chip retained
- **Modals:** `w-[calc(100vw-32px)] max-h-[80vh] overflow-y-auto`; modal grid `grid-cols-1`
- **Page headers:** stacked (`flex-col gap-md items-start`); CTA buttons full-width

### 7b. 1024 px — Landscape Tablet

- Platform sidebar: `w-64 fixed`; collapse toggle available
- Content area: `ml-64 pt-16 p-margin-desktop`
- All table columns visible; grid layouts 2-column
- Page headers side-by-side (`flex justify-between items-end`)
- Audit filter bar wraps in one row

---

## 8. Guards — Platform Plane Only (AC-P8)

```tsx
// Root platform route guard — applied to the /platform/* route tree
<RequireAuth>
  <RequirePlane plane="platform" fallback={<Redirect to="/403" />}>
    <PlatformShell>
      {/* All /platform/* child routes render here */}
    </PlatformShell>
  </RequirePlane>
</RequireAuth>

// CORRECT — plane gate only, no RequirePermission or Can
// WRONG — do NOT add <RequirePermission> / <Can> to any element inside /platform/*
```

No `<Can>` wrappers. No `<RequirePermission>` on any button, tab, link, or form within the platform shell. If the user has passed `RequirePlane('platform')`, they have full access to all platform screens.

A clinic token (plane = 'clinic') hitting any `/platform/*` route is rejected server-side with 403; the UI guard `RequirePlane` prevents rendering before that.

---

## 9. Toast Notification (shared with clinic shell)

Same component as T-5F-01. Positioned `fixed bottom-lg right-lg z-50` (or `bottom-lg left-lg` for right-hand mode).

**Success (save, create, suspend, reactivate):** `bg-secondary-container text-on-secondary-container`
**Error (API failure):** `bg-error-container text-on-error-container`

Auto-dismiss after 4 s.

---

## 10. Acceptance Criteria Checklist

- [x] AC-P1: Customers list shows subdomain, plan, status badge, user count; search + status/plan filter bar
- [x] AC-P2: "Add Customer" modal captures name, subdomain, plan (required dropdown, populated from `GET /platform/plans`), trial toggle; Create button disabled until plan is selected; edge case handled when plans list is empty
- [x] AC-P2b: Usage tab shows live counts (branches/users/owners) from `GET /platform/customers/:id/usage`; progress bars; over-plan flag; unlimited handling for Clinic+
- [x] AC-P2c: Audit screen reads `GET /platform/audit` with date range (from/to), action type, tenant (cross-tenant), and actor filters
- [x] AC-P3: Suspend CTA with confirm dialog explains immediate clinic login block; Reactivate CTA shown when suspended; both states covered in Overview tab and page header
- [x] AC-P4: Plan & Quota tab shows plan default + override ?? plan default effective quota; inputs for max_branches / max_users / max_owners overrides; over-plan grandfather warning shown
- [x] AC-P5: Provisioning tab — S3, SMTP, base providers; secret fields write-only (never echoed); blank on save = omit key
- [x] AC-P6: Plans table with soft-retire; Retire disabled when `customerCount > 0` (tooltip shows count); Create/Edit modal; Retire confirm dialog; retired plan row visually greyed
- [x] AC-P7: Platform Settings — App name, Base URL, trial days, Maintenance mode toggle (bg-error, confirm dialog), SMTP (write-only password), Feature flags
- [x] AC-P8: Zero `<RequirePermission>` / `<Can>` anywhere in `/platform/*` — only `<RequireAuth>` + `<RequirePlane plane="platform">` at the route tree root
- [x] AC-P9: All interactive elements `min-h-[44px] min-w-[44px]`; all table rows `min-h-[48px]`; token names only (no raw hex); Material Symbols Outlined exclusively; layouts specified at 768 px and 1024 px
