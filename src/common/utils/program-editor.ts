import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProgramItem } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../modules/audit/audit.service';
import type { SlugService } from './slugify';
import { groupEditorId } from './church-group-editor';
import { eventTimestamp } from '../../modules/events/event-editor';
type Kind = 'program' | 'template';
type Item = {
  id?: bigint;
  title: string;
  description?: string;
  time?: string;
  responsibleId?: bigint | null;
  sequence: number;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Enter program details.');
  return value as Record<string, unknown>;
}
function text(
  value: unknown,
  label: string,
  required = false,
  description = false,
) {
  if (typeof value !== 'string')
    throw new BadRequestException(`Enter a valid ${label}.`);
  const result = description ? value : value.trim();
  if (
    (required && !result) ||
    (!description && result.length > 191) ||
    (description && Buffer.byteLength(result, 'utf8') > 65535)
  )
    throw new BadRequestException(`Check the ${label}.`);
  return result;
}
export function programEditorDate(value: unknown) {
  if (typeof value !== 'string')
    throw new BadRequestException('Choose a valid program date.');
  let day = value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const date = eventTimestamp(value);
    day = new Date(date.getTime() + 7200000).toISOString().slice(0, 10);
  }
  const date = new Date(day + 'T00:00:00Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new BadRequestException('Choose a valid program date.');
  const result = new Date(date.getTime() - 7200000);
  if (result.getUTCFullYear() < 1000 || result.getUTCFullYear() > 9999)
    throw new BadRequestException(
      'The program date is outside the supported range.',
    );
  return result;
}
export function programEditorInput(
  kind: Kind,
  input: unknown,
  partial: boolean,
) {
  const source = object(input);
  const fields: {
    name?: string;
    date?: Date;
    location?: string;
    typeId?: bigint;
    homecellId?: bigint | null;
    items?: Item[];
  } = {};
  if (kind === 'template' && (!partial || source.name !== undefined))
    fields.name = text(source.name, 'template name', true);
  if (kind === 'program') {
    if (!partial || source.date !== undefined)
      fields.date = programEditorDate(source.date);
    if (source.location !== undefined)
      fields.location = text(source.location, 'location');
  }
  if (!partial || source.typeId !== undefined)
    fields.typeId = groupEditorId(source.typeId);
  if (source.homecellId !== undefined)
    fields.homecellId =
      source.homecellId === '' || source.homecellId === null
        ? null
        : groupEditorId(source.homecellId);
  if (!partial || source.items !== undefined) {
    if (!Array.isArray(source.items))
      throw new BadRequestException('Enter a valid activity list.');
    const ids = new Set<bigint>(),
      times = new Set<string>();
    fields.items = source.items.map((value, index) => {
      const item = object(value);
      const id = item.id === undefined ? undefined : groupEditorId(item.id);
      if (id !== undefined && ids.has(id))
        throw new BadRequestException('An activity is listed more than once.');
      if (id !== undefined) ids.add(id);
      const time =
        item.time === undefined ? undefined : text(item.time, 'activity time');
      const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time || '');
      if (clock) {
        if (+clock[1] > 23 || +clock[2] > 59 || +(clock[3] || 0) > 59)
          throw new BadRequestException('Enter a valid activity clock time.');
        const key =
          clock[1].padStart(2, '0') + ':' + clock[2] + ':' + (clock[3] || '00');
        if (times.has(key))
          throw new BadRequestException(
            'Two activities have the same clock time.',
          );
        times.add(key);
      }
      return {
        id,
        title: text(item.title, 'activity title', true),
        description:
          item.description === undefined
            ? undefined
            : text(item.description, 'description', false, true),
        time,
        sequence: index + 1,
        responsibleId:
          item.responsibleId === undefined
            ? undefined
            : item.responsibleId === '' || item.responsibleId === null
              ? null
              : groupEditorId(item.responsibleId),
      };
    });
  }
  return fields;
}
const relationships = {
  type: true,
  homecell: true,
  items: {
    where: { deletedAt: null },
    include: { responsible: true },
    orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProgramInclude & Prisma.ProgramTemplateInclude;
async function writeEditor(
  tx: Prisma.TransactionClient,
  kind: Kind,
  fields: ReturnType<typeof programEditorInput>,
  id?: bigint,
  slug?: string,
) {
  const before =
    id === undefined
      ? null
      : kind === 'program'
        ? await tx.program.findFirst({
            where: { id, deletedAt: null },
            include: relationships,
          })
        : await tx.programTemplate.findFirst({
            where: { id, deletedAt: null },
            include: relationships,
          });
  if (id !== undefined && !before)
    throw new NotFoundException('Program or template not found.');
  const previousItems: Pick<ProgramItem, 'id' | 'responsibleId' | 'time'>[] =
    before?.items ?? [];
  if (
    fields.typeId !== undefined &&
    fields.typeId !== before?.typeId &&
    !(await tx.programType.findFirst({
      where: { id: fields.typeId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new BadRequestException('The selected type is no longer available.');
  if (
    fields.homecellId &&
    fields.homecellId !== before?.homecellId &&
    !(await tx.homecell.findFirst({
      where: { id: fields.homecellId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new BadRequestException(
      'The selected homecell is no longer available.',
    );
  for (const item of fields.items ?? [])
    if (
      item.id !== undefined &&
      !previousItems.some((old) => old.id === item.id)
    )
      throw new BadRequestException(
        'An activity no longer belongs to this active record. Reload before saving.',
      );
  const newPeople = [
    ...new Set(
      (fields.items ?? [])
        .filter(
          (item) =>
            item.responsibleId &&
            item.responsibleId !==
              previousItems.find((old) => old.id === item.id)?.responsibleId,
        )
        .map((item) => item.responsibleId!),
    ),
  ];
  const effectiveTimes = new Set<string>();
  for (const item of fields.items ?? []) {
    const time =
      item.time === undefined
        ? previousItems.find((old) => old.id === item.id)?.time
        : item.time;
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time || '');
    if (!clock) continue;
    const key =
      clock[1].padStart(2, '0') + ':' + clock[2] + ':' + (clock[3] || '00');
    if (effectiveTimes.has(key))
      throw new BadRequestException('Two activities have the same clock time.');
    effectiveTimes.add(key);
  }
  if (
    newPeople.length &&
    (await tx.member.count({
      where: { id: { in: newPeople }, deletedAt: null },
    })) !== newPeople.length
  )
    throw new BadRequestException(
      'A selected responsible profile is no longer available.',
    );
  const itemData = ({
    title,
    description,
    time,
    sequence,
    responsibleId,
  }: Item) => ({ title, description, time, sequence, responsibleId });
  const createItems =
    fields.items?.filter((item) => item.id === undefined).map(itemData) ?? [];
  const items =
    fields.items === undefined
      ? undefined
      : {
          updateMany: {
            where: {
              deletedAt: null,
              id: {
                notIn: fields.items.flatMap((item) =>
                  item.id === undefined ? [] : [item.id],
                ),
              },
            },
            data: { deletedAt: new Date() },
          },
          update: fields.items
            .filter((item) => item.id !== undefined)
            .map((item) => ({ where: { id: item.id! }, data: itemData(item) })),
          create: createItems,
        };
  const base = { typeId: fields.typeId, homecellId: fields.homecellId };
  const after =
    kind === 'program'
      ? id === undefined
        ? await tx.program.create({
            data: {
              ...base,
              typeId: fields.typeId!,
              date: fields.date!,
              location: fields.location,
              slug: slug!,
              items: { create: createItems },
            },
            include: relationships,
          })
        : await tx.program.update({
            where: { id },
            data: {
              ...base,
              date: fields.date,
              location: fields.location,
              items,
            },
            include: relationships,
          })
      : id === undefined
        ? await tx.programTemplate.create({
            data: {
              ...base,
              typeId: fields.typeId!,
              name: fields.name!,
              items: { create: createItems },
            },
            include: relationships,
          })
        : await tx.programTemplate.update({
            where: { id },
            data: { ...base, name: fields.name, items },
            include: relationships,
          });
  return { before, after };
}
export async function saveProgramEditor(
  prisma: PrismaService,
  audit: AuditService,
  kind: Kind,
  input: unknown,
  actorId?: bigint,
  id?: string,
  slugify?: SlugService,
) {
  const fields = programEditorInput(kind, input, id !== undefined);
  const recordId = id === undefined ? undefined : groupEditorId(id);
  const slug =
    kind === 'program' && recordId === undefined
      ? await slugify!.generateUniqueSlug(
          [
            fields.location,
            new Date(fields.date!.getTime() + 7200000)
              .toISOString()
              .slice(0, 10),
          ]
            .filter(Boolean)
            .join(' '),
          'program',
        )
      : undefined;
  if (slug !== undefined && (!slug || slug.length > 191))
    throw new BadRequestException(
      'Choose a location and date that form a valid public address.',
    );
  let result: Awaited<ReturnType<typeof writeEditor>>;
  try {
    result = await prisma.$transaction((tx) =>
      writeEditor(tx, kind, fields, recordId, slug),
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'The public program address is already in use.',
      );
    throw error;
  }
  await audit.log({
    action:
      (kind === 'program' ? 'PROGRAM' : 'PROGRAM_TEMPLATE') +
      (id === undefined ? '_CREATED' : '_UPDATED'),
    entity: kind === 'program' ? 'Program' : 'ProgramTemplate',
    entityId: result.after.id.toString(),
    before: result.before ?? undefined,
    after: result.after,
    userId: actorId,
  });
  return { success: true, data: result.after, meta: {} };
}
export async function createProgramEditorFromTemplate(
  prisma: PrismaService,
  audit: AuditService,
  slugify: SlugService,
  input: unknown,
  actorId?: bigint,
) {
  const source = object(input);
  const templateId = groupEditorId(source.templateId);
  const date = programEditorDate(source.date);
  const location =
    source.location === undefined ? '' : text(source.location, 'location');
  const slug = await slugify.generateUniqueSlug(
    [location, new Date(date.getTime() + 7200000).toISOString().slice(0, 10)]
      .filter(Boolean)
      .join(' '),
    'program',
  );
  if (!slug || slug.length > 191)
    throw new BadRequestException('Choose a valid public program address.');
  const result = await prisma.$transaction(async (tx) => {
    const template = await tx.programTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      include: relationships,
    });
    if (!template) throw new NotFoundException('Template not found.');
    const fields = programEditorInput(
      'program',
      {
        date: source.date,
        location,
        typeId: template.typeId.toString(),
        homecellId:
          source.homecellId === undefined
            ? template.homecellId?.toString() || ''
            : source.homecellId,
        items: template.items.map((item) => ({
          title: item.title,
          description: item.description || '',
          time: item.time || '',
          responsibleId: item.responsibleId?.toString() || '',
        })),
      },
      false,
    );
    return writeEditor(tx, 'program', fields, undefined, slug);
  });
  await audit.log({
    action: 'PROGRAM_CREATED_FROM_TEMPLATE',
    entity: 'Program',
    entityId: result.after.id.toString(),
    after: result.after,
    userId: actorId,
  });
  return { success: true, data: result.after, meta: {} };
}
