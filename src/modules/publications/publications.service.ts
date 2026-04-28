import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { CreatePublicationDto } from './dto/create-publication.dto';
import { QueryPublicationDto } from './dto/query-publication.dto';
import { UpdatePublicationDto } from './dto/update-publication.dto';

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(
    dto: CreatePublicationDto,
    user?: any,
    file?: Express.Multer.File,
  ) {
    this.logger.log(`Creating publication: ${dto.title}`);

    let fileUrl = '';

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const publication = await this.prisma.publication.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
      },
    });

    await this.auditService.log({
      action: 'PUBLICATION_CREATED',
      entity: 'Publication',
      entityId: publication.id.toString(),
      after: publication,
      userId: user?.id,
    });

    return {
      success: true,
      data: publication,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: QueryPublicationDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching publications`);

    const where = { deletedAt: null, publishedAt: { not: null } };

    const [data, total] = await Promise.all([
      this.prisma.publication.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.publication.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // -----------------------------
  // FIND ONE (NO AUDIT)
  // -----------------------------
  async findOne(id: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { id: toBigIntOptional(id) },
    });

    if (!publication) {
      throw new NotFoundException('publication not found');
    }

    return {
      success: true,
      data: publication,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(
    id: string,
    dto: UpdatePublicationDto,
    user?: any,
    file?: Express.Multer.File,
  ) {
    this.logger.log(`Updating publication ${id}`);

    const publicationId = toBigIntOptional(id);

    const before = await this.prisma.publication.findFirst({
      where: { id: publicationId },
    });

    if (!before) {
      throw new NotFoundException('publication not found');
    }

    let fileUrl: string | undefined;

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const after = await this.prisma.publication.update({
      where: { id: publicationId },
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl: fileUrl ?? undefined,
        publishedAt:
          dto.publishedAt !== undefined
            ? dto.publishedAt === null
              ? null
              : new Date(dto.publishedAt)
            : undefined,
      },
    });

    await this.auditService.log({
      action: 'PUBLICATION_UPDATED',
      entity: 'Publication',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // PUBLISH
  // -----------------------------
  async publish(id: string, user?: any) {
    this.logger.log(`Publishing publication ${id}`);

    const publicationId = toBigIntOptional(id);

    const before = await this.prisma.publication.findFirst({
      where: { id: publicationId },
    });

    const after = await this.prisma.publication.update({
      where: { id: publicationId },
      data: {
        publishedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'PUBLICATION_PUBLISHED',
      entity: 'Publication',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // UNPUBLISH
  // -----------------------------
  async unpublish(id: string, user?: any) {
    this.logger.log(`Unpublishing publication ${id}`);

    const publicationId = toBigIntOptional(id);

    const before = await this.prisma.publication.findFirst({
      where: { id: publicationId },
    });

    const after = await this.prisma.publication.update({
      where: { id: publicationId },
      data: {
        publishedAt: null,
      },
    });

    await this.auditService.log({
      action: 'PUBLICATION_UNPUBLISHED',
      entity: 'Publication',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string, user?: any) {
    this.logger.log(`Deleting publication ${id}`);

    const publicationId = toBigIntOptional(id);

    const before = await this.prisma.publication.findFirst({
      where: { id: publicationId },
    });

    await this.prisma.publication.delete({
      where: { id: publicationId },
    });

    await this.auditService.log({
      action: 'PUBLICATION_DELETED',
      entity: 'Publication',
      entityId: id,
      before,
      userId: user?.id,
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // FILE STORAGE
  // -----------------------------
  private saveFile(file: Express.Multer.File): string {
    const uploadDir = path.join(process.cwd(), 'uploads/publications');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = file.originalname
      .replace(ext, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    const fileName = `${baseName}-${timestamp}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    return this.buildPublicUrl(`/uploads/publications/${fileName}`);
  }

  private buildPublicUrl(filePath: string): string {
    const baseUrl = this.config.get<string>('APP_URL');
    return `${baseUrl}${filePath}`;
  }
}
