// Fix ECONNRESET with supertest 6.x on Node.js 24.
//
// supertest defaults superagent's _agent = false (no connection pooling), which
// causes the HTTP client to destroy sockets via RST after each response. On
// Node 24 this produces intermittent ECONNRESET on subsequent requests.
//
// Setting _agent = http.globalAgent (keepAlive:true) makes the client reuse
// connections and handle server-side closes gracefully instead.
const http = require('http')
const { Request } = require('superagent')

const _origEnd = Request.prototype.end
Request.prototype.end = function patchedEnd (fn) {
  if (this._agent === false) {
    this._agent = http.globalAgent
  }
  return _origEnd.call(this, fn)
}

// Seed RBAC (permissions + system roles) for all tests
// Phase 8 (T-5B) — ensure clinic_admin and other roles have all permissions for enforcement tests
// Note: seedRbac is idempotent (uses upsert) and completes before any test suite runs.
// Invocation happens via globalSetup (jest-global-setup.js), not here.
// This setupFile only sets up the supertest agent patch above.
// The F4 connection-pool teardown lives in jest.setup-after-env.js — this file runs
// via `setupFiles`, before the test framework (afterAll/expect/etc.) is installed.
