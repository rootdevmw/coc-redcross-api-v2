import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { toBigInt } from 'src/common/utils/to-bigint';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private prisma: PrismaService) {}

  // MEDIA EXTRACTION (INLINE — no import issues)
  private extractMediaUrls(html: string) {
    const results: { url: string; type: string }[] = [];

    if (!html) return results;

    const patterns = [
      { regex: /<img[^>]+src="([^"]+)"/g, type: 'image' },
      { regex: /<video[^>]+src="([^"]+)"/g, type: 'video' },
      { regex: /<audio[^>]+src="([^"]+)"/g, type: 'audio' },
      { regex: /<source[^>]+src="([^"]+)"/g, type: 'video' },
      { regex: /<iframe[^>]+src="([^"]+)"/g, type: 'video' },
    ];

    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(html))) {
        results.push({ url: match[1], type });
      }
    }

    //  dedupe
    return Array.from(new Map(results.map((m) => [m.url, m])).values());
  }

  // MAP MEDIA → RELATIONS
  private async buildMediaRelations(html: string) {
    const extracted = this.extractMediaUrls(html);

    if (!extracted.length) return [];

    const mediaRecords = await Promise.all(
      extracted.map((m) =>
        this.prisma.media.upsert({
          where: { url: m.url },
          update: {},
          create: {
            url: m.url,
            type: m.type,
          },
        }),
      ),
    );

    return mediaRecords.map((media) => ({
      media: {
        connect: { id: media.id },
      },
    }));
  }

  // CREATE
  async create(dto: CreateContentDto) {
    this.logger.log(`Creating content: ${dto.title}`);

    const mediaRelations = await this.buildMediaRelations(dto.body);

    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        body: dto.body,
        typeId: toBigInt(dto.typeId),
        authorId: toBigInt(dto.authorId),
        status: 'Draft',

        tags: dto.tags?.length
          ? {
              create: dto.tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
              })),
            }
          : undefined,

        scriptures: dto.scriptures?.length
          ? {
              create: dto.scriptures,
            }
          : undefined,

        // CORRECT RELATION
        contentMedia: mediaRelations.length
          ? { create: mediaRelations }
          : undefined,
      },
    });

    return { success: true, data: content, meta: {} };
  }

  //  FIND ALL
  async findAll(query: QueryContentDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where: any = { deletedAt: null };

    if (query.typeId) where.typeId = toBigInt(query.typeId);
    if (query.status) where.status = query.status;

    if (query.search) {
      where.title = { contains: query.search };
    }

    const [data, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: true,
          type:true,
          tags: {
            where: { tag: { deletedAt: null } },
            include: { tag: true },
          },
          scriptures: {
            where: { deletedAt: null },
          },
          contentMedia: {
            include: { media: true },
          },
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  //  FIND ONE
  async findOne(id: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: toBigInt(id) },
      include: {
        type: true,
        author: true,
        tags: {
          where: { tag: { deletedAt: null } },
          include: { tag: true },
        },
        scriptures: {
          where: { deletedAt: null },
        },
        contentMedia: {
          include: {
            media: true, //  IMPORTANT
          },
        },
      },
    });

    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    return { success: true, data: content, meta: {} };
  }

  //  UPDATE (FULL SYNC)
  async update(id: string, dto: UpdateContentDto) {
    this.logger.log(`Updating content: ${id}`);

    const mediaRelations = await this.buildMediaRelations(dto.body || '');

    const tags = dto.tags?.length
      ? {
          deleteMany: {},
          create: dto.tags.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { name },
                create: { name },
              },
            },
          })),
        }
      : dto.tags
        ? { deleteMany: {} }
        : undefined;

    const scriptures = dto.scriptures
      ? {
          deleteMany: {},
          create: dto.scriptures,
        }
      : undefined;

    const content = await this.prisma.content.update({
      where: { id: toBigInt(id) },
      data: {
        title: dto.title,
        body: dto.body,
        typeId: dto.typeId ? toBigInt(dto.typeId) : undefined,
        authorId: dto.authorId ? toBigInt(dto.authorId) : undefined,
        tags,
        scriptures,
        contentMedia: {
          deleteMany: {}, // remove old
          create: mediaRelations,
        },
      },
    });

    return { success: true, data: content, meta: {} };
  }

  //  REMOVE
  async remove(id: string) {
    await this.prisma.content.delete({
      where: { id: toBigInt(id) },
    });

    return { success: true, data: {}, meta: {} };
  }

  //  PUBLISH
  async publish(id: string, status: string) {
    const content = await this.prisma.content.update({
      where: { id: toBigInt(id) },
      data: {
        status,
        publishedAt: status === 'Published' ? new Date() : null,
      },
    });

    return { success: true, data: content, meta: {} };
  }

  //  TYPES
  async createType(name: string) {
    const type = await this.prisma.contentType.create({
      data: { name },
    });

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    const types = await this.prisma.contentType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types, meta: {} };
  }
}
