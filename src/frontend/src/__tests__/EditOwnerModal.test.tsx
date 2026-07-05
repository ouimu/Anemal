// src/frontend/src/__tests__/EditOwnerModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const putMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { put: (...args: unknown[]) => putMock(...args) },
}))

import { EditOwnerModal } from '../views/clinic/ClinicPets'

const owner = {
  id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678',
  email: 'jane@example.com', address: '123 Main St',
  idCardType: 'passport', idCardNumber: 'AB123456', isActive: true, pets: [],
}

describe('EditOwnerModal', () => {
  it('prefills fields from the owner prop', () => {
    render(<EditOwnerModal owner={owner} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByDisplayValue('Jane')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0812345678')).toBeInTheDocument()
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AB123456')).toBeInTheDocument()
  })

  it('submits PUT /api/owners/:id with edited values', async () => {
    putMock.mockClear()
    render(<EditOwnerModal owner={owner} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const lastNameInput = screen.getByDisplayValue('Doe')
    await userEvent.clear(lastNameInput)
    await userEvent.type(lastNameInput, 'Smith')
    await userEvent.click(screen.getByText('Save Changes'))
    expect(putMock).toHaveBeenCalledWith('/api/owners/1', expect.objectContaining({ lastName: 'Smith' }))
  })

  it('calls onSuccess after a successful save', async () => {
    const onSuccess = vi.fn()
    render(<EditOwnerModal owner={owner} onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(onSuccess).toHaveBeenCalled()
  })

  it('shows an inline error on 409 conflict without closing', async () => {
    putMock.mockRejectedValueOnce({ response: { data: { error: 'ID card number already registered in this clinic' } } })
    const onSuccess = vi.fn()
    render(<EditOwnerModal owner={owner} onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
