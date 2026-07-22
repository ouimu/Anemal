describe('config/env — production local-storage boot guard (G1)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV
  const ORIGINAL_ALLOW    = process.env.ALLOW_LOCAL_STORAGE_IN_PROD

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV
    if (ORIGINAL_ALLOW === undefined) delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    else process.env.ALLOW_LOCAL_STORAGE_IN_PROD = ORIGINAL_ALLOW
    jest.resetModules()
  })

  test('NODE_ENV=production without ALLOW_LOCAL_STORAGE_IN_PROD throws on import', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    expect(() => require('../config/env')).toThrow(/local-disk storage driver is testing-only/i)
  })

  test('NODE_ENV=production with ALLOW_LOCAL_STORAGE_IN_PROD=true does not throw', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_LOCAL_STORAGE_IN_PROD = 'true'
    expect(() => require('../config/env')).not.toThrow()
  })

  test('NODE_ENV=development does not throw regardless of ALLOW_LOCAL_STORAGE_IN_PROD', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'development'
    delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    expect(() => require('../config/env')).not.toThrow()
  })
})
