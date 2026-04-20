import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { toBigInt } from 'src/common/utils/to-bigint';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config/dist/config.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // -----------------------------
  // REGISTER
  // -----------------------------
  async register(dto: any) {
    this.logger.log(`Registering user: ${dto.email}`);

    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existing) {
      this.logger.log(`Registration failed: ${dto.email} already in use`);
      throw new UnauthorizedException('Email already in use');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
      },
    });

    this.logger.log(`User registered successfully: ${dto.email}`);

    const { password, ...safeUser } = user;

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }

  // -----------------------------
  // LOGIN
  // -----------------------------
  async login(dto: any) {
    this.logger.log(`Login attempt for user: ${dto?.email}`);

    if (!dto || !dto.email || !dto.password) {
      this.logger.log(`Login failed: missing email or password in dto`);
      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });

    this.logger.log(
      `User lookup result for ${dto.email}: ${user ? 'found' : 'not found'}`,
    );
    if (!user) {
      this.logger.log(`Login failed: user not found for ${dto.email}`);
      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      this.logger.log(`Login failed: invalid password for ${dto.email}`);
      throw new UnauthorizedException();
    }

    const sessionId = this.generateSessionId();

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + Number(this.config.get<string>('COOKIE_MAX_AGE')),
        ),
      },
    });

    this.logger.log(`User logged in successfully: ${dto.email}`);

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

  async logout(sessionId?: string) {
    this.logger.log(`Logout attempt`);

    if (!sessionId) {
      this.logger.log(`Logout skipped: no session ID provided`);
      return {
        success: true,
        data: {},
        meta: {},
      };
    }

    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });

    this.logger.log(`Session invalidated: ${sessionId}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN ROLE
  // -----------------------------
  async assignRole(userId: string, roleId: string) {
    this.logger.log(`Assigning role ${roleId} to user ${userId}`);

    const rel = await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
      },
      update: {},
      create: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
    });

    this.logger.log(`Role assigned: ${roleId} -> ${userId}`);

    return {
      success: true,
      data: rel,
      meta: {},
    };
  }

  private generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }
}
