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
  attentionQueueFilters,
  prayerQueueWhere,
  visitorQueueWhere,
} = require('../src/common/utils/attention-queue-filters.ts');
const {
  AttentionQueueService,
} = require('../src/modules/attention/attention.queue.service.ts');
const {
  AttentionService,
} = require('../src/modules/attention/attention.service.ts');

test('queue filters retain open/history states, explicit false urgency and inclusive Malawi dates', () => {
  assert.deepEqual(prayerQueueWhere({}), {
    status: { in: ['PENDING', 'REVIEWED'] },
  });
  assert.deepEqual(visitorQueueWhere({}), { status: 'PENDING' });
  assert.deepEqual(
    prayerQueueWhere({ status: 'all', urgent: 'false', search: ' Family ' }),
    {
      OR: [
        { name: { contains: 'Family' } },
        { prayerFor: { contains: 'Family' } },
      ],
      isUrgent: false,
    },
  );
  const range = attentionQueueFilters('visitors', {
    status: 'COMPLETED',
    from: '2026-10-21',
    to: '2026-10-21',
  }).date;
  assert.equal(range.gte.toISOString(), '2026-10-20T22:00:00.000Z');
  assert.equal(range.lte.toISOString(), '2026-10-21T21:59:59.999Z');
  const where = visitorQueueWhere({
    status: 'COMPLETED',
    search: '123',
    from: '2026-10-21',
  });
  assert.equal(where.status, 'COMPLETED');
  assert.equal(where.visitDate.gte.toISOString(), range.gte.toISOString());
  assert.deepEqual(
    where.OR.map((field) => Object.keys(field)[0]),
    ['name', 'phone', 'email'],
  );
});

test('invalid queue filters and unsafe pagination fail before database reads', async () => {
  const service = new AttentionQueueService({});
  for (const query of [
    { from: '2026-02-30' },
    { from: '2026-10-22', to: '2026-10-21' },
    { status: 'UNKNOWN' },
    { urgent: 'yes' },
    { search: ['one', 'two'] },
    { search: 'x'.repeat(201) },
    { page: '0' },
    { limit: '101' },
    { page: '9007199254740991', limit: '100' },
    { sort: 'random' },
  ]) {
    await assert.rejects(
      () => service.prayers(query, false),
      (error) => error.getStatus() === 400,
    );
  }
  for (const query of [
    { urgent: 'true' },
    { sort: 'priority' },
    { status: 'PRAYED_FOR' },
  ])
    await assert.rejects(
      () => service.visitors(query, false),
      (error) => error.getStatus() === 400,
    );
});

