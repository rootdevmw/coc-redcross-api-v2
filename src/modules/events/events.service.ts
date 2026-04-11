import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto } from './dto/query-event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEventDto) {
    this.logger.log(`Creating event: ${dto.title}`);

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        typeId: dto.typeId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),

        ministries: dto.ministryIds
          ? {
              create: dto.ministryIds.map((ministryId) => ({
                ministryId,
              })),
            }
          : undefined,
      },
      include: {
        ministries: {
          include: {
            ministry: true,
          },
        },
      },
    });

    return { success: true, data: event, meta: {} };
  }

  async findAll(query: QueryEventDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching events`);

    const where: any = {};

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
            include: {
              ministry: true,
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    //  Flatten ministries
    const formatted = data.map((event) => ({
      ...event,
      ministries: event.ministries.map((m) => m.ministry),
    }));

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        type: true,
        ministries: {
          include: { ministry: true },
        },
      },
    });

    if (!event) throw new NotFoundException(`Event with ID ${id} not found`);

    return { success: true, data: event, meta: {} };
  }

  async update(id: string, dto: UpdateEventDto) {
    this.logger.log(`Updating event: ${id}`);

    // Replace ministries if provided
    if (dto.ministryIds) {
      await this.prisma.eventMinistry.deleteMany({
        where: { eventId: id },
      });
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        typeId: dto.typeId,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,

        ministries: dto.ministryIds
          ? {
              create: dto.ministryIds.map((ministryId) => ({
                ministryId,
              })),
            }
          : undefined,
      },
      include: {
        ministries: {
          include: {
            ministry: true,
          },
        },
      },
    });

    return { success: true, data: event, meta: {} };
  }

  async createType(name: string) {
    this.logger.log(`Creating event type: ${name}`);

    const type = await this.prisma.eventType.create({
      data: { name },
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
