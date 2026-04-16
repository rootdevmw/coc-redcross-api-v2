import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      throw new UnauthorizedException('No session');
    }

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

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map((r) => r.role.name),
    };

    return true;
  }
}