function queueReader(rows) {
  const calls = [];
  const prisma = Object.fromEntries(
    ['prayerRequest', 'visitor'].map((kind) => [
      kind,
      {
        findMany: async (options) => {
          calls.push([kind, 'rows', options]);
          return rows;
        },
        count: async (options) => {
          calls.push([kind, 'count', options]);
          return 21;
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

test('queue readers share filters and snapshots for rows/count, use stable bounded ordering and project compact data', async () => {
  const prayer = queueReader([
    { id: 7n, request: 'x'.repeat(500), status: 'PENDING' },
  ]);
  const result = await new AttentionQueueService(prayer.prisma).prayers(
    { page: '2', search: 'Family', urgent: 'false' },
    false,
  );
  assert.deepEqual(result.meta, {
    page: 2,
    limit: 10,
    total: 21,
    canRecord: false,
  });
  assert.equal(result.data[0].requestPreview.length, 240);
  assert.equal(result.data[0].hasMoreRequest, true);
  assert.equal(result.data[0].request, undefined);
  const options = prayer.calls[0][2];
  assert.equal(options.skip, 10);
  assert.equal(options.take, 10);
  assert.equal(options.where, prayer.calls[1][2].where);
  assert.deepEqual(options.orderBy, [
    { isUrgent: 'desc' },
    { createdAt: 'asc' },
    { id: 'asc' },
  ]);
  assert.equal(options.select.email, undefined);
  assert.equal(options.select.phone, undefined);
  const visitors = queueReader([]);
  const visitResult = await new AttentionQueueService(visitors.prisma).visitors(
    { page: '3', sort: 'newest', status: 'all' },
    true,
  );
  const visitOptions = visitors.calls[0][2];
  assert.equal(visitResult.meta.canRecord, true);
  assert.equal(visitOptions.skip, 20);
  assert.equal(visitOptions.where, visitors.calls[1][2].where);
  assert.deepEqual(visitOptions.orderBy, [
    { visitDate: 'desc' },
    { id: 'desc' },
  ]);
  for (const key of ['message', 'specialNeedsDetails', 'isChurchOfChrist'])
    assert.equal(visitOptions.select[key], undefined);
});

test('queue controllers require pastoral access and derive write capability from the authenticated linked profile', () => {
  const { Reflector } = require('@nestjs/core');
  const {
    AttentionController,
  } = require('../src/modules/attention/attention.controller.ts');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const guard = new RolesGuard(new Reflector());
  const calls = [];
  const controller = new AttentionController(
    {},
    {
      prayers: (...args) => calls.push(args),
      visitors: (...args) => calls.push(args),
    },
  );
  controller.prayerQueue({ canRecord: 'true' }, { user: {} });
  controller.visitorQueue({ page: '2' }, { user: { member: { id: 8n } } });
  assert.deepEqual(calls, [
    [{ canRecord: 'true' }, false],
    [{ page: '2' }, true],
  ]);
  for (const method of [
    'prayerQueue',
    'visitorQueue',
    'markPrayed',
    'acknowledge',
    'getAllPrayers',
    'getAllVisitors',
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
    assert.equal(guard.canActivate(context('ROOT')), true);
    assert.throws(
      () => guard.canActivate(context('MEDIA')),
      (error) => error.getStatus() === 403,
    );
  }
});

const actor = { id: 9n, member: { id: 10n } };
function followUpFixture(
  initial,
  { race = false, failAction = false, failAudit = false } = {},
) {
  let row = initial ? { id: 7n, status: initial } : null;
  const calls = { updates: 0, actions: [], audits: [], emails: [] };
  const table = {
    findFirst: async () => row && { ...row },
    updateMany: async ({ data }) => {
      calls.updates++;
      row.status =
        race && data.status === 'CONFIRMED' ? 'COMPLETED' : data.status;
      return { count: race ? 0 : 1 };
    },
  };
  const prisma = {
    prayerWarrior: {
      findMany: async () => [
        { user: { email: 'fixture@example.test', member: {} } },
      ],
    },
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'ReadCommitted');
      const before = row && { ...row };
      try {
        return await work({
          prayerRequest: table,
          visitor: table,
          attentionAction: {
            create: async ({ data }) => {
              if (failAction) throw new Error('action failed');
              calls.actions.push(data);
            },
          },
        });
      } catch (error) {
        row = before;
        throw error;
      }
    },
  };
  const service = new AttentionService(
    prisma,
    {
      log: async (entry) => {
        calls.audits.push(entry);
        if (failAudit) throw new Error('audit unavailable');
      },
    },
    {
      sendPrayerCompletedNotification: async (...args) =>
        calls.emails.push(args),
    },
  );
  return { service, calls, status: () => row?.status };
}

test('recording prayer transitions pending/reviewed once, with one action, audit and completion notification', async () => {
  for (const status of ['PENDING', 'REVIEWED']) {
    const fixture = followUpFixture(status);
    const first = await fixture.service.markPrayed('7', actor);
    const repeat = await fixture.service.markPrayed('7', actor);
    assert.equal(first.data.status, 'PRAYED_FOR');
    assert.equal(repeat.meta.changed, false);
    assert.equal(fixture.calls.updates, 1);
    assert.equal(fixture.calls.actions.length, 1);
    assert.equal(fixture.calls.actions[0].performedById, actor.member.id);
    assert.equal(fixture.calls.audits.length, 1);
    assert.equal(fixture.calls.emails.length, 1);
  }
});

test('visitor acknowledgement preserves completed visits and conditional races do not create duplicate actions', async () => {
  const pending = followUpFixture('PENDING');
  assert.equal(
    (await pending.service.acknowledgeVisitor('7', actor)).data.status,
    'CONFIRMED',
  );
  await pending.service.acknowledgeVisitor('7', actor);
  assert.equal(pending.calls.actions.length, 1);
  assert.equal(pending.calls.audits.length, 1);
  for (const status of ['CONFIRMED', 'COMPLETED']) {
    const fixture = followUpFixture(status);
    assert.equal(
      (await fixture.service.acknowledgeVisitor('7', actor)).data.status,
      status,
    );
    assert.equal(fixture.calls.updates, 0);
    assert.equal(fixture.calls.actions.length, 0);
  }
  for (const method of ['markPrayed', 'acknowledgeVisitor']) {
    const fixture = followUpFixture('PENDING', { race: true });
    assert.equal(
      (await fixture.service[method]('7', actor)).meta.changed,
      false,
    );
    assert.equal(fixture.calls.actions.length, 0);
    assert.equal(fixture.calls.audits.length, 0);
    assert.equal(fixture.calls.emails.length, 0);
  }
});

test('missing linked profiles/records reject writes and action failures roll back before audit or email', async () => {
  for (const method of ['markPrayed', 'acknowledgeVisitor']) {
    const fixture = followUpFixture('PENDING');
    await assert.rejects(
      () => fixture.service[method]('7', { id: 9n }),
      (error) => error.getStatus() === 403,
    );
    assert.equal(fixture.calls.updates, 0);
    await assert.rejects(
      () => followUpFixture(null).service[method]('7', actor),
      (error) => error.getStatus() === 404,
    );
    const failed = followUpFixture('PENDING', { failAction: true });
    await assert.rejects(
      () => failed.service[method]('7', actor),
      /action failed/,
    );
    assert.equal(failed.status(), 'PENDING');
    assert.equal(failed.calls.audits.length, 0);
    assert.equal(failed.calls.emails.length, 0);
  }
});

test('a later audit failure leaves committed status readable and a retry does not repeat the transition', async () => {
  const fixture = followUpFixture('PENDING', { failAudit: true });
  await assert.rejects(
    () => fixture.service.markPrayed('7', actor),
    /audit unavailable/,
  );
  assert.equal(fixture.status(), 'PRAYED_FOR');
  assert.equal(
    (await fixture.service.markPrayed('7', actor)).meta.changed,
    false,
  );
  assert.equal(fixture.calls.actions.length, 1);
  assert.equal(fixture.calls.audits.length, 1);
  assert.equal(fixture.calls.emails.length, 0);
});
