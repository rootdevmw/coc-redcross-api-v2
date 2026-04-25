import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { toBigInt, toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { Audit } from 'src/common/decorators/audit.decorator';

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
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        after: { email, reason: 'missing_credentials' },
      });

      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        after: { email, reason: 'user_not_found' },
      });

      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(dto.password, user.password);

    if (!valid) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user.id.toString(),
        after: { reason: 'invalid_password' },
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

    // ✅ SUCCESS LOGIN AUDIT (manual is fine here)
    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user.id.toString(),
      after: {
        email: user.email,
        roles: user.roles.map((r) => r.role.name),
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
      entityId: user?.id?.toString(),
      after: { email: normalizedEmail, exists: !!user },
    });

    if (!user) return { success: true, data: {}, meta: {} };

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
      action: 'PASSWORD_CHANGED_VIA_RESET',
      entity: 'User',
      entityId: user.id.toString(),
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // CHANGE PASSWORD (USE DECORATOR)
  // -----------------------------
  @Audit({
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: toBigIntOptional(userId) },
    });

    if (!user) throw new NotFoundException();

    const valid = await bcrypt.compare(dto.currentPassword, user.password);

    if (!valid) {
      await this.auditService.log({
        action: 'PASSWORD_CHANGE_FAILED',
        entity: 'User',
        entityId: user.id.toString(),
        after: { reason: 'incorrect_current_password' },
      });

      throw new ConflictException('Incorrect password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // LOGOUT (OPTIONAL DECORATOR)
  // -----------------------------
  @Audit({
    action: 'LOGOUT',
    entity: 'Session',
    idParamIndex: 0,
  })
  async logout(sessionId?: string) {
    if (!sessionId) {
      return { success: true, data: {}, meta: {} };
    }

    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // ASSIGN ROLE (USE DECORATOR)
  // -----------------------------
  @Audit({
    action: 'ROLE_ASSIGNED',
    entity: 'UserRole',
    idParamIndex: 0,
  })
  async assignRole(userId: string, roleId: string) {
    const rel = await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
      },
      update: {},
      create: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
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
