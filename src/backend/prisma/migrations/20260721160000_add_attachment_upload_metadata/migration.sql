-- ADR-0021 EMR-ATTACH-9: real-upload metadata on Attachment, additive + nullable.
-- fileUrl becomes optional because the confirm route now accepts fileUrl XOR
-- storageKey (ADR-0021 F3) — every existing row already has fileUrl populated,
-- so relaxing the constraint is a no-op for current data.
ALTER TABLE "attachments" ALTER COLUMN "fileUrl" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "attachments" ADD COLUMN "mimeType" VARCHAR(255);
ALTER TABLE "attachments" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "attachments" ADD COLUMN "uploadedByUserId" INTEGER;

-- AddForeignKey — ON DELETE SET NULL: attachment metadata survives staff
-- deletion, matching daily_inpatient_care.performedBy (20260711140000).
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supporting index, added in the same migration this time (RETEST-2026-07-13
-- P1 found the FK-without-index gap when it was split into a follow-up).
CREATE INDEX "attachments_uploadedByUserId_idx" ON "attachments"("uploadedByUserId");
