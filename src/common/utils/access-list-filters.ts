import { BadRequestException } from '@nestjs/common';

export type AccessListQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  role?: unknown;
  linked?: unknown;
  action?: unknown;
  actionSearch?: unknown;
  actorId?: unknown;
  from?: unknown;
  to?: unknown;
};

function text(value: unknown) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') {
    throw new BadRequestException('Filter values must be text.');
  }
  return value.trim();
}

export function accessListPagination(query: AccessListQuery) {
  for (const value of [query.page, query.limit]) {
    if (
      value !== undefined &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      throw new BadRequestException(
        'Page and page size must be single numbers.',
      );
    }
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    throw new BadRequestException(
      'Choose a valid page and a page size from 1 to 100.',
    );
  }
  return { page, limit };
}

export function userListWhere(query: AccessListQuery) {
  const terms = text(query.search).split(/\s+/).filter(Boolean);
  const role = text(query.role).toUpperCase();
  const linked = text(query.linked);
  if (linked && linked !== 'true' && linked !== 'false') {
    throw new BadRequestException('Choose a valid profile-link filter.');
  }
  return {
    deletedAt: null,
    ...(terms.length && {
      AND: terms.map((term) => ({
        OR: [
          { email: { contains: term } },
          { member: { firstName: { contains: term } } },
          { member: { lastName: { contains: term } } },
        ],
      })),
    }),
    ...(role && { roles: { some: { role: { name: role } } } }),
    ...(linked === 'true' && { member: { isNot: null } }),
    ...(linked === 'false' && { member: { is: null } }),
  };
}

export function roleListWhere(query: AccessListQuery) {
  const search = text(query.search);
  return { deletedAt: null, ...(search && { name: { contains: search } }) };
}

// Both spellings have appeared in historical links. The writer uses compact names.
const entityNames = [
  'UserRole',
  'AuditLog',
  'MemberBio',
  'MemberMinistry',
  'ContentMedia',
  'ContentTag',
  'ContentType',
  'EventMedia',
  'EventMinistry',
  'EventType',
  'ProgramItem',
  'ProgramTemplate',
  'ProgramTemplateItem',
  'ProgramType',
  'StreamPlatform',
  'ScriptureRef',
  'PrayerRequest',
  'AttentionAction',
  'PrayerWarrior',
];
export function auditEntityWhere(value: string) {
  const compact = value
    .trim()
    .replace(/[_\-\s]/g, '')
    .toUpperCase();
  const name = entityNames.find((item) => item.toUpperCase() === compact);
  const aliases = name
    ? [compact, name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()]
    : [compact];
  return aliases.length > 1 ? { in: aliases } : compact;
}

function day(value: unknown, end = false) {
  const selected = text(value);
  if (!selected) return undefined;
  const parsed = new Date(selected + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(selected) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== selected
  ) {
    throw new BadRequestException('Choose a valid calendar date.');
  }
  return new Date(
    new Date(selected + 'T00:00:00+02:00').getTime() + (end ? 86400000 - 1 : 0),
  );
}

export function auditListWhere(entity: string, query: AccessListQuery) {
  const search = text(query.search);
  const normalize = (value: unknown) =>
    text(value)
      .replace(/[\s-]+/g, '_')
      .toUpperCase();
  const action = normalize(query.action);
  const actionSearch = normalize(query.actionSearch);
  const actor = text(query.actorId);
  if (actor && !/^[1-9]\d*$/.test(actor)) {
    throw new BadRequestException('Choose a valid actor account ID.');
  }
  const gte = day(query.from);
  const lte = day(query.to, true);
  if (gte && lte && gte > lte) {
    throw new BadRequestException('The end date must follow the start date.');
  }
  return {
    entity: auditEntityWhere(entity),
    ...(search && { entityId: { contains: search } }),
    ...(action
      ? { action }
      : actionSearch
        ? { action: { contains: actionSearch } }
        : {}),
    ...(actor && { userId: BigInt(actor) }),
    ...((gte || lte) && { createdAt: { gte, lte } }),
  };
}
