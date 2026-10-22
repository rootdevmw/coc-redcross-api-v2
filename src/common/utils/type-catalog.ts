import { BadRequestException, ConflictException } from '@nestjs/common';

export function catalogTypeName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new BadRequestException(
      'Enter a type name from 1 to 100 characters.',
    );
  }
  return value.trim();
}

export function catalogTypeId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException('Choose a valid type ID.');
  }
  return BigInt(value);
}

export function rethrowCatalogWrite(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'A type with this name already exists. Choose another name.',
    );
  }
  throw error;
}
