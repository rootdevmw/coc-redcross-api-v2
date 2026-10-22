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
const {
  listPublicGroups,
  readPublicGroup,
  publicGroupQuery,
  publicGroupIdentifier,
} = require('../src/common/utils/public-groups.ts');
const {
  MinistriesService,
} = require('../src/modules/ministries/ministries.service.ts');
const {
  HomecellsService,
} = require('../src/modules/homecells/homecells.service.ts');
const {
  PublicMinistriesController,
} = require('../src/modules/ministries/ministries.public.controller.ts');
const {
  PublicHomecellsController,
} = require('../src/modules/homecells/homecells.public.controller.ts');
const now = new Date('2026-10-22T22:30:00Z'),
  badRequest = (error) => error.getStatus() === 400,
  missing = (error) => error.getStatus() === 404;
const person = {
  id: 7n,
  firstName: 'Test',
  lastName: 'Person',
  prefix: 'BROTHER',
  imageUrl: '/uploads/profile.webp',
  deletedAt: null,
  phone: 'PRIVATE_PHONE',
  userId: 9n,
  location: 'PRIVATE_LOCATION',
  baptized: true,
  baptismDate: new Date(),
  bio: {
    id: 8n,
    bio: '<p>Published biography</p>',
    memberId: 7n,
    createdAt: new Date(),
  },
  homecellId: 3n,
  ministries: [],
};
const program = (id, date, values = {}) => ({
  id: BigInt(id),
  slug: 'program-' + id,
  date: new Date(date),
  location: 'Group venue',
  deletedAt: null,
  type: { id: 2n, name: 'Homecell prayers', deletedAt: null },
  items: [{ responsible: person }],
  ...values,
});
const event = (id, start, end, values = {}) => ({
  eventId: BigInt(id),
  event: {
    id: BigInt(id),
    slug: 'event-' + id,
    title: 'Gathering ' + id,
    startTime: new Date(start),
    endTime: new Date(end),
    deletedAt: null,
    location: 'Church hall',
    isCritical: false,
    ...values,
  },
});
const ministry = (id, name, values = {}) => ({
  id: BigInt(id),
  name,
  slug: 'ministry-' + id,
  purpose: 'Care & service',
  description: '<p>Our shared purpose</p>',
  deletedAt: null,
  createdAt: new Date(),
  leader: person,
  overseer: { ...person, id: 8n },
  leaderId: 7n,
  overseerId: 8n,
  members: [{ member: person }],
  events: [],
  ...values,
});
const homecell = (id, name, values = {}) => ({
  id: BigInt(id),
  name,
  slug: 'homecell-' + id,
  location: 'North area',
  deletedAt: null,
  createdAt: new Date(),
  leader: person,
  overseer: null,
  leaderId: 7n,
  members: [person],
  programs: [],
  ...values,
});

function matches(row, where = {}) {
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      if (!condition.some((item) => matches(row, item))) return false;
      continue;
    }
    if (
      condition &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      if ('contains' in condition) {
        if (
          !String(row[key] || '')
            .toLowerCase()
            .includes(condition.contains.toLowerCase())
        )
          return false;
      } else if ('gte' in condition || 'gt' in condition) {
        if (condition.gte && !(row[key] >= condition.gte)) return false;
        if (condition.gt && !(row[key] > condition.gt)) return false;
      } else if (!row[key] || !matches(row[key], condition)) return false;
    } else if (row[key] !== condition) return false;
  }
  return true;
}
function ordered(rows, orderBy) {
  const fields = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const field of fields.filter(Boolean)) {
      const [key, direction] = Object.entries(field)[0];
      const nested = direction && typeof direction === 'object',
        next = nested ? Object.keys(direction)[0] : null;
      const left = nested ? a[key][next] : a[key],
        right = nested ? b[key][next] : b[key];
      const difference =
        typeof left === 'string'
          ? left.localeCompare(right, 'en', { sensitivity: 'base' })
          : left < right
            ? -1
            : left > right
              ? 1
              : 0;
      if (difference) return difference * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}
