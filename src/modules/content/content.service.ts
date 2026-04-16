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

  async create(dto: CreateContentDto) {
    this.logger.log(`Creating content: ${dto.title}`);

    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        body: dto.body,
        typeId: toBigInt(dto.typeId),
        authorId: toBigInt(dto.authorId),
        status: 'Draft',

        tags: dto.tags
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

        scriptures: dto.scriptures
          ? {
              create: dto.scriptures,
            }
          : undefined,
      },
    });

    return { success: true, data: content, meta: {} };
  }

  async findAll(query: QueryContentDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching content (page=${page})`);

    const where: any = {};

    if (query.typeId) where.typeId = query.typeId;
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
          tags: {
            where: {
              tag: { deletedAt: null },
            },
            include: { tag: true },
          },
          scriptures: {
            where: { deletedAt: null },
          },
          contentMedia: true,
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: toBigInt(id) },
      include: {
        author: true,
        tags: {
          where: {
            tag: { deletedAt: null },
          },
          include: { tag: true },
        },
        scriptures: {
          where: { deletedAt: null },
        },
        contentMedia: true,
      },
    });

    if (!content)
      throw new NotFoundException(`Content with id ${id} not found`);

    return { success: true, data: content, meta: {} };
  }

  async update(id: string, dto: UpdateContentDto) {
    this.logger.log(`Updating content: ${id}`);

    const content = await this.prisma.content.update({
      where: { id: toBigInt(id) },
      data: {
        title: dto.title,
        body: dto.body,
        typeId: toBigInt(dto.typeId!),
      },
    });

    return { success: true, data: content, meta: {} };
  }

  async remove(id: string) {
    await this.prisma.content.delete({
      where: { id: toBigInt(id) },
    });

    return { success: true, data: {}, meta: {} };
  }

  async publish(id: string, status: string) {
    this.logger.log(`Publishing content ${id} → ${status}`);

    const content = await this.prisma.content.update({
      where: { id: toBigInt(id) },
      data: {
        status,
        publishedAt: status === 'Published' ? new Date() : null,
      },
    });
    this.logger.log(
      `Content titled ${content.title} published with status: ${status}`,
    );
    return { success: true, data: content, meta: {} };
  }

  async createType(name: string) {
    this.logger.log(`Creating content type: ${name}`);

    const type = await this.prisma.contentType.create({
      data: { name },
    });

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    this.logger.log('Fetching content types');

    const types = await this.prisma.contentType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types, meta: {} };
  }
}
