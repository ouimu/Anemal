-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'refunded';

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_petId_fkey";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "invoiceNo" VARCHAR(100) NOT NULL,
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 7,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "petId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "movementType" VARCHAR(20) NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "referenceType" VARCHAR(50),
    "referenceId" INTEGER,
    "notes" TEXT,
    "performedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_itemId_createdAt_idx" ON "stock_movements"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_tenantId_issuedAt_idx" ON "invoices"("tenantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNo_key" ON "invoices"("tenantId", "invoiceNo");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

