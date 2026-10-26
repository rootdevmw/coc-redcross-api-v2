import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { normalizeMemberPrefix } from './member-titles';

export function memberEditorId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequestException('Choose a valid directory record.');
  return BigInt(value);
}
export function memberEditorInput(input: unknown, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Member details are required.');
  const source = input as Record<string, unknown>;
  const result: {
    firstName?: string;
    lastName?: string;
    prefix?: string;
    status?: string;
    phone?: string;
    location?: string;
    imageUrl?: string;
    bio?: string;
    isBaptized?: boolean;
    baptismDate?: string;
    homecellId?: string;
    ministryIds?: string[];
  } = {};
  for (const key of [
    'firstName',
    'lastName',
    'prefix',
    'status',
    'phone',
    'location',
    'imageUrl',
    'bio',
    'baptismDate',
    'homecellId',
  ] as const) {
    const value = source[key];
    if (value === undefined) {
      if (
        !partial &&
        ['firstName', 'lastName', 'prefix', 'status'].includes(key)
      )
        throw new BadRequestException(
          'Name, church title and membership status are required.',
        );
      continue;
    }
    if (typeof value !== 'string')
      throw new BadRequestException('Member fields must be text.');
    result[key] = key === 'bio' ? value : value.trim();
    if (['firstName', 'lastName'].includes(key) && !result[key])
      throw new BadRequestException('First and last name cannot be blank.');
    if (
      ['firstName', 'lastName', 'phone', 'location', 'imageUrl'].includes(
        key,
      ) &&
      value.length > 191
    )
      throw new BadRequestException(
        'Name, contact and photo URL fields must fit within 191 characters.',
      );
  }
  if (result.prefix !== undefined)
    result.prefix = normalizeMemberPrefix(result.prefix);
  if (
    result.prefix !== undefined &&
    !['PASTOR', 'DEACON', 'SISTER', 'BROTHER'].includes(result.prefix)
  )
    throw new BadRequestException('Choose a valid church title.');
  if (
    result.status !== undefined &&
    !['VISITOR', 'MEMBER'].includes(result.status)
  )
    throw new BadRequestException('Choose Visitor or Member.');
  if (source.isBaptized !== undefined && typeof source.isBaptized !== 'boolean')
    throw new BadRequestException('Choose Yes or No for baptism.');
  result.isBaptized = source.isBaptized;
  if (!partial && result.isBaptized === undefined) result.isBaptized = false;
  if (result.homecellId) memberEditorId(result.homecellId);
  if (
    result.imageUrl &&
    !/^https?:\/\//i.test(result.imageUrl) &&
    !/^\/(?!\/)/.test(result.imageUrl)
  )
    throw new BadRequestException('Use a valid uploaded photo URL.');
  if (result.bio !== undefined && Buffer.byteLength(result.bio, 'utf8') > 65535)
    throw new BadRequestException(
      'The biography is too long. Shorten it before saving.',
    );
  if (result.baptismDate) {
    const day = result.baptismDate.slice(0, 10);
    const parsedDay = new Date(day + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(result.baptismDate) ||
      !Number.isFinite(parsedDay.getTime()) ||
      parsedDay.toISOString().slice(0, 10) !== day ||
      !Number.isFinite(Date.parse(result.baptismDate))
    )
      throw new BadRequestException('Choose a valid baptism date.');
  }
  if (source.ministryIds !== undefined) {
    if (!Array.isArray(source.ministryIds) || source.ministryIds.length > 500)
      throw new BadRequestException('Choose a valid set of ministries.');
    result.ministryIds = source.ministryIds.map((value: unknown) => {
      memberEditorId(value);
      return value as string;
    });
    if (new Set(result.ministryIds).size !== result.ministryIds.length)
      throw new BadRequestException('Choose each ministry only once.');
  }
  return result;
}

