import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import ExcelJS from 'exceljs';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateMemberDto, user?: any) {
    this.logger.log(`CREATE_MEMBER_STARTED: ${dto.firstName} ${dto.lastName}`);

    const member = await this.prisma.member.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        prefix: dto.prefix,
        phone: dto.phone,
        status: dto.status,
        location: dto.location,
        homecell: dto.homecellId
          ? { connect: { id: toBigInt(dto.homecellId) } }
          : undefined,
        baptized: dto.isBaptized,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : null,
        bio: dto.bio?.trim() ? { create: { bio: dto.bio } } : undefined,
      },
      include: {
        bio: true,
        homecell: true,
      },
    });

    await this.auditService.log({
      action: 'MEMBER_CREATED',
      entity: 'Member',
      entityId: member.id.toString(),
      after: member,
      userId: user?.id,
    });

    this.logger.log(`CREATE_MEMBER_SUCCESS: ${member.id}`);

    return {
      success: true,
      data: member,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  async findAll(query: QueryMemberDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`FETCH_MEMBERS_STARTED: page=${page} limit=${limit}`);

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.homecellId) where.homecellId = query.homecellId;
    if (query.prefix) where.prefix = query.prefix;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          homecell: true,
          ministries: {
            where: {
              ministry: { deletedAt: null },
            },
            include: {
              ministry: true,
            },
          },
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    this.logger.log(
      `FETCH_MEMBERS_SUCCESS: returned=${data.length} total=${total}`,
    );

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  // -----------------------------
  // FIND ONE
  // -----------------------------
  async findOne(id: string) {
    this.logger.log(`FETCH_MEMBER_STARTED: ${id}`);

    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(id) },
      include: {
        homecell: true,
        ministries: {
          where: {
            ministry: { deletedAt: null },
          },
          include: { ministry: true },
        },
      },
    });

    if (!member) throw new NotFoundException('Member not found');

    this.logger.log(`FETCH_MEMBER_SUCCESS: ${id}`);

    return {
      success: true,
      data: member,
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateMemberDto, user?: any) {
    const memberId = toBigInt(id);

    this.logger.log(`UPDATE_MEMBER_STARTED: ${id}`);

    const before = await this.prisma.member.findFirst({
      where: { id: memberId },
    });

    if (!before) throw new NotFoundException('Member not found');

    const after = await this.prisma.member.update({
      where: { id: memberId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        prefix: dto.prefix,
        phone: dto.phone,
        status: dto.status,
        baptized: dto.isBaptized,
        location: dto.location,
        homecellId: dto.homecellId ? toBigInt(dto.homecellId) : undefined,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : undefined,
        bio:
          dto.bio !== undefined
            ? {
                upsert: {
                  create: { bio: dto.bio },
                  update: { bio: dto.bio },
                },
              }
            : undefined,
      },
      include: {
        bio: true,
        homecell: true,
      },
    });

    await this.auditService.log({
      action: 'MEMBER_UPDATED',
      entity: 'Member',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_MEMBER_SUCCESS: ${id}`);

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
    const memberId = toBigInt(id);

    this.logger.warn(`DELETE_MEMBER_STARTED: ${id}`);

    const before = await this.prisma.member.findFirst({
      where: { id: memberId },
    });

    if (!before) throw new NotFoundException('Member not found');

    await this.prisma.member.delete({
      where: { id: memberId },
    });

    await this.auditService.log({
      action: 'MEMBER_DELETED',
      entity: 'Member',
      entityId: id,
      before,
      userId: user?.id,
    });

    this.logger.warn(`DELETE_MEMBER_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN MINISTRY
  // -----------------------------
  async assignMinistry(memberId: string, ministryId: string, user?: any) {
    this.logger.log(
      `ASSIGN_MINISTRY_STARTED: member=${memberId} ministry=${ministryId}`,
    );

    await this.prisma.memberMinistry.create({
      data: {
        memberId: toBigInt(memberId),
        ministryId: toBigInt(ministryId),
      },
    });

    await this.auditService.log({
      action: 'MEMBER_ASSIGNED_MINISTRY',
      entity: 'Member',
      entityId: memberId,
      after: { ministryId },
      userId: user?.id,
    });

    this.logger.log(
      `ASSIGN_MINISTRY_SUCCESS: member=${memberId} ministry=${ministryId}`,
    );

    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  // -----------------------------
  // REMOVE MINISTRY
  // -----------------------------
  async removeMinistry(memberId: string, ministryId: string, user?: any) {
    this.logger.warn(
      `REMOVE_MINISTRY_STARTED: member=${memberId} ministry=${ministryId}`,
    );

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId: toBigInt(memberId),
          ministryId: toBigInt(ministryId),
        },
      },
    });

    await this.auditService.log({
      action: 'MEMBER_REMOVED_MINISTRY',
      entity: 'Member',
      entityId: memberId,
      after: { ministryId },
      userId: user?.id,
    });

    this.logger.warn(
      `REMOVE_MINISTRY_SUCCESS: member=${memberId} ministry=${ministryId}`,
    );

    return {
      success: true,
      message: 'Member removed from ministry',
      meta: {},
    };
  }

  // -----------------------------
  // EXPORT xlsx
  // -----------------------------

  async exportToXlsx(query: QueryMemberDto): Promise<{
    success: boolean;
    buffer: Buffer;
    meta: { count: number };
  }> {
    this.logger.log(`EXPORT_MEMBERS_XLSX_STARTED`);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.homecellId) where.homecellId = query.homecellId;
    if (query.prefix) where.prefix = query.prefix;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }

    const members = await this.prisma.member.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        homecell: true,
        ministries: {
          where: { ministry: { deletedAt: null } },
          include: { ministry: true },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Church Management System';
    wb.created = new Date();

    const ws = wb.addWorksheet('Members', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // ── Column definitions ──────────────────────────────────────────────────
    ws.columns = [
      { header: 'ID', key: 'id', width: 12 },
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Last Name', key: 'lastName', width: 18 },
      { header: 'Prefix', key: 'prefix', width: 10 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Location', key: 'location', width: 22 },
      { header: 'Baptized', key: 'baptized', width: 10 },
      { header: 'Baptism Date', key: 'baptismDate', width: 18 },
      { header: 'Homecell', key: 'homecell', width: 20 },
      { header: 'Ministries', key: 'ministries', width: 35 },
      { header: 'Created At', key: 'createdAt', width: 22 },
    ];

    // ── Header row styling ──────────────────────────────────────────────────
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = {
        name: 'Arial',
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2D3A8C' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: false,
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      };
    });
    headerRow.height = 28;

    // ── Data rows ───────────────────────────────────────────────────────────
    members.forEach((m, i) => {
      const row = ws.addRow({
        id: m.id.toString(),
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        prefix: m.prefix ?? '',
        phone: m.phone ?? '',
        status: m.status ?? '',
        location: m.location ?? '',
        baptized: m.baptized ? 'Yes' : 'No',
        baptismDate: m.baptismDate ? new Date(m.baptismDate) : '',
        homecell: m.homecell?.name ?? '',
        ministries: m.ministries.map((mm) => mm.ministry.name).join('; '),
        createdAt: new Date(m.createdAt),
      });

      // Alternate row shading
      const rowFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF4F6FB' },
      };

      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = rowFill;
        cell.alignment = { vertical: 'middle', wrapText: false };
      });

      // Format date columns
      const baptismCell = row.getCell('baptismDate');
      const createdCell = row.getCell('createdAt');
      if (baptismCell.value) baptismCell.numFmt = 'yyyy-mm-dd';
      createdCell.numFmt = 'yyyy-mm-dd hh:mm';

      row.height = 20;
    });

    // ── Summary row ─────────────────────────────────────────────────────────
    const totalRow = ws.addRow({
      firstName: `Total: ${members.length} members`,
    });
    totalRow.getCell('firstName').font = {
      name: 'Arial',
      bold: true,
      size: 10,
    };
    totalRow.getCell('firstName').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EAF6' },
    };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    this.logger.log(`EXPORT_MEMBERS_XLSX_SUCCESS: count=${members.length}`);

    return {
      success: true,
      buffer,
      meta: { count: members.length },
    };
  }
}
