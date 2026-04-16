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
      throw new UnauthorizedException('Email already in use');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
      },
    });

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
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException();

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
      return {
        success: true,
        data: {},
        meta: {},
      };
    }

    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });

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
    const rel = await this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
      },
      update: {},
      create: { userId: toBigInt(userId), roleId: toBigInt(roleId) },
    });

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
