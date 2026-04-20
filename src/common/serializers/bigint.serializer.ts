export function serializeBigInt(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === 'bigint') {
    return data.toString();
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeBigInt);
  }

  if (typeof data === 'object') {
    const result: any = {};

    for (const key in data) {
      result[key] = serializeBigInt(data[key]);
    }

    return result;
  }

  return data;
}
