-- Session D-3-01: Rollback — drop payment_history table
-- Drops indexes and FKs via CASCADE on the table itself

DROP TABLE IF EXISTS "payment_history" CASCADE;
