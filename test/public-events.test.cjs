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
  publicEventQuery,
  listPublicEvents,
  readPublicEvent,
} = require('../src/common/utils/public-events.ts');
const { EventsService } = require('../src/modules/events/events.service.ts');
const {
  PublicEventsController,
} = require('../src/modules/events/events.public.controller.ts');
const now = new Date('2026-10-22T09:00:00Z');
const type = {
  id: 1n,
  name: 'Fellowship',
  deletedAt: null,
  administration: 'PRIVATE_TYPE',
};
const group = {
  id: 4n,
  slug: 'care',
  name: 'Care',
  deletedAt: null,
  leaderId: 99n,
  members: [{ phone: 'PRIVATE_MEMBER' }],
};
const event = (
  id,
  start = '2026-10-23T07:00:00Z',
  end = '2026-10-23T09:00:00Z',
  values = {},
) => ({
  id: BigInt(id),
  slug: 'event-' + id,
  title: 'Gathering ' + id,
  description: '<p>Welcome</p>',
  location: 'Church hall',
  startTime: new Date(start),
  endTime: new Date(end),
  deletedAt: null,
  isCritical: true,
  createdAt: now,
  typeId: 1n,
  type,
  ministries: [{ ministryId: 4n, ministry: group }],
  media: [{ private: true }],
  ...values,
});
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((condition) => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('contains' in value)
        return String(row[key] || '')
          .toLowerCase()
          .includes(value.contains.toLowerCase());
      if ('gt' in value || 'gte' in value || 'lte' in value)
        return (
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
function fixture(rows = [event(1)], types = [type], fail = false) {
  const calls = [],
    db = {};
  for (const [model, records] of [
    ['event', rows],
    ['eventType', types],
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
        const row = records.find((item) => matches(item, query.where));
        return row ? (query.select ? project(row, query.select) : row) : null;
      },
    };
  const service = new EventsService(db, {}, {});
  return {
    db,
    calls,
    service,
    controller: new PublicEventsController(service),
  };
}
test('public event queries validate single bounded page/search/period/date values before database access', async () => {
  assert.deepEqual(
    publicEventQuery({
      page: '2',
      limit: '6',
      search: ' hall ',
      period: 'past',
    }),
    { page: 2, limit: 6, search: 'hall', period: 'past', startDate: undefined },
  );
  const { controller, calls } = fixture();
  for (const query of [
    { page: '0' },
    { page: ['1', '2'] },
    { page: '1000001' },
    { limit: '51' },
    { search: ['a', 'b'] },
    { search: 'x'.repeat(201) },
    { period: ['past', 'upcoming'] },
    { period: 'all' },
    { startDate: [] },
    { startDate: '' },
    { startDate: '2026-02-30' },
  ])
    await assert.rejects(
      () => controller.findAll(query),
      (error) => error.getStatus() === 400,
    );
  assert.equal(calls.length, 0);
});
test('upcoming reads include ongoing events, exclude events at their end boundary, and sort before paging/counting', async () => {
  const rows = [
    event(5),
    event(4),
    event(2, '2026-10-22T08:00:00Z', '2026-10-22T10:00:00Z'),
    event(3, '2026-10-22T07:00:00Z', now.toISOString()),
    event(6, undefined, undefined, { deletedAt: now }),
  ];
  const { db, calls } = fixture(rows);
  const result = await listPublicEvents(db, { page: '2', limit: '2' }, now);
  assert.deepEqual(
    result.data.map((item) => item.id),
    [5n],
  );
  assert.deepEqual(result.meta, { page: 2, limit: 2, total: 3, totalPages: 2 });
  assert.deepEqual(calls[0].query.where, calls[1].query.where);
  const first = await listPublicEvents(db, { limit: '2' }, now);
  assert.deepEqual(
    first.data.map((item) => item.id),
    [2n, 4n],
  );
});
test('past reads include the precise end instant and search title or venue with matching totals', async () => {
  const rows = [
    event(2, '2026-10-22T07:00:00Z', now.toISOString(), { title: 'Prayer' }),
    event(1, '2026-10-21T07:00:00Z', '2026-10-21T09:00:00Z'),
    event(3),
  ];
  const { db } = fixture(rows);
  const past = await listPublicEvents(
    db,
    { period: 'past', search: 'church hall' },
    now,
  );
  assert.deepEqual(
    past.data.map((item) => item.id),
    [2n, 1n],
  );
  const search = await listPublicEvents(
    db,
    { period: 'past', search: 'prayer' },
    now,
  );
  assert.equal(search.meta.total, 1);
  assert.equal(search.data[0].id, 2n);
  assert.equal(
    (await listPublicEvents(db, { search: 'missing' }, now)).meta.total,
    0,
  );
});
test('public event projection excludes administration and member fields and archived related records', async () => {
  const archived = { ...group, id: 5n, deletedAt: now };
  const { db } = fixture([
    event(1, undefined, undefined, {
      type: { ...type, deletedAt: now },
      ministries: [
        { ministryId: 4n, ministry: group },
        { ministryId: 5n, ministry: archived },
      ],
    }),
  ]);
  const result = (await readPublicEvent(db, 'event-1')).data;
  assert.equal(result.type, null);
  assert.deepEqual(result.ministries, [{ id: 4n, name: 'Care', slug: 'care' }]);
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'id',
      'slug',
      'title',
      'description',
      'location',
      'startTime',
      'endTime',
      'type',
      'ministries',
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(result, (_, value) =>
      typeof value === 'bigint' ? String(value) : value,
    ),
    /PRIVATE_|leaderId|isCritical|typeId|createdAt/,
  );
});
test('exact numeric slugs take precedence, legacy IDs fall back, and archived events never resolve', async () => {
  const { db } = fixture([
    event(1, undefined, undefined, { slug: '2' }),
    event(2),
    event(3, undefined, undefined, { deletedAt: now }),
  ]);
  assert.equal((await readPublicEvent(db, '2')).data.id, 1n);
  assert.equal((await readPublicEvent(db, '1')).data.id, 1n);
  for (const address of ['event-3', '3', 'missing', '9223372036854775808'])
    await assert.rejects(
      () => readPublicEvent(db, address),
      (error) => error.getStatus() === 404,
    );
  await assert.rejects(
    () => readPublicEvent(db, '\n'),
    (error) => error.getStatus() === 400,
  );
});
test('public controller paths project active type names and preserve private management reads', async () => {
  const { controller, service, calls } = fixture(
    [event(1, '2099-01-01T07:00:00Z', '2099-01-01T09:00:00Z')],
    [type, { ...type, id: 2n, deletedAt: now }],
  );
  assert.deepEqual((await controller.getTypes()).data, [
    { id: 1n, name: 'Fellowship' },
  ]);
  assert.equal((await controller.findAll()).data[0].isCritical, undefined);
  assert.equal((await controller.findOne('event-1')).data.id, 1n);
  const privateResult = await service.findAll({});
  assert.equal(privateResult.data[0].isCritical, true);
  assert.ok(calls.at(-2).query.include.type);
  assert.equal((await service.getTypes()).data.length, 2);
});
test('legacy start boundaries retain Malawi calendar-day and exact timestamp semantics, with explicit read failures', async () => {
  const { db } = fixture([
    event(1, '2026-10-22T22:00:00Z', '2026-10-23T02:00:00Z'),
    event(2, '2026-10-22T21:59:59Z', '2026-10-23T02:00:00Z'),
  ]);
  assert.deepEqual(
    (await listPublicEvents(db, { startDate: '2026-10-23' }, now)).data.map(
      (item) => item.id,
    ),
    [1n],
  );
  assert.deepEqual(
    (await listPublicEvents(db, { startDate: '2026-10-22T22:00:01Z' }, now))
      .data,
    [],
  );
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
