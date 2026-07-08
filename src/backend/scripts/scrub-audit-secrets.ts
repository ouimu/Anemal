/**
 * One-time scrub of existing plaintext secret-like values in platform_audit_logs.details.
 *
 * BUG-001 / ADR-0003 D1: the audit middleware's pre-fix shallow 4-key sanitizer missed
 * secret-like fields (baseSmsApiKey, smtpPassword, lineChannelSecret, etc.) that were
 * nested or didn't match the literal 'password' family. This script re-applies the new
 * recursive SENSITIVE_KEY_PATTERN redaction to every existing row's `details` JSON blob.
 *
 * Idempotent: rows already containing '***' for a matched key are left as-is on re-run
 * (the redact() function is deterministic and safe to re-apply).
 *
 * Run once via: npx ts-node src/backend/scripts/scrub-audit-secrets.ts
 *
 * Ops note (ADR D1): affected tenant credentials (baseSmsApiKey, smtpPassword,
 * lineChannelSecret) found in plaintext rows must be ROTATED after this script runs —
 * scrubbing the audit log does not invalidate a credential that may already be
 * compromised. Credential rotation is a manual ops task, tracked separately, NOT
 * automated by this script.
 */
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { redact } from '../utils/audit-sanitize'

async function main() {
  const rows = await prisma.platformAuditLog.findMany({
    where: { details: { not: Prisma.JsonNull } as never },
    select: { id: true, details: true },
  })

  let scrubbedCount = 0
  for (const row of rows) {
    if (!row.details || typeof row.details !== 'object') continue
    const before = JSON.stringify(row.details)
    const after = redact(row.details)
    if (JSON.stringify(after) === before) continue // idempotent: no change needed
    await prisma.platformAuditLog.update({
      where: { id: row.id },
      data: { details: after as never },
    })
    scrubbedCount++
  }

  console.log(`Scrubbed ${scrubbedCount} of ${rows.length} platform_audit_logs rows.`)
  console.log('OPS ACTION REQUIRED: rotate any tenant credentials (baseSmsApiKey, smtpPassword, lineChannelSecret) that were found in plaintext prior to this scrub.')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
