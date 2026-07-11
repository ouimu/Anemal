-- Down migration for add_care_performed_by_fk
-- Reverses the schema change only. The orphan-nulling UPDATE in the up
-- migration is a one-way data cleanup and is not reversed (there is no
-- record of which performedBy values were nulled).
ALTER TABLE "daily_inpatient_care" DROP CONSTRAINT IF EXISTS "daily_inpatient_care_performedBy_fkey";
