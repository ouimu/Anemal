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
const seedRbac = require('./prisma/seed-rbac').seedRbac
seedRbac().catch(err => {
  console.error('[jest.setup] seedRbac failed:', err)
  process.exit(1)
})
