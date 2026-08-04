import dotenv from 'dotenv'
import path from 'path'

// Load .env from project root (resolved relative to src/backend/config/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const config = {
  port:        Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret:   required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  nodeEnv:     process.env.NODE_ENV || 'development',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  // AES-256-GCM key for settings secrets — 32-byte hex (openssl rand -hex 32)
  settingsEncryptionKey: required('SETTINGS_ENCRYPTION_KEY'),
  // Shared secret Vercel Cron sends as `Authorization: Bearer ${cronSecret}`.
  // Must be set — an unset secret would otherwise let `Bearer undefined` pass.
  cronSecret: required('CRON_SECRET'),
}

// G1 (ADR-0022): the local-disk storage driver is testing-only — it pools
// every tenant's files on the operator's server and loses them on every
// redeploy. Refuse to boot in production unless explicitly overridden.
if (config.nodeEnv === 'production' && process.env.ALLOW_LOCAL_STORAGE_IN_PROD !== 'true') {
  throw new Error(
    'Local-disk storage driver is testing-only and must not run in production. ' +
    'Set ALLOW_LOCAL_STORAGE_IN_PROD=true to override (not recommended; see ADR-0022).'
  )
}
