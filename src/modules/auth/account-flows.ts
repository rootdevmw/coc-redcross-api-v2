import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function accountObject(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Enter valid account details.');
  return input as Record<string, unknown>;
}
export function accountEmail(input: unknown) {
  if (
    typeof input !== 'string' ||
    !isEmail(input.trim()) ||
    input.trim().length > 191
  )
    throw new BadRequestException('Enter a valid email address.');
  return input.trim().toLowerCase();
}
export function accountNewPassword(input: unknown) {
  if (
    typeof input !== 'string' ||
    input.length < 6 ||
    Buffer.byteLength(input, 'utf8') > 72 ||
    input.includes('\u0000')
  )
    throw new BadRequestException(
      'Use a password of at least 6 characters and at most 72 UTF-8 bytes, without null characters.',
    );
  return input;
}
export function accountLoginInput(input: unknown) {
  const source = accountObject(input),
    email = accountEmail(source.email);
  if (typeof source.password !== 'string' || !source.password)
    throw new BadRequestException('Enter your password.');
  return { email, password: source.password };
}
export function accountTokenInput(input: unknown) {
  const source = accountObject(input);
  if (typeof source.token !== 'string' || !/^[a-f0-9]{64}$/i.test(source.token))
    throw new BadRequestException('Use a complete password link.');
  return { token: source.token, password: accountNewPassword(source.password) };
}
type PasswordCrypto = {
  hash: (value: string) => Promise<string>;
  compare: (value: string, hash: string) => Promise<boolean>;
};
const passwords: PasswordCrypto = {
  hash: (value) => bcrypt.hash(value, 10),
  compare: (value, hash) => bcrypt.compare(value, hash),
};
const invalidLink = () =>
  new NotFoundException('Invalid or expired password link.');

export async function finishAccountPassword(
  prisma: PrismaService,
  audit: AuditService,
  input: unknown,
  kind: 'set' | 'reset',
  crypto: PasswordCrypto = passwords,
) {
  const fields = accountTokenInput(input),
    token = createHash('sha256').update(fields.token).digest('hex');
  const candidate = await prisma.passwordResetToken.findUnique({
    where: { token },
  });
  if (!candidate || candidate.expiresAt.getTime() <= Date.now())
    throw invalidLink();
  const hash = await crypto.hash(fields.password);
  const user = await prisma.$transaction(
    async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { token },
      });
      if (!record || record.expiresAt.getTime() <= Date.now())
        throw invalidLink();
      const user = await tx.user.findFirst({
        where: { email: record.email, deletedAt: null },
        select: { id: true, email: true },
      });
      if (!user) throw invalidLink();
      const claimed = await tx.passwordResetToken.deleteMany({
        where: { token, expiresAt: { gt: new Date() } },
      });
      if (claimed.count !== 1) throw invalidLink();
      await tx.user.update({
        where: { id: user.id },
        data: { password: hash },
      });
      await tx.passwordResetToken.deleteMany({ where: { email: user.email } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      return user;
    },
    { isolationLevel: 'Serializable' },
  );
  await audit.log({
    action:
      kind === 'set' ? 'PASSWORD_CHANGED_VIA_RESET' : 'PASSWORD_RESET_SUCCESS',
    entity: 'User',
    entityId: user.id.toString(),
    after: { email: user.email },
  });
  return { success: true, data: {}, meta: {} };
}
export async function changeAccountPassword(
  prisma: PrismaService,
  audit: AuditService,
  userId: unknown,
  input: unknown,
  actorId?: bigint,
  crypto: PasswordCrypto = passwords,
) {
  const source = accountObject(input);
  const id = typeof userId === 'bigint' ? userId.toString() : userId;
  if (
    typeof id !== 'string' ||
    !/^[1-9]\d*$/.test(id) ||
    id.length > 19 ||
    BigInt(id) > 9223372036854775807n
  )
    throw new BadRequestException('Use a valid account.');
  if (typeof source.currentPassword !== 'string' || !source.currentPassword)
    throw new BadRequestException('Enter your current password.');
  const next = accountNewPassword(source.newPassword);
  const before = await prisma.user.findFirst({
    where: { id: BigInt(id), deletedAt: null },
    select: { id: true, email: true, password: true },
  });
  if (!before) throw new NotFoundException('Account not found.');
  if (!(await crypto.compare(source.currentPassword, before.password))) {
    await audit.log({
      action: 'PASSWORD_CHANGE_FAILED',
      entity: 'User',
      entityId: id,
      userId: actorId,
      after: { reason: 'incorrect_current_password' },
    });
    throw new ConflictException('Current password was not accepted.');
  }
  const hash = await crypto.hash(next);
  await prisma.$transaction(
    async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: before.id, deletedAt: null, password: before.password },
        data: { password: hash },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'The password changed during this request. Sign in again before retrying.',
        );
      await tx.passwordResetToken.deleteMany({
        where: { email: before.email },
      });
      await tx.session.deleteMany({ where: { userId: before.id } });
    },
    { isolationLevel: 'Serializable' },
  );
  await audit.log({
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: id,
    userId: actorId,
  });
  return { success: true, data: {}, meta: {} };
}
