import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { programListWhere } from './schedule-list-filters';

export type PublicGroupKind = 'ministry' | 'homecell';
export type PublicGroupQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
};
const leaderSelect = {
  id: true,
  firstName: true,
  lastName: true,
  prefix: true,
  imageUrl: true,
  deletedAt: true,
  bio: { select: { id: true, bio: true } },
} satisfies Prisma.MemberSelect;
const publicMemberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  prefix: true,
} satisfies Prisma.MemberSelect;
const ministrySelect = {
  id: true,
  name: true,
  slug: true,
  purpose: true,
  description: true,
  leader: { select: leaderSelect },
  overseer: { select: leaderSelect },
} satisfies Prisma.MinistrySelect;
const homecellSelect = {
  id: true,
  name: true,
  slug: true,
  location: true,
  leader: { select: leaderSelect },
  overseer: { select: leaderSelect },
} satisfies Prisma.HomecellSelect;
function programSelect(now: Date, take: number) {
  const day = new Date(now.getTime() + 7200000).toISOString().slice(0, 10);
  return {
    where: programListWhere({ fromDate: day }),
    orderBy: [{ date: 'asc' as const }, { id: 'asc' as const }],
    take,
    select: {
      id: true,
      slug: true,
      date: true,
      location: true,
      type: { select: { name: true } },
    },
  };
}
function visibleLeader<T extends { deletedAt: Date | null }>(person: T | null) {
  if (!person || person.deletedAt) return null;
  const { deletedAt, ...profile } = person;
  void deletedAt;
  return profile;
}
function visibleGroup<
  T extends {
    leader: { deletedAt: Date | null } | null;
    overseer: { deletedAt: Date | null } | null;
  },
>(group: T) {
  return {
    ...group,
    leader: visibleLeader(group.leader),
    overseer: visibleLeader(group.overseer),
  };
}
export function publicGroupQuery(query: PublicGroupQuery = {}) {
  function number(value: unknown, fallback: number, maximum: number) {
    if (value === undefined) return fallback;
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      !/^[1-9]\d*$/.test(String(value))
    )
      throw new BadRequestException('Choose a valid group page and limit.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > maximum)
      throw new BadRequestException('Choose a valid group page and limit.');
    return parsed;
  }
  if (
    query.search !== undefined &&
    (typeof query.search !== 'string' || query.search.trim().length > 200)
  )
    throw new BadRequestException(
      'Use a single group search of up to 200 characters.',
    );
  return {
    page: number(query.page, 1, 1000000),
    limit: number(query.limit, 24, 50),
    search: typeof query.search === 'string' ? query.search.trim() : '',
  };
}
export async function listPublicGroups(
  db: PrismaService,
  kind: PublicGroupKind,
  query: PublicGroupQuery = {},
  now = new Date(),
) {
  const { page, limit, search } = publicGroupQuery(query);
  const common = {
    skip: (page - 1) * limit,
    take: limit,
    orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
  };
  if (kind === 'ministry') {
    const where = {
      deletedAt: null,
      ...(search && {
        OR: [{ name: { contains: search } }, { purpose: { contains: search } }],
      }),
    };
    const [rows, total] = await Promise.all([
      db.ministry.findMany({ ...common, where, select: ministrySelect }),
      db.ministry.count({ where }),
    ]);
    return {
      success: true,
      data: rows.map(visibleGroup),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  const where = {
    deletedAt: null,
    ...(search && {
      OR: [{ name: { contains: search } }, { location: { contains: search } }],
    }),
  };
  const [rows, total] = await Promise.all([
    db.homecell.findMany({
      ...common,
      where,
      select: { ...homecellSelect, programs: programSelect(now, 1) },
    }),
    db.homecell.count({ where }),
  ]);
  return {
    success: true,
    data: rows.map(visibleGroup),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export function publicGroupIdentifier(value: string) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 300 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException('Choose a valid group address.');
  return {
    slug: value,
    legacyId:
      /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
        ? BigInt(value)
        : null,
  };
}
export async function readPublicGroup(
  db: PrismaService,
  kind: PublicGroupKind,
  address: string,
  now = new Date(),
) {
  const { slug, legacyId } = publicGroupIdentifier(address);
  if (kind === 'ministry') {
    const select = {
      ...ministrySelect,
      events: {
        where: { event: { deletedAt: null, endTime: { gt: now } } },
        orderBy: [
          { event: { startTime: 'asc' as const } },
          { eventId: 'asc' as const },
        ],
        take: 5,
        select: {
          event: {
            select: {
              id: true,
              slug: true,
              title: true,
              startTime: true,
              endTime: true,
              location: true,
            },
          },
        },
      },
    };
    let group = await db.ministry.findFirst({
      where: { slug, deletedAt: null },
      select,
    });
    if (!group && legacyId !== null)
      group = await db.ministry.findFirst({
        where: { id: legacyId, deletedAt: null },
        select,
      });
    if (!group) throw new NotFoundException('Ministry not found');
    return {
      success: true,
      data: {
        ...visibleGroup(group),
        events: group.events.map(({ event }) => event),
      },
      meta: {},
    };
  }
  const select = { ...homecellSelect, programs: programSelect(now, 5) };
  let group = await db.homecell.findFirst({
    where: { slug, deletedAt: null },
    select,
  });
  if (!group && legacyId !== null)
    group = await db.homecell.findFirst({
      where: { id: legacyId, deletedAt: null },
      select,
    });
  if (!group) throw new NotFoundException('Homecell not found');
  return { success: true, data: visibleGroup(group), meta: {} };
}
export async function publicHomecellMembers(db: PrismaService, id: string) {
  const { legacyId } = publicGroupIdentifier(id);
  if (legacyId === null)
    throw new BadRequestException('Choose a valid homecell.');
  const homecell = await db.homecell.findFirst({
    where: { id: legacyId, deletedAt: null },
    select: { id: true },
  });
  if (!homecell) throw new NotFoundException('Homecell not found');
  const data = await db.member.findMany({
    where: { homecellId: legacyId, deletedAt: null },
    orderBy: [{ firstName: 'asc' }, { id: 'asc' }],
    select: publicMemberSelect,
  });
  return { success: true, data, meta: {} };
}
