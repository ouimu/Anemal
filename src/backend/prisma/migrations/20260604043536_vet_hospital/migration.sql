-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'doctor', 'staff');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'partial', 'void');

-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "subdomain" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "logoUrl" TEXT,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "address" TEXT,
    "taxId" VARCHAR(50),
    "defaultSlotMinutes" INTEGER NOT NULL DEFAULT 30,
    "workStartTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "workEndTime" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lineRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "planTier" VARCHAR(50) NOT NULL DEFAULT 'starter',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255),
    "lineId" VARCHAR(100),
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "species" VARCHAR(50) NOT NULL,
    "breed" VARCHAR(100),
    "birthDate" DATE,
    "gender" "Gender",
    "weightKg" DECIMAL(5,2),
    "microchipId" VARCHAR(50),
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "room" VARCHAR(50),
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "doctorId" INTEGER NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "anatomyNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "medicalRecordId" INTEGER NOT NULL,
    "drugId" INTEGER NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unit" VARCHAR(50),
    "dosageInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100),
    "barcode" VARCHAR(100),
    "unit" VARCHAR(50),
    "stockQuantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minStockLevel" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expiryDate" DATE,
    "unitCost" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "petId" INTEGER NOT NULL,
    "medicalRecordId" INTEGER,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" VARCHAR(50),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "itemType" VARCHAR(50),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "owners_tenantId_idx" ON "owners"("tenantId");

-- CreateIndex
CREATE INDEX "owners_tenantId_phone_idx" ON "owners"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "pets_tenantId_idx" ON "pets"("tenantId");

-- CreateIndex
CREATE INDEX "pets_tenantId_ownerId_idx" ON "pets"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "pets_tenantId_microchipId_idx" ON "pets"("tenantId", "microchipId");

-- CreateIndex
CREATE INDEX "pets_tenantId_name_idx" ON "pets"("tenantId", "name");

-- CreateIndex
CREATE INDEX "appointments_tenantId_idx" ON "appointments"("tenantId");

-- CreateIndex
CREATE INDEX "appointments_tenantId_doctorId_scheduledAt_idx" ON "appointments"("tenantId", "doctorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_petId_idx" ON "appointments"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "medical_records_tenantId_idx" ON "medical_records"("tenantId");

-- CreateIndex
CREATE INDEX "medical_records_tenantId_petId_idx" ON "medical_records"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_idx" ON "prescriptions"("tenantId");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_medicalRecordId_idx" ON "prescriptions"("tenantId", "medicalRecordId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_idx" ON "inventory_items"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_barcode_idx" ON "inventory_items"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "invoices_tenantId_petId_idx" ON "invoices"("tenantId", "petId");

-- CreateIndex
CREATE INDEX "invoice_items_tenantId_invoiceId_idx" ON "invoice_items"("tenantId", "invoiceId");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
