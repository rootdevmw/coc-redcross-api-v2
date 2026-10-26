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
require('@nestjs/common').Logger.overrideLogger(false);
const { MembersService } = require('../src/modules/members/members.service.ts');
const {
  PublicMembersController,
} = require('../src/modules/members/members.public.controller.ts');

const member = (id, firstName, prefix, deletedAt = null) => ({
  id: BigInt(id),
  firstName,
  lastName: 'Person',
  prefix,
  imageUrl: '/uploads/leader.webp',
  deletedAt,
  phone: 'PRIVATE_PHONE',
  location: 'PRIVATE_LOCATION',
  baptized: true,
  baptismDate: new Date(),
  homecellId: 9n,
  userId: 7n,
  status: 'MEMBER',
  createdAt: new Date(),
  bio: {
    id: 3n,
    bio: 'A published biography.',
    memberId: BigInt(id),
    deletedAt: null,
    createdAt: new Date(),
  },
});
const projection = (row, select) =>
  row === null
    ? null
    : Object.fromEntries(
        Object.entries(select).map(([key, value]) => [
          key,
          value === true ? row[key] : projection(row[key], value.select),
        ]),
      );
function fixture(rows = []) {
  const reads = [];
  const service = new MembersService(
    {
      member: {
        findMany: async (options) => {
          reads.push(options);
          assert.ok(options.select, 'public reads must select approved fields');
          return rows
            .filter(
              (row) =>
                (typeof options.where.prefix === 'string'
                  ? row.prefix === options.where.prefix
                  : options.where.prefix.in.includes(row.prefix)) &&
                row.deletedAt === options.where.deletedAt,
            )
            .sort((a, b) => a.firstName.localeCompare(b.firstName))
            .map((row) => projection(row, options.select));
        },
      },
    },
    {
      log: () => {
        throw new Error('Public reads must not write audits');
      },
    },
  );
  return { controller: new PublicMembersController(service), reads };
}

test('public pastor, elder and prefix lookups return profile fields without personal or account data', async () => {
  const { controller } = fixture([
    member(1, 'A', 'PASTOR'),
    member(2, 'B', 'ELDER'),
    member(3, 'C', 'DEACON'),
  ]);
  for (const [response, total] of [
    [await controller.findPastors(), 2],
    [await controller.findElders(), 2],
    [await controller.findByPrefix('deacon'), 1],
  ]) {
    assert.equal(response.success, true);
    assert.equal(response.meta.total, total);
    for (const profile of response.data) {
      assert.deepEqual(Object.keys(profile).sort(), [
        'bio',
        'firstName',
        'id',
        'imageUrl',
        'lastName',
        'prefix',
      ]);
      assert.deepEqual(Object.keys(profile.bio).sort(), ['bio', 'id']);
      assert.equal(profile.bio.bio, 'A published biography.');
      assert.doesNotMatch(
        JSON.stringify(profile, (_, value) =>
          typeof value === 'bigint' ? String(value) : value,
        ),
        /PRIVATE_/,
      );
    }
  }
});

test('pastor and historical elder lookups share one office, exclude archived people and sort by first name', async () => {
  const { controller, reads } = fixture([
    member(1, 'Z', 'PASTOR'),
    member(2, 'A', 'PASTOR'),
    member(3, 'Archived', 'PASTOR', new Date()),
    member(4, 'Elder', 'ELDER'),
    member(5, 'Archived elder', 'ELDER', new Date()),
  ]);
  assert.deepEqual(
    (await controller.findPastors()).data.map((row) => row.id),
    [2n, 4n, 1n],
  );
  assert.deepEqual(
    (await controller.findElders()).data.map((row) => row.id),
    [2n, 4n, 1n],
  );
  for (const prefix of ['PASTOR', 'ELDER'])
    assert.deepEqual(
      (await controller.findByPrefix(prefix)).data.map((row) => row.id),
      [2n, 4n, 1n],
    );
  reads.forEach((query) => {
    assert.equal(query.where.deletedAt, null);
    assert.deepEqual(query.orderBy, { firstName: 'asc' });
  });
});

test('the Pastor directory filter and export include historical Elder records', async () => {
  const reads = [];
  const service = new MembersService(
    {
      member: {
        findMany: async (options) => {
          reads.push(options);
          return [];
        },
        count: async (options) => {
          reads.push(options);
          return 0;
        },
      },
    },
    {},
  );
  await service.findAll({ prefix: 'PASTOR' });
  await service.exportToXlsx({ prefix: 'PASTOR' });
  assert.equal(reads.length, 3);
  reads.forEach(({ where }) =>
    assert.deepEqual(where.prefix, { in: ['PASTOR', 'ELDER'] }),
  );
});

test('empty public leadership lists stay explicit and unavailable reads do not fabricate profiles', async () => {
  const { controller } = fixture();
  assert.deepEqual(await controller.findPastors(), {
    success: true,
    data: [],
    meta: { total: 0 },
  });
  const service = new MembersService(
    {
      member: {
        findMany: async () => {
          throw new Error('Unavailable');
        },
      },
    },
    {},
  );
  await assert.rejects(
    () => new PublicMembersController(service).findElders(),
    /Unavailable/,
  );
});
