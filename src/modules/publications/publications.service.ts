import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePublicationDto } from './dto/create-publication.dto';
import { QueryPublicationDto } from './dto/query-publication.dto';
import { UpdatePublicationDto } from './dto/update-publication.dto';
import { publicationListWhere } from '../../common/utils/editorial-list-filters';
import {
  listPublicDocuments,
  readPublicDocument,
  type PublicLibraryQuery,
} from '../../common/utils/public-library';
import {
  savePublicationEditor,
  storePublicationFile,
  publicationEditorId,
  hasPublicationDocument,
} from './publication-editor';

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  create(
    dto: CreatePublicationDto,
    user?: { id?: bigint },
    file?: Express.Multer.File,
  ) {
    return savePublicationEditor(
      this.prisma,
      this.auditService,
      (file) => this.saveFile(file),
      dto,
      user?.id,
      undefined,
      file,
    );
  }
  update(
    id: string,
    dto: UpdatePublicationDto,
    user?: { id?: bigint },
    file?: Express.Multer.File,
  ) {
    return savePublicationEditor(
      this.prisma,
      this.auditService,
      (file) => this.saveFile(file),
      dto,
      user?.id,
      id,
      file,
    );
  }
  async findAll(
    query: QueryPublicationDto,
    scope: 'public' | 'management' = 'public',
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    this.logger.log('Fetching publications');
    const where = publicationListWhere(query, scope);
    const [data, total] = await Promise.all([
      this.prisma.publication.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy:
          scope === 'management'
            ? [{ createdAt: 'desc' }, { id: 'desc' }]
            : [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.publication.count({ where }),
    ]);
    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  findPublic(query: PublicLibraryQuery = {}) {
    return listPublicDocuments(this.prisma, query);
  }
  readPublic(id: string) {
    return readPublicDocument(this.prisma, id);
  }
  async findOne(id: string, scope: 'public' | 'management' = 'public') {
    const publication = await this.prisma.publication.findFirst({
      where: {
        id: publicationEditorId(id),
        ...publicationListWhere({}, scope),
      },
    });
    if (!publication) throw new NotFoundException('Publication not found.');
    return { success: true, data: publication, meta: {} };
  }
  private async activeRecord(id: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { id: publicationEditorId(id), deletedAt: null },
    });
    if (!publication) throw new NotFoundException('Publication not found.');
    return publication;
  }
  async publish(id: string, user?: { id?: bigint }) {
    const before = await this.activeRecord(id);
    if (!hasPublicationDocument(before.fileUrl))
      throw new BadRequestException('Attach a document before publishing.');
    const after = await this.prisma.publication.update({
      where: { id: before.id },
      data: { publishedAt: new Date() },
    });
    await this.auditService.log({
      action: 'PUBLICATION_PUBLISHED',
      entity: 'Publication',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });
    return { success: true, data: after, meta: {} };
  }
  async unpublish(id: string, user?: { id?: bigint }) {
    const before = await this.activeRecord(id);
    const after = await this.prisma.publication.update({
      where: { id: before.id },
      data: { publishedAt: null },
    });
    await this.auditService.log({
      action: 'PUBLICATION_UNPUBLISHED',
      entity: 'Publication',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });
    return { success: true, data: after, meta: {} };
  }
  async remove(id: string, user?: { id?: bigint }) {
    const before = await this.activeRecord(id);
    await this.prisma.publication.delete({ where: { id: before.id } });
    await this.auditService.log({
      action: 'PUBLICATION_DELETED',
      entity: 'Publication',
      entityId: id,
      before,
      userId: user?.id,
    });
    return { success: true, data: {}, meta: {} };
  }
  private saveFile(file: Express.Multer.File) {
    return storePublicationFile(file, this.config.get<string>('APP_URL'));
  }
}
