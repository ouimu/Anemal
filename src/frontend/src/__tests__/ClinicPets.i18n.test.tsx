// src/frontend/src/__tests__/ClinicPets.i18n.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

describe('ClinicPets — Thai i18n', () => {
  it('renders Thai add owner button', () => {
    render(<ClinicPets />)
    expect(screen.getByText(/เพิ่มเจ้าของใหม่/i)).toBeInTheDocument()
  })
  it('renders Thai phone placeholder in add owner modal', async () => {
    render(<ClinicPets />)
    await userEvent.click(screen.getByText(/เพิ่มเจ้าของใหม่/i))
    expect(screen.getByPlaceholderText(/เบอร์โทรศัพท์/i)).toBeInTheDocument()
  })
})
