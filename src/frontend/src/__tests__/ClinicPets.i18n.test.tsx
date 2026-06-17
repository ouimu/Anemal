// src/frontend/src/__tests__/ClinicPets.i18n.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../store/uiStore', () => ({
  useUiStore: (s: (s: { language: string }) => unknown) => s({ language: 'th' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicPets from '../views/clinic/ClinicPets'

describe('ClinicPets — Thai i18n', () => {
  it('renders Thai pet name label', () => {
    render(<ClinicPets />)
    expect(screen.getByText(/ชื่อสัตว์เลี้ยง/i)).toBeInTheDocument()
  })
  it('renders Thai phone label', () => {
    render(<ClinicPets />)
    expect(screen.getByText(/เบอร์โทรศัพท์/i)).toBeInTheDocument()
  })
})
