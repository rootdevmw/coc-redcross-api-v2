import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

export type PrayerTeamQuery = {
  page?: unknown;
  limit?: unknown;
  search?: unknown;
};
export function prayerTeamSearch(query: PrayerTeamQuery) {
  if (query.search !== undefined && typeof query.search !== 'string')
    throw new BadRequestException('Search must be a single text value.');
  const search = (query.search ?? '').trim();
  if (search.length > 200)
    throw new BadRequestException('Keep search terms within 200 characters.');
  return search
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => ({
      OR: [
        { email: { contains: term } },
        { member: { firstName: { contains: term } } },
        { member: { lastName: { contains: term } } },
      ],
    }));
}
export function prayerTeamId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequestException('Choose a valid account.');
  return BigInt(value);
}
export const prayerNotificationUser = {
  deletedAt: null,
  email: { not: '' },
  member: { is: { deletedAt: null } },
} satisfies Prisma.UserWhereInput;
export const prayerTeamMemberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  deletedAt: true,
} satisfies Prisma.MemberSelect;
export const prayerTeamUserSelect = {
  id: true,
  email: true,
  deletedAt: true,
  member: { select: prayerTeamMemberSelect },
} satisfies Prisma.UserSelect;
export const prayerTeamSelect = {
  userId: true,
  createdAt: true,
  user: { select: prayerTeamUserSelect },
} satisfies Prisma.PrayerWarriorSelect;
type TeamUser = Prisma.UserGetPayload<{ select: typeof prayerTeamUserSelect }>;
export function prayerTeamEligibility(user: TeamUser) {
  if (user.deletedAt) return 'account-unavailable' as const;
  if (!user.member || user.member.deletedAt)
    return 'profile-unavailable' as const;
  if (!user.email.trim()) return 'email-missing' as const;
  return 'eligible' as const;
}
export function prayerTeamAccount(user: TeamUser) {
  return {
    userId: user.id,
    email: user.email,
    member:
      user.member && !user.member.deletedAt
        ? {
            id: user.member.id,
            firstName: user.member.firstName,
            lastName: user.member.lastName,
          }
        : null,
  };
}
