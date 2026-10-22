import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../modules/audit/audit.service';
import type { SlugService } from './slugify';
import type { Ministry, Homecell } from '../../generated/prisma/client';
import { accessListPagination } from './access-list-filters';

export type ChurchGroupKind = 'ministry' | 'homecell';
export type LeadershipQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
};
export function groupEditorId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequestException('Choose a valid directory profile.');
  return BigInt(value);
}
export function churchGroupInput(
  kind: ChurchGroupKind,
  input: unknown,
  partial: boolean,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Group details are required.');
  const source = input as Record<string, unknown>;
  const fields: {
    name?: string;
    purpose?: string;
    location?: string;
    description?: string;
    leaderId?: string;
    overseerId?: string;
  } = {};
  for (const key of [
    'name',
    'purpose',
    'location',
    'description',
    'leaderId',
    'overseerId',
  ] as const) {
    if (
      (kind === 'homecell' && ['purpose', 'description'].includes(key)) ||
      (kind === 'ministry' && key === 'location')
    )
      continue;
    const value = source[key];
    if (value === undefined) {
      if (
        !partial &&
        (key === 'name' || (kind === 'ministry' && key === 'purpose'))
      )
        throw new BadRequestException(
          'Name and ministry purpose are required.',
        );
      continue;
    }
    if (typeof value !== 'string')
      throw new BadRequestException('Group fields must be text.');
    fields[key] = key === 'description' ? value : value.trim();
    if (['name', 'purpose'].includes(key) && !fields[key])
      throw new BadRequestException(
        'Name and ministry purpose cannot be blank.',
      );
    if (key === 'description') {
      if (Buffer.byteLength(value, 'utf8') > 65535)
        throw new BadRequestException(
          'The description is too long. Shorten it before saving.',
        );
    } else if (value.length > 191)
      throw new BadRequestException('Keep group fields within 191 characters.');
    if (['leaderId', 'overseerId'].includes(key) && fields[key])
      groupEditorId(fields[key]);
  }
  return fields;
}

export async function leadershipOptions(
  prisma: PrismaService,
  query: LeadershipQuery,
) {
  const { page, limit } = accessListPagination(query);
  if (query.search !== undefined && typeof query.search !== 'string')
    throw new BadRequestException('Search must be a single text value.');
  const search = query.search?.trim() || '';
  if (search.length > 200)
    throw new BadRequestException('Keep search terms within 200 characters.');
  const terms = search.split(/\s+/).filter(Boolean);
  const where = {
    deletedAt: null,
    ...(terms.length && {
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term } },
          { lastName: { contains: term } },
        ],
      })),
    }),
  };
  const [data, total] = await prisma.$transaction(
    [
      prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          prefix: true,
          location: true,
        },
      }),
      prisma.member.count({ where }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return { data, meta: { page, limit, total } };
}

export async function saveChurchGroup(
  prisma: PrismaService,
  audit: AuditService,
  slugify: SlugService,
  kind: ChurchGroupKind,
  input: unknown,
  actorId?: bigint,
  id?: string,
) {
  const fields = churchGroupInput(kind, input, id !== undefined);
  const groupId = id === undefined ? undefined : groupEditorId(id);
  const slug =
    groupId === undefined
      ? await slugify.generateUniqueSlug(fields.name!, kind)
      : undefined;
  if (slug !== undefined && (!slug || slug.length > 191))
    throw new BadRequestException(
      'Choose a name that can form a valid public web address.',
    );
  let result: {
    before: Ministry | Homecell | null;
    after: Ministry | Homecell;
  };
  try {
    result = await prisma.$transaction(async (tx) => {
      const before =
        groupId === undefined
          ? null
          : kind === 'ministry'
            ? await tx.ministry.findFirst({
                where: { id: groupId, deletedAt: null },
              })
            : await tx.homecell.findFirst({
                where: { id: groupId, deletedAt: null },
              });
      if (groupId !== undefined && !before)
        throw new NotFoundException('Group not found.');
      const ids = [
        ...new Set(
          [fields.leaderId, fields.overseerId].filter(
            (value): value is string => !!value,
          ),
        ),
      ].map(groupEditorId);
      if (
        ids.length &&
        (await tx.member.count({
          where: { id: { in: ids }, deletedAt: null },
        })) !== ids.length
      )
        throw new BadRequestException(
          'A selected leadership profile is no longer available. Review your choices.',
        );
      const leaderId =
        fields.leaderId === undefined
          ? before?.leaderId
          : fields.leaderId
            ? groupEditorId(fields.leaderId)
            : null;
      const overseerId =
        fields.overseerId === undefined
          ? before?.overseerId
          : fields.overseerId
            ? groupEditorId(fields.overseerId)
            : null;
      if (
        kind === 'homecell' &&
        leaderId &&
        overseerId &&
        leaderId === overseerId &&
        (fields.leaderId !== undefined ||
          fields.overseerId !== undefined ||
          groupId === undefined)
      )
        throw new BadRequestException(
          'Choose different people for homecell leader and overseer.',
        );
      const assignments = {
        leaderId: fields.leaderId === undefined ? undefined : leaderId,
        overseerId: fields.overseerId === undefined ? undefined : overseerId,
      };
      const after =
        kind === 'ministry'
          ? groupId === undefined
            ? await tx.ministry.create({
                data: {
                  name: fields.name!,
                  purpose: fields.purpose!,
                  description: fields.description,
                  slug: slug!,
                  ...assignments,
                },
              })
            : await tx.ministry.update({
                where: { id: groupId },
                data: {
                  name: fields.name,
                  purpose: fields.purpose,
                  description: fields.description,
                  ...assignments,
                },
              })
          : groupId === undefined
            ? await tx.homecell.create({
                data: {
                  name: fields.name!,
                  location: fields.location,
                  slug: slug!,
                  ...assignments,
                },
              })
            : await tx.homecell.update({
                where: { id: groupId },
                data: {
                  name: fields.name,
                  location: fields.location,
                  ...assignments,
                },
              });
      return { before, after };
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'The public address is already in use. Try another group name.',
      );
    throw error;
  }
  await audit.log({
    action:
      kind.toUpperCase() + (groupId === undefined ? '_CREATED' : '_UPDATED'),
    entity: kind === 'ministry' ? 'Ministry' : 'Homecell',
    entityId: result.after.id.toString(),
    userId: actorId,
    before: result.before ?? undefined,
    after: result.after,
  });
  return { success: true, data: result.after, meta: {} };
}
