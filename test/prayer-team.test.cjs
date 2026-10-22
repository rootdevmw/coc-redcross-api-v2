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
  prayerTeamId,
  prayerTeamSearch,
  prayerTeamEligibility,
  prayerNotificationUser,
} = require('../src/common/utils/prayer-team.ts');
const {
  PrayerTeamService,
} = require('../src/modules/attention/prayer-team.service.ts');
const user = {
  id: 101n,
  email: 'fixture@example.test',
  deletedAt: null,
  member: { id: 22n, firstName: 'A', lastName: 'Person', deletedAt: null },
  password: 'private-password',
};
const createdAt = new Date('2026-10-21T08:00:00Z');
const json = (value) =>
  JSON.stringify(value, (_key, data) =>
    typeof data === 'bigint' ? data.toString() : data,
  );

test('team search combines name/email tokens, rejects duplicate/oversize input and validates signed database identifiers', async () => {
  assert.equal(prayerTeamSearch({ search: ' A Person ' }).length, 2);
  assert.deepEqual(
    prayerTeamSearch({ search: 'Person' })[0].OR.map(
      (field) => Object.keys(field)[0],
    ),
    ['email', 'member', 'member'],
  );
  assert.equal(prayerTeamId('9223372036854775807'), 9223372036854775807n);
  for (const value of [
    undefined,
    null,
    1,
    '',
    '0',
    '-1',
    '1.5',
    '1e2',
    '9223372036854775808',
    '1'.repeat(500),
  ])
    assert.throws(
      () => prayerTeamId(value),
      (error) => error.getStatus() === 400,
    );
  const service = new PrayerTeamService({}, {});
  for (const query of [
    { search: ['one', 'two'] },
    { search: 'x'.repeat(201) },
    { page: '0' },
    { page: '9007199254740991', limit: '100' },
    { limit: '101' },
  ]) {
    await assert.rejects(
      () => service.roster(query),
      (error) => error.getStatus() === 400,
    );
    await assert.rejects(
      () => service.eligible(query),
      (error) => error.getStatus() === 400,
    );
  }
});

function reader(rows) {
  const calls = [];
  const prisma = Object.fromEntries(
    ['user', 'prayerWarrior'].map((kind) => [
      kind,
      {
        findMany: async (options) => {
          calls.push([kind, 'rows', options]);
          return rows;
        },
        count: async (options) => {
          calls.push([kind, 'count', options]);
          return 111;
        },
      },
    ]),
  );
  prisma.$transaction = async (reads, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return Promise.all(reads);
  };
  return { prisma, calls };
}

test('roster search/count share a snapshot and stable bounded page while response projection removes credentials', async () => {
  const { prisma, calls } = reader([{ userId: user.id, createdAt, user }]);
  const service = new PrayerTeamService(prisma, {});
  const result = await service.roster({ page: '12', search: 'A Person' });
  assert.deepEqual(result.meta, { page: 12, limit: 10, total: 111 });
  assert.equal(result.data[0].eligibility, 'eligible');
  assert.doesNotMatch(json(result), /private-password|deletedAt/);
  const options = calls[0][2];
  assert.equal(options.skip, 110);
  assert.equal(options.take, 10);
  assert.equal(options.where, calls[1][2].where);
  assert.equal(options.where.user.is.AND.length, 2);
  assert.deepEqual(options.orderBy, [
    { createdAt: 'desc' },
    { userId: 'desc' },
  ]);
  assert.equal(options.select.user.select.password, undefined);
  assert.doesNotMatch(
    json(await service.legacyRoster()),
    /private-password|deletedAt/,
  );
});

test('eligible search reaches later pages, excludes assigned/removed/unlinked accounts and selects only required identity fields', async () => {
  const { prisma, calls } = reader([user]);
  const result = await new PrayerTeamService(prisma, {}).eligible({
    page: '12',
    search: 'Person',
  });
  assert.equal(result.data[0].userId, 101n);
  assert.doesNotMatch(json(result), /private-password|deletedAt/);
  const options = calls[0][2];
  assert.equal(options.skip, 110);
  assert.equal(options.take, 10);
  assert.equal(options.where, calls[1][2].where);
  assert.equal(options.where.deletedAt, null);
  assert.deepEqual(options.where.member, { is: { deletedAt: null } });
  assert.deepEqual(options.where.prayerWarriors, { none: {} });
  assert.deepEqual(options.where.email, { not: '' });
  assert.deepEqual(options.orderBy, [{ email: 'asc' }, { id: 'asc' }]);
  assert.equal(options.select.password, undefined);
});

test('roster flags removed accounts, missing/removed profiles and missing email while retaining entries for cleanup', () => {
  assert.equal(
    prayerTeamEligibility({ ...user, deletedAt: createdAt }),
    'account-unavailable',
  );
  assert.equal(
    prayerTeamEligibility({ ...user, member: null }),
    'profile-unavailable',
  );
  assert.equal(
    prayerTeamEligibility({
      ...user,
      member: { ...user.member, deletedAt: createdAt },
    }),
    'profile-unavailable',
  );
  assert.equal(prayerTeamEligibility({ ...user, email: '' }), 'email-missing');
});

