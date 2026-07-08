# Screen Spec: Inventory Management
> Prototype: `stitch_vet_clinic_design_system/inventory_management_1024x768/code.html`
> Component: `src/frontend/src/views/clinic/ClinicInventory.tsx`
> Hooks: `src/frontend/src/hooks/useInventory.ts`
> API: `/api/products` (CRUD, `/alerts`, `/:id/stock-in`, `/:id/movements`)
> Status: **Implemented** — per-branch stock (`branch_inventory`), transfers, and inventory camera barcode scan are present.

---

## Layout

```
pt-16 pl-56 (via ClinicLayout) · inner p-lg

HEADER (flex justify-between):
  H2 "Medical Inventory" text-headline-lg font-headline font-bold text-primary
  Subtitle text-body-md text-on-surface-variant
  "Add Product" button: bg-primary text-primary-on rounded-lg min-h-[44px] (add_circle icon)

KPI ALERT CARDS (grid sm:grid-cols-3 gap-md):
  Critical/Low stock  → border-l-4 border-error,   icon warning  (text-error),  value = lowStockCount
  Expiring ≤ 30 days  → border-l-4 border-warning, icon schedule (text-warning), value = expiringSoonCount
  Active stock value  → border-l-4 border-secondary, icon payments (text-success), value = ฿ inventoryValue
  Card: glass-card rounded-xl shadow-lvl1 p-md; value text-headline-md font-headline font-bold text-primary

TOOLBAR (flex gap-sm):
  Search input (rounded-full, search icon prefix) — matches name OR barcode (ILIKE)
  Category <select>: All + Medicine/Vaccine/Supply/Food/Equipment/Grooming/Other
  Scan button — opens `BarcodeScanner` (`@zxing/browser`) and fills product search with the scanned code

TABLE (glass-card rounded-xl overflow-hidden):
  thead bg-surface-container-low · th text-label-md uppercase
  Columns: Product | Category | Stock | Min | Expiry | Status | actions
  Row: hover:bg-surface-container min-h-[48px]; numeric cells use font-code
  Status chip (rounded-full text-label-md uppercase):
    In Stock    → bg-secondary-container text-secondary-on-container
    Low Stock   → bg-warning/15 text-warning   (qty <= minStockLevel, min > 0)
    Out of Stock→ bg-error-container text-error (qty <= 0)
  Row actions (min-h-[44px] min-w-[44px] icon buttons): add_box (Stock in) · edit · delete (deactivate)
```

## Modals (overlay `fixed inset-0 bg-black/40 z-50`, dialog `bg-surface rounded-xl shadow-lvl3 max-w-md p-lg`)

- **Add / Edit Product** — name, category (select), unit, unit price ฿, unit cost ฿, min stock level, barcode.
  Inputs: `min-h-[44px] bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20`.
- **Stock In** — quantity received, lot no., expiry date → increments `stockQuantity`, refreshes expiry, writes an `in` StockMovement. CTA `bg-secondary text-secondary-on`.

## Behaviour

| Action | Result |
|---|---|
| Add product | `POST /api/products` (category enum + price validated by Zod) |
| Edit product | `PUT /api/products/:id` — price/name/min-stock only; never touches stock |
| Stock in | `POST /api/products/:id/stock-in` — atomic increment + `StockMovement(type:'in')` |
| Deactivate | `DELETE /api/products/:id` — soft delete (`isActive=false`) |
| Alerts | `GET /api/products/alerts` → low-stock, expiring-soon, inventory value |
| Auto-deduct | Dispensing a prescription (EMR) deducts stock + logs `out` movement (Task 3.1.2) |

## Status
Per-branch stock (`branch_inventory`) and inter-branch transfers (`/api/inventory/transfers`) are
**implemented**. Inventory barcode scan is also implemented via `components/BarcodeScanner/*`
and the `ClinicInventory` toolbar Scan button.

## Deferred
Pet/microchip camera barcode capture remains deferred; inventory product barcode scan is not deferred.

## Touch / tokens
All interactive elements ≥ 44×44px; rows ≥ 48px. No emoji, no raw hex — Compassionate Care tokens only (Material Symbols Outlined for every icon).
