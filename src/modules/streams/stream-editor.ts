import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { SlugService } from '../../common/utils/slugify';
import { eventTimestamp } from '../events/event-editor';
import type { Prisma, Platform } from '../../generated/prisma/client';

type StreamWithPlatforms = Prisma.StreamGetPayload<{
  include: { platforms: { include: { platform: true } } };
}>;

export function streamEditorId(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequestException('Choose a valid stream or platform.');
  return BigInt(value);
}
function objectInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Enter stream or platform details.');
  return input as Record<string, unknown>;
}
function requiredName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 191)
    throw new BadRequestException(
      'Enter a name or title from 1 to 191 characters.',
    );
  return value.trim();
}
export function streamPlatformUrl(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.includes('\\') ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= 191
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function streamEditorInput(input: unknown, partial: boolean) {
  const source = objectInput(input);
  const fields: {
    title?: string;
    isLive?: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    platformIds?: bigint[];
  } = {};
  if (!partial || source.title !== undefined)
    fields.title = requiredName(source.title);
  if (source.isLive !== undefined) {
    if (typeof source.isLive !== 'boolean')
      throw new BadRequestException('Live selection must be true or false.');
    fields.isLive = source.isLive;
  }
  for (const key of ['startsAt', 'endsAt'] as const) {
    if (source[key] === undefined) continue;
    if (source[key] === null || source[key] === '') fields[key] = null;
    else {
      try {
        fields[key] = eventTimestamp(source[key]);
      } catch {
        throw new BadRequestException(
          'Enter valid stream dates with an explicit timezone.',
        );
      }
    }
  }
  if (source.platformIds !== undefined) {
    if (!Array.isArray(source.platformIds))
      throw new BadRequestException('Choose platform records.');
    fields.platformIds = [...new Set(source.platformIds.map(streamEditorId))];
  }
  return fields;
}
export function streamPlatformInput(input: unknown, partial: boolean) {
  const source = objectInput(input),
    fields: { name?: string; url?: string } = {};
  if (!partial || source.name !== undefined)
    fields.name = requiredName(source.name);
  if (!partial || source.url !== undefined) {
    const url = streamPlatformUrl(source.url);
    if (!url)
      throw new BadRequestException(
        'Enter a full http or https address of at most 191 characters, without credentials.',
      );
    fields.url = url;
  }
  return fields;
}
const activePlatforms = {
  platforms: {
    where: { platform: { deletedAt: null } },
    include: { platform: true },
  },
} as const;
function writeFailure(error: unknown): never {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'P2002' || code === 'P2034')
    throw new ConflictException(
      'A name or address already exists, or another change overlapped this save. Review the saved records before retrying.',
    );
  throw error;
}
export async function saveStreamEditor(
  prisma: PrismaService,
  audit: AuditService,
  slugify: SlugService,
  input: unknown,
  userId?: bigint,
  id?: string,
  action?: 'STREAM_SET_LIVE' | 'STREAM_ENDED',
) {
  const fields = streamEditorInput(input, id !== undefined),
    streamId = id === undefined ? undefined : streamEditorId(id);
  const slug =
    streamId === undefined
      ? await slugify.generateUniqueSlug(fields.title!, 'stream')
      : undefined;
  if (slug !== undefined && (!slug || slug.length > 191))
    throw new BadRequestException(
      'Choose a title that forms a valid public address.',
    );
  let result: {
    before: StreamWithPlatforms | null;
    after: StreamWithPlatforms;
  };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const before =
          streamId === undefined
            ? null
            : await tx.stream.findFirst({
                where: { id: streamId, deletedAt: null },
                include: { platforms: { include: { platform: true } } },
              });
        if (streamId !== undefined && !before)
          throw new NotFoundException('Stream not found.');
        const start =
          fields.startsAt === undefined ? before?.startsAt : fields.startsAt;
        let end = fields.endsAt === undefined ? before?.endsAt : fields.endsAt;
        const now = new Date();
        // Ending is safe for legacy selections with missing or future schedules too.
        if (
          action === 'STREAM_ENDED' &&
          before?.isLive &&
          start &&
          start.getTime() < now.getTime() &&
          (!end || end > now)
        ) {
          fields.endsAt = end = now;
        }
        if (
          action !== 'STREAM_ENDED' &&
          end &&
          (!start || end.getTime() <= start.getTime())
        )
          throw new BadRequestException('End time must be after start time.');
        const platforms =
          fields.platformIds === undefined
            ? (before?.platforms ?? [])
                .filter((link) => !link.platform.deletedAt)
                .map((link) => link.platform)
            : await tx.platform.findMany({
                where: { id: { in: fields.platformIds }, deletedAt: null },
              });
        if (
          fields.platformIds !== undefined &&
          platforms.length !== fields.platformIds.length
        )
          throw new BadRequestException(
            'A selected platform is no longer available.',
          );
        if (fields.isLive ?? before?.isLive ?? false) {
          if (
            !start ||
            !end ||
            start.getTime() > now.getTime() ||
            end.getTime() <= now.getTime() ||
            !platforms.some((platform) => streamPlatformUrl(platform.url))
          )
            throw new BadRequestException(
              'Go live requires a start time that has arrived, a future end time and an available platform link. Confirm the broadcast is airing on its provider first.',
            );
        }
        if (fields.isLive === true)
          await tx.stream.updateMany({
            where: {
              deletedAt: null,
              isLive: true,
              ...(streamId !== undefined && { id: { not: streamId } }),
            },
            data: { isLive: false },
          });
        const { platformIds, ...scalars } = fields;
        const after =
          streamId === undefined
            ? await tx.stream.create({
                data: {
                  ...scalars,
                  title: fields.title!,
                  slug: slug!,
                  isLive: fields.isLive ?? false,
                  platforms: {
                    create: (platformIds ?? []).map((platformId) => ({
                      platformId,
                    })),
                  },
                },
                include: activePlatforms,
              })
            : await tx.stream.update({
                where: { id: streamId },
                data: {
                  ...scalars,
                  ...(platformIds !== undefined && {
                    platforms: {
                      deleteMany: platformIds.length
                        ? { platformId: { notIn: platformIds } }
                        : {},
                      create: platformIds
                        .filter(
                          (platformId) =>
                            !before!.platforms.some(
                              (link) => link.platformId === platformId,
                            ),
                        )
                        .map((platformId) => ({ platformId })),
                    },
                  }),
                },
                include: activePlatforms,
              });
        return { before, after };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    writeFailure(error);
  }
  await audit.log({
    action:
      action ?? (streamId === undefined ? 'STREAM_CREATED' : 'STREAM_UPDATED'),
    entity: 'Stream',
    entityId: result.after.id.toString(),
    before: result.before,
    after: result.after,
    userId,
  });
  return {
    success: true,
    data: {
      ...result.after,
      platforms: result.after.platforms.map((link) => link.platform),
    },
    meta: {},
  };
}
export async function saveStreamPlatform(
  prisma: PrismaService,
  audit: AuditService,
  input: unknown,
  userId?: bigint,
  id?: string,
) {
  const fields = streamPlatformInput(input, id !== undefined),
    platformId = id === undefined ? undefined : streamEditorId(id);
  const before =
    platformId === undefined
      ? null
      : await prisma.platform.findFirst({
          where: { id: platformId, deletedAt: null },
        });
  if (platformId !== undefined && !before)
    throw new NotFoundException('Platform not found.');
  let after: Platform;
  try {
    after =
      platformId === undefined
        ? await prisma.platform.create({
            data: { name: fields.name!, url: fields.url! },
          })
        : await prisma.platform.update({
            where: { id: platformId },
            data: fields,
          });
  } catch (error) {
    writeFailure(error);
  }
  await audit.log({
    action: platformId === undefined ? 'PLATFORM_CREATED' : 'PLATFORM_UPDATED',
    entity: 'Platform',
    entityId: after.id.toString(),
    before,
    after,
    userId,
  });
  return { success: true, data: after, meta: {} };
}
