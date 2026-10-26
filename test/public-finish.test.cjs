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
const library = require('../src/common/utils/public-library.ts');
const { publicPrayerInput } = require('../src/common/utils/public-prayer.ts');
const { changeAccountRole } = require('../src/modules/auth/role-changes.ts');
const { AuthController } = require('../src/modules/auth/auth.controller.ts');
const {
  AttentionService,
} = require('../src/modules/attention/attention.service.ts');
const { StreamsService } = require('../src/modules/streams/streams.service.ts');
const {
  PublicStreamsController,
} = require('../src/modules/streams/streams.public.controller.ts');
const {
  PublicationService,
} = require('../src/modules/publications/publications.service.ts');
const {
  PublicPublicationsController,
} = require('../src/modules/publications/publications.public.controller.ts');
const now = new Date('2026-10-22T10:00:00Z');
const channel = {
  id: 1n,
  name: 'YouTube',
  url: 'https://youtu.be/abcdefghijk',
  deletedAt: null,
  private: 'PRIVATE_PLATFORM',
};
const broadcast = (id, extra = {}) => ({
  id: BigInt(id),
  slug: `stream-${id}`,
  title: `Sunday ${id}`,
  startsAt: new Date('2026-10-22T09:00:00Z'),
  endsAt: new Date('2026-10-22T11:00:00Z'),
  isLive: true,
  deletedAt: null,
  platforms: [
    { platformId: 1n, platform: channel },
    { platformId: 2n, platform: { ...channel, id: 2n, deletedAt: now } },
  ],
  audit: 'PRIVATE_AUDIT',
  ...extra,
});
const document = (id, extra = {}) => ({
  id: BigInt(id),
  title: `Newsletter ${id}`,
  description: 'Church news',
  fileUrl: '/bulletin.pdf',
  publishedAt: new Date('2026-10-01T09:00:00Z'),
  deletedAt: null,
  authorId: 90n,
  audit: 'PRIVATE_AUDIT',
  ...extra,
});
function matches(row, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return condition.some((value) => matches(row, value));
    if (key === 'AND') return condition.every((value) => matches(row, value));
    if (
      condition &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      if ('contains' in condition)
        return String(row[key] || '')
          .toLowerCase()
          .includes(condition.contains.toLowerCase());
      if ('not' in condition && row[key] === condition.not) return false;
      for (const [op, compare] of Object.entries(condition)) {
        if (['gt', 'gte', 'lt', 'lte'].includes(op)) {
          if (row[key] == null) return false;
          if (
            (op === 'gt' && !(row[key] > compare)) ||
            (op === 'gte' && !(row[key] >= compare)) ||
            (op === 'lt' && !(row[key] < compare)) ||
            (op === 'lte' && !(row[key] <= compare))
          )
            return false;
        }
      }
      if (
        Object.keys(condition).some((op) =>
          ['not', 'gt', 'gte', 'lt', 'lte'].includes(op),
        )
      )
        return true;
      return row[key] != null && matches(row[key], condition);
    }
    return row[key] === condition;
  });
}
function ordered(rows, orderBy) {
  return [...rows].sort((left, right) => {
    for (const field of [orderBy].flat().filter(Boolean)) {
      const [key, direction] = Object.entries(field)[0];
      const delta =
        left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
      if (delta) return delta * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}
function project(row, select) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(select).map(([key, spec]) => [
      key,
      spec === true
        ? row[key]
        : Array.isArray(row[key])
          ? ordered(
              row[key].filter((item) => matches(item, spec.where)),
              spec.orderBy,
            ).map((item) => project(item, spec.select))
          : project(row[key], spec.select),
    ]),
  );
}
function fixture(streams = [broadcast(1)], publications = [document(1)]) {
  const calls = [],
    db = {};
  for (const [model, records] of [
    ['stream', streams],
    ['publication', publications],
    ['platform', [channel, { ...channel, id: 2n, deletedAt: now }]],
  ]) {
    db[model] = {
      findMany: async (query) => {
        calls.push(query);
        return ordered(
          records.filter((row) => matches(row, query.where)),
          query.orderBy,
        )
          .slice(
            query.skip || 0,
            (query.skip || 0) + (query.take ?? records.length),
          )
          .map((row) => project(row, query.select));
      },
      count: async (query) => {
        calls.push(query);
        return records.filter((row) => matches(row, query.where)).length;
      },
      findFirst: async (query) => {
        calls.push(query);
        const row = ordered(
          records.filter((row) => matches(row, query.where)),
          query.orderBy,
        )[0];
        return row ? project(row, query.select) : null;
      },
    };
  }
  return { db, calls };
}
const status = (expected) => (error) => error.getStatus() === expected;
test('broadcast filters validate before reads and preserve stable globally paged search counts', async () => {
  const f = fixture([
    broadcast(1),
    broadcast(2),
    broadcast(3, { title: 'Other', startsAt: new Date('2026-10-23') }),
  ]);
  for (const query of [
    { page: '0' },
    { limit: '51' },
    { search: ['a'] },
    { search: 'x'.repeat(201) },
    { period: ['past'] },
    { period: 'invalid' },
  ])
    await assert.rejects(
      () => library.listPublicBroadcasts(f.db, query, now),
      status(400),
    );
  assert.equal(f.calls.length, 0);
  const result = await library.listPublicBroadcasts(
    f.db,
    { page: '2', limit: '1', search: ' Sunday ' },
    now,
  );
  assert.equal(result.meta.total, 2);
  assert.equal(result.meta.totalPages, 2);
  assert.equal(result.data[0].id, 2n);
  assert.deepEqual(f.calls.at(-1).where, f.calls.at(-2).where);
});
test('live broadcast requires a real flag, active record and current time window', async () => {
  const f = fixture([
    broadcast(1, { endsAt: now }),
    broadcast(2, { startsAt: new Date('2026-10-22T10:01Z') }),
    broadcast(3, { deletedAt: now }),
    broadcast(4, { isLive: false }),
    broadcast(5),
    broadcast(6, { startsAt: new Date('2000-01-01'), endsAt: null }),
    broadcast(7, { startsAt: null }),
    broadcast(8, { startsAt: null, endsAt: null }),
  ]);
  const result = await library.readLiveBroadcast(f.db, now);
  assert.equal(result.data.id, 5n);
  assert.equal(result.data.platforms.length, 1);
  assert.doesNotMatch(
    JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? String(v) : v)),
    /PRIVATE|deletedAt|platformId/,
  );
  assert.equal(
    (await library.readLiveBroadcast(fixture([]).db, now)).data,
    null,
  );
});

