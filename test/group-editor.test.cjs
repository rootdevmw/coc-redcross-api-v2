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
  churchGroupInput,
  groupEditorId,
  leadershipOptions,
} = require('../src/common/utils/church-group-editor.ts');
const {
  MinistriesService,
} = require('../src/modules/ministries/ministries.service.ts');
const {
  HomecellsService,
} = require('../src/modules/homecells/homecells.service.ts');
const values = {
  name: ' Care group ',
  purpose: 'Serve together',
  location: 'Area',
  description: '<p>Story</p>',
  leaderId: '101',
  overseerId: '102',
};

function fixture(
  kind,
  {
    missing = false,
    absentPeople = false,
    duplicate = false,
    auditFailure = false,
    writeFailure = false,
  } = {},
) {
  const writes = [],
    audits = [],
    slugs = [],
    profileReads = [];
  const before = {
    id: 7n,
    name: 'Old name',
    slug: 'old-stable-url',
    leaderId: 101n,
    overseerId: 102n,
  };
  const delegate = {
    findFirst: async () => (missing ? null : before),
    create: async ({ data }) => {
      if (duplicate) throw { code: 'P2002' };
      if (writeFailure) throw new Error('write failed');
      writes.push(data);
      return { id: 7n, ...data };
    },
    update: async ({ data }) => {
      if (writeFailure) throw new Error('write failed');
      writes.push(data);
      return { ...before, ...data };
    },
  };
  const prisma = {
    $transaction: async (work) =>
      work({
        [kind]: delegate,
        member: {
          count: async (options) => {
            profileReads.push(options);
            return absentPeople ? 0 : options.where.id.in.length;
          },
        },
      }),
  };
  const audit = {
    log: async (entry) => {
      if (auditFailure) throw new Error('audit unavailable');
      audits.push(entry);
    },
  };
  const slug = {
    generateUniqueSlug: async (...args) => {
      slugs.push(args);
      return 'new-group';
    },
  };
  return {
    service:
      kind === 'ministry'
        ? new MinistriesService(prisma, audit, slug)
        : new HomecellsService(prisma, audit, slug),
    writes,
    audits,
    slugs,
    profileReads,
  };
}

test('group validation trims names/purpose, rejects invalid fields and signed IDs, and distinguishes omitted from explicit blank assignments', () => {
  assert.equal(churchGroupInput('ministry', values, false).name, 'Care group');
  assert.equal(
    churchGroupInput('homecell', { name: 'Group' }, false).location,
    undefined,
  );
  assert.equal(
    churchGroupInput('ministry', { name: 'Group' }, true).leaderId,
    undefined,
  );
  assert.equal(
    churchGroupInput('homecell', { leaderId: '' }, true).leaderId,
    '',
  );
  for (const invalid of [
    { name: ' ' },
    { name: 'x'.repeat(192) },
    { purpose: '' },
    { leaderId: 'bad' },
    { overseerId: '0' },
    { description: 'é'.repeat(32768) },
    { leaderId: null },
  ])
    assert.throws(
      () => churchGroupInput('ministry', { ...values, ...invalid }, false),
      (error) => error.getStatus() === 400,
    );
  for (const value of ['-1', '1.5', '9223372036854775808', 101, []])
    assert.throws(
      () => groupEditorId(value),
      (error) => error.getStatus() === 400,
    );
});

test('leadership options use active profile predicates, shared search/count snapshots and stable bounded ordering with minimal fields', async () => {
  const calls = [];
  const prisma = {
    member: {
      findMany: async (options) => {
        calls.push(options);
        return [
          {
            id: 101n,
            firstName: 'A',
            lastName: 'Person',
            prefix: 'DEACON',
            location: 'Area',
          },
        ];
      },
      count: async (options) => {
        calls.push(options);
        return 101;
      },
    },
    $transaction: async (reads, options) => {
      assert.equal(options.isolationLevel, 'RepeatableRead');
      return Promise.all(reads);
    },
  };
  const result = await leadershipOptions(prisma, {
    page: '6',
    limit: '20',
    search: 'A Person',
  });
  assert.deepEqual(result.meta, { page: 6, limit: 20, total: 101 });
  assert.equal(calls[0].skip, 100);
  assert.equal(calls[0].take, 20);
  assert.equal(calls[0].where, calls[1].where);
  assert.equal(calls[0].where.deletedAt, null);
  assert.equal(calls[0].where.AND.length, 2);
  assert.deepEqual(calls[0].orderBy, [
    { firstName: 'asc' },
    { lastName: 'asc' },
    { id: 'asc' },
  ]);
  assert.deepEqual(Object.keys(calls[0].select), [
    'id',
    'firstName',
    'lastName',
    'prefix',
    'location',
  ]);
  for (const query of [
    { page: '0' },
    { limit: '101' },
    { search: ['A', 'B'] },
    { search: 'x'.repeat(201) },
  ])
    await assert.rejects(
      () => leadershipOptions({}, query),
      (error) => error.getStatus() === 400,
    );
});

