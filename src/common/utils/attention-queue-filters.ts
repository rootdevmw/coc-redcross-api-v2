import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

export type AttentionQueueQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
  urgent?: unknown;
  from?: unknown;
  to?: unknown;
  sort?: unknown;
};
function text(value: unknown) {
  if (value === undefined) return '';
  if (typeof value !== 'string')
    throw new BadRequestException('Filter values must be text.');
  return value.trim();
}
function boundary(value: unknown, end = false) {
  const day = text(value);
  if (!day) return undefined;
  const parsed = new Date(day + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  )
    throw new BadRequestException('Choose a valid calendar date.');
  return new Date(
    new Date(day + 'T00:00:00+02:00').getTime() + (end ? 86400000 - 1 : 0),
  );
}
export function attentionQueueFilters(
  kind: 'prayers' | 'visitors',
  query: AttentionQueueQuery,
) {
  const search = text(query.search);
  if (search.length > 200)
    throw new BadRequestException('Keep search terms within 200 characters.');
  const status = text(query.status) || 'open';
  const statuses =
    kind === 'prayers'
      ? ['open', 'all', 'PENDING', 'REVIEWED', 'PRAYED_FOR']
      : ['open', 'all', 'PENDING', 'CONFIRMED', 'COMPLETED'];
  if (!statuses.includes(status))
    throw new BadRequestException('Choose a valid queue status.');
  const urgent = text(query.urgent);
  if (urgent && (kind !== 'prayers' || !['true', 'false'].includes(urgent)))
    throw new BadRequestException('Choose a valid urgency filter.');
  const sort = text(query.sort) || (kind === 'prayers' ? 'priority' : 'oldest');
  if (
    !(
      kind === 'prayers'
        ? ['priority', 'oldest', 'newest']
        : ['oldest', 'newest']
    ).includes(sort)
  )
    throw new BadRequestException('Choose a valid queue order.');
  const gte = boundary(query.from);
  const lte = boundary(query.to, true);
  if (gte && lte && gte > lte)
    throw new BadRequestException('The end date must follow the start date.');
  return {
    search,
    status,
    urgent,
    sort,
    date: gte || lte ? { gte, lte } : undefined,
  };
}
export function prayerQueueWhere(
  query: AttentionQueueQuery,
): Prisma.PrayerRequestWhereInput {
  const filters = attentionQueueFilters('prayers', query);
  return {
    ...(filters.status === 'open'
      ? { status: { in: ['PENDING', 'REVIEWED'] } }
      : filters.status === 'all'
        ? {}
        : { status: filters.status as 'PENDING' | 'REVIEWED' | 'PRAYED_FOR' }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search } },
        { prayerFor: { contains: filters.search } },
      ],
    }),
    ...(filters.urgent && { isUrgent: filters.urgent === 'true' }),
    ...(filters.date && { createdAt: filters.date }),
  };
}
export function visitorQueueWhere(
  query: AttentionQueueQuery,
): Prisma.VisitorWhereInput {
  const filters = attentionQueueFilters('visitors', query);
  return {
    ...(filters.status === 'all'
      ? {}
      : {
          status:
            filters.status === 'open'
              ? 'PENDING'
              : (filters.status as 'PENDING' | 'CONFIRMED' | 'COMPLETED'),
        }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search } },
        { phone: { contains: filters.search } },
        { email: { contains: filters.search } },
      ],
    }),
    ...(filters.date && { visitDate: filters.date }),
  };
}
