import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE USER (INVITE FLOW)
  // -----------------------------
  async create(dto: any) {
    const email = dto.email.toLowerCase().trim();

    this.logger.log(`CREATE_USER_STARTED: ${email}`);

    const existing = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(`User ${email} already exists`);
    }

    const tempPassword = await bcrypt.hash(
      crypto.randomBytes(16).toString('hex'),
      10,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        password: tempPassword,
      },
    });

    // generate invite token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const ttl =
      Number(this.config.get<string>('PASSWORD_SET_TOKEN_TTL')) ||
      1000 * 60 * 60 * 24;

    await this.prisma.passwordResetToken.create({
      data: {
        email,
        token: hashedToken,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    await this.emailService.sendSetPassword(email, rawToken);

    const { password, ...safeUser } = user;

    await this.auditService.log({
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id.toString(),
      after: safeUser,
    });

    this.logger.log(`CREATE_USER_SUCCESS: ${user.id}`);

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE USER
  // -----------------------------
  async update(id: string, dto: any) {
    const userId = toBigIntOptional(id);
    const email = dto.email?.toLowerCase().trim();

    this.logger.log(`UPDATE_USER_STARTED: ${id}`);

    const before = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        member: true,
      },
    });

    if (!before) {
      throw new NotFoundException(`User not found`);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });

    await this.auditService.log({
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      before,
      after: {
        id: user.id.toString(),
        email: user.email,
      },
    });

    this.logger.log(`UPDATE_USER_SUCCESS: ${id}`);

    return {
      success: true,
      data: {
        id: user.id.toString(),
        email: user.email,
      },
      meta: {},
    };
  }

  // -----------------------------
  // DELETE USER (SOFT)
  // -----------------------------
  async remove(id: string) {
    const userId = toBigIntOptional(id);

    this.logger.warn(`DELETE_USER_STARTED: ${id}`);

    const before = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        member: true,
      },
    });

    if (!before) {
      throw new NotFoundException(`User not found`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      before,
    });

    this.logger.warn(`DELETE_USER_SUCCESS: ${id}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // LINK MEMBER
  // -----------------------------
  async linkMember(userId: string, memberId: string) {
    const userIdBigInt = toBigIntOptional(userId);
    const memberIdBigInt = toBigIntOptional(memberId);

    this.logger.log(`LINK_MEMBER_STARTED: user=${userId} member=${memberId}`);

    const user = await this.prisma.user.findFirst({
      where: { id: userIdBigInt, deletedAt: null },
      include: { member: true },
    });

    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const member = await this.prisma.member.findFirst({
      where: { id: memberIdBigInt, deletedAt: null },
    });

    if (!member) throw new NotFoundException(`Member ${memberId} not found`);

    if (member.userId) {
      throw new ConflictException(`Member already linked`);
    }

    if (user.member) {
      await this.prisma.member.update({
        where: { id: user.member.id },
        data: { userId: null },
      });
    }

    await this.prisma.member.update({
      where: { id: memberIdBigInt },
      data: { userId: userIdBigInt },
    });

    await this.auditService.log({
      action: 'USER_MEMBER_LINKED',
      entity: 'User',
      entityId: userId,
      before: user,
      after: { linkedMemberId: memberId },
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // UNLINK MEMBER
  // -----------------------------
  async unlinkMember(userId: string) {
    const userIdBigInt = toBigIntOptional(userId);

    this.logger.log(`UNLINK_MEMBER_STARTED: ${userId}`);

    const user = await this.prisma.user.findFirst({
      where: { id: userIdBigInt },
      include: { member: true },
    });

    if (!user?.member) {
      throw new NotFoundException('No member linked');
    }

    await this.prisma.member.update({
      where: { id: user.member.id },
      data: { userId: null },
    });

    await this.auditService.log({
      action: 'USER_MEMBER_UNLINKED',
      entity: 'User',
      entityId: userId,
      before: user,
      after: null,
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // READS (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: { include: { role: true } },
          member: true,
        },
      }),
      this.prisma.user.count({
        where: { deletedAt: null },
      }),
    ]);

    const users = data.map((user) => ({
      id: user.id.toString(),
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
      member: user.member
        ? {
            id: user.member.id.toString(),
            firstName: user.member.firstName,
            lastName: user.member.lastName,
          }
        : null,
      createdAt: user.createdAt,
    }));

    return {
      success: true,
      data: users,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: toBigIntOptional(id), deletedAt: null },
      include: {
        roles: { include: { role: true } },
        member: true,
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    return {
      success: true,
      data: {
        id: user.id.toString(),
        email: user.email,
        roles: user.roles.map((r) => r.role.name),
        member: user.member
          ? {
              id: user.member.id.toString(),
              firstName: user.member.firstName,
              lastName: user.member.lastName,
            }
          : null,
        createdAt: user.createdAt,
      },
      meta: {},
    };
  }
}
