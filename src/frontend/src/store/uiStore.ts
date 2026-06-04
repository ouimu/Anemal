// UI state — sidebar collapse + hand mode
// @uiux-agent: sidebarOpen and handMode persist to localStorage
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  handMode:    'left' | 'right'
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleHandMode: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      handMode:    'left',
      toggleSidebar:  () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleHandMode: () => set({ handMode: get().handMode === 'left' ? 'right' : 'left' }),
    }),
    { name: 'vetclinic-ui' }
  )
)
