import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: {
    action: string;
    entity: string;
    entityId?: string;
    before?: any;
    after?: any;
    userId?: bigint;
    ipAddress?: string;
    userAgent?: string;
  }) {
    this.logger.log(
      `${params.action} on ${params.entity} (${params.entityId}) by user ${params.userId}`,
    );

    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId?.toString(),
        before: params.before,
        after: params.after,
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }
}
