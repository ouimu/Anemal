-- Session D-3-01: Add payment_history table
-- Records individual payment events against invoices (supports partial/split payments).
-- Tenant-scoped: all queries must include WHERE "tenantId" = :tenantId
-- Branch-scoped: also filter AND "branchId" = :branchId for branch-level views

CREATE TABLE "payment_history" (
  "id"           SERIAL         NOT NULL,
  "tenantId"     INTEGER        NOT NULL,
  "branchId"     INTEGER        NOT NULL,
  "invoiceId"    INTEGER        NOT NULL,
  "amount"       DECIMAL(10,2)  NOT NULL,
  "method"       VARCHAR(50)    NOT NULL,
  "receivedById" INTEGER        NOT NULL,
  "note"         TEXT,
  "paidAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_history"
  ADD CONSTRAINT "payment_history_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_history"
  ADD CONSTRAINT "payment_history_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_history"
  ADD CONSTRAINT "payment_history_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_history"
  ADD CONSTRAINT "payment_history_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite indexes lead with tenantId per iron rule
CREATE INDEX "payment_history_tenantId_branchId_idx" ON "payment_history"("tenantId", "branchId");
CREATE INDEX "payment_history_tenantId_paidAt_idx"   ON "payment_history"("tenantId", "paidAt");