function project(row, select) {
  if (row === null) return null;
  return Object.fromEntries(
    Object.entries(select).map(([key, spec]) => {
      if (spec === true) return [key, row[key]];
      let data = row[key];
      if (Array.isArray(data)) {
        data = ordered(
          data.filter((item) => matches(item, spec.where)),
          spec.orderBy,
        );
        if (spec.take !== undefined) data = data.slice(0, spec.take);
        return [key, data.map((item) => project(item, spec.select))];
      }
      return [key, project(data, spec.select)];
    }),
  );
}
function fixture({
  ministries = [ministry(2, 'Care')],
  homecells = [homecell(3, 'North')],
  members = [person],
  fail = false,
} = {}) {
  const calls = [],
    db = {};
  for (const [model, rows] of [
    ['ministry', ministries],
    ['homecell', homecells],
    ['member', members],
  ])
    db[model] = {
      findMany: async (query) => {
        calls.push({ model, operation: 'list', query });
        if (fail) throw new Error('Database unavailable');
        const selected = ordered(
          rows.filter((row) => matches(row, query.where)),
          query.orderBy,
        ).slice(
          query.skip || 0,
          (query.skip || 0) + (query.take ?? rows.length),
        );
        return selected.map((row) =>
          query.select ? project(row, query.select) : row,
        );
      },
      count: async (query) => {
        calls.push({ model, operation: 'count', query });
        return rows.filter((row) => matches(row, query.where)).length;
      },
      findFirst: async (query) => {
        calls.push({ model, operation: 'detail', query });
        if (fail) throw new Error('Database unavailable');
        const row = rows.find((row) => matches(row, query.where));
        return row ? (query.select ? project(row, query.select) : row) : null;
      },
    };
  const ministriesService = new MinistriesService(db, {}, {}),
    homecellsService = new HomecellsService(db, {}, {});
  return {
    db,
    calls,
    ministriesService,
    homecellsService,
    ministriesController: new PublicMinistriesController(ministriesService),
    homecellsController: new PublicHomecellsController(homecellsService),
  };
}

test('public group queries bound pages, limits and single search values before database access', async () => {
  assert.deepEqual(
    publicGroupQuery({ page: '2', limit: '6', search: ' Care ' }),
    { page: 2, limit: 6, search: 'Care' },
  );
  const { ministriesController, homecellsController, calls } = fixture();
  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '1000001' },
    { limit: '51' },
    { page: ['1', '2'] },
    { search: ['Care', 'North'] },
    { search: 'x'.repeat(201) },
  ]) {
    await assert.rejects(() => ministriesController.findAll(query), badRequest);
    await assert.rejects(() => homecellsController.findAll(query), badRequest);
  }
  assert.equal(calls.length, 0);
});

test('both public directories sort globally before pagination and share row/count constraints', async () => {
  const { db, calls } = fixture({
    ministries: Array.from({ length: 13 }, (_, index) =>
      ministry(index + 1, String(13 - index).padStart(2, '0')),
    ),
    homecells: Array.from({ length: 13 }, (_, index) =>
      homecell(index + 1, String(13 - index).padStart(2, '0')),
    ),
  });
  for (const kind of ['ministry', 'homecell']) {
    const result = await listPublicGroups(
      db,
      kind,
      { page: '2', limit: '6' },
      now,
    );
    assert.deepEqual(
      result.data.map((group) => group.name),
      ['07', '08', '09', '10', '11', '12'],
    );
    assert.deepEqual(result.meta, {
      page: 2,
      limit: 6,
      total: 13,
      totalPages: 3,
    });
    const reads = calls.filter((item) => item.model === kind);
    assert.equal(reads[0].query.where, reads[1].query.where);
    assert.deepEqual(reads[0].query.orderBy, [{ name: 'asc' }, { id: 'asc' }]);
    assert.equal(reads[0].query.skip, 6);
  }
});

