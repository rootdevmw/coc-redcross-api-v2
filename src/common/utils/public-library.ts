import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { publicGroupIdentifier, publicGroupQuery } from './public-groups';

export type PublicLibraryQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  period?: unknown;
};
const streamSelect = {
  id: true,
  slug: true,
  title: true,
  isLive: true,
  startsAt: true,
  endsAt: true,
  platforms: {
    where: { platform: { deletedAt: null } },
    orderBy: { platformId: 'asc' },
    select: { platform: { select: { id: true, name: true, url: true } } },
  },
} satisfies Prisma.StreamSelect;
const publicationSelect = {
  id: true,
  title: true,
  description: true,
  fileUrl: true,
  publishedAt: true,
} satisfies Prisma.PublicationSelect;
function activeBroadcast(now: Date): Prisma.StreamWhereInput {
  return {
    deletedAt: null,
    isLive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}
function visibleStream(
  stream: Prisma.StreamGetPayload<{ select: typeof streamSelect }>,
) {
  return {
    ...stream,
    platforms: stream.platforms.map(({ platform }) => platform),
  };
}
export async function listPublicBroadcasts(
  db: PrismaService,
  query: PublicLibraryQuery = {},
  now = new Date(),
) {
  const { page, limit, search } = publicGroupQuery(query);
  const period = query.period ?? 'upcoming';
  if (period !== 'upcoming' && period !== 'past')
    throw new BadRequestException('Choose upcoming or past broadcasts.');
  const where: Prisma.StreamWhereInput = {
    deletedAt: null,
    ...(search && { title: { contains: search } }),
    ...(period === 'past'
      ? {
          OR: [
            { endsAt: { lte: now } },
            { isLive: false, startsAt: { lte: now } },
          ],
        }
      : { OR: [{ startsAt: { gt: now } }, activeBroadcast(now)] }),
  };
  const direction = period === 'past' ? 'desc' : 'asc';
  const [rows, total] = await Promise.all([
    db.stream.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ startsAt: direction }, { id: direction }],
      select: streamSelect,
    }),
    db.stream.count({ where }),
  ]);
  return {
    success: true,
    data: rows.map(visibleStream),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function readPublicBroadcast(db: PrismaService, address: string) {
  const { slug, legacyId } = publicGroupIdentifier(address);
  let row = await db.stream.findFirst({
    where: { slug, deletedAt: null },
    select: streamSelect,
  });
  if (!row && legacyId !== null)
    row = await db.stream.findFirst({
      where: { id: legacyId, deletedAt: null },
      select: streamSelect,
    });
  if (!row) throw new NotFoundException('Broadcast not found.');
  return { success: true, data: visibleStream(row), meta: {} };
}
export async function readLiveBroadcast(db: PrismaService, now = new Date()) {
  const row = await db.stream.findFirst({
    where: activeBroadcast(now),
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    select: streamSelect,
  });
  return { success: true, data: row ? visibleStream(row) : null, meta: {} };
}
export async function publicBroadcastPlatforms(db: PrismaService) {
  return {
    success: true,
    data: await db.platform.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, url: true },
    }),
  };
}
export async function listPublicDocuments(
  db: PrismaService,
  query: PublicLibraryQuery = {},
  now = new Date(),
) {
  const { page, limit, search } = publicGroupQuery(query);
  const where: Prisma.PublicationWhereInput = {
    deletedAt: null,
    publishedAt: { not: null, lte: now },
    ...(search && {
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
      ],
    }),
  };
  const [data, total] = await Promise.all([
    db.publication.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: publicationSelect,
    }),
    db.publication.count({ where }),
  ]);
  return {
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function readPublicDocument(
  db: PrismaService,
  address: string,
  now = new Date(),
) {
  const { legacyId } = publicGroupIdentifier(address);
  if (legacyId === null)
    throw new BadRequestException('Choose a valid publication.');
  const row = await db.publication.findFirst({
    where: {
      id: legacyId,
      deletedAt: null,
      publishedAt: { not: null, lte: now },
    },
    select: publicationSelect,
  });
  if (!row) throw new NotFoundException('Publication not found.');
  return { success: true, data: row, meta: {} };
}
