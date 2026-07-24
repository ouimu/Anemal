# Grill Record — OneDrive Driver Design (ADR-0023 Sub-project 3 of 3)

**CLAUDE.md Step 3.5 (mandatory, non-skippable).** Interview run live with the product owner 2026-07-24, one question at a time per the `grilling` skill contract, after BA sign-off (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`, APPROVE-WITH-FINDINGS).

Design under interview: `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`

---

## G1 — Client-secret rotation reminder cadence

**Question:** Q3 (earlier round) already got "the dev team will handle rotation" — this asked to pin down *how often*, given a missed rotation bricks OneDrive for every clinic simultaneously (OD-3).
**Team recommendation:** calendar reminder every 6 months (half of Microsoft's 24-month cap, margin for a missed reminder).
**Answer:** OK — accepted as-is.
**Resolution:** No design change (OD-3 mitigation already stated this cadence in the design's Q3 answer). Confirmed, not re-opened.

## G2 — Does switching providers move old files, or does the clinic just lose access?

**Question:** the product owner asked back — is there a background migration, or does the clinic simply lose visibility into files uploaded under the previous provider?
**Answer (established from I-19, the locked parent no-migration decision, applied here for the first time to a live product question):** neither. No file is ever deleted or moved by a switch. Every driver derives its keys deterministically from `tenant-{id}` + record/pet ID (I-4, M-4) — switching just changes which driver is active. Old files remain exactly where they were; switching back makes them visible again with zero loss.
**Follow-up ask:** show this as a **popup confirm**, not just documentation.
**Resolution — M-12 (folded into design §2/§6):** the *existing* switch-confirmation dialog (I-17, reused — not a new popup) gains one added paragraph, applied uniformly to every provider pair (not a Google↔OneDrive-specific variant): *"เปลี่ยนผู้ให้บริการจะไม่โยกย้ายไฟล์เดิมให้อัตโนมัติ ระบบจะมองไม่เห็นไฟล์เก่าจนกว่าจะสลับกลับ — ไฟล์เดิมไม่ได้ถูกลบ สลับกลับมาดูได้ทุกเมื่อ"*. Round-trip test added (§9): switch A→B→A, original files still readable after switching back.

## G3 — Same personal Microsoft/Google account connected to two different clinics

**Question:** should the system detect and warn if two *different* Anemal tenants connect the same cloud account?
**Answer:** yes for different clinics; branches of the *same* clinic sharing one account is fine (they already share the tenant prefix). Offered two implementation options (OneDrive-only now vs. shared detection retrofitted to Google Drive too); product owner picked **(b) — build it once, apply to both providers** ("check duplicate + warning ไม่น่าทำเยอะ" — confirmed as bounded scope).
**Resolution — M-11 (folded into design §2/§4/§6/§9, risk OD-9):** new hashed account-identifier column per provider (`oneDriveAccountIdHash` new, `googleAccountIdHash` retrofit to the shipped Google callback — small patch, same PR). Populated from an identifier already reachable with existing scopes (Microsoft `owner.user.id` off the already-called `GET /me/drive`; Google `about.get` `user.permissionId`) — **no new OAuth scope required**. On collision with a *different* tenant's row (same provider), connect still succeeds; a non-blocking Storage-page banner shows, existence-only, no cross-tenant detail leaked. Same-tenant multi-branch reuse of one account never warns.

## G4 — Failed/interrupted upload on the >4 MB chunked path

**Question:** if network drops mid-upload for a large attachment, does the clinic get told, or does it fail silently?
**Team clarification (technical correction, not a decision):** the "4 MB" boundary in M-5 is a **hard Microsoft Graph API limit** (simple `PUT` caps at ~4 MB), not a value this project chose or can raise. Files above it already route through `createUploadSession` chunking automatically and transparently — the existing 25 MB attachment cap (ADR-0021/0022) is unaffected either way; there is nothing to change to "10 MB."
**Answer:** OK, no threshold change needed — but confirm the user is notified on a failed/interrupted upload.
**Resolution — M-13 (folded into design §2/§9, risk OD-10):** already covered by the existing contract — uploads are synchronous HTTP calls from the frontend's perspective, so a network drop surfaces as a rejected request the existing attachment-upload UI already renders as an error (same path as any other `StorageUnavailableError`). No new code; added an explicit acceptance test (§9) that a simulated mid-chunk failure on the >4 MB path renders the same visible error, so it's asserted instead of assumed. Automatic retry remains out of scope (§10, unchanged).

---

## Outcome

All four grill threads resolved with the product owner present — no fabricated answers, no skipped step. Design doc updated in place (M-11/M-12/M-13, §4 schema additions, §6 UI, §9 tests, risk register OD-9/OD-10, Definition-of-Ready check). **Design is ready for `/write-plan` (CLAUDE.md Step 4).**
