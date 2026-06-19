-- Add per-user UI theme preference (light | dark). Backfills existing rows to 'light'.
ALTER TABLE "users" ADD COLUMN     "theme" VARCHAR(10) NOT NULL DEFAULT 'light';
