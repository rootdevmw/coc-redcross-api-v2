import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { assertCanAssignRole } from './utils/role-hierarchy';
import {
  accountEmail,
  accountLoginInput,
  finishAccountPassword,
  changeAccountPassword,
} from './account-flows';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // LOGIN (KEEP MANUAL AUDIT)
  // -----------------------------
  async login(dto: unknown) {
    const { email, password } = accountLoginInput(dto);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: {
        roles: {
          where: { role: { deletedAt: null } },
          include: { role: true },
        },
      },
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user?.id.toString() ?? '',
        after: { email, reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Email and password were not accepted.');
    }
    const duration = Number(this.config.get('COOKIE_MAX_AGE'));
    if (
      !Number.isSafeInteger(duration) ||
      duration <= 0 ||
      !Number.isFinite(new Date(Date.now() + duration).getTime())
    )
      throw new InternalServerErrorException(
        'Session configuration is unavailable.',
      );
    const sessionId = crypto.randomBytes(32).toString('hex');
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(Date.now() + duration),
      },
    });
    const safeUser = {
      id: user.id,
      email: user.email,
      roles: user.roles.map((record) => record.role.name),
    };
    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user.id.toString(),
      after: { email: safeUser.email, roles: safeUser.roles },
    });
    return { success: true, data: { sessionId, user: safeUser }, meta: {} };
  }

  // -----------------------------
  // REQUEST RESET (KEEP MANUAL)
  // -----------------------------
  async requestPasswordReset(email: string) {
    const normalizedEmail = accountEmail(email);

    this.logger.log(`PASSWORD_RESET_REQUEST → ${normalizedEmail}`);

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    await this.auditService.log({
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'User',
      entityId: user?.id?.toString() ?? '',
      after: {
        email: normalizedEmail,
        exists: !!user,
      },
    });

    if (!user) {
      this.logger.warn(`RESET_REQUEST_UNKNOWN_USER → ${normalizedEmail}`);
      return { success: true, data: {}, meta: {} };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await this.prisma.passwordResetToken.deleteMany({
      where: { email: normalizedEmail },
    });

    const ttl =
      Number(this.config.get<string>('PASSWORD_RESET_TOKEN_TTL')) ||
      1000 * 60 * 15;

    await this.prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        token: hashedToken,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    await this.emailService.sendResetPassword(normalizedEmail, rawToken);

    this.logger.log(`RESET_EMAIL_SENT → ${normalizedEmail}`);

    return { success: true, data: {}, meta: {} };
  }
  // -----------------------------
  // SET PASSWORD (MIXED)
  // -----------------------------
  setPassword(dto: unknown) {
    return this.finishPassword(dto, 'set');
  }
  private async finishPassword(dto: unknown, kind: 'set' | 'reset') {
    try {
      return await finishAccountPassword(
        this.prisma,
        this.auditService,
        dto,
        kind,
      );
    } catch (error) {
      if (error instanceof NotFoundException)
        await this.auditService.log({
          action: 'PASSWORD_RESET_FAILED',
          entity: 'User',
          after: { reason: 'invalid_or_expired_token' },
        });
      throw error;
    }
  }
  changePassword(
    userId: string | bigint,
    dto: unknown,
    actorUser?: { id?: bigint },
  ) {
    return changeAccountPassword(
      this.prisma,
      this.auditService,
      userId,
      dto,
      actorUser?.id,
    );
  }

  // -----------------------------
  // LOGOUT (OPTIONAL DECORATOR)
  // -----------------------------
  async logout(sessionId?: string) {
    this.logger.log(`LOGOUT_ATTEMPT`);

    if (!sessionId) {
      this.logger.warn(`LOGOUT_SKIPPED: no session`);

      return { success: true, data: {}, meta: {} };
    }

    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });

    await this.auditService.log({
      action: 'LOGOUT',
      entity: 'Session',
      entityId: sessionId,
    });

    this.logger.log(`SESSION_INVALIDATED → ${sessionId}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // ASSIGN ROLE (USE DECORATOR)
  // -----------------------------
  // -----------------------------
  // SET ROLE (ELEVATE / DEMOTE)
  // -----------------------------
  async setRole(userId: string, roleId: string, actorUser?: any) {
    this.logger.log(`SET_ROLE → user=${userId}, role=${roleId}`);

    const userIdBigInt = toBigInt(userId);
    const roleIdBigInt = toBigInt(roleId);

    const role = await this.prisma.role.findUnique({
      where: { id: roleIdBigInt },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // permission check (hierarchy-aware)
    assertCanAssignRole(actorUser?.roles ?? [], role.name);

    // fetch current role (if any)
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: userIdBigInt },
      include: { role: true },
    });

    const before = existing
      ? {
          userId,
          roleId: existing.roleId.toString(),
          roleName: existing.role.name,
        }
      : null;

    // remove existing role (enforce single-role system)
    if (existing) {
      await this.prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId: userIdBigInt,
            roleId: existing.roleId,
          },
        },
      });
    }

    // set new role
    const rel = await this.prisma.userRole.create({
      data: {
        userId: userIdBigInt,
        roleId: roleIdBigInt,
      },
    });

    const after = {
      userId,
      roleId,
      roleName: role.name,
    };

    await this.auditService.log({
      action: 'ROLE_CHANGED',
      entity: 'UserRole',
      entityId: userId,
      before,
      after,
      userId: actorUser?.id,
    });

    this.logger.log(`ROLE_SET_SUCCESS → user=${userId}`);

    return { success: true, data: rel, meta: {} };
  }

  // -----------------------------
  // REMOVE ROLE
  // -----------------------------
  async removeRole(userId: string, actorUser?: any) {
    this.logger.log(`REMOVE_ROLE → user=${userId}`);

    const userIdBigInt = toBigInt(userId);

    const before = await this.prisma.userRole.findFirst({
      where: { userId: userIdBigInt },
      include: { role: true },
    });

    if (!before) {
      return { success: true, data: {}, meta: {} };
    }

    const visitorRole = await this.prisma.role.findFirst({
      where: { name: 'VISITOR' },
    });

    if (!visitorRole) {
      throw new Error('VISITOR role not found');
    }

    // Replace instead of delete
    await this.prisma.userRole.deleteMany({
      where: { userId: userIdBigInt },
    });

    const rel = await this.prisma.userRole.create({
      data: {
        userId: userIdBigInt,
        roleId: visitorRole.id,
      },
    });

    await this.auditService.log({
      action: 'ROLE_RESET_TO_VISITOR',
      entity: 'UserRole',
      entityId: userId,
      before,
      after: { role: 'VISITOR' },
      userId: actorUser?.id,
    });

    return { success: true, data: rel, meta: {} };
  }

  // -----------------------------
  // RESET PASSWORD (SET NEW PASSWORD)
  // -----------------------------
  resetPassword(dto: unknown) {
    return this.finishPassword(dto, 'reset');
  }
}
