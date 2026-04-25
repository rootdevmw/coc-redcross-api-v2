import { ForbiddenException } from '@nestjs/common';

export const ROLE_HIERARCHY = [
  'ROOT',
  'ADMIN',
  'PASTOR',
  'DEACON',
  'MEDIA',
  'MEMBER',
  'VISITOR',
] as const;

export type AppRole = (typeof ROLE_HIERARCHY)[number];

function normalizeRole(role: string): AppRole | undefined {
  const normalized = role?.trim().toUpperCase();
  return ROLE_HIERARCHY.find((item) => item === normalized);
}

export function getRoleRank(role: string): number {
  const normalized = normalizeRole(role);
  if (!normalized) return Number.POSITIVE_INFINITY;
  return ROLE_HIERARCHY.indexOf(normalized);
}

export function hasRequiredRole(
  userRoles: string[] = [],
  requiredRoles: string[] = [],
): boolean {
  if (!requiredRoles.length) return true;

  return requiredRoles.some((requiredRole) => {
    const requiredRank = getRoleRank(requiredRole);

    return userRoles.some((userRole) => getRoleRank(userRole) <= requiredRank);
  });
}

export function getHighestRole(userRoles: string[] = []): AppRole | null {
  const sorted = userRoles
    .map(normalizeRole)
    .filter((role): role is AppRole => !!role)
    .sort((a, b) => getRoleRank(a) - getRoleRank(b));

  return sorted[0] ?? null;
}

export function assertCanAssignRole(
  actorRoles: string[] = [],
  targetRole: string,
) {
  const actorHighestRole = getHighestRole(actorRoles);

  if (!actorHighestRole) {
    throw new ForbiddenException('No role assignment permissions');
  }

  const targetRank = getRoleRank(targetRole);

  if (!Number.isFinite(targetRank)) {
    throw new ForbiddenException(`Unknown target role: ${targetRole}`);
  }

  if (actorHighestRole === 'ROOT') {
    return;
  }

  const actorRank = getRoleRank(actorHighestRole);

  if (actorRank >= targetRank) {
    throw new ForbiddenException(
      `You cannot assign the ${targetRole.toUpperCase()} role`,
    );
  }
}
