import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

import ClinicInventory from '../views/clinic/ClinicInventory'

describe('ClinicInventory — Thai i18n', () => {
  it('renders Thai product name header', () => {
    render(<ClinicInventory />)
    expect(screen.getByText(/ชื่อสินค้า/i)).toBeInTheDocument()
  })
  it('renders Thai stock quantity label', () => {
    render(<ClinicInventory />)
    expect(screen.getByText(/จำนวนคงเหลือ/i)).toBeInTheDocument()
  })
})
