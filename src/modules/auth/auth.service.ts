import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { toBigInt, toBigIntOptional } from 'src/common/utils/to-bigint';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { assertCanAssignRole } from './utils/role-hierarchy';

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
  async login(dto: any) {
    const email = dto.email?.toLowerCase().trim();

    this.logger.log(`LOGIN_ATTEMPT → ${email || 'NO_EMAIL'}`);

    if (!email || !dto.password) {
      this.logger.warn(`LOGIN_FAILED: missing credentials`);

      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: '',
        after: { email, reason: 'missing_credentials' },
      });

      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      this.logger.warn(`LOGIN_FAILED: user not found → ${email}`);

      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: '',
        after: { email, reason: 'user_not_found' },
      });

      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(dto.password, user.password);

    if (!valid) {
      this.logger.warn(`LOGIN_FAILED: invalid password → ${email}`);

      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user.id.toString(),
        after: { email, reason: 'invalid_password' },
      });

      throw new UnauthorizedException();
    }

    const sessionId = crypto.randomBytes(32).toString('hex');

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + Number(this.config.get('COOKIE_MAX_AGE')),
        ),
      },
    });

    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user.id.toString(),
      after: {
        email: user.email,
        roles: user.roles.map((r) => r.role.name),
        sessionId,
      },
    });

    this.logger.log(`LOGIN_SUCCESS → ${email}`);

    return {
      success: true,
      data: {
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          roles: user.roles.map((r) => r.role.name),
        },
      },
      meta: {},
    };
  }

  // -----------------------------
  // REQUEST RESET (KEEP MANUAL)
  // -----------------------------
  async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

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
  async setPassword(dto: { token: string; password: string }) {
    this.logger.log(`SET_PASSWORD_ATTEMPT`);

    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record || record.expiresAt < new Date()) {
      this.logger.warn(`SET_PASSWORD_FAILED: invalid/expired token`);

      await this.auditService.log({
        action: 'PASSWORD_RESET_FAILED',
        entity: 'User',
        entityId: '',
        after: { reason: 'invalid_or_expired_token' },
      });

      throw new NotFoundException('Invalid or expired token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordResetToken.delete({
      where: { token: hashedToken },
    });

    await this.auditService.log({
      action: 'PASSWORD_CHANGED_VIA_RESET',
      entity: 'User',
      entityId: user.id.toString(),
      after: { email: user.email },
    });

    this.logger.log(`PASSWORD_SET_SUCCESS → ${record.email}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // CHANGE PASSWORD
  // -----------------------------
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
    actorUser?: any,
  ) {
    this.logger.log(`CHANGE_PASSWORD → user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: toBigIntOptional(userId) },
    });

    if (!user) {
      this.logger.warn(`CHANGE_PASSWORD_FAILED: user not found`);

      throw new NotFoundException();
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);

    if (!valid) {
      this.logger.warn(`CHANGE_PASSWORD_FAILED: incorrect password`);

      await this.auditService.log({
        action: 'PASSWORD_CHANGE_FAILED',
        entity: 'User',
        entityId: user.id.toString(),
        after: { reason: 'incorrect_current_password' },
        userId: actorUser?.id,
      });

      throw new ConflictException('Incorrect password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    await this.auditService.log({
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: user.id.toString(),
      userId: actorUser?.id,
    });

    this.logger.log(`PASSWORD_CHANGED_SUCCESS → ${user.email}`);

    return { success: true, data: {}, meta: {} };
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
  async resetPassword(dto: { token: string; password: string }) {
    this.logger.log(`RESET_PASSWORD_ATTEMPT`);

    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record || record.expiresAt < new Date()) {
      await this.auditService.log({
        action: 'PASSWORD_RESET_FAILED',
        entity: 'User',
        after: { reason: 'invalid_or_expired_token' },
      });

      throw new NotFoundException('Invalid or expired token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordResetToken.delete({
      where: { token: hashedToken },
    });

    await this.auditService.log({
      action: 'PASSWORD_RESET_SUCCESS',
      entity: 'User',
      entityId: user.id.toString(),
    });

    return { success: true, data: {}, meta: {} };
  }
}
