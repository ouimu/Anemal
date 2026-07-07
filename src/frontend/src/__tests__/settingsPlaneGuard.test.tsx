/**
 * BUG-011 regression: /settings must be wrapped in RequirePlane plane="clinic",
 * matching /clinic-admin and /clinic — a platform-plane session must not be able
 * to reach clinic Settings screens (even though it's a separate journey today,
 * this is the same defense-in-depth pattern already applied to the other two
 * clinic route trees).
 */
import { describe, it, expect } from 'vitest'
// Vite `?raw` import — reads App.tsx as plain text with no Node `fs`/`path`
// dependency, so this test needs no @types/node addition to the frontend.
import appSource from '../App.tsx?raw'

describe('App.tsx route wiring — /settings plane guard (BUG-011)', () => {
  it('wraps the /settings route element in RequirePlane plane="clinic"', () => {
    const settingsRouteLine: string | undefined = appSource
      .split('\n')
      .find((line: string) => line.includes('path="/settings"'))
    expect(settingsRouteLine).toBeDefined()
    expect(settingsRouteLine).toMatch(/RequirePlane plane="clinic"/)
  })
})
