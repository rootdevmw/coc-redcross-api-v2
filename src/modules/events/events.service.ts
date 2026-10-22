import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { SlugService } from 'src/common/utils/slugify';
import { eventListWhere } from '../../common/utils/schedule-list-filters';
import { saveEventEditor, createEventEditorType } from './event-editor';
import {
  listPublicEvents,
  readPublicEvent,
  listPublicEventTypes,
  type PublicEventQuery,
} from '../../common/utils/public-events';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private slugify: SlugService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateEventDto, user?: { id?: bigint }) {
    return saveEventEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      dto,
      user?.id,
    );
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  findPublic(query: PublicEventQuery = {}) {
    return listPublicEvents(this.prisma, query);
  }

  getPublicTypes() {
    return listPublicEventTypes(this.prisma);
  }

  async findAll(query: QueryEventDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where = eventListWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
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
  // FIND BY SLUG
  // -----------------------------
  findBySlug(slug: string) {
    return readPublicEvent(this.prisma, slug);
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateEventDto, user?: { id?: bigint }) {
    return saveEventEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      dto,
      user?.id,
      id,
    );
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string, user?: any) {
    const eventId = toBigInt(id);

    this.logger.warn(`DELETE_EVENT_STARTED: ${id}`);

    const before = await this.prisma.event.findFirst({
      where: { id: eventId },
      include: { ministries: true },
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
      userId: user?.id,
    });

    this.logger.warn(`DELETE_EVENT_SUCCESS: ${id}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // CREATE TYPE
  // -----------------------------
  async createType(name: string, user?: { id?: bigint }) {
    return createEventEditorType(
      this.prisma,
      this.auditService,
      name,
      user?.id,
    );
  }

  async getTypes() {
    const types = await this.prisma.eventType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types };
  }
}
