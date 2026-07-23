// src/backend/config/smb-client.ts
// Thin seam between SmbShareDriver and whatever SMB2 client library is
// chosen. Every consumer depends on this interface, never on the concrete
// library — this is what lets SmbShareDriver's tests run against
// FakeSmbClient with zero network dependency (ADR-0023).
import SMB2 from '@marsaud/smb2'
import { AppError } from '../utils/errors'

export interface SmbClientConfig {
  host:     string
  share:    string
  username: string
  password: string
}

export interface SmbClient {
  connect(): Promise<void>
  writeFile(remotePath: string, body: Buffer): Promise<void>
  readFile(remotePath: string): Promise<Buffer>
  unlink(remotePath: string): Promise<void>
  rename(fromPath: string, toPath: string): Promise<void>
  exists(remotePath: string): Promise<boolean>
  disconnect(): Promise<void>
}

// Surfaced as specific, distinct save-time reasons (design §"Address format")
// rather than one generic "failed" — createSmbClient's implementation maps
// the library's native errors (connection refused/timeout vs.
// STATUS_BAD_NETWORK_NAME vs. STATUS_LOGON_FAILURE) onto these three.
export class SmbHostUnreachableError extends AppError {
  constructor(host: string) { super(400, `Cannot reach host: ${host}`, 'SMB_HOST_UNREACHABLE') }
}
export class SmbShareNotFoundError extends AppError {
  constructor(share: string) { super(400, `Share not found: ${share}`, 'SMB_SHARE_NOT_FOUND') }
}
export class SmbAuthRejectedError extends AppError {
  constructor() { super(400, 'Credentials were rejected', 'SMB_AUTH_REJECTED') }
}

// Windows/SMB status codes (via the library's ms_erref mapping) and Node
// socket-level errno codes that identify each connect-time failure class.
const AUTH_REJECTED_CODES = new Set(['STATUS_LOGON_FAILURE', 'STATUS_ACCESS_DENIED', 'STATUS_ACCOUNT_RESTRICTION'])
const SHARE_NOT_FOUND_CODES = new Set(['STATUS_BAD_NETWORK_NAME', 'STATUS_BAD_NETWORK_PATH'])
const HOST_UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'ENETUNREACH'])
// Not-found file/path codes — normalized to a plain ENOENT-coded error so
// SmbShareDriver's shared isNotFound() check (also used by FakeSmbClient)
// works identically against the real library.
const NOT_FOUND_CODES = new Set(['STATUS_OBJECT_NAME_NOT_FOUND', 'STATUS_OBJECT_PATH_NOT_FOUND', 'ENOENT'])

/**
 * Classifies a raw error from the underlying SMB2 library/socket layer into
 * one of: a connect-time SmbHostUnreachableError/SmbShareNotFoundError/
 * SmbAuthRejectedError, a normalized ENOENT-coded not-found error, or the
 * original error (left for SmbShareDriver to wrap as StorageUnavailableError).
 */
function classify(err: unknown, config: SmbClientConfig): Error {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  if (code && NOT_FOUND_CODES.has(code)) {
    return Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  if (code && AUTH_REJECTED_CODES.has(code)) return new SmbAuthRejectedError()
  if (code && SHARE_NOT_FOUND_CODES.has(code)) return new SmbShareNotFoundError(config.share)
  if (code && HOST_UNREACHABLE_CODES.has(code)) return new SmbHostUnreachableError(config.host)
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * Real SMB2 client factory — implemented against `@marsaud/smb2` (chosen
 * 2026-07-23: pure-JS, no native/CLI dependency, ~94k npm downloads/month,
 * the interface this seam was designed around — see code comment on the
 * package's own "experimental" README disclaimer below). Wraps the
 * library's connect/readFile/writeFile/unlink/rename/exists calls and maps
 * its native connection/auth/share/not-found errors onto the typed errors
 * above. Every other file depends only on SmbClient — this is the one place
 * the concrete package is imported (swap it here only, per ADR-0023).
 *
 * NOTE (flagged for review, not silently swapped): @marsaud/smb2's own
 * README states "development is still at an experimental stage and should
 * not be yet considered for production environment" despite being the most
 * widely used pure-JS SMB2 client for Node (last published 2022-06, but
 * still ~94k downloads/month as of 2026-07). No actively-maintained
 * alternative matches this seam's flat readFile/writeFile/unlink/rename/
 * exists shape without a larger rewrite (the next-closest, @awo00/smb2, uses
 * a session/tree object model instead). Kept as the plan's chosen package;
 * this disclaimer should be weighed before any production SMB rollout.
 */
export function createSmbClient(config: SmbClientConfig): SmbClient {
  let client: SMB2 | null = null

  function buildClient(): SMB2 {
    return new SMB2({
      share:    `\\\\${config.host}\\${config.share}`,
      username: config.username,
      password: config.password,
      domain:   '',
    })
  }

  return {
    async connect(): Promise<void> {
      const candidate = buildClient()
      try {
        // The library lazily opens its connection on first operation — force
        // a real connect/auth/share-access attempt now so failures surface
        // from connect(), matching SmbShareDriver's per-operation contract.
        await candidate.exists('\\')
      } catch (err) {
        throw classify(err, config)
      }
      client = candidate
    },

    async writeFile(remotePath: string, body: Buffer): Promise<void> {
      if (!client) throw new Error('SmbClient: not connected — call connect() first')
      try {
        await client.writeFile(remotePath, body)
      } catch (err) {
        throw classify(err, config)
      }
    },

    async readFile(remotePath: string): Promise<Buffer> {
      if (!client) throw new Error('SmbClient: not connected — call connect() first')
      try {
        return await client.readFile(remotePath)
      } catch (err) {
        throw classify(err, config)
      }
    },

    async unlink(remotePath: string): Promise<void> {
      if (!client) throw new Error('SmbClient: not connected — call connect() first')
      try {
        await client.unlink(remotePath)
      } catch (err) {
        throw classify(err, config)
      }
    },

    async rename(fromPath: string, toPath: string): Promise<void> {
      if (!client) throw new Error('SmbClient: not connected — call connect() first')
      try {
        await client.rename(fromPath, toPath)
      } catch (err) {
        throw classify(err, config)
      }
    },

    async exists(remotePath: string): Promise<boolean> {
      if (!client) throw new Error('SmbClient: not connected — call connect() first')
      try {
        return await client.exists(remotePath)
      } catch (err) {
        throw classify(err, config)
      }
    },

    async disconnect(): Promise<void> {
      client?.disconnect()
      client = null
    },
  }
}
