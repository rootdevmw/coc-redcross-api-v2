import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { contentListWhere } from '../../common/utils/editorial-list-filters';

// Public readers need attribution, not the author's personal/member record.
export const publicMessageSelect = {
  id: true,
  title: true,
  slug: true,
  body: true,
  status: true,
  createdAt: true,
  publishedAt: true,
  type: { select: { id: true, name: true } },
  author: { select: { id: true, firstName: true, lastName: true } },
  tags: {
    where: { tag: { deletedAt: null } },
    select: { tag: { select: { id: true, name: true } } },
  },
  scriptures: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      book: true,
      chapter: true,
      verseFrom: true,
      verseTo: true,
      version: true,
    },
  },
} satisfies Prisma.ContentSelect;

type PublicMessageQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  typeId?: string;
  tags?: string;
};
function text(value: unknown, maximum: number) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > maximum)
    throw new BadRequestException('Choose valid message filters.');
  return value.trim();
}
function positive(value: unknown, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d*$/.test(String(value))
  )
    throw new BadRequestException('Choose a valid message page and limit.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum)
    throw new BadRequestException('Choose a valid message page and limit.');
  return parsed;
}
export function publicMessageQuery(query: PublicMessageQuery) {
  const search = text(query.search, 200),
    typeId = text(query.typeId, 19),
    tag = text(query.tags, 191);
  if (
    typeId &&
    (!/^[1-9]\d*$/.test(typeId) || BigInt(typeId) > 9223372036854775807n)
  )
    throw new BadRequestException('Choose a valid message type.');
  return {
    page: positive(query.page, 1, 1000000),
    limit: positive(query.limit, 10, 50),
    where: {
      ...contentListWhere({ search, typeId }, true),
      ...(tag && { tags: { some: { tag: { name: tag, deletedAt: null } } } }),
    },
  };
}

export function publicMessageIdentifier(value: string) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 300 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException('Choose a valid message address.');
  const legacyId =
    /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
      ? BigInt(value)
      : null;
  return { slug: value, legacyId };
}
