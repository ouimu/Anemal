// emr.repository.ts — Electronic Medical Record, tenant-isolated
import { prisma } from '../config/database';

export interface EMRCreateInput {
  tenantId: number; petId: number; appointmentId?: number;
  doctorId: number; subjective?: string; objective?: string;
  assessment?: string; plan?: string;
  weightKg?: number; temperatureC?: number; heartRateBpm?: number; respRateRpm?: number;
  anatomyAnnotation?: object; anatomySpecies?: string;
}

export class EMRRepository {

  /** Get full treatment history for a pet — paginated. tenant_id MANDATORY. */
  async findByPet(tenantId: number, petId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      prisma.medical_records.findMany({
        where: { tenant_id: tenantId, pet_id: petId },
        include: {
          users:         { select: { id: true, name: true } },
          prescriptions: { include: { products: { select: { name: true, unit: true } } } },
          attachments:   { select: { id: true, file_name: true, file_url: true, attachment_type: true } },
          vaccinations:  true,
        },
        orderBy: { visit_date: 'desc' },
        skip, take: limit,
      }),
      prisma.medical_records.count({ where: { tenant_id: tenantId, pet_id: petId } }),
    ]);
    return { records, total };
  }

  /** Find one EMR — cross-tenant access returns null (shown as 404). */
  async findById(tenantId: number, recordId: number) {
    return prisma.medical_records.findFirst({
      where: { id: recordId, tenant_id: tenantId },
      include: {
        users:         { select: { id: true, name: true } },
        pets:          { include: { owners: true } },
        prescriptions: { include: { products: true } },
        attachments:   true,
        vaccinations:  true,
      },
    });
  }

  /** Create new EMR. tenantId from auth token ALWAYS. */
  async create(data: EMRCreateInput) {
    return prisma.medical_records.create({
      data: {
        tenant_id:          data.tenantId,
        pet_id:             data.petId,
        appointment_id:     data.appointmentId,
        doctor_id:          data.doctorId,
        subjective:         data.subjective,
        objective:          data.objective,
        assessment:         data.assessment,
        plan:               data.plan,
        weight_kg:          data.weightKg,
        temperature_c:      data.temperatureC,
        heart_rate_bpm:     data.heartRateBpm,
        resp_rate_rpm:      data.respRateRpm,
        anatomy_annotation: data.anatomyAnnotation ? JSON.stringify(data.anatomyAnnotation) : undefined,
        anatomy_species:    data.anatomySpecies,
        status:             'in_progress',
      },
    });
  }

  /** Partial update — status 'billed' is locked. */
  async update(tenantId: number, recordId: number, data: Partial<EMRCreateInput>) {
    const existing = await prisma.medical_records.findFirst({
      where: { id: recordId, tenant_id: tenantId },
    });
    if (!existing) return null;
    if (existing.status === 'billed') return { error: 'LOCKED', message: 'Cannot edit a billed record' };

    return prisma.medical_records.update({
      where: { id: recordId },
      data: {
        subjective:         data.subjective,
        objective:          data.objective,
        assessment:         data.assessment,
        plan:               data.plan,
        weight_kg:          data.weightKg,
        temperature_c:      data.temperatureC,
        heart_rate_bpm:     data.heartRateBpm,
        resp_rate_rpm:      data.respRateRpm,
        anatomy_annotation: data.anatomyAnnotation ? JSON.stringify(data.anatomyAnnotation) : undefined,
        updated_at:         new Date(),
      },
    });
  }

  async markComplete(tenantId: number, recordId: number) {
    const existing = await prisma.medical_records.findFirst({
      where: { id: recordId, tenant_id: tenantId },
    });
    if (!existing) return null;
    return prisma.medical_records.update({
      where: { id: recordId },
      data: { status: 'completed', updated_at: new Date() },
    });
  }

  /** Add prescription line — auto-deducts from inventory stock. */
  async addPrescription(
    tenantId: number, recordId: number,
    productId: number, qty: number,
    dosageInstructions: string, durationDays: number,
    dispensedBy: number
  ) {
    // Verify record belongs to this tenant
    const record = await prisma.medical_records.findFirst({
      where: { id: recordId, tenant_id: tenantId },
    });
    if (!record) return null;

    // Check and deduct stock atomically
    const product = await prisma.products.findFirst({
      where: { id: productId, tenant_id: tenantId },
    });
    if (!product) return { error: 'PRODUCT_NOT_FOUND' };
    if (product.stock_qty < qty) return { error: 'INSUFFICIENT_STOCK', available: product.stock_qty };

    // Transaction: create prescription + deduct stock + log movement
    return prisma.$transaction(async (tx) => {
      const prescription = await tx.prescriptions.create({
        data: {
          tenant_id: tenantId, medical_record_id: recordId,
          product_id: productId, qty, unit_price: product.unit_price,
          dosage_instructions: dosageInstructions, duration_days: durationDays,
          dispensed_at: new Date(), dispensed_by: dispensedBy,
        },
      });

      await tx.products.update({
        where: { id: productId },
        data: { stock_qty: { decrement: qty }, updated_at: new Date() },
      });

      await tx.stock_movements.create({
        data: {
          tenant_id: tenantId, product_id: productId,
          movement_type: 'out', qty,
          reference_type: 'prescription', reference_id: prescription.id,
          performed_by: dispensedBy,
        },
      });

      return prescription;
    });
  }

  /** Remove prescription — restores stock. */
  async removePrescription(tenantId: number, prescriptionId: number, removedBy: number) {
    const prescription = await prisma.prescriptions.findFirst({
      where: { id: prescriptionId, tenant_id: tenantId },
    });
    if (!prescription) return null;

    return prisma.$transaction(async (tx) => {
      await tx.prescriptions.delete({ where: { id: prescriptionId } });

      await tx.products.update({
        where: { id: prescription.product_id },
        data: { stock_qty: { increment: prescription.qty }, updated_at: new Date() },
      });

      await tx.stock_movements.create({
        data: {
          tenant_id: tenantId, product_id: prescription.product_id,
          movement_type: 'in', qty: prescription.qty,
          reference_type: 'prescription', reference_id: prescriptionId,
          notes: 'Prescription cancelled — stock restored',
          performed_by: removedBy,
        },
      });

      return { success: true };
    });
  }
}

export const emrRepository = new EMRRepository();
