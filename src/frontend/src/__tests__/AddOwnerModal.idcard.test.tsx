// src/frontend/src/__tests__/AddOwnerModal.idcard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

// AddOwnerModal is not separately exported; open it through ClinicPets' "Add New Owner" button.
async function openAddOwnerModal() {
  render(<ClinicPets />)
  await userEvent.click(screen.getByText('Add New Owner'))
}

describe('AddOwnerModal — idCardType/idCardNumber', () => {
  it('does not show a number input when card type is unset', async () => {
    await openAddOwnerModal()
    expect(screen.queryByPlaceholderText(/id card number|passport number/i)).not.toBeInTheDocument()
  })

  it('shows a 13-digit-hinted number input when Thai National ID is selected', async () => {
    await openAddOwnerModal()
    await userEvent.selectOptions(screen.getByLabelText(/id card type/i), 'thai_id')
    const input = screen.getByPlaceholderText(/id card number/i) as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.maxLength).toBe(13)
  })

  it('shows a passport number input when Passport is selected', async () => {
    await openAddOwnerModal()
    await userEvent.selectOptions(screen.getByLabelText(/id card type/i), 'passport')
    expect(screen.getByPlaceholderText(/passport number/i)).toBeInTheDocument()
  })

  it('omits idCardType/idCardNumber from the payload when left unset', async () => {
    postMock.mockClear()
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'Jane')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'Doe')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '0812345678')
    await userEvent.click(screen.getByText('Save Owner'))
    expect(postMock).toHaveBeenCalledWith('/api/owners', expect.objectContaining({ idCardType: null, idCardNumber: null }))
  })

  it('includes idCardType/idCardNumber in the payload when set', async () => {
    postMock.mockClear()
    await openAddOwnerModal()
    await userEvent.type(screen.getByPlaceholderText('First name'), 'Jane')
    await userEvent.type(screen.getByPlaceholderText('Last name'), 'Doe')
    await userEvent.type(screen.getByPlaceholderText('Phone number'), '0812345678')
    await userEvent.selectOptions(screen.getByLabelText(/id card type/i), 'passport')
    await userEvent.type(screen.getByPlaceholderText(/passport number/i), 'AB123456')
    await userEvent.click(screen.getByText('Save Owner'))
    expect(postMock).toHaveBeenCalledWith('/api/owners', expect.objectContaining({ idCardType: 'passport', idCardNumber: 'AB123456' }))
  })
})
