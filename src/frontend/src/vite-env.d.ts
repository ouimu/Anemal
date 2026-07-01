/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_IDLE_TIMEOUT_MINUTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
