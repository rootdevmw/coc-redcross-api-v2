const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  compilerOptions: { emitDecoratorMetadata: false },
});
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: {},
});
const { Logger } = require('@nestjs/common');
Logger.overrideLogger(false);
const {
  accessListPagination,
  userListWhere,
  roleListWhere,
  auditListWhere,
  auditEntityWhere,
} = require('../src/common/utils/access-list-filters.ts');
const { UsersService } = require('../src/modules/users/users.service.ts');
const { RolesService } = require('../src/modules/roles/roles.service.ts');
const {
  AuditReaderService,
} = require('../src/modules/audit/audit.reader.service.ts');
const json = (value) =>
  JSON.stringify(value, (_key, child) =>
    typeof child === 'bigint' ? child.toString() : child,
  );

test('account filters combine name tokens, exact role and linked-profile choices; pagination rejects unsafe values', () => {
  assert.deepEqual(accessListPagination({}), { page: 1, limit: 10 });
  assert.deepEqual(accessListPagination({ page: '2', limit: '20' }), {
    page: 2,
    limit: 20,
  });
  for (const query of [
    { page: '-1' },
    { page: '1.5' },
    { limit: '101' },
    { limit: '0' },
    { page: '9007199254740991', limit: '10' },
  ])
    assert.throws(
      () => accessListPagination(query),
      (error) => error.getStatus() === 400,
    );
  const where = userListWhere({
    search: ' Test Member ',
    role: 'admin',
    linked: 'false',
  });
  assert.deepEqual(
    where.AND,
    ['Test', 'Member'].map((term) => ({
      OR: [
        { email: { contains: term } },
        { member: { firstName: { contains: term } } },
        { member: { lastName: { contains: term } } },
      ],
    })),
  );
  assert.equal(where.deletedAt, null);
  assert.deepEqual(where.roles, { some: { role: { name: 'ADMIN' } } });
  assert.deepEqual(where.member, { is: null });
  assert.deepEqual(userListWhere({ linked: 'true' }).member, { isNot: null });
  assert.deepEqual(roleListWhere({ search: ' ADMIN ' }), {
    deletedAt: null,
    name: { contains: 'ADMIN' },
  });
  for (const query of [{ search: [] }, { linked: 'maybe' }, { role: {} }])
    assert.throws(
      () => userListWhere(query),
      (error) => error.getStatus() === 400,
    );
});

test('actual account services apply the same search to rows and totals, page stably and omit credential fields', async () => {
  const calls = {};
  const prisma = {
    user: {
      findMany: async (options) => {
        calls.users = options;
        return [
          {
            id: 7n,
            email: 'test@example.test',
            password: 'fixture-secret',
            roles: [{ role: { name: 'MEMBER' } }],
            member: {
              id: 12n,
              firstName: 'Test',
              lastName: 'Member',
              phone: 'fixture-private',
            },
            createdAt: new Date(),
          },
        ];
      },
      count: async (options) => {
        calls.userCount = options;
        return 11;
      },
    },
    role: {
      findMany: async (options) => {
        calls.roles = options;
        return [{ id: 2n, name: 'ADMIN' }];
      },
      count: async (options) => {
        calls.roleCount = options;
        return 1;
      },
    },
  };
  const users = await new UsersService(prisma, {}, {}, {}).findAll({
    search: 'Test Member',
    linked: 'true',
    page: 2,
  });
  assert.equal(calls.users.where, calls.userCount.where);
  assert.equal(calls.users.skip, 10);
  assert.equal(calls.users.take, 10);
  assert.deepEqual(calls.users.orderBy, [
    { createdAt: 'desc' },
    { id: 'desc' },
  ]);
  assert.equal(calls.users.select.password, undefined);
  assert.deepEqual(calls.users.select.member, {
    select: { id: true, firstName: true, lastName: true },
  });
  assert.equal(users.meta.total, 11);
  assert.doesNotMatch(json(users), /fixture-/);
  const roles = await new RolesService(prisma, {}).findAll({ search: 'ADMIN' });
  assert.equal(calls.roles.where, calls.roleCount.where);
  assert.deepEqual(calls.roles.where, {
    deletedAt: null,
    name: { contains: 'ADMIN' },
  });
  assert.deepEqual(calls.roles.orderBy, [{ name: 'asc' }, { id: 'asc' }]);
  assert.equal(roles.meta.total, 1);
});

