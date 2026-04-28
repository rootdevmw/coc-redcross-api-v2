import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { toBigInt } from 'src/common/utils/to-bigint';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ConfigService } from '@nestjs/config';
import { Audit } from 'src/common/decorators/audit.decorator';
import { AuditService } from '../audit/audit.service';
import { slugify } from 'src/common/utils/slugify';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  private readonly TMP_DIR = join(process.cwd(), 'uploads', 'tmp');
  private readonly FINAL_DIR = join(process.cwd(), 'uploads');

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // MEDIA EXTRACTION
  // -----------------------------
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

    return Array.from(new Map(results.map((m) => [m.url, m])).values());
  }

  // -----------------------------
  // MEDIA SYNC
  // -----------------------------
  private async syncMedia(html: string, contentId?: bigint) {
    this.logger.log(`Syncing media for contentId=${contentId ?? 'NEW'}`);

    const extracted = this.extractMediaUrls(html);
    const newUrls = extracted.map((m) => m.url);

    const existing = contentId
      ? await this.prisma.contentMedia.findMany({
          where: { contentId },
          include: { media: true },
        })
      : [];

    // REMOVE UNUSED
    const removed = existing.filter((m) => !newUrls.includes(m.media.url));

    for (const item of removed) {
      const relativePath = item.media.url.replace(
        this.configService.get<string>('APP_URL')!,
        '',
      );

      const filePath = join(process.cwd(), relativePath);

      try {
        await fs.unlink(filePath);
      } catch {}
    }

    if (removed.length) {
      await this.prisma.media.deleteMany({
        where: { id: { in: removed.map((r) => r.media.id) } },
      });
    }

    // UPSERT
    const mediaRecords = await Promise.all(
      extracted.map((m) =>
        this.prisma.media.upsert({
          where: { url: m.url },
          update: {},
          create: { url: m.url, type: m.type },
        }),
      ),
    );

    return mediaRecords.map((media) => ({
      media: { connect: { id: media.id } },
    }));
  }

  // -----------------------------
  // UPLOAD MEDIA
  // -----------------------------
  async uploadMedia(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    let type = 'image';
    if (file.mimetype.startsWith('video')) type = 'video';
    else if (file.mimetype.startsWith('audio')) type = 'audio';
    else if (!file.mimetype.startsWith('image')) {
      throw new BadRequestException('Unsupported file type');
    }

    const extension = extname(file.originalname) || '';
    const filename = `${Date.now()}-${randomUUID()}${extension}`;

    const uploadPath = join(this.TMP_DIR, filename);

    await fs.mkdir(this.TMP_DIR, { recursive: true });

    if (file.buffer) await fs.writeFile(uploadPath, file.buffer);
    else if (file.path) await fs.rename(file.path, uploadPath);

    const baseUrl = this.configService.get<string>('APP_URL');
    const url = `${baseUrl}/uploads/tmp/${filename}`;

    const media = await this.prisma.media.create({
      data: { url, type },
    });

    return {
      success: true,
      data: {
        id: media.id,
        url: media.url,
        type: media.type,
      },
      meta: {},
    };
  }

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateContentDto, user?: any) {
    this.logger.log(`CREATE_CONTENT_STARTED: ${dto.title}`);

    const mediaRelations = await this.syncMedia(dto.body);

    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        body: dto.body,
        typeId: toBigInt(dto.typeId),
        authorId: toBigInt(dto.authorId),
        status: 'Draft',
        slug: slugify(dto.title),
        tags:
          Array.isArray(dto.tags) && dto.tags.length > 0
            ? {
                create: dto.tags.filter(Boolean).map((name) => ({
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
          ? { create: dto.scriptures }
          : undefined,

        contentMedia: mediaRelations.length
          ? { create: mediaRelations }
          : undefined,
      },
      include: {
        tags: true,
        scriptures: true,
        contentMedia: true,
      },
    });

    await this.auditService.log({
      action: 'CONTENT_CREATED',
      entity: 'Content',
      entityId: content.id.toString(),
      after: content,
      userId: user?.id,
    });

    this.logger.log(`CREATE_CONTENT_SUCCESS: ${content.id}`);

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateContentDto, user?: any) {
    const contentId = toBigInt(id);

    this.logger.log(`UPDATE_CONTENT_STARTED: ${id}`);

    const before = await this.prisma.content.findFirst({
      where: { id: contentId },
      include: {
        tags: { include: { tag: true } },
        scriptures: true,
        contentMedia: { include: { media: true } },
      },
    });

    if (!before) throw new NotFoundException('Content not found');

    const mediaRelations = await this.syncMedia(dto.body || '', contentId);

    const after = await this.prisma.content.update({
      where: { id: contentId },
      data: {
        title: dto.title,
        body: dto.body,
        typeId: dto.typeId ? toBigInt(dto.typeId) : undefined,
        authorId: dto.authorId ? toBigInt(dto.authorId) : undefined,

        tags: dto.tags
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
          : undefined,

        scriptures: dto.scriptures
          ? {
              deleteMany: {},
              create: dto.scriptures,
            }
          : undefined,

        contentMedia: {
          deleteMany: {},
          create: mediaRelations,
        },
      },
      include: {
        tags: true,
        scriptures: true,
        contentMedia: true,
      },
    });

    await this.auditService.log({
      action: 'CONTENT_UPDATED',
      entity: 'Content',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_CONTENT_SUCCESS: ${id}`);

    return { success: true, data: after, meta: {} };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string, user?: any) {
    const contentId = toBigInt(id);

    this.logger.warn(`DELETE_CONTENT_STARTED: ${id}`);

    const before = await this.prisma.content.findFirst({
      where: { id: contentId },
      include: {
        tags: true,
        scriptures: true,
        contentMedia: true,
      },
    });

    if (!before) throw new NotFoundException('Content not found');

    await this.prisma.content.delete({
      where: { id: contentId },
    });

    await this.auditService.log({
      action: 'CONTENT_DELETED',
      entity: 'Content',
      entityId: id,
      before,
      userId: user?.id,
    });

    this.logger.warn(`DELETE_CONTENT_SUCCESS: ${id}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // PUBLISH
  // -----------------------------
  async publish(id: string, status: string, user?: any) {
    this.logger.log(`PUBLISH_CONTENT_STARTED: ${id} → ${status}`);

    const contentId = toBigInt(id);

    const before = await this.prisma.content.findFirst({
      where: { id: contentId },
    });

    const content = await this.prisma.content.update({
      where: { id: contentId },
      data: {
        status,
        publishedAt: status === 'Published' ? new Date() : null,
      },
    });

    await this.auditService.log({
      action:
        status === 'Published' ? 'CONTENT_PUBLISHED' : 'CONTENT_UNPUBLISHED',
      entity: 'Content',
      entityId: id,
      before,
      after: content,
      userId: user?.id,
    });

    this.logger.log(`PUBLISH_CONTENT_SUCCESS: ${id}`);

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // TYPES
  // -----------------------------
  async createType(name: string, user?: any) {
    this.logger.log(`CREATE_CONTENT_TYPE: ${name}`);

    const type = await this.prisma.contentType.create({
      data: { name },
    });

    await this.auditService.log({
      action: 'CONTENT_TYPE_CREATED',
      entity: 'ContentType',
      entityId: type.id.toString(),
      after: type,
      userId: user?.id,
    });

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    const types = await this.prisma.contentType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types, meta: {} };
  }

  async findAll(query: QueryContentDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching content page=${page}, limit=${limit}`);

    const where: any = { deletedAt: null };

    if (query.typeId) where.typeId = toBigInt(query.typeId);

    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { body: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          type: true,
          author: true,
          tags: { include: { tag: true } },
          scriptures: true,
          contentMedia: { include: { media: true } },
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const contentId = toBigInt(id);

    const content = await this.prisma.content.findFirst({
      where: { id: contentId, deletedAt: null },
      include: {
        type: true,
        author: true,
        tags: { include: { tag: true } },
        scriptures: true,
        contentMedia: { include: { media: true } },
      },
    });

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    return {
      success: true,
      data: content,
      meta: {},
    };
  }

  async findOneBySlug(identifier: string) {
    const isNumeric = /^\d+$/.test(identifier);

    const content = await this.prisma.content.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { slug: identifier },
          ...(isNumeric ? [{ id: toBigInt(identifier) }] : []),
        ],
      },
      include: {
        type: true,
        author: true,
        tags: { include: { tag: true } },
        scriptures: true,
        contentMedia: { include: { media: true } },
      },
    });

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    return {
      success: true,
      data: content,
      meta: {},
    };
  }
}
