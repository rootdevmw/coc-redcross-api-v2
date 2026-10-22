import type { Prisma } from '../../generated/prisma/client';

// Strip credential fields from old snapshots as well as newly written history.
// This runs at the API boundary so secrets never reach browser caches or responses.
export function protectAuditSnapshot(
  snapshot: Prisma.JsonValue,
  session = false,
) {
  let protectedFields = false;
  function visit(value: Prisma.JsonValue): Prisma.JsonValue {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, child]) => {
          const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            /password|token|secret|authorization|cookie|credential|privatekey|apikey|sessionid|^sessions$|^salt$/.test(
              normalized,
            ) ||
            (session && normalized === 'id')
          ) {
            protectedFields = true;
            return [];
          }
          return [[key, visit(child ?? null)]];
        }),
      );
    }
    return value;
  }
  return { value: visit(snapshot), protectedFields };
}