test('team additions revalidate active profiles, report duplicate membership and record the real actor without modifying roles', async () => {
  const audits = [];
  const options = [];
  let current = user;
  let duplicate = false;
  let writes = 0;
  const service = new PrayerTeamService(
    {
      user: {
        findFirst: async (query) => {
          options.push(query);
          return current;
        },
      },
      prayerWarrior: {
        create: async (query) => {
          writes++;
          assert.deepEqual(query.data, { userId: 101n });
          if (duplicate) throw { code: 'P2002' };
          return { userId: 101n, createdAt };
        },
      },
    },
    { log: async (entry) => audits.push(entry) },
  );
  const result = await service.add('101', 9n);
  assert.equal(result.data.userId, 101n);
  assert.deepEqual(options[0].where, { id: 101n, deletedAt: null });
  assert.equal(audits[0].userId, 9n);
  assert.equal(audits[0].entityId, '101');
  assert.doesNotMatch(json(audits), /private-password/);
  duplicate = true;
  await assert.rejects(
    () => service.add('101', 9n),
    (error) => error.getStatus() === 409,
  );
  assert.equal(audits.length, 1);
  for (const invalid of [
    null,
    { ...user, deletedAt: createdAt },
    { ...user, member: null },
    { ...user, member: { ...user.member, deletedAt: createdAt } },
    { ...user, email: '' },
  ]) {
    current = invalid;
    await assert.rejects(
      () => service.add('101', 9n),
      (error) => [400, 404].includes(error.getStatus()),
    );
  }
  assert.equal(writes, 2);
});

test('removals are repeat-safe and uncertain audit failure leaves membership changes visible for refresh', async () => {
  let count = 1;
  const audits = [];
  const service = new PrayerTeamService(
    {
      prayerWarrior: {
        deleteMany: async (query) => {
          assert.deepEqual(query.where, { userId: 101n });
          const result = { count };
          count = 0;
          return result;
        },
      },
    },
    { log: async (entry) => audits.push(entry) },
  );
  assert.equal((await service.remove('101', 9n)).data.removed, true);
  assert.equal((await service.remove('101', 9n)).data.removed, false);
  assert.equal(audits.length, 1);
  let added = false;
  const uncertain = new PrayerTeamService(
    {
      user: { findFirst: async () => user },
      prayerWarrior: {
        create: async () => {
          added = true;
          return { userId: 101n, createdAt };
        },
      },
    },
    {
      log: async () => {
        throw new Error('audit unavailable');
      },
    },
  );
  await assert.rejects(() => uncertain.add('101', 9n), /audit unavailable/);
  assert.equal(added, true);
});

test('team routes remain authenticated pastoral operations and pass paging, selected account and authenticated actor to the service', () => {
  const { Reflector } = require('@nestjs/core');
  const {
    AttentionController,
  } = require('../src/modules/attention/attention.controller.ts');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const guard = new RolesGuard(new Reflector());
  for (const method of [
    'teamRoster',
    'eligibleTeamAccounts',
    'getPrayerWarriors',
    'addPrayerWarrior',
    'removePrayerWarrior',
  ]) {
    assert.equal(
      Reflect.getMetadata(IS_PUBLIC_KEY, AttentionController.prototype[method]),
      undefined,
    );
    const context = (role) => ({
      getHandler: () => AttentionController.prototype[method],
      getClass: () => AttentionController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
    });
    assert.equal(guard.canActivate(context('DEACON')), true);
    assert.equal(guard.canActivate(context('ADMIN')), true);
    assert.throws(
      () => guard.canActivate(context('MEDIA')),
      (error) => error.getStatus() === 403,
    );
  }
  const calls = [];
  const controller = new AttentionController(
    {},
    {},
    Object.fromEntries(
      ['roster', 'eligible', 'add', 'remove'].map((method) => [
        method,
        (...args) => calls.push([method, ...args]),
      ]),
    ),
  );
  controller.teamRoster({ page: '12', search: 'Family' });
  controller.eligibleTeamAccounts({ page: '2' });
  controller.addPrayerWarrior(
    { userId: '101', actorId: 'untrusted' },
    { user: { id: 9n } },
  );
  controller.removePrayerWarrior('101', { user: { id: 9n } });
  assert.deepEqual(calls, [
    ['roster', { page: '12', search: 'Family' }],
    ['eligible', { page: '2' }],
    ['add', '101', 9n],
    ['remove', '101', 9n],
  ]);
});

test('prayer notification lookup uses the same active-profile predicate and omits credential data', async () => {
  const {
    AttentionService,
  } = require('../src/modules/attention/attention.service.ts');
  let lookup;
  const sent = [];
  const service = new AttentionService(
    {
      prayerRequest: { create: async () => ({ id: 7n }) },
      prayerWarrior: {
        findMany: async (options) => {
          lookup = options;
          return [
            { user },
            { user: { ...user, email: '   ' } },
            { user: { ...user, member: null } },
          ];
        },
      },
    },
    { log: async () => {} },
    { sendPrayerRequestNotification: async (email) => sent.push(email) },
  );
  await service.createPrayerRequest({
    prayerFor: 'Fixture',
    request: 'Fixture',
  });
  assert.deepEqual(lookup.where, { user: { is: prayerNotificationUser } });
  assert.equal(lookup.select.user.select.email, true);
  assert.equal(lookup.select.user.select.password, undefined);
  assert.equal(lookup.include, undefined);
  assert.deepEqual(sent, [user.email]);
});
