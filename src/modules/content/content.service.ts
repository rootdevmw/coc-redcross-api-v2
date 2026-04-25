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

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  private readonly TMP_DIR = join(process.cwd(), 'uploads', 'tmp');
  private readonly FINAL_DIR = join(process.cwd(), 'uploads');

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
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
  // MEDIA SYNC (CORE ENGINE)
  // -----------------------------
  private async syncMedia(html: string, contentId?: bigint) {
    this.logger.log(`Syncing media for contentId=${contentId ?? 'NEW'}`);

    const extracted = this.extractMediaUrls(html);
    const newUrls = extracted.map((m) => m.url);

    this.logger.debug(`Extracted media URLs: ${JSON.stringify(newUrls)}`);

    const existing = contentId
      ? await this.prisma.contentMedia.findMany({
          where: { contentId },
          include: { media: true },
        })
      : [];

    // -----------------------------
    // REMOVE UNUSED MEDIA
    // -----------------------------
    const removed = existing.filter((m) => !newUrls.includes(m.media.url));

    if (removed.length) {
      this.logger.warn(`Removing ${removed.length} orphan media files`);
    }

    for (const item of removed) {
      const relativePath = item.media.url.replace(
        this.configService.get<string>('APP_URL')!,
        '',
      );

      const filePath = join(process.cwd(), relativePath);

      try {
        await fs.unlink(filePath);
        this.logger.log(`Deleted file: ${filePath}`);
      } catch (err) {
        this.logger.warn(`File already missing: ${filePath}`);
      }
    }

    if (removed.length) {
      await this.prisma.media.deleteMany({
        where: {
          id: { in: removed.map((r) => r.media.id) },
        },
      });

      this.logger.log(`Deleted ${removed.length} media records`);
    }

    // -----------------------------
    // UPSERT NEW MEDIA
    // -----------------------------
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

    this.logger.log(`Upserted ${mediaRecords.length} media records`);

    return mediaRecords.map((media) => ({
      media: {
        connect: { id: media.id },
      },
    }));
  }

  // -----------------------------
  // UPLOAD MEDIA (TEMP SYSTEM)
  // -----------------------------
  async uploadMedia(file: Express.Multer.File) {
    if (!file) {
      this.logger.error('Upload attempted without file');
      throw new BadRequestException('No file provided');
    }

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

    if (file.buffer) {
      await fs.writeFile(uploadPath, file.buffer);
    } else if (file.path) {
      await fs.rename(file.path, uploadPath);
    }

    const baseUrl = this.configService.get<string>('APP_URL');
    const url = `${baseUrl}/uploads/tmp/${filename}`;

    const media = await this.prisma.media.create({
      data: {
        url,
        type,
      },
    });

    this.logger.log(`Uploaded new ${type} media → ${url}`);

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
  // CREATE CONTENT
  // -----------------------------
  async create(dto: CreateContentDto) {
    this.logger.log(`Creating content: ${dto.title}`);

    const mediaRelations = await this.syncMedia(dto.body);

    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        body: dto.body,
        typeId: toBigInt(dto.typeId),
        authorId: toBigInt(dto.authorId),
        status: 'Draft',

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
    });

    this.logger.log(`Content created with id=${content.id}`);

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  async findAll(query: QueryContentDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching content page=${page}, limit=${limit}`);

    const where: any = { deletedAt: null };

    if (query.typeId) where.typeId = toBigInt(query.typeId);
    if (query.status) where.status = query.status;
    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim());
      where.tags = {
        some: {
          tag: {
            name: { in: tagList },
          },
        },
      };
    }
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
          type: true,
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

    this.logger.log(`Fetched ${data.length} records`);

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
    this.logger.log(`Fetching content id=${id}`);

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
          include: { media: true },
        },
      },
    });

    if (!content) {
      this.logger.warn(`Content not found id=${id}`);
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateContentDto) {
    const contentId = toBigInt(id);

    this.logger.log(`Updating content id=${id}`);

    const mediaRelations = await this.syncMedia(dto.body || '', contentId);

    const content = await this.prisma.content.update({
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
    });

    this.logger.log(`Content updated id=${id}`);

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // REMOVE
  // -----------------------------
  async remove(id: string) {
    this.logger.warn(`Deleting content id=${id}`);

    await this.prisma.content.delete({
      where: { id: toBigInt(id) },
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // PUBLISH
  // -----------------------------
  async publish(id: string, status: string) {
    this.logger.log(`Publishing content id=${id} → ${status}`);

    const content = await this.prisma.content.update({
      where: { id: toBigInt(id) },
      data: {
        status,
        publishedAt: status === 'Published' ? new Date() : null,
      },
    });

    return { success: true, data: content, meta: {} };
  }

  // -----------------------------
  // TYPES
  // -----------------------------
  async createType(name: string) {
    const type = await this.prisma.contentType.create({
      data: { name },
    });

    this.logger.log(`Created content type: ${name}`);

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    this.logger.log(`Fetching content types`);

    const types = await this.prisma.contentType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types, meta: {} };
  }
}
