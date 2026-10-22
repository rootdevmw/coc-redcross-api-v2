import { BadRequestException } from '@nestjs/common';

type EditorialQuery = {
  search?: string;
  status?: string;
  typeId?: string;
  platformId?: string;
  isLive?: string;
};

function text(value?: string) {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new BadRequestException('Filter values must be text.');
  }
  return value.trim();
}

function id(value?: string) {
  const selected = text(value);
  if (!selected) return undefined;
  if (!/^[1-9]\d*$/.test(selected)) {
    throw new BadRequestException('Choose a valid type or platform.');
  }
  return BigInt(selected);
}

function status(value?: string): 'Draft' | 'Published' | undefined {
  const selected = text(value);
  if (!selected) return undefined;
  if (selected !== 'Draft' && selected !== 'Published') {
    throw new BadRequestException('Choose Draft or Published.');
  }
  return selected;
}

export function contentListWhere(query: EditorialQuery, publicOnly = false) {
  const search = text(query.search);
  const typeId = id(query.typeId);
  const selected = publicOnly ? 'Published' : status(query.status);
  return {
    deletedAt: null,
    ...(selected && { status: selected }),
    ...(typeId !== undefined && { typeId }),
    ...(search && {
      OR: [{ title: { contains: search } }, { body: { contains: search } }],
    }),
  };
}

export function publicationListWhere(
  query: EditorialQuery,
  scope: 'public' | 'management' = 'public',
) {
  const search = text(query.search);
  // Public visibility is a server argument, never a query-string choice.
  const selected = scope === 'management' ? status(query.status) : 'Published';
  return {
    deletedAt: null,
    ...(search && { title: { contains: search } }),
    ...(selected === 'Draft' ? { publishedAt: null } : {}),
    ...(selected === 'Published' ? { publishedAt: { not: null } } : {}),
  };
}

export function streamListWhere(query: EditorialQuery) {
  const search = text(query.search);
  const platformId = id(query.platformId);
  const live = text(query.isLive);
  if (live && live !== 'true' && live !== 'false') {
    throw new BadRequestException('Choose a valid live selection.');
  }
  return {
    deletedAt: null,
    ...(search && { title: { contains: search } }),
    ...(live && { isLive: live === 'true' }),
    ...(platformId !== undefined && {
      platforms: { some: { platformId, platform: { deletedAt: null } } },
    }),
  };
}
