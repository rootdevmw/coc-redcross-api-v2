import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NewslettersService {
  private readonly logger = new Logger(NewslettersService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: any, user?: any, file?: Express.Multer.File) {
    this.logger.log(`Creating newsletter: ${dto.title}`);

    let fileUrl = '';

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const newsletter = await this.prisma.newsletter.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
      },
    });

    await this.auditService.log({
      action: 'NEWSLETTER_CREATED',
      entity: 'Newsletter',
      entityId: newsletter.id.toString(),
      after: newsletter,
      userId: user?.id,
    });

    return {
      success: true,
      data: newsletter,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching newsletters`);

    const where = { deletedAt: null, publishedAt: { not: null } };

    const [data, total] = await Promise.all([
      this.prisma.newsletter.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.newsletter.count({ where }),
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
    const newsletter = await this.prisma.newsletter.findFirst({
      where: { id: toBigIntOptional(id) },
    });

    if (!newsletter) {
      throw new NotFoundException('Newsletter not found');
    }

    return {
      success: true,
      data: newsletter,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: any, user?: any, file?: Express.Multer.File) {
    this.logger.log(`Updating newsletter ${id}`);

    const newsletterId = toBigIntOptional(id);

    const before = await this.prisma.newsletter.findFirst({
      where: { id: newsletterId },
    });

    if (!before) {
      throw new NotFoundException('Newsletter not found');
    }

    let fileUrl: string | undefined;

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const after = await this.prisma.newsletter.update({
      where: { id: newsletterId },
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
      action: 'NEWSLETTER_UPDATED',
      entity: 'Newsletter',
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
    this.logger.log(`Publishing newsletter ${id}`);

    const newsletterId = toBigIntOptional(id);

    const before = await this.prisma.newsletter.findFirst({
      where: { id: newsletterId },
    });

    const after = await this.prisma.newsletter.update({
      where: { id: newsletterId },
      data: {
        publishedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'NEWSLETTER_PUBLISHED',
      entity: 'Newsletter',
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
    this.logger.log(`Unpublishing newsletter ${id}`);

    const newsletterId = toBigIntOptional(id);

    const before = await this.prisma.newsletter.findFirst({
      where: { id: newsletterId },
    });

    const after = await this.prisma.newsletter.update({
      where: { id: newsletterId },
      data: {
        publishedAt: null,
      },
    });

    await this.auditService.log({
      action: 'NEWSLETTER_UNPUBLISHED',
      entity: 'Newsletter',
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
    this.logger.log(`Deleting newsletter ${id}`);

    const newsletterId = toBigIntOptional(id);

    const before = await this.prisma.newsletter.findFirst({
      where: { id: newsletterId },
    });

    await this.prisma.newsletter.delete({
      where: { id: newsletterId },
    });

    await this.auditService.log({
      action: 'NEWSLETTER_DELETED',
      entity: 'Newsletter',
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
    const uploadDir = path.join(process.cwd(), 'uploads/newsletters');

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

    return this.buildPublicUrl(`/uploads/newsletters/${fileName}`);
  }

  private buildPublicUrl(filePath: string): string {
    const baseUrl = this.config.get<string>('APP_URL');
    return `${baseUrl}${filePath}`;
  }
}
