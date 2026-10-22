const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

// Execute actual services with fixture Prisma methods; no database is opened.
require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  compilerOptions: { emitDecoratorMetadata: false },
});
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: {},
});

const backend = require('../src/common/utils/schedule-list-filters.ts');
test('backend date filters use complete Malawi calendar days and retain exact event timestamp boundaries', () => {
  const events = backend.eventListWhere({
    search: ' Prayer ',
    typeId: '2',
    startDate: '2026-10-21',
    endDate: '2026-10-21',
  });
  assert.deepEqual(events, {
    deletedAt: null,
    title: { contains: 'Prayer' },
    typeId: 2n,
    startTime: {
      gte: new Date('2026-10-20T22:00:00Z'),
      lte: new Date('2026-10-21T21:59:59.999Z'),
    },
  });
  assert.equal(
    backend
      .eventListWhere({ startDate: '2026-10-21T13:10:00Z' })
      .startTime.gte.toISOString(),
    '2026-10-21T13:10:00.000Z',
  );
  const programs = backend.programListWhere({
    date: '2026-10-21',
    typeId: '3',
    homecellId: '9',
  });
  assert.deepEqual(programs, {
    deletedAt: null,
    typeId: 3n,
    homecellId: 9n,
    date: {
      gte: new Date('2026-10-20T22:00:00Z'),
      lte: new Date('2026-10-21T21:59:59.999Z'),
    },
  });
  assert.deepEqual(
    backend.programListWhere({ date: '2026-10-20T22:30:00Z' }).date,
    programs.date,
  );
  assert.equal(
    backend.programListWhere({ fromDate: '2026-10-21' }).date.gte.toISOString(),
    '2026-10-20T22:00:00.000Z',
  );
  assert.deepEqual(
    backend.templateListWhere({
      search: ' Sunday ',
      typeId: '3',
      homecellId: '9',
    }),
    {
      deletedAt: null,
      name: { contains: 'Sunday' },
      typeId: 3n,
      homecellId: 9n,
    },
  );
});

test('backend filters return explicit bad requests for malformed IDs, dates, ranges and duplicate search values', () => {
  for (const action of [
    () => backend.eventListWhere({ startDate: '2026-02-30' }),
    () =>
      backend.eventListWhere({
        startDate: '2026-10-22',
        endDate: '2026-10-21',
      }),
    () => backend.programListWhere({ date: 'not-a-date' }),
    () => backend.templateListWhere({ typeId: '4/5' }),
    () => backend.programListWhere({ homecellId: '-1' }),
    () => backend.eventListWhere({ search: ['one', 'two'] }),
  ]) {
    assert.throws(action, (error) => error.getStatus() === 400);
  }
});

test('actual list services apply matching count filters and deterministic date/identity ordering', async () => {
  for (const [file, className, model, query, expectedWhere, expectedOrder] of [
    [
      'events/events.service.ts',
      'EventsService',
      'event',
      { page: '2', limit: '10', search: 'Prayer', typeId: '2' },
      backend.eventListWhere({ search: 'Prayer', typeId: '2' }),
      [{ startTime: 'asc' }, { id: 'asc' }],
    ],
    [
      'programs/programs.service.ts',
      'ProgramsService',
      'program',
      {
        page: '2',
        limit: '10',
        fromDate: '2026-10-21',
        typeId: '3',
        homecellId: '9',
      },
      backend.programListWhere({
        fromDate: '2026-10-21',
        typeId: '3',
        homecellId: '9',
      }),
      [{ date: 'asc' }, { id: 'asc' }],
    ],
    [
      'program-templates/program-template.service.ts',
      'ProgramTemplatesService',
      'programTemplate',
      {
        page: '2',
        limit: '10',
        search: 'Sunday',
        typeId: '3',
        homecellId: '9',
      },
      backend.templateListWhere({
        search: 'Sunday',
        typeId: '3',
        homecellId: '9',
      }),
      [{ createdAt: 'desc' }, { id: 'desc' }],
    ],
  ]) {
    const calls = {};
    const Service = require('../src/modules/' + file)[className];
    const prisma = {
      [model]: {
        findMany: async (options) => {
          calls.list = options;
          return [{ id: 1n }];
        },
        count: async (options) => {
          calls.count = options;
          return 21;
        },
      },
    };
    const result = await new Service(prisma, {}, {}).findAll(query);
    assert.deepEqual(calls.list.where, expectedWhere);
    assert.equal(calls.list.where, calls.count.where);
    assert.deepEqual(calls.list.orderBy, expectedOrder);
    assert.equal(calls.list.skip, 10);
    assert.equal(calls.list.take, 10);
    assert.equal(result.meta.total, 21);
  }
});
