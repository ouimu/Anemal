// src/backend/__tests__/smb-client.test.ts
// Regression test for the P1 QA finding: createSmbClient's rename() wrapper
// must force replace-on-existing at the real @marsaud/smb2 library call —
// the library itself defaults to NOT replacing an existing target, which
// silently broke pet-photo overwrite-in-place on a real SMB share. This test
// mocks the library directly (not FakeSmbClient, which sits one layer above
// and can't see this bug) so it actually fails without the fix.

const mockInstance = {
  exists: jest.fn().mockResolvedValue(true),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('x')),
  unlink: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
}

jest.mock('@marsaud/smb2', () => jest.fn().mockImplementation(() => mockInstance))

import { createSmbClient } from '../config/smb-client'

describe('createSmbClient — rename wrapper (P1 regression, QA 2026-07-23)', () => {
  beforeEach(() => jest.clearAllMocks())

  test('rename() forces replace:true on the underlying library call', async () => {
    const client = createSmbClient({ host: 'h', share: 's', username: 'u', password: 'p' })
    await client.connect()
    await client.rename('a/.tmp-123', 'a/final.jpg')

    expect(mockInstance.rename).toHaveBeenCalledWith('a/.tmp-123', 'a/final.jpg', { replace: true })
  })
})
