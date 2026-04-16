import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { toBigIntOptional } from 'src/common/utils/to-bigint';

@Injectable()
export class NewslettersService {
  private readonly logger = new Logger(NewslettersService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: any, file?: Express.Multer.File) {
    this.logger.log(`Creating newsletter: ${dto.title}`);

    let fileUrl = '';

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const newsletter = await this.prisma.newsletter.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl: fileUrl, //  from upload
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
      },
    });

    return {
      success: true,
      data: newsletter,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching newsletters`);

    const [data, total] = await Promise.all([
      this.prisma.newsletter.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.newsletter.count(),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  // -----------------------------
  // FIND ONE (OPTIONAL BUT GOOD)
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
  async update(id: string, dto: any, file?: Express.Multer.File) {
    this.logger.log(`Updating newsletter ${id}`);

    let fileUrl: string | undefined;

    if (file) {
      fileUrl = this.saveFile(file);
    }

    const newsletter = await this.prisma.newsletter.update({
      where: { id: toBigIntOptional(id) },
      data: {
        title: dto.title,
        description: dto.description,
        fileUrl: fileUrl ?? undefined,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
      },
    });

    return {
      success: true,
      data: newsletter,
      meta: {},
    };
  }

  async remove(id: string) {
    await this.prisma.newsletter.delete({
      where: { id: toBigIntOptional(id) },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  private saveFile(file: Express.Multer.File): string {
    const uploadDir = path.join(process.cwd(), 'uploads/newsletters');

    // ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // generate clean filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = file.originalname
      .replace(ext, '')
      .replace(/\s+/g, '-')
      .toLowerCase();

    const fileName = `${baseName}-${timestamp}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    // return public path
    return `/uploads/newsletters/${fileName}`;
  }
}
