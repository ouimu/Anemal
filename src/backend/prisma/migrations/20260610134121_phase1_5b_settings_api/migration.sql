-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'superadmin';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultCalendarView" VARCHAR(10) NOT NULL DEFAULT 'week',
ADD COLUMN     "language" VARCHAR(5) NOT NULL DEFAULT 'th';
