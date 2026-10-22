import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { SlugService } from '../../common/utils/slugify';
import { groupEditorId } from '../../common/utils/church-group-editor';
import {
  accessListPagination,
  type AccessListQuery,
} from '../../common/utils/access-list-filters';
type ScriptureInput = {
  id?: bigint;
  book: string;
  chapter: number;
  verseFrom: number;
  verseTo?: number | null;
  version?: string | null;
};
function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Enter valid message details.');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, required = false) {
  if (
    typeof value !== 'string' ||
    value.trim().length > 191 ||
    (required && !value.trim())
  )
    throw new BadRequestException(`Check the ${field}.`);
  return value.trim();
}
function positiveInteger(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new BadRequestException(
      'Use positive whole chapter and verse numbers.',
    );
  return value;
}
export function hasContentBody(html: string) {
  const visible = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return (
    !!visible
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|#160|#x0*a0);|[\s\u200B-\u200D\uFEFF]/gi, '')
      .trim() ||
    /<(?:img|audio|video|iframe)\b[^>]*\bsrc\s*=|<span\b[^>]*data-scripture/i.test(
      visible,
    )
  );
}
export function contentEditorInput(input: unknown, partial: boolean) {
  const source = record(input);
  const fields: {
    title?: string;
    body?: string;
    typeId?: bigint;
    authorId?: bigint | null;
    tags?: string[];
    scriptures?: ScriptureInput[];
  } = {};
  if (!partial || source.title !== undefined)
    fields.title = text(source.title, 'title', true);
  if (!partial || source.body !== undefined) {
    if (typeof source.body !== 'string' || !hasContentBody(source.body))
      throw new BadRequestException(
        'Add message text, a scripture reference or media.',
      );
    fields.body = source.body;
  }
  if (!partial || source.typeId !== undefined)
    fields.typeId = groupEditorId(source.typeId);
  if (source.authorId !== undefined)
    fields.authorId =
      source.authorId === '' || source.authorId === null
        ? null
        : groupEditorId(source.authorId);
  if (source.tags !== undefined) {
    if (!Array.isArray(source.tags))
      throw new BadRequestException('Enter valid tags.');
    const names = source.tags.map((name) => text(name, 'tag', true));
    fields.tags = [
      ...new Map(
        names.map((name) => [name.toLocaleLowerCase(), name]),
      ).values(),
    ];
  }
  if (source.scriptures !== undefined) {
    if (!Array.isArray(source.scriptures))
      throw new BadRequestException('Enter valid scripture references.');
    const ids = new Set<bigint>();
    fields.scriptures = source.scriptures.map((value) => {
      const entry = record(value);
      const id = entry.id === undefined ? undefined : groupEditorId(entry.id);
      if (id !== undefined && ids.has(id))
        throw new BadRequestException(
          'A scripture reference is listed more than once.',
        );
      if (id !== undefined) ids.add(id);
      const verseFrom = positiveInteger(entry.verseFrom);
      const verseTo =
        entry.verseTo === undefined
          ? undefined
          : entry.verseTo === null || entry.verseTo === ''
            ? null
            : positiveInteger(entry.verseTo);
      if (verseTo && verseTo < verseFrom)
        throw new BadRequestException(
          'The last verse must be at or after the first verse.',
        );
      return {
        id,
        book: text(entry.book, 'book', true),
        chapter: positiveInteger(entry.chapter),
        verseFrom,
        verseTo,
        version:
          entry.version === undefined
            ? undefined
            : entry.version === null || entry.version === ''
              ? null
              : text(entry.version, 'version'),
      };
    });
  }
  return fields;
}
function mediaUrl(value: string) {
  const url = value
    .replace(/&amp;|&#38;|&#x26;/gi, '&')
    .replace(/&#(\d+);|&#x([a-f\d]+);/gi, (_, decimal: string, hex: string) => {
      const code = parseInt(decimal || hex, decimal ? 10 : 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .trim();
  if (
    (!/^https?:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) ||
    [...url].some(
      (character) =>
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127 ||
        character === '\\',
    )
  )
    return null;
  try {
    const parsed = new URL(url, 'https://content.invalid');
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return null;
  } catch {
    return null;
  }
  if (url.length > 191)
    throw new BadRequestException(
      'A media URL is too long. Use a shorter source URL.',
    );
  return url;
}
export function extractContentMedia(html: string) {
  const source = html.replace(
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  const results = new Map<string, { url: string; type: string }>();
  const tags =
    /<(img|video|audio|source|iframe)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(source))) {
    const attributes =
      /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributes.exec(match[2]))) {
      if (attribute[1].toLowerCase() !== 'src') continue;
      const url = mediaUrl(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      if (url) {
        const tag = match[1].toLowerCase();
        const preceding = source.slice(0, match.index).toLowerCase();
        const audio =
          tag === 'audio' ||
          (tag === 'source' &&
            preceding.lastIndexOf('<audio') > preceding.lastIndexOf('</audio'));
        results.set(url, {
          url,
          type: tag === 'img' ? 'image' : audio ? 'audio' : 'video',
        });
      }
    }
  }
  return [...results.values()];
}
const relationships = {
  type: true,
  author: true,
  tags: { where: { tag: { deletedAt: null } }, include: { tag: true } },
  scriptures: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
  contentMedia: { include: { media: true } },
} as const;
export async function contentAuthorOptions(
  prisma: PrismaService,
  query: AccessListQuery,
) {
  const { page, limit } = accessListPagination(query);
  if (query.search !== undefined && typeof query.search !== 'string')
    throw new BadRequestException('Enter a single author search.');
  const search = (query.search || '').trim();
  if (search.length > 200)
    throw new BadRequestException(
      'Keep the author search within 200 characters.',
    );
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
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.member.count({ where }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return { data, meta: { page, limit, total } };
}
export async function saveContentEditor(
  prisma: PrismaService,
  audit: AuditService,
  slugify: SlugService,
  input: unknown,
  actorId?: bigint,
  id?: string,
) {
  const fields = contentEditorInput(input, id !== undefined),
    contentId = id === undefined ? undefined : groupEditorId(id);
  const slug =
    contentId === undefined
      ? await slugify.generateUniqueSlug(fields.title!, 'content')
      : undefined;
  if (slug !== undefined && (!slug || slug.length > 191))
    throw new BadRequestException(
      'Choose a title that forms a valid public address.',
    );
  const result = await prisma.$transaction(async (tx) => {
    const before =
      contentId === undefined
        ? null
        : await tx.content.findFirst({
            where: { id: contentId, deletedAt: null },
            include: relationships,
          });
    if (contentId !== undefined && !before)
      throw new NotFoundException('Content not found.');
    if (
      fields.typeId !== undefined &&
      fields.typeId !== before?.typeId &&
      !(await tx.contentType.findFirst({
        where: { id: fields.typeId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'The selected content type is no longer available.',
      );
    if (
      fields.authorId &&
      fields.authorId !== before?.authorId &&
      !(await tx.member.findFirst({
        where: { id: fields.authorId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'The selected author is no longer available.',
      );
    for (const entry of fields.scriptures ?? [])
      if (
        entry.id !== undefined &&
        !before?.scriptures.some((old) => old.id === entry.id)
      )
        throw new BadRequestException(
          'A scripture reference no longer belongs to this active message.',
        );
    const tagIds: bigint[] = [];
    for (const name of fields.tags ?? []) {
      const tag = await tx.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      if (tag.deletedAt)
        throw new BadRequestException(
          'A selected tag is archived. Choose another tag.',
        );
      if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
    }
    const mediaIds: bigint[] = [];
    if (fields.body !== undefined)
      for (const entry of extractContentMedia(fields.body)) {
        const media = await tx.media.upsert({
          where: { url: entry.url },
          update: {},
          create: entry,
        });
        if (media.deletedAt)
          throw new BadRequestException(
            'A media file is no longer available. Remove or replace it before saving.',
          );
        if (!mediaIds.includes(media.id)) mediaIds.push(media.id);
      }
    const scriptureData = ({
      book,
      chapter,
      verseFrom,
      verseTo,
      version,
    }: ScriptureInput) => ({ book, chapter, verseFrom, verseTo, version });
    const scriptures =
      fields.scriptures === undefined
        ? undefined
        : {
            updateMany: {
              where: {
                deletedAt: null,
                id: {
                  notIn: fields.scriptures.flatMap((entry) =>
                    entry.id === undefined ? [] : [entry.id],
                  ),
                },
              },
              data: { deletedAt: new Date() },
            },
            update: fields.scriptures
              .filter((entry) => entry.id !== undefined)
              .map((entry) => ({
                where: { id: entry.id! },
                data: scriptureData(entry),
              })),
            create: fields.scriptures
              .filter((entry) => entry.id === undefined)
              .map(scriptureData),
          };
    const tags =
      fields.tags === undefined
        ? undefined
        : {
            deleteMany: {
              tagId: {
                in: (before?.tags || [])
                  .filter((entry) => !tagIds.includes(entry.tagId))
                  .map((entry) => entry.tagId),
              },
            },
            create: tagIds
              .filter(
                (tagId) => !before?.tags.some((entry) => entry.tagId === tagId),
              )
              .map((tagId) => ({ tagId })),
          };
    const contentMedia =
      fields.body === undefined
        ? undefined
        : {
            deleteMany: {
              mediaId: {
                in: (before?.contentMedia || [])
                  .filter((entry) => !mediaIds.includes(entry.mediaId))
                  .map((entry) => entry.mediaId),
              },
            },
            create: mediaIds
              .filter(
                (mediaId) =>
                  !before?.contentMedia.some(
                    (entry) => entry.mediaId === mediaId,
                  ),
              )
              .map((mediaId) => ({ mediaId })),
          };
    const base = {
      title: fields.title,
      body: fields.body,
      typeId: fields.typeId,
      authorId: fields.authorId,
    };
    try {
      const after =
        contentId === undefined
          ? await tx.content.create({
              data: {
                ...base,
                title: fields.title!,
                body: fields.body!,
                typeId: fields.typeId!,
                slug: slug!,
                status: 'Draft',
                tags: { create: tagIds.map((tagId) => ({ tagId })) },
                scriptures: {
                  create: fields.scriptures?.map(scriptureData) || [],
                },
                contentMedia: {
                  create: mediaIds.map((mediaId) => ({ mediaId })),
                },
              },
              include: relationships,
            })
          : await tx.content.update({
              where: { id: contentId },
              data: { ...base, tags, scriptures, contentMedia },
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
          'The public message address is already in use.',
        );
      throw error;
    }
  });
  await audit.log({
    action: contentId === undefined ? 'CONTENT_CREATED' : 'CONTENT_UPDATED',
    entity: 'Content',
    entityId: result.after.id.toString(),
    before: result.before ?? undefined,
    after: result.after,
    userId: actorId,
  });
  return { success: true, data: result.after, meta: {} };
}
