import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { groupEditorId } from '../../common/utils/church-group-editor';
import { ROLE_HIERARCHY } from './utils/role-hierarchy';
export async function changeAccountRole(
  db: PrismaService,
  audit: AuditService,
  userId: string,
  roleId: string | undefined,
  actor?: { id?: unknown; roles?: string[] },
) {
  if (
    !actor?.roles?.includes('ROOT') ||
    (typeof actor.id !== 'string' && typeof actor.id !== 'bigint')
  )
    throw new ForbiddenException('Only ROOT can change account roles.');
  const actorId = groupEditorId(String(actor.id)),
    targetId = groupEditorId(userId),
    selectedId = roleId === undefined ? undefined : groupEditorId(roleId);
  const result = await db.$transaction(
    async (tx) => {
      const currentActor = await tx.user.findFirst({
        where: {
          id: actorId,
          deletedAt: null,
          roles: { some: { role: { name: 'ROOT', deletedAt: null } } },
        },
        select: { id: true },
      });
      if (!currentActor)
        throw new ForbiddenException(
          'Your current account cannot change roles.',
        );
      const target = await tx.user.findFirst({
        where: { id: targetId, deletedAt: null },
        select: {
          id: true,
          roles: {
            select: {
              role: { select: { id: true, name: true, deletedAt: true } },
            },
          },
        },
      });
      if (!target) throw new NotFoundException('Account not found.');
      const role = await tx.role.findFirst({
        where: {
          ...(selectedId ? { id: selectedId } : { name: 'VISITOR' }),
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (!role) throw new NotFoundException('Role not found.');
      if (!(ROLE_HIERARCHY as readonly string[]).includes(role.name))
        throw new BadRequestException('Choose a supported church role.');
      const before = target.roles
        .filter((link) => !link.role.deletedAt)
        .map((link) => link.role.name);
      if (before.includes('ROOT') && role.name !== 'ROOT') {
        const roots = await tx.user.count({
          where: {
            deletedAt: null,
            roles: { some: { role: { name: 'ROOT', deletedAt: null } } },
          },
        });
        if (roots <= 1)
          throw new ConflictException('Keep at least one active ROOT account.');
      }
      await tx.userRole.deleteMany({ where: { userId: targetId } });
      const relation = await tx.userRole.create({
        data: { userId: targetId, roleId: role.id },
      });
      await tx.session.deleteMany({ where: { userId: targetId } });
      return { relation, before, roleName: role.name };
    },
    { isolationLevel: 'Serializable' },
  );
  await audit.log({
    action: roleId === undefined ? 'ROLE_RESET_TO_VISITOR' : 'ROLE_CHANGED',
    entity: 'UserRole',
    entityId: userId,
    before: { roles: result.before },
    after: { role: result.roleName },
    userId: actorId,
  });
  return { success: true, data: result.relation, meta: {} };
}
