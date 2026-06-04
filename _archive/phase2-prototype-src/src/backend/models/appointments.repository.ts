// appointments.repository.ts — Tenant-isolated, double-booking detection
import { prisma } from '../config/database';

export interface AppointmentCreateInput {
  tenantId: number; petId: number; doctorId?: number; room?: string;
  appointmentDate: Date; durationMin?: number; reason?: string;
  isWalkIn?: boolean; notes?: string; createdBy: number;
}

export class AppointmentsRepository {

  /** Get appointments by date range. tenant_id MANDATORY. */
  async findByDateRange(tenantId: number, startDate: Date, endDate: Date, doctorId?: number) {
    return prisma.appointments.findMany({
      where: {
        tenant_id: tenantId,
        appointment_date: { gte: startDate, lte: endDate },
        ...(doctorId && { doctor_id: doctorId }),
      },
      include: {
        pets:  { select: { id: true, name: true, species: true, photo_url: true } },
        users: { select: { id: true, name: true } },
      },
      orderBy: { appointment_date: 'asc' },
    });
  }

  /** Today's schedule for one doctor (Tablet sidebar). tenant_id MANDATORY. */
  async getTodayForDoctor(tenantId: number, doctorId: number) {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(); tomorrow.setHours(23, 59, 59, 999);
    return prisma.appointments.findMany({
      where: {
        tenant_id: tenantId,
        doctor_id: doctorId,
        appointment_date: { gte: today, lte: tomorrow },
        status: { notIn: ['cancelled'] },
      },
      include: {
        pets: {
          select: { id: true, name: true, species: true, photo_url: true },
          include: { owners: { select: { first_name: true, last_name: true, phone: true } } },
        },
      },
      orderBy: { appointment_date: 'asc' },
    });
  }

  /** Returns true if the doctor has a conflicting appointment in this time window. */
  async hasConflict(
    tenantId: number, doctorId: number, startTime: Date,
    durationMin: number, excludeId?: number
  ): Promise<boolean> {
    const endTime = new Date(startTime.getTime() + durationMin * 60000);
    const conflict = await prisma.appointments.findFirst({
      where: {
        tenant_id: tenantId,
        doctor_id: doctorId,
        status: { notIn: ['cancelled', 'no_show'] },
        ...(excludeId && { NOT: { id: excludeId } }),
        AND: [
          { appointment_date: { lt: endTime } },
          { appointment_date: { gt: new Date(startTime.getTime() - 90 * 60000) } },
        ],
      },
    });
    return !!conflict;
  }

  /** Create appointment. tenantId ALWAYS comes from auth token. */
  async create(data: AppointmentCreateInput) {
    return prisma.appointments.create({
      data: {
        tenant_id: data.tenantId,
        pet_id: data.petId, doctor_id: data.doctorId, room: data.room,
        appointment_date: data.appointmentDate, duration_min: data.durationMin ?? 30,
        reason: data.reason, is_walk_in: data.isWalkIn ?? false,
        status: 'scheduled', notes: data.notes, created_by: data.createdBy,
      },
      include: {
        pets:  { select: { id: true, name: true, species: true } },
        users: { select: { id: true, name: true } },
      },
    });
  }

  /** Update status — verifies tenant ownership before update. */
  async updateStatus(tenantId: number, appointmentId: number, status: string) {
    const existing = await prisma.appointments.findFirst({
      where: { id: appointmentId, tenant_id: tenantId },
    });
    if (!existing) return null;
    return prisma.appointments.update({
      where: { id: appointmentId },
      data: { status, updated_at: new Date() },
    });
  }

  /** Walk-in queue for today, sorted by arrival time. tenant_id MANDATORY. */
  async getWalkInQueue(tenantId: number) {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(); tomorrow.setHours(23, 59, 59, 999);
    return prisma.appointments.findMany({
      where: {
        tenant_id: tenantId,
        is_walk_in: true,
        appointment_date: { gte: today, lte: tomorrow },
        status: { in: ['scheduled', 'confirmed'] },
      },
      include: {
        pets: { include: { owners: { select: { first_name: true, last_name: true, phone: true } } } },
      },
      orderBy: { created_at: 'asc' },
    });
  }
}

export const appointmentsRepository = new AppointmentsRepository();
