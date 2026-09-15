/**
 * ClinicInventory — first test coverage (MODAL-10).
 *
 * Zero coverage existed for this file before this task. Covers the Dialog
 * migration for both modals (open/close channels: cancel, backdrop, Escape)
 * and the per-modal permission mapping the AC calls out as a distinct-code,
 * do-not-conflate requirement:
 *   - Add Product  -> inventory.create
 *   - Edit Product -> inventory.edit   (Deactivate shares this code — same
 *                                        DELETE route requirement)
 *   - Stock In     -> inventory.adjust
 *
 * A caller holding only inventory.view (doctor, per the plan's actor line)
 * can still open the Edit and Stock In dialogs to look at an item, but the
 * write path must not be reachable: no submit control renders, fields are
 * disabled, and the mutation is never invoked even if the underlying
 * <form> is submitted directly (defense in depth — the route itself is the
 * real 403 boundary, unchanged by this migration and out of this file's
 * scope).
 *
 * hooks/useInventory is mocked directly (as CloneRoleModal.test.tsx mocks
 * hooks/useRoles) rather than reaching through react-query, so submitted
 * payloads can be asserted without a QueryClientProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClinicInventory from '../ClinicInventory'
import type { Product, ProductList, InventoryAlerts } from '../../../hooks/useInventory'

const PRODUCT: Product = {
  id: 1,
  name: 'Amoxicillin 250mg',
  category: 'Medicine',
  barcode: '8850001',
  unit: 'tablet',
  stockQuantity: '40',
  minStockLevel: '10',
  expiryDate: '2027-01-01T00:00:00.000Z',
  unitCost: '2.50',
  unitPrice: '5.00',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const PRODUCT_LIST: ProductList = { products: [PRODUCT], total: 1, page: 1, limit: 20 }
const ALERTS: InventoryAlerts = {
  lowStock: [], expiringSoon: [], lowStockCount: 0, expiringSoonCount: 0, inventoryValue: 0, expiryWindowDays: 30,
}

const h = vi.hoisted(() => ({
  createMutateAsync: vi.fn(() => Promise.resolve({})),
  updateMutateAsync: vi.fn(() => Promise.resolve({})),
  stockInMutateAsync: vi.fn(() => Promise.resolve({})),
  deactivateMutate: vi.fn(),
}))

vi.mock('../../../hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useInventory')>()
  return {
    ...actual,
    useProducts: () => ({ data: PRODUCT_LIST, isLoading: false }),
    useInventoryAlerts: () => ({ data: ALERTS }),
    useCreateProduct: () => ({ mutateAsync: h.createMutateAsync, isPending: false }),
    useUpdateProduct: () => ({ mutateAsync: h.updateMutateAsync, isPending: false }),
    useStockIn: () => ({ mutateAsync: h.stockInMutateAsync, isPending: false }),
    useDeactivateProduct: () => ({ mutate: h.deactivateMutate, isPending: false }),
  }
})

vi.mock('../../../components/BarcodeScanner', () => ({
  default: () => null,
}))

const state = vi.hoisted(() => ({
  permissions: ['inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjust'] as string[],
}))
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { permissions: string[]; hasPermission: (p: string) => boolean }) => unknown) =>
    selector({
      permissions: state.permissions,
      hasPermission: (p: string) => state.permissions.includes(p),
    }),
}))

function setPermissions(perms: string[]): void {
  state.permissions = perms
}

beforeEach(() => {
  vi.clearAllMocks()
  setPermissions(['inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjust'])
})

describe('ClinicInventory — clinic_staff (full access)', () => {
  it('Add Item opens the Add Product dialog; Escape closes it', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByText(/add item/i))
    expect(screen.getByRole('dialog', { name: 'Add Product' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Add Product: backdrop click closes without submitting', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByText(/add item/i))
    const dialog = screen.getByRole('dialog', { name: 'Add Product' })
    fireEvent.click(dialog.parentElement as HTMLElement) // the fixed-inset backdrop wrapper
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.createMutateAsync).not.toHaveBeenCalled()
  })

  it('Add Product: Cancel closes without submitting', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByText(/add item/i))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.createMutateAsync).not.toHaveBeenCalled()
  })

  it('Add Product: submit calls useCreateProduct with the form payload (inventory.create)', async () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByText(/add item/i))
    const dialog = screen.getByRole('dialog', { name: 'Add Product' })
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Paracetamol 500mg')
    fireEvent.click(within(dialog).getByText('Add Item'))
    expect(h.createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Paracetamol 500mg', category: 'Medicine' })
    )
  })

  it('Edit Product: submit calls useUpdateProduct with the product id (inventory.edit)', async () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Edit'))
    const dialog = screen.getByRole('dialog', { name: 'Edit Product' })
    expect(within(dialog).getByDisplayValue('Amoxicillin 250mg')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByText('Save'))
    expect(h.updateMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('Stock In: submit calls useStockIn with the product id and quantity (inventory.adjust)', async () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Stock in'))
    const dialog = screen.getByRole('dialog', { name: /stock in/i })
    await userEvent.type(within(dialog).getByLabelText(/quantity received/i), '15')
    fireEvent.click(within(dialog).getByText(/receive stock/i))
    expect(h.stockInMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 1, qty: 15 }))
  })

  it('Stock In: backdrop click closes without submitting', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Stock in'))
    const dialog = screen.getByRole('dialog', { name: /stock in/i })
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.stockInMutateAsync).not.toHaveBeenCalled()
  })

  it('Stock In: Escape closes without submitting', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Stock in'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.stockInMutateAsync).not.toHaveBeenCalled()
  })

  it('Deactivate button is offered (inventory.edit)', () => {
    render(<ClinicInventory />)
    expect(screen.getByTitle('Deactivate')).toBeInTheDocument()
  })
})

describe('ClinicInventory — doctor (inventory.view only, read-only)', () => {
  beforeEach(() => setPermissions(['inventory.view']))

  it('does not render Add Item (no inventory.create)', () => {
    render(<ClinicInventory />)
    expect(screen.queryByText(/add item/i)).toBeNull()
  })

  it('does not render Deactivate (no inventory.edit)', () => {
    render(<ClinicInventory />)
    expect(screen.queryByTitle('Deactivate')).toBeNull()
  })

  it('can open Edit Product read-only: fields disabled, no Save control, submit does not call useUpdateProduct', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Edit'))
    const dialog = screen.getByRole('dialog', { name: 'Edit Product' })
    expect(within(dialog).getByDisplayValue('Amoxicillin 250mg')).toBeDisabled()
    expect(within(dialog).queryByText('Save')).toBeNull()
    expect(within(dialog).getByText(/view only/i)).toBeInTheDocument()

    // Defense in depth: even a direct form submit (e.g. Enter key) must not
    // reach the mutation when the write permission is absent.
    fireEvent.submit(within(dialog).getByDisplayValue('Amoxicillin 250mg').closest('form') as HTMLFormElement)
    expect(h.updateMutateAsync).not.toHaveBeenCalled()
  })

  it('can open Stock In read-only: fields disabled, no submit control, submit does not call useStockIn', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Stock in'))
    const dialog = screen.getByRole('dialog', { name: /stock in/i })
    expect(within(dialog).getByLabelText(/quantity received/i)).toBeDisabled()
    expect(within(dialog).queryByText(/receive stock/i)).toBeNull()
    expect(within(dialog).getByText(/view only/i)).toBeInTheDocument()

    fireEvent.submit(within(dialog).getByLabelText(/quantity received/i).closest('form') as HTMLFormElement)
    expect(h.stockInMutateAsync).not.toHaveBeenCalled()
  })

  it('Escape still closes the read-only Edit dialog', () => {
    render(<ClinicInventory />)
    fireEvent.click(screen.getByTitle('Edit'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