test('public ministry purpose and homecell area searches return accurate totals and exclude archived groups', async () => {
  const { ministriesController, homecellsController } = fixture({
    ministries: [
      ministry(1, 'Care', { purpose: 'Practical support' }),
      ministry(2, 'Archived', {
        purpose: 'Practical support',
        deletedAt: new Date(),
      }),
      ministry(3, 'Other', { purpose: 'Teaching' }),
    ],
    homecells: [
      homecell(1, 'Central', { location: 'North area' }),
      homecell(2, 'Archived', {
        location: 'North area',
        deletedAt: new Date(),
      }),
      homecell(3, 'Other', { location: 'South area' }),
    ],
  });
  const ministries = await ministriesController.findAll({
      search: 'support',
      limit: '6',
    }),
    homecells = await homecellsController.findAll({
      search: 'North',
      limit: '6',
    });
  assert.equal(ministries.meta.total, 1);
  assert.equal(homecells.meta.total, 1);
  assert.equal(ministries.data[0].name, 'Care');
  assert.equal(homecells.data[0].name, 'Central');
});

test('public group list/detail projections exclude rosters, personal fields and archived leaders', async () => {
  const { ministriesController, homecellsController } = fixture({
    ministries: [
      ministry(2, 'Care', { overseer: { ...person, deletedAt: new Date() } }),
    ],
  });
  const results = [
    (await ministriesController.findAll({})).data[0],
    (await ministriesController.findOne('ministry-2')).data,
    (await homecellsController.findAll({})).data[0],
    (await homecellsController.findOne('homecell-3')).data,
  ];
  for (const group of results) {
    for (const field of [
      'members',
      'leaderId',
      'overseerId',
      'deletedAt',
      'createdAt',
    ])
      assert.ok(!(field in group));
    assert.deepEqual(Object.keys(group.leader).sort(), [
      'bio',
      'firstName',
      'id',
      'imageUrl',
      'lastName',
      'prefix',
    ]);
    assert.deepEqual(Object.keys(group.leader.bio).sort(), ['bio', 'id']);
    assert.equal(group.overseer, null);
    assert.doesNotMatch(
      JSON.stringify(group, (_, value) =>
        typeof value === 'bigint' ? String(value) : value,
      ),
      /PRIVATE_/,
    );
  }
});

test('ministry gatherings include ongoing and future events in order and exclude archived or completed events', async () => {
  const rows = [
    event(1, '2026-10-22T22:00:00Z', '2026-10-22T23:30:00Z'),
    event(2, '2026-10-22T20:00:00Z', '2026-10-22T22:30:00Z'),
    event(3, '2026-10-23T08:00:00Z', '2026-10-23T10:00:00Z'),
    event(4, '2026-10-23T08:00:00Z', '2026-10-23T10:00:00Z', {
      deletedAt: new Date(),
    }),
  ];
  const { db, calls } = fixture({
    ministries: [ministry(2, 'Care', { events: rows })],
  });
  const result = await readPublicGroup(db, 'ministry', 'ministry-2', now);
  assert.deepEqual(
    result.data.events.map((row) => row.id),
    [1n, 3n],
  );
  assert.equal(calls[0].query.select.events.take, 5);
  assert.deepEqual(Object.keys(result.data.events[0]).sort(), [
    'endTime',
    'id',
    'location',
    'slug',
    'startTime',
    'title',
  ]);
});

