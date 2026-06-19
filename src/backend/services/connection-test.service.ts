// Stateless connection tests for Settings "Test" buttons (Phase 1.5-B).
// CRITICAL: nothing here writes to the database — these verify credentials only.
// Failures return { success: false, detail } with HTTP 200 (TC-S009), never a 500.

import net from 'net'

const TEST_TIMEOUT_MS = 10_000
const LINE_BOT_INFO_URL = 'https://api.line.me/v2/bot/info'

const SMS_CREDIT_URLS: Record<string, string> = {
  thaibulksms: 'https://api-v2.thaibulksms.com/credit',
  thsms:       'https://thsms.com/api/rest/credit',
}

export interface ConnectionTestResult {
  success:    boolean
  detail:     string
  latencyMs?: number
}

async function timedFetch(url: string, init: RequestInit): Promise<{ res: Response; latencyMs: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  const start = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return { res, latencyMs: Date.now() - start }
  } finally {
    clearTimeout(timer)
  }
}

function failureDetail(err: unknown): string {
  if (err instanceof Error && err.name === 'AbortError') return `Connection timed out after ${TEST_TIMEOUT_MS / 1000}s`
  return err instanceof Error ? err.message : 'Connection failed'
}

// Verifies a LINE OA channel access token against the read-only bot/info endpoint.
export async function testLine(token: string): Promise<ConnectionTestResult> {
  if (!token) return { success: false, detail: 'No LINE OA token configured' }
  try {
    const { res, latencyMs } = await timedFetch(LINE_BOT_INFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return { success: true, detail: 'LINE OA token is valid', latencyMs }
    return { success: false, detail: `LINE API rejected the token (HTTP ${res.status})`, latencyMs }
  } catch (err) {
    return { success: false, detail: failureDetail(err) }
  }
}

// Verifies SMS provider credentials via the provider's credit-check endpoint.
export async function testSms(provider: string, apiKey: string): Promise<ConnectionTestResult> {
  const url = SMS_CREDIT_URLS[provider]
  if (!url) return { success: false, detail: `Unknown SMS provider: ${provider || '(none)'}` }
  if (!apiKey) return { success: false, detail: 'No SMS API key configured' }
  try {
    const { res, latencyMs } = await timedFetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) return { success: true, detail: `${provider} credentials accepted`, latencyMs }
    return { success: false, detail: `${provider} rejected the credentials (HTTP ${res.status})`, latencyMs }
  } catch (err) {
    return { success: false, detail: failureDetail(err) }
  }
}

// Block private/loopback/link-local targets to prevent SSRF via admin-supplied lab URL.
function assertSafeUrl(raw: string): void {
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new Error('Invalid URL') }
  if (parsed.protocol !== 'https:') throw new Error('Lab API URL must use HTTPS')
  const host = parsed.hostname
  if (/^(localhost|127\.|::1$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) {
    throw new Error('Lab API URL must not target internal addresses')
  }
}

// Pings the configured lab API base URL with the API key header.
export async function testLab(url: string, apiKey: string): Promise<ConnectionTestResult> {
  if (!url) return { success: false, detail: 'No lab API URL configured' }
  try { assertSafeUrl(url) }
  catch (err) { return { success: false, detail: err instanceof Error ? err.message : 'Invalid URL' } }
  try {
    const { res, latencyMs } = await timedFetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (res.ok) return { success: true, detail: `Lab API reachable (HTTP ${res.status})`, latencyMs }
    return { success: false, detail: `Lab API responded with HTTP ${res.status}`, latencyMs }
  } catch (err) {
    return { success: false, detail: failureDetail(err) }
  }
}

// TCP-level reachability check for the platform SMTP host (super-admin only).
export function testSmtp(host: string, port: number): Promise<ConnectionTestResult> {
  if (!host) return Promise.resolve({ success: false, detail: 'No SMTP host configured' })
  return new Promise(resolve => {
    const start = Date.now()
    const socket = net.createConnection({ host, port, timeout: TEST_TIMEOUT_MS })
    const done = (result: ConnectionTestResult): void => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => done({ success: true, detail: `Connected to ${host}:${port}`, latencyMs: Date.now() - start }))
    socket.once('timeout', () => done({ success: false, detail: `Connection timed out after ${TEST_TIMEOUT_MS / 1000}s` }))
    socket.once('error', err => done({ success: false, detail: err.message }))
  })
}
