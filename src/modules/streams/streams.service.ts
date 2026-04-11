import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: any) {
    this.logger.log(`Creating stream: ${dto.title}`);

    const stream = await this.prisma.stream.create({
      data: {
        title: dto.title,
        isLive: dto.isLive ?? false,
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
          include: {
            platform: true,
          },
        },
      },
    });

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  // -----------------------------
  // GET ALL
  // -----------------------------
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
            include: {
              platform: true,
            },
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

  // -----------------------------
  // GET LIVE
  // -----------------------------
  async findLive() {
    const stream = await this.prisma.stream.findFirst({
      where: { isLive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        platforms: {
          include: {
            platform: true,
          },
        },
      },
    });

    return {
      success: true,
      data: stream ? this.format(stream) : null,
      meta: {},
    };
  }

  // -----------------------------
  // GET ONE
  // -----------------------------
  async findOne(id: string) {
    const stream = await this.prisma.stream.findUnique({
      where: { id },
      include: {
        platforms: {
          include: {
            platform: true,
          },
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

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: any) {
    this.logger.log(`Updating stream ${id}`);

    // replace platforms if provided
    if (dto.platformIds) {
      await this.prisma.streamPlatform.deleteMany({
        where: { streamId: id },
      });
    }

    const stream = await this.prisma.stream.update({
      where: { id },
      data: {
        title: dto.title,
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
          include: {
            platform: true,
          },
        },
      },
    });

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  // -----------------------------
  // SET LIVE
  // -----------------------------
  async setLive(id: string) {
    this.logger.log(`Setting stream ${id} as live`);

    await this.prisma.stream.updateMany({
      data: { isLive: false },
    });

    const stream = await this.prisma.stream.update({
      where: { id },
      data: { isLive: true },
      include: {
        platforms: {
          include: {
            platform: true,
          },
        },
      },
    });

    return {
      success: true,
      data: this.format(stream),
      meta: {},
    };
  }

  // -----------------------------
  // FORMAT (FLATTEN)
  // -----------------------------
  private format(stream: any) {
    return {
      ...stream,
      platforms: stream.platforms.map((p: any) => p.platform),
    };
  }

  // -----------------------------
  // CREATE PLATFORM
  // -----------------------------
  async createPlatform(dto: any) {
    this.logger.log(`Creating platform: ${dto.name}`);

    const platform = await this.prisma.platform.create({
      data: {
        name: dto.name,
        url: dto.url,
      },
    });

    return {
      success: true,
      data: platform,
      meta: {},
    };
  }

  // -----------------------------
  // GET PLATFORMS
  // -----------------------------
  async getPlatforms() {
    const platforms = await this.prisma.platform.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: platforms,
      meta: {},
    };
  }
}
