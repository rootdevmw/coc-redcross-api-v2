import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const sessionId = req.cookies?.session_id;

    this.logger.log(`Auth attempt from IP: ${req.ip}`);
    this.logger.log(`Guard triggered for ${req.url}`);
    this.logger.log(`Cookies: ${JSON.stringify(req.cookies)}`);
    if (!sessionId) {
      this.logger.warn('No session_id cookie found');
      throw new UnauthorizedException('No session');
    }

    this.logger.log(`Session ID received: ${sessionId}`);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });

    if (!session) {
      this.logger.warn(`Session not found for ID: ${sessionId}`);
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expiresAt < new Date()) {
      this.logger.warn(`Session expired for user: ${session.user.email}`);
      throw new UnauthorizedException('Invalid session');
    }

    this.logger.log(
      `Authenticated user: ${session.user.email} | Roles: ${session.user.roles
        .map((r) => r.role.name)
        .join(', ')}`,
    );

    req.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map((r) => r.role.name),
    };

    return true;
  }
}
