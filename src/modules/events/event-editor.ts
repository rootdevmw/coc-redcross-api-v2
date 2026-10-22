import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { SlugService } from '../../common/utils/slugify';
import { groupEditorId } from '../../common/utils/church-group-editor';

export function eventTimestamp(value: unknown) {
  if (typeof value !== 'string')
    throw new BadRequestException(
      'Enter an event time with an explicit timezone.',
    );
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match)
    throw new BadRequestException(
      'Enter an event time with an explicit timezone.',
    );
  const [, year, month, day, hour, minute, second = '00', fraction = '', zone] =
    match;
  const wall = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}Z`;
  const date = new Date(wall);
  if (
    +year < 1000 ||
    +month < 1 ||
    +month > 12 ||
    +day < 1 ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59 ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== wall.slice(0, 19)
  )
    throw new BadRequestException('Enter a valid event date and time.');
  const offset =
    zone === 'Z' ? 0 : Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4));
  if (offset > 840 || Number(zone.slice(4)) > 59)
    throw new BadRequestException('Enter a valid event timezone.');
  const result = new Date(
    date.getTime() - (zone.startsWith('-') ? -offset : offset) * 60000,
  );
  if (result.getUTCFullYear() < 1000 || result.getUTCFullYear() > 9999)
    throw new BadRequestException(
      'The event time is outside the supported range.',
    );
  return result;
}
export function eventEditorInput(input: unknown, partial: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Enter event details.');
  const source = input as Record<string, unknown>;
  const result: {
    title?: string;
    description?: string;
    location?: string;
    typeId?: bigint;
    ministryIds?: bigint[];
    startTime?: Date;
    endTime?: Date;
  } = {};
  for (const key of ['title', 'location', 'description'] as const) {
    const value = source[key];
    if (value === undefined && (partial || key !== 'title')) continue;
    if (typeof value !== 'string')
      throw new BadRequestException(`Enter a valid ${key}.`);
    const text = key === 'description' ? value : value.trim();
    if (
      (key === 'title' && !text) ||
      (key !== 'description' && text.length > 191) ||
      (key === 'description' && Buffer.byteLength(text, 'utf8') > 65535)
    )
      throw new BadRequestException(`Check the event ${key}.`);
    result[key] = text;
  }
  if (!partial || source.typeId !== undefined)
    result.typeId = groupEditorId(source.typeId);
  for (const key of ['startTime', 'endTime'] as const)
    if (!partial || source[key] !== undefined)
      result[key] = eventTimestamp(source[key]);
  if (source.ministryIds !== undefined) {
    if (!Array.isArray(source.ministryIds))
      throw new BadRequestException('Choose valid ministries.');
    result.ministryIds = [...new Set(source.ministryIds.map(groupEditorId))];
  }
  return result;
}
const relationships = {
  type: true,
  ministries: {
    where: { ministry: { deletedAt: null } },
    include: { ministry: true },
  },
} as const;
export async function saveEventEditor(
  prisma: PrismaService,
  audit: AuditService,
  slugify: SlugService,
  input: unknown,
  actorId?: bigint,
  id?: string,
) {
  const fields = eventEditorInput(input, id !== undefined);
  const eventId = id === undefined ? undefined : groupEditorId(id);
  const slug =
    eventId === undefined
      ? await slugify.generateUniqueSlug(fields.title!, 'event')
      : undefined;
  if (slug !== undefined && (!slug || slug.length > 191))
    throw new BadRequestException(
      'Choose a title that forms a valid public address.',
    );
  const result = await prisma.$transaction(async (tx) => {
    const before =
      eventId === undefined
        ? null
        : await tx.event.findFirst({
            where: { id: eventId, deletedAt: null },
            include: relationships,
          });
    if (eventId !== undefined && !before)
      throw new NotFoundException('Event not found.');
    const startTime = fields.startTime ?? before?.startTime;
    const endTime = fields.endTime ?? before?.endTime;
    if (!startTime || !endTime || endTime.getTime() <= startTime.getTime())
      throw new BadRequestException('End time must be after start time.');
    if (
      fields.typeId !== undefined &&
      fields.typeId !== before?.typeId &&
      !(await tx.eventType.findFirst({
        where: { id: fields.typeId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'The selected event type is no longer available.',
      );
    if (
      fields.ministryIds?.length &&
      (await tx.ministry.count({
        where: { id: { in: fields.ministryIds }, deletedAt: null },
      })) !== fields.ministryIds.length
    )
      throw new BadRequestException(
        'A selected ministry is no longer available.',
      );
    const base = {
      title: fields.title,
      description: fields.description,
      location: fields.location,
      typeId: fields.typeId,
      startTime: fields.startTime,
      endTime: fields.endTime,
    };
    try {
      const after =
        eventId === undefined
          ? await tx.event.create({
              data: {
                ...base,
                title: fields.title!,
                typeId: fields.typeId!,
                startTime,
                endTime,
                slug: slug!,
                ministries: fields.ministryIds?.length
                  ? {
                      create: fields.ministryIds.map((ministryId) => ({
                        ministryId,
                      })),
                    }
                  : undefined,
              },
              include: relationships,
            })
          : await tx.event.update({
              where: { id: eventId },
              data: {
                ...base,
                ministries:
                  fields.ministryIds !== undefined
                    ? {
                        deleteMany: {
                          ministryId: {
                            in: before!.ministries
                              .filter(
                                (entry) =>
                                  !fields.ministryIds!.includes(
                                    entry.ministryId,
                                  ),
                              )
                              .map((entry) => entry.ministryId),
                          },
                        },
                        create: fields.ministryIds
                          .filter(
                            (ministryId) =>
                              !before!.ministries.some(
                                (entry) => entry.ministryId === ministryId,
                              ),
                          )
                          .map((ministryId) => ({ ministryId })),
                      }
                    : undefined,
              },
              include: relationships,
            });
      return { before, after };
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'The public address is already in use. Choose another event title.',
        );
      throw error;
    }
  });
  const rescheduled =
    result.before &&
    (result.before.startTime.getTime() !== result.after.startTime.getTime() ||
      result.before.endTime.getTime() !== result.after.endTime.getTime());
  await audit.log({
    action:
      eventId === undefined
        ? 'EVENT_CREATED'
        : rescheduled
          ? 'EVENT_RESCHEDULED'
          : 'EVENT_UPDATED',
    entity: 'Event',
    entityId: result.after.id.toString(),
    before: result.before ?? undefined,
    after: result.after,
    userId: actorId,
  });
  return { success: true, data: result.after, meta: {} };
}
export async function createEventEditorType(
  prisma: PrismaService,
  audit: AuditService,
  value: unknown,
  actorId?: bigint,
) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 191)
    throw new BadRequestException(
      'Enter a type name from 1 to 191 characters.',
    );
  let type: Awaited<ReturnType<typeof prisma.eventType.create>>;
  try {
    type = await prisma.eventType.create({ data: { name: value.trim() } });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'An event type with this name already exists.',
      );
    throw error;
  }
  await audit.log({
    action: 'EVENT_TYPE_CREATED',
    entity: 'EventType',
    entityId: type.id.toString(),
    after: type,
    userId: actorId,
  });
  return { success: true, data: type, meta: {} };
}
