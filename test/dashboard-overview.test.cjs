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
  DashboardService,
  dashboardCalendar,
} = require('../src/modules/dashboard/dashboard.service.ts');

function readerPrisma(results = {}) {
  const calls = [];
  const prisma = Object.fromEntries(
    [
      'prayerRequest',
      'visitor',
      'event',
      'program',
      'content',
      'publication',
      'stream',
    ].map((family) => [
      family,
      Object.fromEntries(
        ['count', 'findMany'].map((method) => [
          method,
          async (options) => {
            calls.push([family, method, options]);
            const value = results[family]?.[method];
            return typeof value === 'function'
              ? value(options)
              : (value ?? (method === 'count' ? 0 : []));
          },
        ]),
      ),
    ]),
  );
  prisma.$transaction = async (reads, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return Promise.all(reads);
  };
  return { prisma, calls };
}

test('overview calendar uses the Malawi day and midnight independently of UTC and server timezone', () => {
  const calendar = dashboardCalendar(new Date('2026-10-20T22:30:00Z'));
  assert.equal(calendar.today, '2026-10-21');
  assert.equal(calendar.dayStart.toISOString(), '2026-10-20T22:00:00.000Z');
  assert.equal(
    dashboardCalendar(new Date('2026-10-20T21:59:59Z')).today,
    '2026-10-20',
  );
});

test('care counts pending/reviewed prayers, their urgent subset, and pending visits without reading personal records', async () => {
  const { prisma, calls } = readerPrisma({
    prayerRequest: { count: ({ where }) => (where.isUrgent ? 2 : 5) },
    visitor: { count: 3 },
  });
  const { data } = await new DashboardService(prisma).care();
  assert.equal(data.prayers, 5);
  assert.equal(data.urgentPrayers, 2);
  assert.equal(data.visitors, 3);
  assert.ok(data.generatedAt instanceof Date);
  assert.deepEqual(calls, [
    [
      'prayerRequest',
      'count',
      { where: { status: { in: ['PENDING', 'REVIEWED'] } } },
    ],
    [
      'prayerRequest',
      'count',
      { where: { status: { in: ['PENDING', 'REVIEWED'] }, isUrgent: true } },
    ],
    ['visitor', 'count', { where: { status: 'PENDING' } }],
  ]);
  assert.equal(
    calls.some(([, method]) => method === 'findMany'),
    false,
  );
});

test('planning pairs exact totals with bounded minimal previews and filters ongoing events and whole Malawi program days', async () => {
  const event = {
    id: 7n,
    title: 'Gathering',
    startTime: new Date(),
    endTime: new Date(),
    location: 'Church',
  };
  const program = {
    id: 8n,
    date: new Date(),
    location: null,
    type: { name: 'Worship' },
    homecell: null,
  };
  const { prisma, calls } = readerPrisma({
    event: { count: 4, findMany: [event] },
    program: { count: 6, findMany: [program] },
  });
  const { data } = await new DashboardService(prisma).planning();
  assert.deepEqual(data.events, { total: 4, items: [event] });
  assert.deepEqual(data.programs, { total: 6, items: [program] });
  const [eventCount, eventRows, programCount, programRows] = calls.map(
    ([, , options]) => options,
  );
  assert.equal(eventCount.where, eventRows.where);
  assert.equal(programCount.where, programRows.where);
  assert.deepEqual(eventRows.where, {
    deletedAt: null,
    endTime: { gt: data.generatedAt },
  });
  assert.deepEqual(programRows.where, {
    deletedAt: null,
    date: { gte: dashboardCalendar(data.generatedAt).dayStart },
  });
  assert.equal(data.today, dashboardCalendar(data.generatedAt).today);
  assert.equal(eventRows.take, 3);
  assert.equal(programRows.take, 3);
  assert.deepEqual(eventRows.orderBy, [{ startTime: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(programRows.orderBy, [{ date: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(eventRows.select, {
    id: true,
    title: true,
    startTime: true,
    endTime: true,
    location: true,
  });
  assert.deepEqual(programRows.select, {
    id: true,
    date: true,
    location: true,
    type: { select: { name: true } },
    homecell: { select: { name: true } },
  });
});

test('publishing summaries use actual draft/live predicates and exclude message bodies, attachments and provider secrets', async () => {
  const { prisma, calls } = readerPrisma({
    content: { count: 2 },
    publication: { count: 4 },
    stream: { count: 1, findMany: [{ id: 9n, title: 'Sunday broadcast' }] },
  });
  const { data } = await new DashboardService(prisma).publishing();
  assert.equal(data.messageDrafts, 2);
  assert.equal(data.publicationDrafts, 4);
  assert.equal(data.selectedLive.total, 1);
  assert.deepEqual(calls[0], [
    'content',
    'count',
    { where: { deletedAt: null, status: 'Draft' } },
  ]);
  assert.deepEqual(calls[1], [
    'publication',
    'count',
    { where: { deletedAt: null, publishedAt: null } },
  ]);
  assert.equal(calls[2][2].where, calls[3][2].where);
  assert.deepEqual(calls[3][2], {
    where: { deletedAt: null, isLive: true },
    take: 3,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true },
  });
});

test('failed summaries reject rather than returning fabricated zeroes, while independent sections remain readable', async () => {
  const { prisma } = readerPrisma();
  prisma.prayerRequest.count = async () => {
    throw new Error('fixture unavailable');
  };
  const service = new DashboardService(prisma);
  await assert.rejects(() => service.care(), /unavailable/);
  assert.equal((await service.publishing()).data.messageDrafts, 0);
  assert.deepEqual((await service.planning()).data.events, {
    total: 0,
    items: [],
  });
});

test('real overview routes remain authenticated and role-gated; completed visitors are excluded from notification backlog', async () => {
  const { Reflector } = require('@nestjs/core');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    SessionAuthGuard,
  } = require('../src/modules/auth/guard/session.guard.ts');
  const {
    DashboardController,
  } = require('../src/modules/dashboard/dashboard.controller.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const reflector = new Reflector();
  const context = (method, roles) => ({
    getHandler: () => DashboardController.prototype[method],
    getClass: () => DashboardController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { roles }, cookies: {} }),
    }),
  });
  for (const [method, allowed, blocked] of [
    ['care', 'DEACON', 'MEDIA'],
    ['planning', 'DEACON', 'MEDIA'],
    ['publishing', 'MEDIA', 'MEMBER'],
  ]) {
    assert.equal(
      Reflect.getMetadata(IS_PUBLIC_KEY, DashboardController.prototype[method]),
      undefined,
    );
    assert.equal(
      new RolesGuard(reflector).canActivate(context(method, [allowed])),
      true,
    );
    assert.throws(
      () => new RolesGuard(reflector).canActivate(context(method, [blocked])),
      (error) => error.getStatus() === 403,
    );
    await assert.rejects(
      () =>
        new SessionAuthGuard({}, reflector).canActivate(context(method, [])),
      (error) => error.getStatus() === 401,
    );
  }
  const {
    AttentionService,
  } = require('../src/modules/attention/attention.service.ts');
  const { prisma, calls } = readerPrisma();
  await new AttentionService(prisma, {}, {}).getAttentionOverview();
  const visitors = calls.filter(([family]) => family === 'visitor');
  assert.equal(visitors.length, 2);
  visitors.forEach(([, , options]) =>
    assert.deepEqual(options.where, { status: 'PENDING' }),
  );
});