test('homecell programs retain the whole current Malawi day and provide the earliest list program with bounded detail records', async () => {
  const programs = [
    program(4, '2026-10-24T22:00:00Z'),
    program(2, '2026-10-22T22:00:00Z'),
    program(1, '2026-10-21T22:00:00Z'),
    program(3, '2026-10-23T22:00:00Z', { deletedAt: new Date() }),
  ];
  const { db, calls } = fixture({
    homecells: [homecell(3, 'North', { programs })],
  });
  const list = await listPublicGroups(db, 'homecell', { limit: '6' }, now),
    detail = await readPublicGroup(db, 'homecell', 'homecell-3', now);
  assert.deepEqual(
    list.data[0].programs.map((row) => row.id),
    [2n],
  );
  assert.deepEqual(
    detail.data.programs.map((row) => row.id),
    [2n, 4n],
  );
  assert.equal(
    calls[0].query.select.programs.where.date.gte.toISOString(),
    '2026-10-22T22:00:00.000Z',
  );
  assert.equal(calls[0].query.select.programs.take, 1);
  assert.deepEqual(Object.keys(detail.data.programs[0]).sort(), [
    'date',
    'id',
    'location',
    'slug',
    'type',
  ]);
});

test('public slug and legacy-ID reads exclude archived groups and give an exact numeric slug priority', async () => {
  const { ministriesController, homecellsController } = fixture({
    ministries: [
      ministry(2, 'Numeric slug', { slug: '3' }),
      ministry(3, 'Other'),
      ministry(4, 'Archived', { deletedAt: new Date() }),
    ],
    homecells: [
      homecell(2, 'Numeric slug', { slug: '3' }),
      homecell(3, 'Other'),
      homecell(4, 'Archived', { deletedAt: new Date() }),
    ],
  });
  for (const controller of [ministriesController, homecellsController]) {
    assert.equal((await controller.findOne('3')).data.id, 2n);
    assert.equal((await controller.findOne('2')).data.id, 2n);
    for (const address of ['4', 'ministry-4', 'homecell-4', 'missing'])
      await assert.rejects(() => controller.findOne(address), missing);
  }
  assert.equal(publicGroupIdentifier('9'.repeat(100)).legacyId, null);
  for (const address of ['', 'x'.repeat(301), 'bad\u0000slug'])
    assert.throws(() => publicGroupIdentifier(address), badRequest);
});

test('the existing public homecell roster endpoint exposes identity fields only and checks the active parent group', async () => {
  const { homecellsController, homecellsService } = fixture({
    members: [person, { ...person, id: 9n, deletedAt: new Date() }],
  });
  const result = await homecellsController.getMembers('3');
  assert.equal(result.data.length, 1);
  assert.deepEqual(Object.keys(result.data[0]).sort(), [
    'firstName',
    'id',
    'lastName',
    'prefix',
  ]);
  const privateResult = await homecellsService.getMembers('3');
  assert.equal(privateResult.data[0].phone, 'PRIVATE_PHONE');
  await assert.rejects(() => homecellsController.getMembers('999'), missing);
  await assert.rejects(
    () => homecellsController.getMembers('9223372036854775808'),
    badRequest,
  );
});

test('private group directories and detail views retain their existing contact and membership relationships', async () => {
  const { ministriesService, homecellsService } = fixture();
  assert.equal(
    (await ministriesService.findAll({})).data[0].leader.phone,
    'PRIVATE_PHONE',
  );
  assert.equal(
    (await ministriesService.findOne('2')).data.members[0].member.phone,
    'PRIVATE_PHONE',
  );
  const result = await homecellsService.findAll();
  assert.deepEqual(result.meta, {});
  assert.equal(result.data[0].members[0].phone, 'PRIVATE_PHONE');
  assert.equal(
    (await homecellsService.findOne('3')).data.leader.phone,
    'PRIVATE_PHONE',
  );
});

test('unavailable public group reads fail explicitly without inventing empty successful responses', async () => {
  const { ministriesController, homecellsController } = fixture({ fail: true });
  for (const controller of [ministriesController, homecellsController]) {
    await assert.rejects(() => controller.findAll({}), /Database unavailable/);
    await assert.rejects(
      () => controller.findOne('missing'),
      /Database unavailable/,
    );
  }
});
