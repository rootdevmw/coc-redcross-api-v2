import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma/prisma.service';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const sessionId = req.cookies?.session_id;

    this.logger.log(`Auth attempt from IP: ${req.ip}`);
    this.logger.log(`Guard triggered for ${req.url}`);

    if (!sessionId) {
      this.logger.warn('No session_id cookie found');
      throw new UnauthorizedException('No session');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
            member: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      this.logger.warn(`Invalid or expired session`);
      throw new UnauthorizedException('Invalid session');
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map((r) => r.role.name),
      member: {
        id: session.user.member?.id,
        firstName: session.user.member?.firstName,
        lastName: session.user.member?.lastName,
        prefix: session.user.member?.prefix,
      },
    };

    return true;
  }
}
