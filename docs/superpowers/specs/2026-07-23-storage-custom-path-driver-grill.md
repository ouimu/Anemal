# Grill — Per-Tenant Storage Provider: Custom Path Driver (Sub-project 1 of 3)

**Date:** 2026-07-23
**Gate:** CLAUDE.md Step 3.5 (mandatory, non-skippable)
**Inputs:** design (`2026-07-23-storage-custom-path-driver-design.md`), BA sign-off (`2026-07-23-storage-custom-path-driver-ba-signoff.md`), edge-case sweep by an independent model (Fable) prompted against the live design + source.

## Method

Fable model was asked to find gaps orthogonal to what BA already caught (permission class, format restriction, audit, switch-confirmation, G1 guard), reading the design doc and the live `storage-driver.ts` / `pet.service.ts` / `emr-attachment.service.ts`. It returned 7 findings. Each was put to the user as a plain-language question, one at a time, with a recommended default. One finding (network authentication) surfaced a genuine architecture-changing correction through follow-up discussion; the rest were confirmed as-recommended.

## Findings and resolutions

| # | Finding | Resolution |
|---|---|---|
| 1 | Native UNC access needs OS-level credential setup outside the app — but the app server is the SaaS operator's shared central machine, not the clinic's own; Windows only remembers one credential per remote host per machine, so two clinics with colliding private-IP shares (common — `192.168.1.x` defaults) would collide/leak into each other's session | **Architecture change:** replaced native-UNC `fs` access with an application-layer `SmbShareDriver` — connects using per-tenant stored credentials (host, share, username, password — password AES-256-GCM encrypted via existing `SETTINGS_ENCRYPTION_KEY`) via an SMB2 client library, independent of the OS session. Credential capture happens in the Clinic Settings UI (connect-and-test-write at save time), not pre-configured out-of-band. |
| 2 | Non-atomic `save()` (`fs.writeFile` direct-to-final-path) — a network blip mid-write can truncate/destroy the *previous* good file, worst on pet-photo overwrite-in-place | Write-to-temp-then-rename in both `LocalDiskDriver` and `SmbShareDriver`; old file survives until new file is fully written. |
| 3 | `exists()` swallows every error (network unreachable, timeout, auth) as `false` — a temporary outage reads identically to "file was deleted," which will alarm clinic staff mid-consult | Only true not-found means "missing" (404). Any other error surfaces a distinct retryable message ("can't reach storage right now, try again") — never the same copy as data loss. |
| 4 | Design silently assumed a single Windows on-prem server (UNC/native-fs constraint) | Resolved as a side effect of finding #1's fix — app-layer SMB client has no OS/single-instance dependency. |
| 5 | Backup/data-custody responsibility moves to the clinic once they use their own share; deprovisioning leaves files behind with no stated policy | Documented (not solved by code): switch-time confirmation gains one line stating backup is now the clinic's responsibility; deprovisioning intentionally never touches a custom share's files. |
| 6 | Photo/attachment grids do 2 network round-trips per image (`exists()` + `read()`) with no caching (`no-store` per PR #44 QA finding) — will be visibly slower over a network share | Accepted as-is for this sub-project; no caching layer added; revisit only if measured to matter. |
| 7 | Delete-after-DB-commit and rollback-delete failures can mask the real error or leave orphaned files when the share is down | Best-effort: logged, not surfaced as a user-facing failure — DB row is the source of truth. |

## Outcome

All 7 findings resolved and folded into the design doc (see its "Architecture", "Address format + credential capture", "Error handling", "Performance", "Data custody note", and "Deployment topology note" sections). No open findings remain. Recorded as ADR-0023.

**Gate cleared — proceeds to `/write-plan` (CLAUDE.md Step 4).**
