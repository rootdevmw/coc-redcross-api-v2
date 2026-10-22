import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { publicGroupIdentifier, publicGroupQuery } from './public-groups';
import { eventListWhere } from './schedule-list-filters';

export type PublicEventQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  period?: unknown;
  startDate?: unknown;
};
const select = {
  id: true,
  slug: true,
  title: true,
  description: true,
  location: true,
  startTime: true,
  endTime: true,
  type: { select: { id: true, name: true, deletedAt: true } },
  ministries: {
    where: { ministry: { deletedAt: null } },
    select: { ministry: { select: { id: true, name: true, slug: true } } },
    orderBy: { ministryId: 'asc' },
  },
} satisfies Prisma.EventSelect;
type SelectedEvent = Prisma.EventGetPayload<{ select: typeof select }>;
function visible(event: SelectedEvent) {
  return {
    ...event,
    type: event.type.deletedAt
      ? null
      : { id: event.type.id, name: event.type.name },
    ministries: event.ministries.map(({ ministry }) => ministry),
  };
}
export function publicEventQuery(query: PublicEventQuery = {}) {
  const parsed = publicGroupQuery(query);
  const period = query.period ?? 'upcoming';
  if (period !== 'upcoming' && period !== 'past')
    throw new BadRequestException('Choose upcoming or past events.');
  let startDate: string | undefined;
  if (query.startDate !== undefined) {
    if (typeof query.startDate !== 'string' || !query.startDate.trim())
      throw new BadRequestException('Choose a valid event start date.');
    startDate = query.startDate;
    // Retain the existing exact timestamp / Malawi calendar-day boundary.
    eventListWhere({ startDate });
  }
  return { ...parsed, period, startDate };
}
export async function listPublicEvents(
  db: PrismaService,
  query: PublicEventQuery = {},
  now = new Date(),
) {
  const { page, limit, search, period, startDate } = publicEventQuery(query);
  const where = {
    ...eventListWhere({ startDate }),
    endTime: period === 'past' ? { lte: now } : { gt: now },
    ...(search && {
      OR: [{ title: { contains: search } }, { location: { contains: search } }],
    }),
  };
  const direction = period === 'past' ? 'desc' : 'asc';
  const [rows, total] = await Promise.all([
    db.event.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ startTime: direction }, { id: direction }],
      select,
    }),
    db.event.count({ where }),
  ]);
  return {
    success: true,
    data: rows.map(visible),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function readPublicEvent(db: PrismaService, address: string) {
  const { slug, legacyId } = publicGroupIdentifier(address);
  let event = await db.event.findFirst({
    where: { slug, deletedAt: null },
    select,
  });
  if (!event && legacyId !== null)
    event = await db.event.findFirst({
      where: { id: legacyId, deletedAt: null },
      select,
    });
  if (!event) throw new NotFoundException('Event not found.');
  return { success: true, data: visible(event), meta: {} };
}

export async function listPublicEventTypes(db: PrismaService) {
  const data = await db.eventType.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });
  return { success: true, data };
}
