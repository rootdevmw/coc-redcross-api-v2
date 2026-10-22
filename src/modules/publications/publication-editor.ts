import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { eventTimestamp } from '../events/event-editor';

export const PUBLICATION_FILE_LIMIT = 50 * 1024 * 1024;
export function publicationEditorId(value: string) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequestException('Choose a valid publication.');
  return BigInt(value);
}
export function publicationEditorInput(input: unknown, partial: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Enter publication details.');
  const source = input as Record<string, unknown>;
  const fields: {
    title?: string;
    description?: string;
    publishedAt?: Date | null;
  } = {};
  for (const key of ['title', 'description'] as const) {
    const value = source[key];
    if (value === undefined && (partial || key === 'description')) continue;
    if (typeof value !== 'string')
      throw new BadRequestException(`Enter a valid ${key}.`);
    const text = key === 'title' ? value.trim() : value;
    if (
      (key === 'title' && (!text || text.length > 191)) ||
      (key === 'description' && Buffer.byteLength(text, 'utf8') > 65535)
    )
      throw new BadRequestException(`Check the publication ${key}.`);
    fields[key] = text;
  }
  if (source.publishedAt !== undefined) {
    if (source.publishedAt === null || source.publishedAt === '')
      fields.publishedAt = null;
    else {
      try {
        fields.publishedAt = eventTimestamp(source.publishedAt);
      } catch {
        throw new BadRequestException(
          'Enter a valid publication date and time with a timezone.',
        );
      }
    }
  } else if (!partial) fields.publishedAt = null;
  return fields;
}
export function validatePublicationUpload(file: Express.Multer.File) {
  if (
    !Buffer.isBuffer(file.buffer) ||
    !file.buffer.length ||
    file.buffer.length !== file.size ||
    file.size > PUBLICATION_FILE_LIMIT
  )
    throw new BadRequestException('Choose a nonempty PDF of 50 MB or less.');
  if (
    typeof file.originalname !== 'string' ||
    !/\.pdf$/i.test(file.originalname) ||
    !['application/pdf', 'application/octet-stream'].includes(
      file.mimetype?.toLowerCase(),
    ) ||
    file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  )
    throw new BadRequestException('Choose a valid PDF document.');
}
export function hasPublicationDocument(value: string | null | undefined) {
  if (
    !value ||
    value.includes('\\') ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export async function storePublicationFile(
  file: Express.Multer.File,
  baseUrl: unknown,
  io: Pick<typeof fs, 'mkdir' | 'writeFile'> = fs,
) {
  validatePublicationUpload(file);
  if (
    typeof baseUrl !== 'string' ||
    !hasPublicationDocument(baseUrl) ||
    !/^https?:\/\//.test(baseUrl)
  )
    throw new InternalServerErrorException(
      'Document storage is not configured.',
    );
  const base = new URL(baseUrl);
  if (base.search || base.hash)
    throw new InternalServerErrorException(
      'Document storage is not configured.',
    );
  const filename = randomUUID() + '.pdf';
  const url =
    base.href.replace(/\/$/, '') + '/uploads/publications/' + filename;
  if (url.length > 191)
    throw new InternalServerErrorException('The document address is too long.');
  const directory = resolve(process.cwd(), 'uploads', 'publications');
  // The generated leaf never includes the original, untrusted filename.
  await io.mkdir(directory, { recursive: true });
  await io.writeFile(join(directory, filename), file.buffer, { flag: 'wx' });
  return url;
}
export async function savePublicationEditor(
  prisma: PrismaService,
  audit: AuditService,
  store: (file: Express.Multer.File) => Promise<string>,
  input: unknown,
  userId?: bigint,
  id?: string,
  file?: Express.Multer.File,
) {
  const fields = publicationEditorInput(input, id !== undefined);
  const publicationId = id === undefined ? undefined : publicationEditorId(id);
  if (file) validatePublicationUpload(file);
  const before =
    publicationId === undefined
      ? null
      : await prisma.publication.findFirst({
          where: { id: publicationId, deletedAt: null },
        });
  if (publicationId !== undefined && !before)
    throw new NotFoundException('Publication not found.');
  const publishedAt =
    fields.publishedAt === undefined ? before?.publishedAt : fields.publishedAt;
  if (publishedAt && !file && !hasPublicationDocument(before?.fileUrl))
    throw new BadRequestException('Attach a document before publishing.');
  const fileUrl = file ? await store(file) : undefined;
  // Never remove the previous file, including when a database or later audit call fails.
  // A new orphan is retained after an uncertain write for separate, controlled cleanup.
  const after =
    publicationId === undefined
      ? await prisma.publication.create({
          data: {
            title: fields.title!,
            description: fields.description,
            publishedAt: fields.publishedAt,
            fileUrl: fileUrl ?? '',
          },
        })
      : await prisma.publication.update({
          where: { id: publicationId },
          data: { ...fields, ...(fileUrl !== undefined && { fileUrl }) },
        });
  await audit.log({
    action:
      publicationId === undefined
        ? 'PUBLICATION_CREATED'
        : 'PUBLICATION_UPDATED',
    entity: 'Publication',
    entityId: after.id.toString(),
    before,
    after,
    userId,
  });
  return { success: true, data: after, meta: {} };
}
