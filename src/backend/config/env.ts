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
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  // AES-256-GCM key for settings secrets — 32-byte hex (openssl rand -hex 32)
  settingsEncryptionKey: required('SETTINGS_ENCRYPTION_KEY'),
}
