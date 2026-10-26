import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SlugService } from 'src/common/utils/slugify';
import { streamListWhere } from '../../common/utils/editorial-list-filters';
import type { Prisma } from '../../generated/prisma/client';
import {
  listPublicBroadcasts,
  activeBroadcast,
  readPublicBroadcast,
  readLiveBroadcast,
  publicBroadcastPlatforms,
  type PublicLibraryQuery,
} from '../../common/utils/public-library';
import {
  saveStreamEditor,
  saveStreamPlatform,
  streamEditorId,
} from './stream-editor';

type StreamWithPlatforms = Prisma.StreamGetPayload<{
  include: { platforms: { include: { platform: true } } };
}>;
export type StreamQuery = Parameters<typeof streamListWhere>[0] & {
  page?: string;
  limit?: string;
};

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private slugify: SlugService,
  ) {}

  create(dto: unknown, user?: { id?: bigint }) {
    return saveStreamEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      dto,
      user?.id,
    );
  }
  findPublic(query: PublicLibraryQuery = {}) {
    return listPublicBroadcasts(this.prisma, query);
  }
  findPublicLive() {
    return readLiveBroadcast(this.prisma);
  }
  getPublicPlatforms() {
    return publicBroadcastPlatforms(this.prisma);
  }
  update(id: string, dto: unknown, user?: { id?: bigint }) {
    return saveStreamEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      dto,
      user?.id,
      id,
    );
  }

  findBySlug(slug: string) {
    return readPublicBroadcast(this.prisma, slug);
  }

  // -----------------------------
  // DELETE STREAM
  // -----------------------------
  async remove(id: string, user?: { id?: bigint }) {
    const streamId = streamEditorId(id);

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
  setLive(id: string, user?: { id?: bigint }) {
    return saveStreamEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      { isLive: true },
      user?.id,
      id,
      'STREAM_SET_LIVE',
    );
  }
  endLive(id: string, user?: { id?: bigint }) {
    return saveStreamEditor(
      this.prisma,
      this.auditService,
      this.slugify,
      { isLive: false },
      user?.id,
      id,
      'STREAM_ENDED',
    );
  }
  createPlatform(dto: unknown, user?: { id?: bigint }) {
    return saveStreamPlatform(this.prisma, this.auditService, dto, user?.id);
  }
  updatePlatform(
    dto: { id: string; name?: unknown; url?: unknown },
    user?: { id?: bigint },
  ) {
    const id = streamEditorId(dto.id).toString();
    return saveStreamPlatform(
      this.prisma,
      this.auditService,
      dto,
      user?.id,
      id,
    );
  }

  async findAllInFuture(query: StreamQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const now = new Date();

    this.logger.log(
      `[STREAMS] Fetching future/active streams from: ${now.toISOString()}`,
    );

    const where: Prisma.StreamWhereInput = {
      deletedAt: null,
      OR: [{ startsAt: { gt: now } }, activeBroadcast(now)],
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

  async findAll(query: StreamQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const where = streamListWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.stream.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          platforms: {
            where: { platform: { deletedAt: null } },
            include: { platform: true },
          },
        },
      }),
      this.prisma.stream.count({ where }),
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
      where: activeBroadcast(now),
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
      where: { id: streamEditorId(id) },
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
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
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
  private format(stream: StreamWithPlatforms) {
    return {
      ...stream,
      platforms: stream.platforms.map((p) => p.platform),
    };
  }
}