test('audit filters resolve historical entity aliases, preserve exact actions and search full action names with inclusive Malawi dates', () => {
  assert.deepEqual(auditEntityWhere('ProgramTemplate'), {
    in: ['PROGRAMTEMPLATE', 'PROGRAM_TEMPLATE'],
  });
  assert.deepEqual(
    auditEntityWhere('PROGRAM_TEMPLATE'),
    auditEntityWhere('ProgramTemplate'),
  );
  const where = auditListWhere('USER_ROLE', {
    search: ' 7 ',
    actionSearch: 'role changed',
    actorId: '8',
    from: '2026-10-20',
    to: '2026-10-21',
  });
  assert.deepEqual(where.entity, { in: ['USERROLE', 'USER_ROLE'] });
  assert.deepEqual(where.action, { contains: 'ROLE_CHANGED' });
  assert.equal(where.userId, 8n);
  assert.deepEqual(where.entityId, { contains: '7' });
  assert.equal(where.createdAt.gte.toISOString(), '2026-10-19T22:00:00.000Z');
  assert.equal(where.createdAt.lte.toISOString(), '2026-10-21T21:59:59.999Z');
  assert.equal(
    auditListWhere('USER', { action: 'user_updated' }).action,
    'USER_UPDATED',
  );
  for (const query of [
    { actorId: '7/8' },
    { actorId: [] },
    { from: '2026-02-30' },
    { from: '2026-10-22', to: '2026-10-21' },
    { actionSearch: {} },
  ])
    assert.throws(
      () => auditListWhere('USER', query),
      (error) => error.getStatus() === 400,
    );
});

function auditFixture() {
  const calls = [];
  const common = {
    id: 91n,
    entity: 'USER',
    entityId: '7',
    userId: 8n,
    action: 'USER_UPDATED',
    description: null,
    createdAt: new Date('2026-10-21T07:00:00Z'),
    ipAddress: null,
    userAgent: null,
  };
  const logs = [
    {
      ...common,
      before: {
        password: 'fixture-password',
        nested: { reset_token: 'fixture-reset-token', title: 'Allowed' },
        sessions: [{ id: 'fixture-session-array' }],
        roles: [{ name: 'ADMIN', apiKey: 'fixture-api-key' }],
      },
      after: { nested: { title: 'Changed' }, passwordHash: 'fixture-hash' },
    },
    {
      ...common,
      id: 92n,
      entity: 'SESSION',
      entityId: 'fixture-session-id',
      userId: null,
      before: {
        id: 'fixture-session-id',
        userId: '7',
        nested: { cookie: 'fixture-cookie' },
      },
      after: null,
    },
  ];
  const prisma = {
    auditLog: {
      findMany: async (options) => {
        calls.push(['rows', options]);
        return logs;
      },
      count: async (options) => {
        calls.push(['count', options]);
        return logs.length;
      },
    },
    user: {
      findMany: async (options) => {
        calls.push(['actors', options]);
        return [
          {
            id: 8n,
            email: 'actor@example.test',
            password: 'fixture-actor-password',
            member: {
              firstName: 'Test',
              lastName: 'Actor',
              phone: 'fixture-actor-private',
            },
          },
        ];
      },
    },
  };
  return { service: new AuditReaderService(prisma), calls, logs };
}

