// UI state — sidebar collapse + hand mode + theme + language
// @uiux-agent: all fields persist to localStorage (single source of truth for
// appearance/language, shared by TopNav ProfileMenu and the Preferences page).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'
export type Language = 'en' | 'th'

interface UiState {
  sidebarOpen: boolean
  handMode:    'left' | 'right'
  theme:       Theme
  language:    Language
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleHandMode: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setLanguage: (language: Language) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      handMode:    'left',
      theme:       'light',
      language:    'en',
      toggleSidebar:  () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleHandMode: () => set({ handMode: get().handMode === 'left' ? 'right' : 'left' }),
      setTheme:       (theme) => set({ theme }),
      toggleTheme:    () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setLanguage:    (language) => set({ language }),
    }),
    { name: 'vetclinic-ui' }
  )
)
