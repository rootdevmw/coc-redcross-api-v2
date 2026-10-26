export function normalizeMemberPrefix(prefix: string): string {
  return prefix === 'ELDER' ? 'PASTOR' : prefix;
}

export function memberPrefixWhere(prefix: string): string | { in: string[] } {
  const normalized = prefix.trim().toUpperCase();
  // Both historical titles identify the same church office.
  return normalizeMemberPrefix(normalized) === 'PASTOR'
    ? { in: ['PASTOR', 'ELDER'] }
    : normalized;
}
