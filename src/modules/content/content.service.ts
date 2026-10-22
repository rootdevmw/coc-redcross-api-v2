import { saveContentEditor, contentAuthorOptions } from './content-editor';
import type { AccessListQuery } from '../../common/utils/access-list-filters';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { SlugService } from 'src/common/utils/slugify';
import { toBigInt } from 'src/common/utils/to-bigint';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateContentDto } from './dto/create-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { contentListWhere } from '../../common/utils/editorial-list-filters';
import { catalogTypeName, rethrowCatalogWrite } from '../../common/utils/type-catalog';
import { publicMessageIdentifier, publicMessageQuery, publicMessageSelect } from './public-messages';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  private readonly TMP_DIR = join(process.cwd(), 'uploads', 'tmp');

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditService: AuditService,
    private slugify: SlugService,
  ) {}

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
  async create(dto: CreateContentDto, user?: { id?: bigint }) {
    return saveContentEditor(this.prisma, this.auditService, this.slugify, dto, user?.id);
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateContentDto, user?: { id?: bigint }) {
    return saveContentEditor(this.prisma, this.auditService, this.slugify, dto, user?.id, id);
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
        scriptures: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
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
      data: { name: catalogTypeName(name) },
    }).catch(rethrowCatalogWrite);

    await this.auditService.log({
      action: 'CONTENT_TYPE_CREATED',
      entity: 'ContentType',
      entityId: type.id.toString(),
      after: type,
      userId: user?.id,
    });

    return { success: true, data: type, meta: {} };
  }

  authorOptions(query: AccessListQuery) { return contentAuthorOptions(this.prisma, query); }

  async getTypes() {
    const types = await this.prisma.contentType.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return { success: true, data: types, meta: {} };
  }

  async findAll(query: QueryContentDto, publicOnly = false) {
    const publicQuery = publicOnly ? publicMessageQuery(query) : null;
    const page = publicQuery?.page ?? (Number(query.page) || 1);
    const limit = publicQuery?.limit ?? (Number(query.limit) || 10);

    this.logger.log(`Fetching content page=${page}, limit=${limit}`);

    const where = publicQuery?.where ?? contentListWhere(query);
    const read = { where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }] };

    const [data, total] = await Promise.all([
      publicOnly ? this.prisma.content.findMany({ ...read, select: publicMessageSelect }) : this.prisma.content.findMany({
        ...read,
        include: {
          type: true,
          author: true,
          tags: { where: { tag: { deletedAt: null } }, include: { tag: true } },
          scriptures: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
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
        tags: { where: { tag: { deletedAt: null } }, include: { tag: true } },
        scriptures: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
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
    const { slug, legacyId } = publicMessageIdentifier(identifier);
    let content = await this.prisma.content.findFirst({
      where: {
        deletedAt: null,
        status: 'Published',
        OR: [{ slug }],
      },
      select: publicMessageSelect,
    });

    // A numeric slug wins over a different record's legacy numeric ID.
    if (!content && legacyId !== null) content = await this.prisma.content.findFirst({
      where: { id: legacyId, deletedAt: null, status: 'Published' },
      select: publicMessageSelect,
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
