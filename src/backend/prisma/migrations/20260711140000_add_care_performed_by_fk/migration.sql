-- ADR-0013 D4: DailyInpatientCare.performedBy had no FK previously — dangling
-- ids are possible (manual data edits, prior cleanup scripts). This MUST run
-- before the ADD CONSTRAINT below, else it fails on the first orphaned row.
UPDATE "daily_inpatient_care"
SET "performedBy" = NULL
WHERE "performedBy" IS NOT NULL
  AND "performedBy" NOT IN (SELECT "id" FROM "users");

-- AddForeignKey
-- ON DELETE SET NULL: care logs must survive staff deletion — the log entry
-- stays, only the resolved name degrades to "Staff #<id>" then eventually "—"
-- once this FK itself nulls performedBy on user delete.
ALTER TABLE "daily_inpatient_care"
  ADD CONSTRAINT "daily_inpatient_care_performedBy_fkey"
  FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
