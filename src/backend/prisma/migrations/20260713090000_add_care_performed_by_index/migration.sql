-- RETEST-2026-07-13 P1: performedBy FK had no supporting index, forcing a
-- sequential scan on every performer-name batch lookup / FK cascade check.
CREATE INDEX "daily_inpatient_care_performedBy_idx" ON "daily_inpatient_care"("performedBy");
