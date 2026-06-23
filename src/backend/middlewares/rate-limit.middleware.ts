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
