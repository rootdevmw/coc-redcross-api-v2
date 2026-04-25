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
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  // -----------------------------
  // CREATE USER (INVITE FLOW)
  // -----------------------------
  @Audit({
    action: 'USER_CREATED',
    entity: 'User',
  })
  async create(dto: any) {
    const email = dto.email.toLowerCase().trim();
    this.logger.log(`Creating user: ${email}`);

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

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE USER
  // -----------------------------
  @Audit({
    action: 'USER_UPDATED',
    entity: 'User',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: any) {
    const email = dto.email?.toLowerCase().trim();

    const user = await this.prisma.user.update({
      where: { id: toBigIntOptional(id) },
      data: { email },
    });

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
  @Audit({
    action: 'USER_DELETED',
    entity: 'User',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    await this.prisma.user.update({
      where: { id: toBigIntOptional(id) },
      data: { deletedAt: new Date() },
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // LINK MEMBER
  // -----------------------------
  @Audit({
    action: 'USER_MEMBER_LINKED',
    entity: 'User',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async linkMember(userId: string, memberId: string) {
    const userIdBigInt = toBigIntOptional(userId);
    const memberIdBigInt = toBigIntOptional(memberId);

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

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // UNLINK MEMBER
  // -----------------------------
  @Audit({
    action: 'USER_MEMBER_UNLINKED',
    entity: 'User',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async unlinkMember(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: toBigIntOptional(userId) },
      include: { member: true },
    });

    if (!user?.member) {
      throw new NotFoundException('No member linked');
    }

    await this.prisma.member.update({
      where: { id: user.member.id },
      data: { userId: null },
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