test('both create services validate active leaders and record the authenticated actor without adding members or changing account roles', async () => {
  for (const kind of ['ministry', 'homecell']) {
    const f = fixture(kind);
    const response = await f.service.create(values, { id: 9n });
    assert.equal(response.data.id, 7n);
    assert.equal(f.writes[0].name, 'Care group');
    assert.equal(f.writes[0].leaderId, 101n);
    assert.equal(f.writes[0].overseerId, 102n);
    assert.equal(f.profileReads[0].where.deletedAt, null);
    assert.deepEqual(f.slugs, [['Care group', kind]]);
    assert.equal(f.audits[0].userId, 9n);
    assert.equal(f.audits[0].action, kind.toUpperCase() + '_CREATED');
    assert.equal(f.writes[0].members, undefined);
    assert.equal(f.writes[0].roles, undefined);
  }
});

test('both updates preserve omitted leaders and explicitly clear empty selections while avoiding unrelated relationship writes', async () => {
  for (const kind of ['ministry', 'homecell']) {
    const kept = fixture(kind);
    await kept.service.update('7', { name: 'Renamed' });
    assert.equal(kept.writes[0].leaderId, undefined);
    assert.equal(kept.writes[0].overseerId, undefined);
    assert.equal(kept.profileReads.length, 0);
    const cleared = fixture(kind);
    await cleared.service.update('7', { leaderId: '', overseerId: '' });
    assert.equal(cleared.writes[0].leaderId, null);
    assert.equal(cleared.writes[0].overseerId, null);
    assert.equal(cleared.writes[0].members, undefined);
  }
});

test('renaming keeps existing public URLs and blank optional description/location writes are explicit', async () => {
  for (const kind of ['ministry', 'homecell']) {
    const f = fixture(kind);
    const result = await f.service.update('7', {
      name: 'New name',
      description: '',
      location: '',
    });
    assert.equal(result.data.slug, 'old-stable-url');
    assert.equal(f.writes[0].slug, undefined);
    assert.equal(f.slugs.length, 0);
    if (kind === 'ministry') assert.equal(f.writes[0].description, '');
    else assert.equal(f.writes[0].location, '');
  }
});

test('unavailable groups/profiles and duplicate homecell assignments fail before a write, while two unassigned roles are valid', async () => {
  for (const kind of ['ministry', 'homecell']) {
    const absent = fixture(kind, { missing: true });
    await assert.rejects(
      () => absent.service.update('7', values),
      (error) => error.getStatus() === 404,
    );
    assert.equal(absent.writes.length, 0);
    const inactive = fixture(kind, { absentPeople: true });
    await assert.rejects(
      () => inactive.service.create(values),
      (error) => error.getStatus() === 400,
    );
    assert.equal(inactive.writes.length, 0);
    const empty = fixture(kind);
    await empty.service.create({ ...values, leaderId: '', overseerId: '' });
    assert.equal(empty.writes.length, 1);
  }
  const f = fixture('homecell');
  await assert.rejects(
    () => f.service.update('7', { overseerId: '101' }),
    (error) => error.getStatus() === 400,
  );
  assert.equal(f.writes.length, 0);
});

test('slug conflicts are explicit and write/audit failures do not produce false success or repeat the operation automatically', async () => {
  for (const kind of ['ministry', 'homecell']) {
    const duplicate = fixture(kind, { duplicate: true });
    await assert.rejects(
      () => duplicate.service.create(values),
      (error) => error.getStatus() === 409,
    );
    assert.equal(duplicate.audits.length, 0);
    const failed = fixture(kind, { writeFailure: true });
    await assert.rejects(() => failed.service.create(values), /write failed/);
    assert.equal(failed.audits.length, 0);
    const uncertain = fixture(kind, { auditFailure: true });
    await assert.rejects(
      () => uncertain.service.create(values),
      /audit unavailable/,
    );
    assert.equal(uncertain.writes.length, 1);
  }
});

test('leadership lookup and group writes retain authenticated pastoral access and forward only the requested lookup filters', () => {
  const { Reflector } = require('@nestjs/core');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    MembersController,
  } = require('../src/modules/members/members.controller.ts');
  const {
    MinistriesController,
  } = require('../src/modules/ministries/ministries.controller.ts');
  const {
    HomecellsController,
  } = require('../src/modules/homecells/homecells.controller.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const guard = new RolesGuard(new Reflector());
  for (const [Controller, method] of [
    [MembersController, 'leadershipOptions'],
    [MinistriesController, 'create'],
    [MinistriesController, 'update'],
    [HomecellsController, 'create'],
    [HomecellsController, 'update'],
  ]) {
    assert.equal(
      Reflect.getMetadata(IS_PUBLIC_KEY, Controller.prototype[method]),
      undefined,
    );
    const context = (role) => ({
      getHandler: () => Controller.prototype[method],
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
    });
    assert.equal(guard.canActivate(context('DEACON')), true);
    assert.throws(
      () => guard.canActivate(context('MEDIA')),
      (error) => error.getStatus() === 403,
    );
  }
  let filters;
  new MembersController({
    leadershipOptions: (query) => {
      filters = query;
    },
  }).leadershipOptions({ page: '6', search: 'Person' });
  assert.deepEqual(filters, { page: '6', search: 'Person' });
});
