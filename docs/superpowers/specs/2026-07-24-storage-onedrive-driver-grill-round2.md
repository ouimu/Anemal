# Independent Second-Pass Grill Review — OneDrive Driver Design (ADR-0023 Sub-project 3 of 3)

**Reviewer:** Fable (independent model, adversarial second pass — same pattern as PR #48's independent QA round 2, which caught 3 real gaps the first review missed)
**Date:** 2026-07-24
**Requested by:** product owner, explicitly asking whether the first grill pass (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`) missed anything.
**Scope note:** did not re-litigate settled decisions (Q1-Q4, G1's 6-month cadence, overall architecture) — focused on technical gaps, unverified claims, missed edge cases, and inconsistencies introduced by the same-day sequence of edits (Q1-Q4 → BA findings M-10 → grill findings M-11/M-12/M-13), i.e. the interaction surface between the newest additions and shipped code.

Inputs: parent ADR-0023, the shipped Google Drive design/BA-signoff/grill (precedent), the OneDrive design in its post-grill state, its BA sign-off, its grill record, and the live shipped source (`oauth-google.controller.ts`, `settings.controller.ts`, `storage-config.service.ts`, `tenant-storage-config.repository.ts`, `oauth-connect-nonce.repository.ts`, routes, `schema.prisma`, `emr-attachment.service.ts`).

---

## Finding 1 (High) — Reverse switch `onedrive → google_drive` leaves OneDrive tokens live at rest

M-10/F-OD-1 fixed only the OneDrive-connect direction (nulls `smb*`+`google*`). The opposite direction — connecting Google Drive over a `provider='onedrive'` row — goes through the *already-shipped* Google callback, whose upsert (`oauth-google.controller.ts:104`) nulls only `smb*`; it predates OneDrive. Since Microsoft has no revoke endpoint (M-3), **nulling is the only mechanism that ends Anemal's OneDrive access** — miss this direction and a live, rotating OneDrive refresh token sits encrypted on a `google_drive` row indefinitely. This is the third occurrence of the "stale secret at rest after a switch" bug class (first: PR #48 QA round 2 on Google/SMB; second: F-OD-1 on OneDrive/Google+SMB; third: this).

**Resolution — folded into M-10, §3, §7, §9, risk OD-11:** write-plan extends the shipped Google callback's upsert to also null all four `oneDrive*` columns when overwriting a `provider === 'onedrive'` row. No revoke needed (M-3 applies either way).

## Finding 2 (High-Med) — Doc self-contradiction: hash columns excluded from every nulling list

M-11 (written last) added `oneDriveAccountIdHash`/`googleAccountIdHash` but earlier-written column lists (I-14, §3 disconnect, §5, §9 disconnect test) still said "three `oneDrive*` columns" against §4's four, and M-10's nulling lists didn't include the hash columns. A stale hash surviving disconnect produces **false-positive** duplicate-account warnings for unrelated tenants.

**Resolution — folded into I-14 references (now "four"), M-10 (both directions null the hash column too), M-11 (explicit statement), §4, §9, risk OD-12:** hash columns nulled everywhere their sibling secrets are nulled; collision query gets an explicit `provider = ? AND hash = ? AND tenantId != ?` predicate as a second guard.

## Finding 3 (Med) — Unverified OAuth-scope claims underlying M-11 and I-16

The design asserts `Files.ReadWrite.AppFolder` authorizes `GET /me/drive` and `drive.file` authorizes `about.get?fields=user`, without the citation discipline applied to its other Microsoft Learn claims — and conflated `GET /me/drive` with the different `GET /me/drive/special/approot` endpoint the design elsewhere already calls. If wrong, a 403 would fall into M-9's generic "everything else → unavailable, never flips connected" bucket, permanently masking a broken status check as green.

**Resolution — folded into M-11 (flagged as a verification spike required before write-plan, with a documented fallback: ping + identifier via `GET /me/drive/special/approot`'s `parentReference.driveId`), M-9 (new explicit 403 branch), §9, risk OD-13 ("spike required before write-plan").** Not resolved by documentation alone — genuinely requires a pre-write-plan technical spike.

## Finding 4 (Med — OPEN, needs product owner) — Delete during a provider switch orphans the file at the old provider forever

Deleting an attachment while a different provider is active than the one holding the file: the DB row is deleted, `driver.delete` targets only the *active* provider and 404s (idempotent-success by existing contract), and the physical file at the old, inactive provider is never touched — orphaned permanently, un-enumerable, potentially containing clinical/EMR data, with no cleanup path. M-12's new dialog copy ("nothing is deleted") is accurate for reads but overstates reversibility for this case.

**Not resolved — this is a genuine product/business trade-off, not a technical fix, and was not invented an answer for.** Folded a caveat into M-12 noting the copy must not overstate reversibility here, and added risk row F-OD-4 (OPEN) plus a DoR-check flag. **Question for the product owner (posed separately in chat, in Thai, not decided here):** accept as documented residual risk (one sentence added to the switch dialog), or add a block/warning on delete-not-found-on-active-provider (with the trade-off that blocking would also block legitimate cleanup of already-drifted rows, which the current idempotent-delete contract exists to allow)?

## Finding 5 (Low-Med) — Duplicate-account warning lifecycle and observability gap

Unspecified whether the M-11 warning is computed once at connect (stale, and the *first* connector never learns) or recomputed per status read (which — since `GET /clinic/storage-config` is `clinic.profile.view`, held by doctor/staff — would let any non-admin staff user of tenant A infer tenant B's connect/disconnect timing over repeated page loads, a broader ongoing signal than the one-time existence-only disclosure the product owner approved at grill G3).

**Resolution — folded into M-11, §5, §9:** recompute per status read (avoids staleness); gate the `duplicateAccountWarning` field to `clinic.integrations.edit` holders only in the response, collapsing the non-admin observation channel.

## Finding 6 (Low) — Abandoned upload session + timeout headroom

G4's "no code change required" core claim holds (frontend does one synchronous multipart POST; chunking is server-side; a mid-chunk failure rejects the single request the existing error UI already renders). Two residuals: a failed session leaves an abandoned Graph upload session at Microsoft (self-expires, but a best-effort `DELETE {uploadUrl}` is one cheap line); and the frontend/proxy timeout should be confirmed to comfortably exceed a worst-case ~3-chunk 25 MB upload, or a slow-but-successful upload could misreport as failed.

**Resolution — folded into M-13, §3 `save`, §9 as write-plan bullets.** No design change; hygiene/verification callouts only.

## Finding 7 (Low) — HKDF `info` string not purpose-separated

M-11 said "same pattern as `oauth-state.ts`" without naming a distinct HKDF `info` string, risking a dev reusing the state-signing key's info string and re-coupling two purposes N-5 deliberately separated.

**Resolution — folded into M-11:** explicit distinct info string, e.g. `'account-id-hash-v1'`.

## Finding 8 (Cosmetic) — Blind "mirror GDrive's failure branches" is wrong for one case

The shipped Google callback sends every denial to the fixed default origin because Google omits `state` on a denial. Microsoft *includes* `state` on its `error=access_denied`/`consent_required` redirects — the OneDrive callback can and should verify that state and redirect to the correct tenant origin with the right copy, rather than blindly copying Google's fallback-only behavior. Not a security issue (the fail-safe direction is fine); a copy-fidelity/UX improvement.

**Resolution — folded into §3 callback description.**

---

## Not findings (independently checked, clean)

- M-7's provider-matched nonce consume: premise verified against live source, fix and F-OD-2's non-regression obligation both correctly specified.
- M-2's rotation write-back and N-4 conditional guard: consistent with the shipped pattern; concurrent-double-refresh race is benign.
- F-OD-1 as folded in by the first grill pass (OneDrive-connect direction) matches shipped precedent exactly — only the reverse direction (finding 1) was open.
- `OAuthConnectNonce` rows are never purged (only an `expiresAt` index) — pre-existing from sub-project 2, not an OneDrive-specific gap, mention-only.

---

## Outcome

Findings 1, 2, 3, 5, 6, 7, 8 folded into the design doc (`docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`) same-day, per product-owner instruction ("ใส่ได้เลยครับ"). **Finding 4 (F-OD-4) is intentionally left OPEN** — it is a genuine product/business trade-off (accept residual risk vs. add a delete-time block/warning), posed to the product owner separately rather than resolved here. Design is **not yet ready for `/write-plan`** until F-OD-4 is answered — see the design doc's Definition-of-Ready check.