const relationships = {
  bio: true,
  homecell: true,
  ministries: {
    where: { ministry: { deletedAt: null } },
    include: { ministry: true },
  },
} satisfies Prisma.MemberInclude;
export async function saveMemberEditor(
  prisma: PrismaService,
  audit: AuditService,
  input: unknown,
  actorId?: bigint,
  id?: string,
) {
  const fields = memberEditorInput(input, id !== undefined);
  const memberId = id === undefined ? undefined : memberEditorId(id);
  const { before, after } = await prisma.$transaction(async (tx) => {
    const before =
      memberId === undefined
        ? null
        : await tx.member.findFirst({
            where: { id: memberId, deletedAt: null },
            include: relationships,
          });
    if (memberId !== undefined && !before)
      throw new NotFoundException('Member not found.');
    if (
      fields.homecellId &&
      !(await tx.homecell.findFirst({
        where: { id: memberEditorId(fields.homecellId), deletedAt: null },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'This homecell is no longer available. Choose another or leave it unassigned.',
      );
    if (fields.ministryIds?.length) {
      const available = await tx.ministry.findMany({
        where: {
          id: { in: fields.ministryIds.map(memberEditorId) },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (available.length !== fields.ministryIds.length)
        throw new BadRequestException(
          'One or more ministries are no longer available. Review the selected ministries.',
        );
    }
    const base = {
      firstName: fields.firstName,
      lastName: fields.lastName,
      prefix: fields.prefix,
      status: fields.status,
      phone: fields.phone,
      location: fields.location,
      imageUrl:
        fields.imageUrl === undefined ? undefined : fields.imageUrl || null,
      baptized: fields.isBaptized,
      baptismDate:
        fields.isBaptized === false
          ? null
          : fields.baptismDate !== undefined
            ? fields.baptismDate
              ? new Date(fields.baptismDate)
              : null
            : undefined,
    };
    if (memberId === undefined) {
      const after = await tx.member.create({
        data: {
          ...base,
          firstName: fields.firstName!,
          lastName: fields.lastName!,
          prefix: fields.prefix!,
          status: fields.status!,
          baptized: fields.isBaptized ?? false,
          homecell: fields.homecellId
            ? { connect: { id: memberEditorId(fields.homecellId) } }
            : undefined,
          bio: fields.bio?.trim() ? { create: { bio: fields.bio } } : undefined,
          ministries: fields.ministryIds?.length
            ? {
                create: fields.ministryIds.map((ministryId) => ({
                  ministry: { connect: { id: memberEditorId(ministryId) } },
                })),
              }
            : undefined,
        },
        include: relationships,
      });
      return { before, after };
    }
    const after = await tx.member.update({
      where: { id: memberId },
      data: {
        ...base,
        homecell:
          fields.homecellId !== undefined
            ? fields.homecellId
              ? { connect: { id: memberEditorId(fields.homecellId) } }
              : { disconnect: true }
            : undefined,
        bio:
          fields.bio !== undefined
            ? {
                upsert: {
                  create: { bio: fields.bio },
                  update: { bio: fields.bio },
                },
              }
            : undefined,
        ministries:
          fields.ministryIds !== undefined
            ? {
                deleteMany: {
                  ministryId: {
                    in: before!.ministries
                      .filter(
                        (entry) =>
                          !fields.ministryIds!.includes(
                            entry.ministryId.toString(),
                          ),
                      )
                      .map((entry) => entry.ministryId),
                  },
                },
                create: fields.ministryIds
                  .filter(
                    (ministryId) =>
                      !before!.ministries.some(
                        (entry) => entry.ministryId.toString() === ministryId,
                      ),
                  )
                  .map((ministryId) => ({
                    ministry: { connect: { id: memberEditorId(ministryId) } },
                  })),
              }
            : undefined,
      },
      include: relationships,
    });
    return { before, after };
  });
  await audit.log({
    action: id === undefined ? 'MEMBER_CREATED' : 'MEMBER_UPDATED',
    entity: 'Member',
    entityId: after.id.toString(),
    before: before ?? undefined,
    after,
    userId: actorId,
  });
  return { success: true, data: after, meta: {} };
}
