import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { publicGroupIdentifier, publicGroupQuery } from './public-groups';
import { programListWhere } from './schedule-list-filters';
import { programEditorDate } from './program-editor';

export type PublicProgramQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  period?: unknown;
  typeId?: unknown;
  homecellId?: unknown;
  date?: unknown;
  fromDate?: unknown;
};
const select = {
  id: true,
  slug: true,
  date: true,
  location: true,
  type: { select: { id: true, name: true, deletedAt: true } },
  homecell: { select: { id: true, slug: true, name: true, deletedAt: true } },
  items: {
    where: { deletedAt: null },
    orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      time: true,
      sequence: true,
      responsible: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          prefix: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ProgramSelect;
type SelectedProgram = Prisma.ProgramGetPayload<{ select: typeof select }>;
function visible(program: SelectedProgram) {
  return {
    ...program,
    type: program.type.deletedAt
      ? null
      : { id: program.type.id, name: program.type.name },
    homecell:
      !program.homecell || program.homecell.deletedAt
        ? null
        : {
            id: program.homecell.id,
            name: program.homecell.name,
            slug: program.homecell.slug,
          },
    items: program.items.map((item) => ({
      ...item,
      responsible:
        !item.responsible || item.responsible.deletedAt
          ? null
          : {
              id: item.responsible.id,
              firstName: item.responsible.firstName,
              lastName: item.responsible.lastName,
              prefix: item.responsible.prefix,
            },
    })),
  };
}
export function publicProgramQuery(query: PublicProgramQuery = {}) {
  const parsed = publicGroupQuery(query);
  const period = query.period ?? 'upcoming';
  if (period !== 'upcoming' && period !== 'past')
    throw new BadRequestException('Choose upcoming or past programs.');
  function id(value: unknown) {
    if (value === undefined) return undefined;
    if (
      typeof value !== 'string' ||
      publicGroupIdentifier(value).legacyId === null
    )
      throw new BadRequestException('Choose a valid program type or homecell.');
    return value;
  }
  function date(value: unknown) {
    if (value === undefined) return undefined;
    programEditorDate(value);
    return value as string;
  }
  return {
    ...parsed,
    period,
    typeId: id(query.typeId),
    homecellId: id(query.homecellId),
    date: date(query.date),
    fromDate: date(query.fromDate),
    explicitPeriod: query.period !== undefined,
  };
}
export async function listPublicPrograms(
  db: PrismaService,
  query: PublicProgramQuery = {},
  now = new Date(),
) {
  const {
    page,
    limit,
    search,
    period,
    typeId,
    homecellId,
    date,
    fromDate,
    explicitPeriod,
  } = publicProgramQuery(query);
  const day = new Date(now.getTime() + 7200000).toISOString().slice(0, 10);
  const today = programEditorDate(day);
  const periodDate = period === 'past' ? { lt: today } : { gte: today };
  const where: Prisma.ProgramWhereInput = {
    ...programListWhere({ typeId, homecellId, date, fromDate }),
    ...(!date && !fromDate && { date: periodDate }),
    ...((date || fromDate) &&
      explicitPeriod && { AND: [{ date: periodDate }] }),
    ...(typeId && { type: { deletedAt: null } }),
    ...(homecellId && { homecell: { deletedAt: null } }),
    ...(search && {
      OR: [
        { location: { contains: search } },
        { type: { deletedAt: null, name: { contains: search } } },
        { homecell: { deletedAt: null, name: { contains: search } } },
      ],
    }),
  };
  const direction = period === 'past' ? 'desc' : 'asc';
  const [rows, total] = await Promise.all([
    db.program.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ date: direction }, { id: direction }],
      select,
    }),
    db.program.count({ where }),
  ]);
  return {
    success: true,
    data: rows.map(visible),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function readPublicProgram(db: PrismaService, address: string) {
  const { slug, legacyId } = publicGroupIdentifier(address);
  let program = await db.program.findFirst({
    where: { slug, deletedAt: null },
    select,
  });
  if (!program && legacyId !== null)
    program = await db.program.findFirst({
      where: { id: legacyId, deletedAt: null },
      select,
    });
  if (!program) throw new NotFoundException('Program not found.');
  return { success: true, data: visible(program), meta: {} };
}
export async function listPublicProgramTypes(db: PrismaService) {
  const data = await db.programType.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });
  return { success: true, data, meta: {} };
}
