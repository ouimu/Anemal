-- CreateTable
CREATE TABLE IF NOT EXISTS "user_branches" (
    "id"        SERIAL PRIMARY KEY,
    "tenantId"  INTEGER NOT NULL,
    "userId"    INTEGER NOT NULL,
    "branchId"  INTEGER NOT NULL,
    CONSTRAINT "user_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "user_branches_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "users"("id")   ON DELETE CASCADE,
    CONSTRAINT "user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE,
    CONSTRAINT "user_branches_tenantId_userId_branchId_key" UNIQUE ("tenantId", "userId", "branchId")
);
CREATE INDEX IF NOT EXISTS "user_branches_tenantId_userId_idx" ON "user_branches" ("tenantId", "userId");

-- Seed existing single-branch assignments from users.branchId
INSERT INTO "user_branches" ("tenantId", "userId", "branchId")
SELECT "tenantId", "id", "branchId"
FROM   "users"
WHERE  "branchId" IS NOT NULL
ON CONFLICT DO NOTHING;
