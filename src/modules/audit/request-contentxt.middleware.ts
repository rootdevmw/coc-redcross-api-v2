// request-context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RequestContextService } from './request-contenxt.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private ctx: RequestContextService,
    private prisma: PrismaService,
  ) {}

  async use(req: any, res: any, next: () => void) {
    console.log('middleware firing......................');
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return this.ctx.run({}, next); // ← next called INSIDE run
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: { include: { member: true } },
      },
    });

    const memberId = session?.user?.member?.id;
    const userId = memberId ? BigInt(memberId) : undefined;

    console.log('middleware resolved userId:', userId);

    this.ctx.run({ userId }, next); // ← next called INSIDE run
  }
}
