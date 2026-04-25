// audit.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { map, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    this.logger.log('AUDIT INTERCEPTOR HIT');
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());

    // Skip if no audit config
    if (!meta) {
      this.logger.log('No audit metadata found, skipping audit');
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const args = context.getArgs();
    const user = request.user;
    this.logger.log('Reached here with meta: ', meta);
    this.logger.log('Reached here with args: ', args);
    this.logger.log('Reached here with user: ', user);
    const id =
      meta.idParamIndex !== undefined ? args[meta.idParamIndex] : undefined;

    let before: any = null;

    // -----------------------------
    // BEFORE STATE
    // -----------------------------
    if (meta.fetchBefore && id) {
      try {
        before = await this.fetchEntity(meta.entity, id);
      } catch (err) {
        this.logger.warn(
          `Audit BEFORE fetch failed for ${meta.entity} (${id})`,
        );
      }
    }
    this.logger.log('Reached here with meta 2: ', meta);
    this.logger.log('Reached here with before: ', before);

    // -----------------------------
    // EXECUTION PIPELINE
    // -----------------------------
    return next.handle().pipe(
      tap((result) => {
        void this.auditService
          .log({
            action: meta.action,
            entity: meta.entity,
            entityId: id ? id.toString() : null,
            before,
            after: result?.data ?? result,
            userId: user?.member?.id ?? null,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          })
          .then(() => {
            this.logger.log(
              `Logged audit action: ${meta.action} on ${meta.entity} (${id}) by user ${user?.member?.id})`,
            );
          })
          .catch((err) => {
            this.logger.error(`AUDIT LOG FAILED for ${meta.entity}`, err);
          });
      }),
    );
  }

  private async fetchEntity(entity: string, id: any) {
    const bigId = toBigIntOptional(id);

    switch (entity) {
      // -----------------------------
      // AUTH & USERS
      // -----------------------------
      case 'User':
        return this.prisma.user.findFirst({
          where: { id: bigId },
          include: {
            roles: { include: { role: true } },
            member: true,
          },
        });

      case 'Role':
        return this.prisma.role.findFirst({
          where: { id: bigId },
        });

      case 'Session':
        return this.prisma.session.findFirst({
          where: { id: id?.toString() },
        });

      // -----------------------------
      // MEMBERS
      // -----------------------------
      case 'Member':
        return this.prisma.member.findFirst({
          where: { id: bigId },
          include: {
            ministries: true,
            homecell: true,
            bio: true,
          },
        });

      case 'MemberBio':
        return this.prisma.memberBio.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // HOMECELLS
      // -----------------------------
      case 'Homecell':
        return this.prisma.homecell.findFirst({
          where: { id: bigId },
          include: {
            leader: true,
            overseer: true,
            members: true,
          },
        });

      // -----------------------------
      // MINISTRIES
      // -----------------------------
      case 'Ministry':
        return this.prisma.ministry.findFirst({
          where: { id: bigId },
          include: {
            members: true,
          },
        });

      // -----------------------------
      // CONTENT SYSTEM
      // -----------------------------
      case 'Content':
        return this.prisma.content.findFirst({
          where: { id: bigId },
          include: {
            type: true,
            author: true,
            tags: { include: { tag: true } },
            scriptures: true,
            contentMedia: { include: { media: true } },
          },
        });

      case 'ContentType':
        return this.prisma.contentType.findFirst({
          where: { id: bigId },
        });

      case 'Media':
        return this.prisma.media.findFirst({
          where: { id: bigId },
        });

      case 'Tag':
        return this.prisma.tag.findFirst({
          where: { id: bigId },
        });

      case 'Series':
        return this.prisma.series.findFirst({
          where: { id: bigId },
        });

      case 'ScriptureRef':
        return this.prisma.scriptureRef.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // ANNOUNCEMENTS
      // -----------------------------
      case 'Announcement':
        return this.prisma.announcement.findFirst({
          where: { id: bigId },
          include: {
            targets: true,
          },
        });

      // -----------------------------
      // EVENTS
      // -----------------------------
      case 'Event':
        return this.prisma.event.findFirst({
          where: { id: bigId },
          include: {
            type: true,
            ministries: {
              include: { ministry: true },
            },
            eventMedia: { include: { media: true } },
          },
        });

      case 'EventType':
        return this.prisma.eventType.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // PROGRAMS
      // -----------------------------
      case 'Program':
        return this.prisma.program.findFirst({
          where: { id: bigId },
          include: {
            items: true,
            homecell: true,
          },
        });

      case 'ProgramTemplate':
        return this.prisma.programTemplate.findFirst({
          where: { id: bigId },
          include: {
            items: true,
          },
        });

      // -----------------------------
      // STREAMING
      // -----------------------------
      case 'Stream':
        return this.prisma.stream.findFirst({
          where: { id: bigId },
          include: {
            platforms: true,
          },
        });

      case 'Platform':
        return this.prisma.platform.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // NEWSLETTER
      // -----------------------------
      case 'Newsletter':
        return this.prisma.newsletter.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // ATTENTION SYSTEM
      // -----------------------------
      case 'PrayerRequest':
        return this.prisma.prayerRequest.findFirst({
          where: { id: bigId },
        });

      case 'Visitor':
        return this.prisma.visitor.findFirst({
          where: { id: bigId },
        });

      case 'AttentionAction':
        return this.prisma.attentionAction.findFirst({
          where: { id: bigId },
        });

      // -----------------------------
      // FALLBACK
      // -----------------------------
      default:
        this.logger.warn(`No audit fetch handler for entity: ${entity}`);
        return null;
    }
  }
}