test('old open-ended selections are excluded from live and retained in the past library', async () => {
  const old = broadcast(10, { startsAt: new Date('2000-01-01'), endsAt: null });
  const f = fixture([old]);
  assert.equal((await library.readLiveBroadcast(f.db, now)).data, null);
  assert.equal(
    (await library.listPublicBroadcasts(f.db, {}, now)).data.length,
    0,
  );
  assert.deepEqual(
    (
      await library.listPublicBroadcasts(f.db, { period: 'past' }, now)
    ).data.map((row) => row.id),
    [10n],
  );
  assert.equal(
    (await library.readPublicBroadcast(f.db, old.slug)).data.id,
    10n,
  );
});

test('read-only selection review identifies legacy issues without changing records', () => {
  const { reviewLiveSelection } = require('../scripts/audit-live-streams.cjs');
  for (const [extra, expected] of [
    [{ startsAt: null }, 'missing-start'],
    [{ endsAt: null }, 'missing-end'],
    [{ endsAt: new Date('2026-10-22T08:00Z') }, 'invalid-window'],
    [{ endsAt: now }, 'expired'],
    [{ startsAt: new Date('2026-10-22T10:01Z') }, 'future-selection'],
    [{}, 'current-window-confirm-provider'],
  ]) {
    const row = broadcast(1, extra),
      before = structuredClone(row);
    assert.equal(reviewLiveSelection(row, now.getTime()), expected);
    assert.deepEqual(row, before);
  }
});
test('upcoming and past broadcasts exclude archives and respect boundary times', async () => {
  const f = fixture([
    broadcast(1),
    broadcast(2, { endsAt: now }),
    broadcast(3, { isLive: false }),
    broadcast(4, { startsAt: new Date('2026-10-23') }),
    broadcast(5, { deletedAt: now }),
  ]);
  assert.deepEqual(
    (await library.listPublicBroadcasts(f.db, {}, now)).data.map(
      (row) => row.id,
    ),
    [1n, 4n],
  );
  assert.deepEqual(
    (
      await library.listPublicBroadcasts(f.db, { period: 'past' }, now)
    ).data.map((row) => row.id),
    [3n, 2n],
  );
});
test('broadcast details prefer exact numeric slugs then fall back to legacy ids', async () => {
  const f = fixture([
    broadcast(1),
    broadcast(2, { slug: '1' }),
    broadcast(3, { deletedAt: now }),
  ]);
  assert.equal((await library.readPublicBroadcast(f.db, '1')).data.id, 2n);
  assert.equal((await library.readPublicBroadcast(f.db, '2')).data.id, 2n);
  await assert.rejects(
    () => library.readPublicBroadcast(f.db, 'stream-3'),
    status(404),
  );
  assert.deepEqual((await library.publicBroadcastPlatforms(f.db)).data, [
    { id: 1n, name: channel.name, url: channel.url },
  ]);
});
test('publications expose published active records with bounded search, counts and safe fields', async () => {
  const f = fixture(
    [],
    [
      document(1),
      document(2),
      document(3, { publishedAt: null }),
      document(4, { publishedAt: new Date('2099-01-01') }),
      document(5, { deletedAt: now }),
    ],
  );
  const result = await library.listPublicDocuments(
    f.db,
    { search: ' news ', page: '2', limit: '1' },
    now,
  );
  assert.equal(result.meta.total, 2);
  assert.equal(result.data[0].id, 1n);
  assert.deepEqual(Object.keys(result.data[0]).sort(), [
    'description',
    'fileUrl',
    'id',
    'publishedAt',
    'title',
  ]);
  for (const id of ['3', '4', '5'])
    await assert.rejects(
      () => library.readPublicDocument(f.db, id, now),
      status(404),
    );
  await assert.rejects(
    () => library.readPublicDocument(f.db, 'not-an-id', now),
    status(400),
  );
});
test('public controllers delegate to the restricted library services', async () => {
  const f = fixture();
  const streams = new PublicStreamsController(new StreamsService(f.db, {}, {}));
  const publications = new PublicPublicationsController(
    new PublicationService(f.db, {}, {}),
  );
  assert.equal((await streams.findOne('stream-1')).data.id, 1n);
  assert.equal((await streams.getPlatforms()).data.length, 1);
  assert.equal(
    (await publications.findAll({ search: 'Newsletter' })).data.length,
    1,
  );
  assert.equal((await publications.findOne('1')).data.id, 1n);
});
test('personal prayers and malformed fields are rejected before persistence', () => {
  const valid = {
    prayerFor: 'Myself',
    request: ' Pray together. ',
    shareWithElders: 'Yes',
    name: '',
    email: '',
    unknown: 'PRIVATE_EXTRA',
  };
  for (const extra of [
    { shareWithElders: 'No' },
    { shareWithElders: false },
    { request: ' ' },
    { request: 'x'.repeat(16001) },
    { email: 'invalid' },
    { isUrgent: 'true' },
    { phone: ['secret'] },
  ])
    assert.throws(() => publicPrayerInput({ ...valid, ...extra }), status(400));
  assert.deepEqual(publicPrayerInput(valid), {
    name: null,
    phone: null,
    email: null,
    prayerFor: 'Myself',
    request: 'Pray together.',
    requestType: null,
    isUrgent: false,
    shareWithElders: true,
  });
  assert.equal(
    publicPrayerInput({ prayerFor: 'Fixture', request: 'Compatibility' })
      .shareWithElders,
    true,
  );
});
function rolesFixture(options = {}) {
  const state = { roles: ['MEMBER'], sessions: 2 },
    calls = [],
    audits = [];
  const db = {
    $transaction: async (run, settings) => {
      calls.push({ settings });
      const before = structuredClone(state);
      try {
        return await run({
          user: {
            findFirst: async (query) => {
              calls.push(query);
              if (query.where.roles) return options.stale ? null : { id: 1n };
              return options.missingTarget
                ? null
                : {
                    id: 2n,
                    roles: (options.targetRoles || state.roles).map((name) => ({
                      role: { id: 3n, name, deletedAt: null },
                    })),
                  };
            },
            count: async (query) => {
              calls.push(query);
              return options.roots ?? 2;
            },
          },
          role: {
            findFirst: async (query) => {
              calls.push(query);
              return options.missingRole
                ? null
                : {
                    id: query.where.id || 4n,
                    name: options.role || query.where.name || 'PASTOR',
                  };
            },
          },
          userRole: {
            deleteMany: async (query) => {
              calls.push(query);
              state.roles = [];
            },
            create: async ({ data }) => {
              if (options.failCreate) throw new Error('Write failed');
              state.roles = [options.role || 'PASTOR'];
              return data;
            },
          },
          session: {
            deleteMany: async (query) => {
              calls.push(query);
              if (options.failSessions) throw new Error('Session failure');
              state.sessions = 0;
            },
          },
        });
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  const audit = {
    log: async (value) => {
      audits.push(value);
      if (options.failAudit) throw new Error('Audit failure');
    },
  };
  return { db, audit, state, calls, audits };
}
const actor = { id: '1', roles: ['ROOT'] };
test('role changes require ROOT before any reads and recheck current ROOT membership', async () => {
  const f = rolesFixture();
  for (const roles of [['MEMBER'], ['ADMIN'], [], undefined])
    await assert.rejects(
      () => changeAccountRole(f.db, f.audit, '2', '3', { id: '1', roles }),
      status(403),
    );
  assert.equal(f.calls.length, 0);
  const stale = rolesFixture({ stale: true });
  await assert.rejects(
    () => changeAccountRole(stale.db, stale.audit, '2', '3', actor),
    status(403),
  );
  assert.deepEqual(stale.state.roles, ['MEMBER']);
  assert.equal(stale.audits.length, 0);
});
test('role changes validate ids, active targets and supported active roles', async () => {
  const f = rolesFixture();
  await assert.rejects(
    () => changeAccountRole(f.db, f.audit, '0', '3', actor),
    status(400),
  );
  assert.equal(f.calls.length, 0);
  for (const [options, expected] of [
    [{ missingTarget: true }, 404],
    [{ missingRole: true }, 404],
    [{ role: 'UNKNOWN' }, 400],
  ]) {
    const view = rolesFixture(options);
    await assert.rejects(
      () => changeAccountRole(view.db, view.audit, '2', '3', actor),
      status(expected),
    );
    assert.deepEqual(view.state.roles, ['MEMBER']);
    assert.equal(
      view.calls.find((call) => call.where?.id === 2n).where.deletedAt,
      null,
    );
  }
});
test('last ROOT cannot be demoted and transactions use serializable isolation', async () => {
  const f = rolesFixture({ targetRoles: ['ROOT'], roots: 1 });
  await assert.rejects(
    () => changeAccountRole(f.db, f.audit, '2', undefined, actor),
    status(409),
  );
  assert.equal(f.state.sessions, 2);
  assert.deepEqual(f.calls[0].settings, { isolationLevel: 'Serializable' });
  assert.equal(f.audits.length, 0);
});
test('successful role changes replace roles, revoke sessions and audit only role names', async () => {
  const f = rolesFixture();
  const result = await changeAccountRole(f.db, f.audit, '2', '3', actor);
  assert.equal(result.success, true);
  assert.deepEqual(f.state, { roles: ['PASTOR'], sessions: 0 });
  assert.deepEqual(f.audits[0].before, { roles: ['MEMBER'] });
  assert.deepEqual(f.audits[0].after, { role: 'PASTOR' });
  const reset = rolesFixture({ role: 'VISITOR' });
  await changeAccountRole(reset.db, reset.audit, '2', undefined, actor);
  assert.equal(
    reset.calls.find((call) => call.where?.name).where.name,
    'VISITOR',
  );
  assert.equal(reset.audits[0].action, 'ROLE_RESET_TO_VISITOR');
});
test('failed role/session writes roll back and post-commit audit failure remains uncertain', async () => {
  for (const options of [{ failCreate: true }, { failSessions: true }]) {
    const f = rolesFixture(options);
    await assert.rejects(() =>
      changeAccountRole(f.db, f.audit, '2', '3', actor),
    );
    assert.deepEqual(f.state, { roles: ['MEMBER'], sessions: 2 });
    assert.equal(f.audits.length, 0);
  }
  const f = rolesFixture({ failAudit: true });
  await assert.rejects(
    () => changeAccountRole(f.db, f.audit, '2', '3', actor),
    /Audit failure/,
  );
  assert.deepEqual(f.state, { roles: ['PASTOR'], sessions: 0 });
});
test('both HTTP role mutation routes require ROOT', () => {
  for (const method of ['setRole', 'removeRole'])
    assert.deepEqual(
      Reflect.getMetadata('roles', AuthController.prototype[method]),
      ['ROOT'],
    );
});

test('public prayer service rejects personal prayers before writes and returns only the receipt id', async () => {
  const writes = [],
    messages = [];
  const db = {
    prayerRequest: {
      create: async (query) => {
        writes.push(query);
        return { id: 1n, ...query.data };
      },
    },
    prayerWarrior: { findMany: async () => [] },
  };
  const service = new AttentionService(
    db,
    { log: async () => {} },
    { sendPrayerRequestNotification: async (value) => messages.push(value) },
  );
  await assert.rejects(
    () =>
      service.createPrayerRequest({
        prayerFor: 'Myself',
        request: 'PRIVATE_TEXT',
        shareWithElders: 'No',
      }),
    status(400),
  );
  assert.equal(writes.length, 0);
  const result = await service.createPrayerRequest({
    prayerFor: 'Myself',
    request: 'PRIVATE_TEXT',
    shareWithElders: 'Yes',
  });
  assert.deepEqual(result.data, { id: 1n });
  assert.equal(writes.length, 1);
  assert.equal(messages.length, 0);
});
