import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { SlugService } from 'src/common/utils/slugify';

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private slugify: SlugService,
  ) {}

  // -----------------------------
  // CREATE STREAM
  // -----------------------------
  async create(dto: any, user?: any) {
    this.logger.log(`CREATE_STREAM_STARTED: ${dto.title}`);
    const slug = await this.slugify.generateUniqueSlug(dto.title, 'stream');
    const stream = await this.prisma.stream.create({
      data: {
        title: dto.title,
        isLive: dto.isLive ?? false,
        slug,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,

        platforms: dto.platformIds
          ? {
              create: dto.platformIds.map((platformId: string) => ({
                platformId,
              })),
            }
          : undefined,
      },
      include: {
        platforms: {
          where: { platform: { deletedAt: null } },
          include: { platform: true },
        },
      },
    });

    await this.auditService.log({
      action: 'STREAM_CREATED',
      entity: 'Stream',
      entityId: stream.id.toString(),
      after: stream,
      userId: user?.id,
    });

    this.logger.log(`CREATE_STREAM_SUCCESS: ${stream.id}`);

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE STREAM
  // -----------------------------
  async update(id: string, dto: any, user?: any) {
    const streamId = toBigIntOptional(id);

    this.logger.log(`UPDATE_STREAM_STARTED: ${id}`);

    const before = await this.prisma.stream.findFirst({
      where: { id: streamId },
      include: {
        platforms: { include: { platform: true } },
      },
    });

    if (!before) {
      throw new NotFoundException('Stream not found');
    }

    if (dto.platformIds) {
      await this.prisma.streamPlatform.deleteMany({
        where: { streamId },
      });
    }

    const titleChanged = dto.title && dto.title !== before.title;

    const slug = titleChanged
      ? await this.slugify.generateUniqueSlug(dto.title, 'stream')
      : undefined;

    const after = await this.prisma.stream.update({
      where: { id: streamId },
      data: {
        title: dto.title,
        ...(slug && { slug }),
        isLive: dto.isLive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,

        platforms: dto.platformIds
          ? {
              create: dto.platformIds.map((platformId: string) => ({
                platformId,
              })),
            }
          : undefined,
      },
      include: {
        platforms: {
          where: { platform: { deletedAt: null } },
          include: { platform: true },
        },
      },
    });

    await this.auditService.log({
      action: 'STREAM_UPDATED',
      entity: 'Stream',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_STREAM_SUCCESS: ${id}`);

    return {
      success: true,
      data: this.format(after),
      meta: {},
    };
  }

  async findBySlug(slug: string) {
    this.logger.log(`FETCH_STREAM_BY_SLUG: ${slug}`);

    const stream = await this.prisma.stream.findFirst({
      where: {
        slug,
      },
      include: {
        platforms: {
          where: { platform: { deletedAt: null } },
          include: { platform: true },
        },
      },
    });

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  // -----------------------------
  // DELETE STREAM
  // -----------------------------
  async remove(id: string, user?: any) {
    const streamId = toBigIntOptional(id);

    this.logger.warn(`DELETE_STREAM_STARTED: ${id}`);

    const before = await this.prisma.stream.findFirst({
      where: { id: streamId },
      include: {
        platforms: { include: { platform: true } },
      },
    });

    if (!before) {
      throw new NotFoundException('Stream not found');
    }

    await this.prisma.stream.delete({
      where: { id: streamId },
    });

    await this.auditService.log({
      action: 'STREAM_DELETED',
      entity: 'Stream',
      entityId: id,
      before,
      userId: user?.id,
    });

    this.logger.warn(`DELETE_STREAM_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // SET LIVE STREAM
  // -----------------------------
  async setLive(id: string, user?: any) {
    const streamId = toBigIntOptional(id);

    this.logger.log(`SET_LIVE_STREAM_STARTED: ${id}`);

    const before = await this.prisma.stream.findFirst({
      where: { id: streamId },
      include: {
        platforms: { include: { platform: true } },
      },
    });

    if (!before) {
      throw new NotFoundException('Stream not found');
    }

    await this.prisma.stream.updateMany({
      data: { isLive: false },
    });

    const after = await this.prisma.stream.update({
      where: { id: streamId },
      data: { isLive: true },
      include: {
        platforms: { include: { platform: true } },
      },
    });

    await this.auditService.log({
      action: 'STREAM_SET_LIVE',
      entity: 'Stream',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`SET_LIVE_STREAM_SUCCESS: ${id}`);

    return {
      success: true,
      data: this.format(after),
      meta: {},
    };
  }

  // -----------------------------
  // CREATE PLATFORM
  // -----------------------------
  async createPlatform(dto: any, user?: any) {
    this.logger.log(`CREATE_PLATFORM_STARTED: ${dto.name}`);

    const platform = await this.prisma.platform.create({
      data: {
        name: dto.name,
        url: dto.url,
      },
    });

    await this.auditService.log({
      action: 'PLATFORM_CREATED',
      entity: 'Platform',
      entityId: platform.id.toString(),
      after: platform,
      userId: user?.id,
    });

    return {
      success: true,
      data: platform,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE PLATFORM
  // -----------------------------
  async updatePlatform(dto: any, user?: any) {
    const platformId = toBigIntOptional(dto.id);

    this.logger.log(`UPDATE_PLATFORM_STARTED: ${dto.id}`);

    const before = await this.prisma.platform.findFirst({
      where: { id: platformId },
    });

    if (!before) {
      throw new NotFoundException('Platform not found');
    }

    const after = await this.prisma.platform.update({
      where: { id: platformId },
      data: {
        name: dto.name,
        url: dto.url,
      },
    });

    await this.auditService.log({
      action: 'PLATFORM_UPDATED',
      entity: 'Platform',
      entityId: dto.id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_PLATFORM_SUCCESS: ${dto.id}`);

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  async findAllInFuture(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const now = new Date();

    this.logger.log(
      `[STREAMS] Fetching future/active streams from: ${now.toISOString()}`,
    );

    const where: any = {
      deletedAt: null,
      OR: [
        // upcoming streams
        {
          startsAt: {
            gte: now,
          },
        },

        // ongoing streams (started already but not ended)
        {
          AND: [
            {
              startsAt: {
                lte: now,
              },
            },
            {
              OR: [
                {
                  endsAt: {
                    gte: now,
                  },
                },
                {
                  endsAt: null,
                },
              ],
            },
          ],
        },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.stream.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ startsAt: 'asc' }],
        include: {
          platforms: {
            where: { platform: { deletedAt: null } },
            include: { platform: true },
          },
        },
      }),

      this.prisma.stream.count({ where }),
    ]);

    this.logger.log(`[STREAMS] Found ${data.length} streams (total: ${total})`);

    return {
      success: true,
      data: data.map((s) => this.format(s)),
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const [data, total] = await Promise.all([
      this.prisma.stream.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          platforms: {
            where: { platform: { deletedAt: null } },
            include: { platform: true },
          },
        },
      }),
      this.prisma.stream.count(),
    ]);

    return {
      success: true,
      data: data.map((s) => this.format(s)),
      meta: { page, limit, total },
    };
  }

  async findLive() {
    const now = new Date();

    this.logger.log(`[STREAMS] Fetching live streams at ${now.toISOString()}`);

    const stream = await this.prisma.stream.findFirst({
      where: {
        isLive: true,
        startsAt: {
          lte: now,
        },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: {
              gte: now,
            },
          },
        ],
      },
      orderBy: {
        startsAt: 'desc',
      },
      include: {
        platforms: {
          where: { platform: { deletedAt: null } },
          include: { platform: true },
        },
      },
    });

    this.logger.debug(
      `[STREAMS LIVE RESULT] ${stream ? stream.id.toString() : 'none'}`,
    );

    return {
      success: true,
      data: stream ? this.format(stream) : null,
      meta: {},
    };
  }

  async findOne(id: string) {
    const stream = await this.prisma.stream.findFirst({
      where: { id: toBigIntOptional(id) },
      include: {
        platforms: {
          where: { platform: { deletedAt: null } },
          include: { platform: true },
        },
      },
    });

    if (!stream) throw new NotFoundException('Stream not found');

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  async getPlatforms() {
    const platforms = await this.prisma.platform.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: platforms,
      meta: {},
    };
  }

  // -----------------------------
  // HELPERS
  // -----------------------------
  private format(stream: any) {
    return {
      ...stream,
      platforms: stream.platforms.map((p: any) => p.platform),
    };
  }
}
