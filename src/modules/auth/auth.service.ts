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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  // -----------------------------
  // LOGIN
  // -----------------------------
  async login(dto: any) {
    const email = dto.email?.toLowerCase().trim();

    this.logger.log(`Login attempt → ${email || 'NO_EMAIL'}`);

    if (!email || !dto.password) {
      this.logger.warn(`Login failed: missing credentials`);
      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      this.logger.warn(`Login failed: user not found → ${email}`);
      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(dto.password, user.password);

    if (!valid) {
      this.logger.warn(`Login failed: invalid password → ${email}`);
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

    this.logger.log(
      `Login success → ${email} | roles: ${user.roles
        .map((r) => r.role.name)
        .join(', ')}`,
    );

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
  // REQUEST RESET
  // -----------------------------
  async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    this.logger.log(`Password reset requested → ${normalizedEmail}`);

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    if (!user) {
      this.logger.warn(
        `Password reset requested for non-existent user → ${normalizedEmail}`,
      );
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
      1000 * 60 * 15; // fallback 24h

    await this.prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        token: hashedToken,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    this.logger.log(`Reset token generated → ${normalizedEmail}`);

    await this.emailService.sendResetPassword(normalizedEmail, rawToken);

    this.logger.log(`Reset email sent → ${normalizedEmail}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // SET PASSWORD
  // -----------------------------
  async setPassword(dto: { token: string; password: string }) {
    this.logger.log(`Set password attempt`);

    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record || record.expiresAt < new Date()) {
      this.logger.warn(`Set password failed: invalid/expired token`);
      throw new NotFoundException('Invalid or expired token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordResetToken.delete({
      where: { token: hashedToken },
    });

    this.logger.log(`Password set successfully → ${record.email}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // RESET PASSWORD (alias)
  // -----------------------------
  async resetPassword(dto: { token: string; password: string }) {
    return this.setPassword(dto);
  }

  // -----------------------------
  // CHANGE PASSWORD
  // -----------------------------
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    this.logger.log(`Change password → user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: toBigIntOptional(userId) },
    });

    if (!user) {
      this.logger.warn(`Change password failed: user not found → ${userId}`);
      throw new NotFoundException();
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);

    if (!valid) {
      this.logger.warn(
        `Change password failed: incorrect current password → ${user.email}`,
      );
      throw new ConflictException('Incorrect password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    this.logger.log(`Password changed → ${user.email}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------
  async logout(sessionId?: string) {
    this.logger.log(`Logout attempt`);

    if (!sessionId) {
      this.logger.warn(`Logout skipped: no session ID`);
      return { success: true, data: {}, meta: {} };
    }

    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });

    this.logger.log(`Session invalidated → ${sessionId}`);

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // ASSIGN ROLE
  // -----------------------------
  async assignRole(userId: string, roleId: string) {
    this.logger.log(`Assigning role ${roleId} → user ${userId}`);

    const rel = await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
      },
      update: {},
      create: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
    });

    this.logger.log(`Role assigned successfully → ${roleId} -> ${userId}`);

    return { success: true, data: rel, meta: {} };
  }
}
