export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  return BigInt(value);
}

export function toBigIntOptional(
  value?: string | number | bigint | null,
): bigint | undefined {
  if (value === null || value === undefined) return undefined;
  return toBigInt(value);
}
