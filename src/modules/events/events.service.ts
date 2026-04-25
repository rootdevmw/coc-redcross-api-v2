import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateEventDto) {
    this.logger.log(`CREATE_EVENT_STARTED: ${dto.title}`);

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        typeId: toBigInt(dto.typeId),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),

        ministries: dto.ministryIds
          ? {
              create: dto.ministryIds.map((ministryId) => ({
                ministryId: toBigInt(ministryId),
              })),
            }
          : undefined,
      },
      include: {
        ministries: { include: { ministry: true } },
      },
    });

    await this.auditService.log({
      action: 'EVENT_CREATED',
      entity: 'Event',
      entityId: event.id.toString(),
      after: event,
    });

    this.logger.log(`CREATE_EVENT_SUCCESS: ${event.id}`);

    return { success: true, data: event, meta: {} };
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  async findAll(query: QueryEventDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where: any = { deletedAt: null };

    if (query.typeId) where.typeId = query.typeId;

    if (query.startDate || query.endDate) {
      where.startTime = {
        gte: query.startDate ? new Date(query.startDate) : undefined,
        lte: query.endDate ? new Date(query.endDate) : undefined,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startTime: 'asc' },
        include: {
          type: true,
          ministries: {
            where: { ministry: { deletedAt: null } },
            include: { ministry: true },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // -----------------------------
  // FIND ONE
  // -----------------------------
  async findOne(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: toBigInt(id) },
      include: {
        type: true,
        ministries: {
          where: { ministry: { deletedAt: null } },
          include: { ministry: true },
        },
      },
    });

    if (!event) throw new NotFoundException(`Event with ID ${id} not found`);

    return { success: true, data: event, meta: {} };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateEventDto) {
    const eventId = toBigInt(id);

    this.logger.log(`UPDATE_EVENT_STARTED: ${id}`);

    const before = await this.prisma.event.findFirst({
      where: { id: eventId },
      include: {
        ministries: true,
      },
    });

    if (!before) throw new NotFoundException(`Event not found`);

    // replace ministries if provided
    if (dto.ministryIds) {
      await this.prisma.eventMinistry.deleteMany({
        where: { eventId },
      });
    }

    const after = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        typeId: dto.typeId ? toBigInt(dto.typeId) : undefined,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,

        ministries: dto.ministryIds
          ? {
              create: dto.ministryIds.map((ministryId) => ({
                ministryId: toBigInt(ministryId),
              })),
            }
          : undefined,
      },
      include: {
        ministries: { include: { ministry: true } },
      },
    });

    //  SPECIAL CASE: detect reschedule
    const wasRescheduled =
      before.startTime.getTime() !== after.startTime.getTime() ||
      before.endTime.getTime() !== after.endTime.getTime();

    await this.auditService.log({
      action: wasRescheduled ? 'EVENT_RESCHEDULED' : 'EVENT_UPDATED',
      entity: 'Event',
      entityId: id,
      before,
      after,
    });

    this.logger.log(`UPDATE_EVENT_SUCCESS: ${id}`);

    return { success: true, data: after, meta: {} };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string) {
    const eventId = toBigInt(id);

    this.logger.warn(`DELETE_EVENT_STARTED: ${id}`);

    const before = await this.prisma.event.findFirst({
      where: { id: eventId },
      include: {
        ministries: true,
      },
    });

    if (!before) throw new NotFoundException(`Event not found`);

    await this.prisma.event.delete({
      where: { id: eventId },
    });

    await this.auditService.log({
      action: 'EVENT_DELETED',
      entity: 'Event',
      entityId: id,
      before,
    });

    this.logger.warn(`DELETE_EVENT_SUCCESS: ${id}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // CREATE TYPE
  // -----------------------------
  async createType(name: string) {
    this.logger.log(`CREATE_EVENT_TYPE: ${name}`);

    const type = await this.prisma.eventType.create({
      data: { name },
    });

    await this.auditService.log({
      action: 'EVENT_TYPE_CREATED',
      entity: 'EventType',
      entityId: type.id.toString(),
      after: type,
    });

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    const types = await this.prisma.eventType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types };
  }
}
