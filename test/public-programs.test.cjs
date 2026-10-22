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
  publicProgramQuery,
  listPublicPrograms,
  readPublicProgram,
} = require('../src/common/utils/public-programs.ts');
const {
  ProgramsService,
} = require('../src/modules/programs/programs.service.ts');
const {
  PublicProgramsController,
} = require('../src/modules/programs/programs.public.controller.ts');
const now = new Date('2026-10-22T22:30:00Z');
const type = {
  id: 2n,
  name: 'Sunday worship',
  deletedAt: null,
  private: 'PRIVATE_TYPE',
};
const homecell = {
  id: 3n,
  slug: 'north',
  name: 'North group',
  location: 'PRIVATE_HOME',
  deletedAt: null,
  leaderId: 90n,
  members: ['PRIVATE_ROSTER'],
};
const person = {
  id: 7n,
  firstName: 'Test',
  lastName: 'Person',
  prefix: 'BROTHER',
  deletedAt: null,
  phone: 'PRIVATE_PHONE',
  userId: 90n,
  location: 'PRIVATE_ADDRESS',
  baptized: true,
};
const activity = (id, sequence, values = {}) => ({
  id: BigInt(id),
  programId: 1n,
  sequence,
  title: 'Activity ' + id,
  description: 'Gather together',
  time: '07:30',
  responsible: person,
  responsibleId: 7n,
  deletedAt: null,
  ...values,
});
const program = (id, date = '2026-10-22T22:00:00Z', values = {}) => ({
  id: BigInt(id),
  slug: 'program-' + id,
  date: new Date(date),
  location: 'Church hall',
  typeId: 2n,
  homecellId: 3n,
  type,
  homecell,
  items: [activity(4, 2), activity(3, 1)],
  createdAt: now,
  deletedAt: null,
  ...values,
});
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((condition) => matches(row, condition));
    if (key === 'AND')
      return value.every((condition) => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('contains' in value)
        return String(row[key] || '')
          .toLowerCase()
          .includes(value.contains.toLowerCase());
      if ('lt' in value || 'gt' in value || 'gte' in value || 'lte' in value)
        return (
          (!value.lt || row[key] < value.lt) &&
          (!value.gt || row[key] > value.gt) &&
          (!value.gte || row[key] >= value.gte) &&
          (!value.lte || row[key] <= value.lte)
        );
      return !!row[key] && matches(row[key], value);
    }
    return row[key] === value;
  });
}
function ordered(rows, orderBy) {
  return [...rows].sort((left, right) => {
    for (const field of [orderBy].flat().filter(Boolean)) {
      const [key, direction] = Object.entries(field)[0];
      const difference =
        left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
      if (difference) return difference * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}
function project(row, select) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(select).map(([key, spec]) => {
      if (spec === true) return [key, row[key]];
      const value = row[key];
      return [
        key,
        Array.isArray(value)
          ? ordered(
              value.filter((item) => matches(item, spec.where)),
              spec.orderBy,
            ).map((item) => project(item, spec.select))
          : project(value, spec.select),
      ];
    }),
  );
}
function fixture(rows = [program(1)], types = [type], fail = false) {
  const calls = [],
    db = {};
  for (const [model, records] of [
    ['program', rows],
    ['programType', types],
  ])
    db[model] = {
      findMany: async (query) => {
        calls.push({ model, operation: 'list', query });
        if (fail) throw new Error('Database unavailable');
        return ordered(
          records.filter((row) => matches(row, query.where)),
          query.orderBy,
        )
          .slice(
            query.skip || 0,
            (query.skip || 0) + (query.take ?? records.length),
          )
          .map((row) => (query.select ? project(row, query.select) : row));
      },
      count: async (query) => {
        calls.push({ model, operation: 'count', query });
        return records.filter((row) => matches(row, query.where)).length;
      },
      findFirst: async (query) => {
        calls.push({ model, operation: 'detail', query });
        if (fail) throw new Error('Database unavailable');
        const row = records.find((row) => matches(row, query.where));
        return row ? (query.select ? project(row, query.select) : row) : null;
      },
    };
  const service = new ProgramsService(db, {}, {});
  return {
    db,
    calls,
    service,
    controller: new PublicProgramsController(service),
  };
}
test('public program query validation rejects malformed or duplicate values before database reads', async () => {
  const { controller, calls } = fixture();
  for (const query of [
    { page: '0' },
    { page: ['1', '2'] },
    { page: '1000001' },
    { limit: '51' },
    { search: ['one', 'two'] },
    { search: 'x'.repeat(201) },
    { period: 'ongoing' },
    { period: ['past', 'upcoming'] },
    { typeId: '0' },
    { typeId: '9223372036854775808' },
    { homecellId: [] },
    { date: '2026-02-30' },
    { date: [] },
    { fromDate: '' },
    { fromDate: '2026-10-22T08:00:00' },
  ])
    await assert.rejects(
      () => controller.findAll(query),
      (error) => error.getStatus() === 400,
    );
  assert.equal(calls.length, 0);
  const parsed = publicProgramQuery({
    page: '2',
    limit: '6',
    search: ' North ',
    period: 'past',
    typeId: '2',
  });
  assert.equal(parsed.search, 'North');
  assert.equal(parsed.typeId, '2');
  assert.equal(parsed.page, 2);
});
test('today remains available for the full Malawi day, with globally ordered paging and matching counts', async () => {
  const { db, calls } = fixture([
    program(5),
    program(4),
    program(1, '2026-10-21T22:00:00Z'),
    program(6, '2026-10-23T22:00:00Z'),
    program(7, undefined, { deletedAt: now }),
  ]);
  const result = await listPublicPrograms(db, { page: '2', limit: '2' }, now);
  assert.deepEqual(
    result.data.map((item) => item.id),
    [6n],
  );
  assert.deepEqual(result.meta, { page: 2, limit: 2, total: 3, totalPages: 2 });
  assert.deepEqual(calls[0].query.where, calls[1].query.where);
  const lastMinute = await listPublicPrograms(
    db,
    {},
    new Date('2026-10-23T21:59:59Z'),
  );
  assert.deepEqual(
    lastMinute.data.map((item) => item.id),
    [4n, 5n, 6n],
  );
  const nextDay = await listPublicPrograms(
    db,
    {},
    new Date('2026-10-23T22:00:00Z'),
  );
  assert.deepEqual(
    nextDay.data.map((item) => item.id),
    [6n],
  );
});
test('past programs use complete calendar days and search matches type, homecell or venue with the same count', async () => {
  const { db } = fixture([
    program(1, '2026-10-20T22:00:00Z'),
    program(2, '2026-10-21T22:00:00Z'),
    program(3),
  ]);
  for (const search of ['Sunday', 'North', 'Church hall']) {
    const result = await listPublicPrograms(
      db,
      { period: 'past', search, typeId: '2', homecellId: '3' },
      now,
    );
    assert.deepEqual(
      result.data.map((item) => item.id),
      [2n, 1n],
    );
    assert.equal(result.meta.total, 2);
  }
  assert.equal(
    (await listPublicPrograms(db, { search: 'Missing' }, now)).meta.total,
    0,
  );
  assert.equal(
    (await listPublicPrograms(db, { homecellId: '99' }, now)).meta.total,
    0,
  );
});
test('public detail projection sorts active activities by sequence and identity without leaking member or group records', async () => {
  const { db } = fixture([
    program(1, undefined, {
      items: [
        activity(9, 2),
        activity(8, 2),
        activity(7, 1, { deletedAt: now }),
        activity(6, 1, { responsible: { ...person, deletedAt: now } }),
      ],
    }),
  ]);
  const result = (await readPublicProgram(db, 'program-1')).data;
  assert.deepEqual(
    result.items.map((item) => item.id),
    [6n, 8n, 9n],
  );
  assert.equal(result.items[0].responsible, null);
  assert.deepEqual(result.homecell, {
    id: 3n,
    name: 'North group',
    slug: 'north',
  });
  assert.deepEqual(result.items[1].responsible, {
    id: 7n,
    firstName: 'Test',
    lastName: 'Person',
    prefix: 'BROTHER',
  });
  assert.doesNotMatch(
    JSON.stringify(result, (_, value) =>
      typeof value === 'bigint' ? String(value) : value,
    ),
    /PRIVATE_|responsibleId|programId|homecellId|typeId|deletedAt|createdAt|leaderId|baptized/,
  );
});
test('archived homecells and types are hidden, including when filtered or searched by their archived name', async () => {
  const { db } = fixture([
    program(1, undefined, {
      type: { ...type, deletedAt: now },
      homecell: { ...homecell, deletedAt: now },
    }),
  ]);
  const detail = (await readPublicProgram(db, 'program-1')).data;
  assert.equal(detail.type, null);
  assert.equal(detail.homecell, null);
  for (const query of [
    { typeId: '2' },
    { homecellId: '3' },
    { search: 'North' },
    { search: 'Sunday' },
  ])
    assert.equal((await listPublicPrograms(db, query, now)).meta.total, 0);
});
test('numeric slugs win over legacy IDs and archived or missing programs do not resolve', async () => {
  const { db } = fixture([
    program(1, undefined, { slug: '2' }),
    program(2),
    program(3, undefined, { deletedAt: now }),
  ]);
  assert.equal((await readPublicProgram(db, '2')).data.id, 1n);
  assert.equal((await readPublicProgram(db, '1')).data.id, 1n);
  for (const address of ['program-3', '3', 'missing', '9223372036854775808'])
    await assert.rejects(
      () => readPublicProgram(db, address),
      (error) => error.getStatus() === 404,
    );
  await assert.rejects(
    () => readPublicProgram(db, '\n'),
    (error) => error.getStatus() === 400,
  );
});
test('explicit date/from-date callers keep their date boundaries, with an explicit period applied only when requested', async () => {
  const { db } = fixture([
    program(1, '2026-10-21T22:00:00Z'),
    program(2),
    program(3, '2026-10-23T22:00:00Z'),
  ]);
  assert.deepEqual(
    (await listPublicPrograms(db, { date: '2026-10-22' }, now)).data.map(
      (item) => item.id,
    ),
    [1n],
  );
  assert.deepEqual(
    (
      await listPublicPrograms(
        db,
        { date: '2026-10-22', period: 'upcoming' },
        now,
      )
    ).data,
    [],
  );
  assert.deepEqual(
    (
      await listPublicPrograms(db, { fromDate: '2026-10-22T22:00:01Z' }, now)
    ).data.map((item) => item.id),
    [3n],
  );
});
test('actual public controller uses restricted reads and active type names while private reads remain intact', async () => {
  const { controller, service, calls } = fixture(
    [program(1, '2099-01-01T00:00:00Z')],
    [type, { ...type, id: 9n, deletedAt: now }],
  );
  assert.deepEqual((await controller.getTypes()).data, [
    { id: 2n, name: 'Sunday worship' },
  ]);
  assert.equal(
    (await controller.findAll()).data[0].homecell.leaderId,
    undefined,
  );
  assert.equal(
    (await controller.findOne('program-1')).data.items[0].responsible.phone,
    undefined,
  );
  assert.equal(
    (await service.findAll({})).data[0].items[0].responsible.phone,
    'PRIVATE_PHONE',
  );
  assert.ok(calls.at(-2).query.include.items.include.responsible);
  assert.equal((await service.getTypes()).data.length, 1);
  const failed = fixture([], [], true);
  await assert.rejects(
    () => failed.controller.findAll(),
    /Database unavailable/,
  );
  await assert.rejects(
    () => failed.controller.findOne('missing'),
    /Database unavailable/,
  );
});
