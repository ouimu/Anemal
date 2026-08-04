/**
 * Rate-limiting middleware for authentication endpoints.
 *
 * Applied to login routes only. Skipped entirely in the test environment
 * so existing test suites remain unaffected.
 *
 * @module rate-limit.middleware
 */

import rateLimit from 'express-rate-limit'

/** Maximum login attempts per window before a 429 is returned. */
const MAX_LOGIN_ATTEMPTS = 10

/** Rate-limit window in milliseconds (15 minutes). */
const WINDOW_MS = 15 * 60 * 1_000

/**
 * Login rate limiter — allows at most {@link MAX_LOGIN_ATTEMPTS} failed
 * attempts per IP within a {@link WINDOW_MS} sliding window.
 *
 * Successful requests are not counted against the limit
 * (`skipSuccessfulRequests: true`).
 */
export const loginRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_LOGIN_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Try again later.',
      },
    })
  },
})

/**
 * R3-HI-07: multer's `memoryStorage()` (medical-record + pet attachment/photo routes)
 * buffers the entire file into process heap before any MIME/size validation runs. That
 * bounds a SINGLE request's memory cost but not the AGGREGATE — nothing previously
 * stopped one identity from firing many concurrent/rapid uploads and multiplying that
 * cost across the process heap. This runs BEFORE `upload.single(...)` in the route chain,
 * so a caller over the limit is rejected before multer buffers anything for that request.
 *
 * Scoped per-identity (authenticated userId) rather than per-IP: `authMiddleware` runs
 * first on these routers, so `req.context` is always populated here, and per-identity
 * scoping is the correct unit for a shared-clinic-tablet deployment where many staff can
 * share one IP.
 *
 * A full streaming-upload rewrite (never buffering the whole file in memory) would close
 * the remaining per-request cost too, but is out of scope for this pass — tracked as a
 * follow-up.
 */
const MAX_UPLOADS_PER_WINDOW = 10
const UPLOAD_WINDOW_MS = 60 * 1_000

export const uploadRateLimiter = rateLimit({
  windowMs: UPLOAD_WINDOW_MS,
  max: MAX_UPLOADS_PER_WINDOW,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    const ctx = req.context
    return ctx?.userId != null ? `user:${ctx.userId}` : (req.ip ?? 'unknown')
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many uploads. Try again later.',
      },
    })
  },
})