test('list and timeline responses redact nested credential fields, actor records and session entity IDs before transport', async () => {
  const { service, calls } = auditFixture();
  const result = await service.findByEntity({
    entity: 'USER',
    actionSearch: 'updated',
    page: 1,
    limit: 10,
  });
  assert.equal(calls[0][1].where, calls[1][1].where);
  assert.deepEqual(calls[0][1].orderBy, [
    { createdAt: 'desc' },
    { id: 'desc' },
  ]);
  assert.deepEqual(calls[2][1].select, {
    id: true,
    email: true,
    member: { select: { firstName: true, lastName: true } },
  });
  assert.doesNotMatch(json(result), /fixture-/);
  assert.equal(result.data[0].before.nested.title, 'Allowed');
  assert.equal(result.data[0].after.nested.title, 'Changed');
  assert.deepEqual(result.data[0].before.roles, [{ name: 'ADMIN' }]);
  assert.equal(result.data[0].protectedFields, true);
  assert.equal(result.data[1].entityId, null);
  assert.equal(result.data[1].user, null);
  assert.deepEqual(result.data[0].user, {
    id: 8n,
    email: 'actor@example.test',
    member: { firstName: 'Test', lastName: 'Actor' },
  });
  const timeline = await service.findEntityTimeline({
    entity: 'ProgramTemplate',
    entityId: '7',
  });
  assert.deepEqual(calls[3][1].where, {
    entity: { in: ['PROGRAMTEMPLATE', 'PROGRAM_TEMPLATE'] },
    entityId: '7',
  });
  assert.doesNotMatch(json(timeline), /fixture-/);
});

test('audit responses without actors still redact snapshots and retain missing IDs and null snapshots', async () => {
  let actorReads = 0;
  const service = new AuditReaderService({
    auditLog: {
      findMany: async () => [
        {
          id: 1n,
          entity: 'USER',
          entityId: null,
          userId: null,
          action: 'LOGIN_FAILED',
          before: null,
          after: { password: 'fixture-password', success: false, attempts: 0 },
        },
      ],
      count: async () => 1,
    },
    user: {
      findMany: async () => {
        actorReads++;
        return [];
      },
    },
  });
  const result = await service.findByEntity({ entity: 'USER' });
  assert.equal(actorReads, 0);
  assert.equal(result.data[0].before, null);
  assert.equal(result.data[0].entityId, null);
  assert.equal(result.data[0].user, null);
  assert.deepEqual(result.data[0].after, { success: false, attempts: 0 });
  assert.doesNotMatch(json(result), /fixture-/);
});

test('actual list controller metadata enforces administrator history/accounts and root role definitions', () => {
  const { Reflector } = require('@nestjs/core');
  const {
    UsersController,
  } = require('../src/modules/users/users.controller.ts');
  const {
    RolesController,
  } = require('../src/modules/roles/roles.controller.ts');
  const {
    AuditController,
  } = require('../src/modules/audit/audit.reader.controller.ts');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const guard = new RolesGuard(new Reflector());
  const context = (Controller, method, role) => ({
    getHandler: () => Controller.prototype[method],
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
  });
  for (const [Controller, method, allowed, blocked] of [
    [UsersController, 'findAll', 'ADMIN', 'PASTOR'],
    [RolesController, 'findAll', 'ROOT', 'ADMIN'],
    [AuditController, 'findByEntity', 'ADMIN', 'PASTOR'],
  ]) {
    assert.equal(
      Reflect.getMetadata(IS_PUBLIC_KEY, Controller.prototype[method]),
      undefined,
    );
    assert.equal(guard.canActivate(context(Controller, method, allowed)), true);
    assert.throws(
      () => guard.canActivate(context(Controller, method, blocked)),
      (error) => error.getStatus() === 403,
    );
  }
  let actual;
  new AuditController({
    findByEntity: (params) => {
      actual = params;
    },
  }).findByEntity('USER_ROLE', {
    page: '2',
    actionSearch: 'changed',
    actorId: '8',
    from: '2026-10-20',
    to: '2026-10-21',
  });
  assert.equal(actual.page, '2');
  assert.equal(actual.actorId, '8');
  assert.equal(actual.actionSearch, 'changed');
  assert.equal(actual.to, '2026-10-21');
});
