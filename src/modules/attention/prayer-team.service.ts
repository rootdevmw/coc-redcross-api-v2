import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { accessListPagination } from '../../common/utils/access-list-filters';
import {
  prayerNotificationUser,
  prayerTeamAccount,
  prayerTeamEligibility,
  prayerTeamId,
  prayerTeamSearch,
  prayerTeamSelect,
  prayerTeamUserSelect,
  type PrayerTeamQuery,
} from '../../common/utils/prayer-team';

@Injectable()
export class PrayerTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async roster(query: PrayerTeamQuery) {
    const { page, limit } = accessListPagination(query);
    const terms = prayerTeamSearch(query);
    const where: Prisma.PrayerWarriorWhereInput = terms.length
      ? { user: { is: { AND: terms } } }
      : {};
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.prayerWarrior.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
          select: prayerTeamSelect,
        }),
        this.prisma.prayerWarrior.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map((row) => ({
        ...prayerTeamAccount(row.user),
        createdAt: row.createdAt,
        eligibility: prayerTeamEligibility(row.user),
      })),
      meta: { page, limit, total },
    };
  }

  async eligible(query: PrayerTeamQuery) {
    const { page, limit } = accessListPagination(query);
    const terms = prayerTeamSearch(query);
    const where: Prisma.UserWhereInput = {
      ...prayerNotificationUser,
      prayerWarriors: { none: {} },
      ...(terms.length && { AND: terms }),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ email: 'asc' }, { id: 'asc' }],
          select: prayerTeamUserSelect,
        }),
        this.prisma.user.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { data: rows.map(prayerTeamAccount), meta: { page, limit, total } };
  }

  async legacyRoster() {
    const rows = await this.prisma.prayerWarrior.findMany({
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      select: prayerTeamSelect,
    });
    return {
      data: rows.map((row) => {
        const account = prayerTeamAccount(row.user);
        return {
          userId: row.userId,
          createdAt: row.createdAt,
          user: {
            id: account.userId,
            email: account.email,
            member: account.member,
          },
        };
      }),
      meta: {},
    };
  }

  async add(value: unknown, actorId: bigint) {
    const userId = prayerTeamId(value);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: prayerTeamUserSelect,
    });
    if (!user) throw new NotFoundException('Account not found.');
    if (prayerTeamEligibility(user) !== 'eligible')
      throw new BadRequestException(
        'An active linked directory profile and email are required.',
      );
    let added: { userId: bigint; createdAt: Date };
    try {
      added = await this.prisma.prayerWarrior.create({
        data: { userId },
        select: { userId: true, createdAt: true },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'This account is already on the prayer team.',
        );
      throw error;
    }
    await this.audit.log({
      action: 'PRAYER_WARRIOR_ADDED',
      entity: 'PrayerWarrior',
      entityId: userId.toString(),
      userId: actorId,
      after: added,
    });
    return { success: true, data: added };
  }

  async remove(value: unknown, actorId: bigint) {
    const userId = prayerTeamId(value);
    const result = await this.prisma.prayerWarrior.deleteMany({
      where: { userId },
    });
    if (result.count)
      await this.audit.log({
        action: 'PRAYER_WARRIOR_REMOVED',
        entity: 'PrayerWarrior',
        entityId: userId.toString(),
        userId: actorId,
      });
    return { success: true, data: { userId, removed: result.count > 0 } };
  }
}
