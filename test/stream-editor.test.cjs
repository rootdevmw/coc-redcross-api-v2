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
  streamEditorInput,
  streamEditorId,
  streamPlatformInput,
  streamPlatformUrl,
} = require('../src/modules/streams/stream-editor.ts');
const { StreamsService } = require('../src/modules/streams/streams.service.ts');
const {
  StreamsController,
} = require('../src/modules/streams/streams.controller.ts');
const badRequest = (error) => error.getStatus() === 400;
const start = new Date('2099-10-22T07:00:00.123Z');
function fixture({
  missing = false,
  failWrite = false,
  failRelations = false,
  failAudit = false,
  duplicate = false,
  conflict = false,
  selected = false,
  startsAt = start,
  endsAt = null,
  platformIds = [4n],
  platformMissing = false,
  slug = 'stable-stream-address',
} = {}) {
  let streams = [
    {
      id: 7n,
      title: 'Sunday service',
      slug,
      isLive: selected,
      startsAt,
      endsAt,
      platformIds,
      deletedAt: null,
    },
    {
      id: 8n,
      title: 'Previous selection',
      slug: 'previous',
      isLive: true,
      startsAt: new Date('2000-01-01T07:00Z'),
      endsAt: null,
      platformIds: [4n],
      deletedAt: null,
    },
    {
      id: 9n,
      title: 'Archived',
      isLive: true,
      deletedAt: new Date(),
      platformIds: [],
    },
  ];
  let platforms = [
    {
      id: 4n,
      name: 'YouTube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      deletedAt: null,
    },
    {
      id: 5n,
      name: 'Church channel',
      url: 'https://video.example/church',
      deletedAt: null,
    },
    {
      id: 6n,
      name: 'Archived',
      url: 'https://example.com/old',
      deletedAt: new Date(),
    },
    { id: 10n, name: 'Broken', url: 'javascript:bad', deletedAt: null },
  ];
  let inTransaction = false;
  const reads = [],
    writes = [],
    audits = [],
    slugs = [],
    transactions = [];
  const project = (record, options) =>
    record
      ? {
          ...record,
          platforms: record.platformIds
            .map((platformId) => ({
              streamId: record.id,
              platformId,
              platform: platforms.find((item) => item.id === platformId),
            }))
            .filter(
              (link) =>
                !options?.include?.platforms?.where || !link.platform.deletedAt,
            ),
        }
      : null;
  const tx = {
    stream: {
      findFirst: async (options) => {
        reads.push(options);
        return missing
          ? null
          : project(
              streams.find(
                (item) => item.id === options.where.id && !item.deletedAt,
              ),
              options,
            );
      },
      updateMany: async (options) => {
        assert.equal(inTransaction, true);
        writes.push(['selection', options]);
        for (const record of streams)
          if (
            !record.deletedAt &&
            record.isLive &&
            record.id !== options.where.id?.not
          )
            record.isLive = false;
        return { count: 1 };
      },
      create: async (options) => {
        assert.equal(inTransaction, true);
        writes.push(['create', options]);
        if (failWrite || conflict)
          throw Object.assign(
            new Error('write failed'),
            conflict ? { code: 'P2034' } : {},
          );
        const { platforms: links, ...data } = options.data;
        const record = {
          ...data,
          id: 11n,
          deletedAt: null,
          platformIds: links.create.map((link) => link.platformId),
        };
        streams.push(record);
        return project(record, options);
      },
      update: async (options) => {
        assert.equal(inTransaction, true);
        writes.push(['update', options]);
        if (failWrite || conflict)
          throw Object.assign(
            new Error('write failed'),
            conflict ? { code: 'P2034' } : {},
          );
        const record = streams.find((item) => item.id === options.where.id),
          { platforms: links, ...data } = options.data;
        Object.assign(record, data);
        if (links) {
          record.platformIds = links.deleteMany.platformId
            ? record.platformIds.filter((id) =>
                links.deleteMany.platformId.notIn.includes(id),
              )
            : [];
          if (failRelations) throw new Error('relationship write failed');
          record.platformIds.push(
            ...links.create.map((link) => link.platformId),
          );
        }
        return project(record, options);
      },
    },
    platform: {
      findMany: async (options) =>
        platforms.filter(
          (item) =>
            !item.deletedAt &&
            (!options.where.id || options.where.id.in.includes(item.id)) &&
            (!platformMissing || item.id !== 5n),
        ),
      findFirst: async (options) => {
        const found = platforms.find(
          (item) => item.id === options.where.id && !item.deletedAt,
        );
        return found ? { ...found } : null;
      },
      create: async (options) => {
        if (duplicate) throw { code: 'P2002' };
        const record = { ...options.data, id: 12n, deletedAt: null };
        platforms.push(record);
        writes.push(['platform-create', options]);
        return { ...record };
      },
      update: async (options) => {
        if (duplicate) throw { code: 'P2002' };
        const record = platforms.find((item) => item.id === options.where.id);
        Object.assign(record, options.data);
        writes.push(['platform-update', options]);
        return { ...record };
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback, options) => {
      transactions.push(options);
      const snapshot = structuredClone(streams);
      inTransaction = true;
      try {
        return await callback(tx);
      } catch (error) {
        streams = snapshot;
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  };
  const audit = {
    log: async (data) => {
      assert.equal(inTransaction, false);
      audits.push(data);
      if (failAudit) throw new Error('audit failed after commit');
    },
  };
  const slugify = {
    generateUniqueSlug: async (...args) => {
      slugs.push(args);
      return 'new-service';
    },
  };
  return {
    service: new StreamsService(prisma, audit, slugify),
    reads,
    writes,
    audits,
    slugs,
    transactions,
    get streams() {
      return streams;
    },
    get platforms() {
      return platforms;
    },
  };
}

test('stream runtime input validates booleans, text, IDs and timezone-aware dates without accepting client slugs', () => {
  assert.deepEqual(
    streamEditorInput(
      {
        title: ' Service ',
        isLive: false,
        startsAt: '',
        endsAt: null,
        platformIds: ['4', '4'],
        slug: 'spoofed',
      },
      false,
    ),
    {
      title: 'Service',
      isLive: false,
      startsAt: null,
      endsAt: null,
      platformIds: [4n],
    },
  );
  assert.deepEqual(streamEditorInput({}, true), {});
  assert.equal(
    streamEditorInput(
      { startsAt: '2099-10-22T09:00:00.123+02:00' },
      true,
    ).startsAt.toISOString(),
    start.toISOString(),
  );
  for (const input of [
    null,
    [],
    {},
    { title: ' ' },
    { title: 'x'.repeat(192) },
    { title: 'News', isLive: 'false' },
    { title: 'News', platformIds: '4' },
    { title: 'News', platformIds: ['0'] },
    { title: 'News', startsAt: '2099-02-30T09:00Z' },
    { title: 'News', startsAt: '2099-10-22T09:00' },
  ])
    assert.throws(() => streamEditorInput(input, false), badRequest);
  for (const id of ['0', '01', '9223372036854775808', 7, undefined])
    assert.throws(() => streamEditorId(id), badRequest);
});

test('new streams default to unselected, allow no schedule/platforms and generate their public address once', async () => {
  const f = fixture();
  const result = await f.service.create({ title: ' New service ' }, { id: 3n });
  assert.equal(result.data.isLive, false);
  assert.equal(result.data.slug, 'new-service');
  assert.deepEqual(result.data.platforms, []);
  assert.equal(f.slugs.length, 1);
  assert.equal(f.audits[0].userId, 3n);
  assert.equal(f.transactions[0].isolationLevel, 'Serializable');
  assert.equal(
    f.writes.some(([kind]) => kind === 'selection'),
    false,
  );
});

test('metadata edits retain public URLs, precise dates and connections, while explicit nulls and empty arrays clear them', async () => {
  const f = fixture();
  await f.service.update('7', { title: 'Renamed', slug: 'spoofed' });
  assert.equal(f.streams[0].slug, 'stable-stream-address');
  assert.deepEqual(f.streams[0].platformIds, [4n]);
  assert.equal(f.streams[0].startsAt, start);
  assert.equal(f.slugs.length, 0);
  assert.equal(f.writes[0][1].data.platforms, undefined);
  await f.service.update('7', {
    startsAt: null,
    endsAt: null,
    platformIds: [],
  });
  assert.equal(f.streams[0].startsAt, null);
  assert.deepEqual(f.streams[0].platformIds, []);
  assert.equal(f.streams[1].isLive, true);
});

test('schedule changes validate the final merged record, including retained end times and ordered ranges', async () => {
  const f = fixture({ endsAt: new Date('2099-10-22T08:00Z') });
  await assert.rejects(
    () => f.service.update('7', { startsAt: null }),
    badRequest,
  );
  await assert.rejects(
    () => f.service.update('7', { endsAt: '2099-10-22T06:00Z' }),
    badRequest,
  );
  assert.equal(f.writes.length, 0);
  await f.service.update('7', { startsAt: '', endsAt: '' });
  assert.equal(f.streams[0].startsAt, null);
  assert.equal(f.streams[0].endsAt, null);
});

test('platform deltas retain existing links and validate all selected active targets before writing', async () => {
  const f = fixture();
  await f.service.update('7', { platformIds: ['4', '5', '4'] });
  assert.deepEqual(f.streams[0].platformIds, [4n, 5n]);
  assert.deepEqual(f.writes[0][1].data.platforms.create, [{ platformId: 5n }]);
  await assert.rejects(
    () => f.service.update('7', { platformIds: ['6'] }),
    badRequest,
  );
  const missing = fixture({ platformMissing: true });
  await assert.rejects(
    () => missing.service.update('7', { platformIds: ['5'] }),
    badRequest,
  );
  assert.equal(missing.writes.length, 0);
});

function liveFixture(options = {}) {
  return fixture({
    startsAt: new Date(Date.now() - 60000),
    endsAt: new Date(Date.now() + 3600000),
    ...options,
  });
}

test('selecting live through edit and create switches the previous active selection off in the same transaction', async () => {
  const f = liveFixture();
  await f.service.update('7', { isLive: true });
  assert.equal(f.streams[0].isLive, true);
  assert.equal(f.streams[1].isLive, false);
  assert.equal(f.streams[2].isLive, true);
  assert.deepEqual(
    f.writes.map(([kind]) => kind),
    ['selection', 'update'],
  );
  const created = liveFixture();
  const result = await created.service.create({
    title: 'New live service',
    isLive: true,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    platformIds: ['5'],
  });
  assert.equal(result.data.isLive, true);
  assert.equal(created.streams[1].isLive, false);
  assert.equal(result.data.platforms[0].id, 5n);
});

test('separate live action shares platform/start/end guards and audits its own action without disabling another stream on failure', async () => {
  for (const options of [
    { startsAt: null },
    { startsAt: start },
    { endsAt: null },
    { platformIds: [] },
    { platformIds: [6n] },
    { platformIds: [10n] },
    {
      startsAt: new Date('2000-01-01T07:00Z'),
      endsAt: new Date('2000-01-01T08:00Z'),
    },
  ]) {
    const f = liveFixture(options);
    await assert.rejects(() => f.service.setLive('7'), badRequest);
    assert.equal(f.streams[1].isLive, true);
    assert.equal(f.writes.length, 0);
  }
  const valid = liveFixture();
  await valid.service.setLive('7', { id: 3n });
  assert.equal(valid.audits[0].action, 'STREAM_SET_LIVE');
  assert.equal(valid.streams[1].isLive, false);
});

test('failed target or relationship writes roll back both connections and previous live selection', async () => {
  for (const options of [{ failWrite: true }, { failRelations: true }]) {
    const f = liveFixture(options);
    await assert.rejects(
      () => f.service.update('7', { isLive: true, platformIds: ['5'] }),
      /write failed/,
    );
    assert.equal(f.streams[0].isLive, false);
    assert.equal(f.streams[1].isLive, true);
    assert.deepEqual(f.streams[0].platformIds, [4n]);
    assert.equal(f.audits.length, 0);
  }
});

test('transaction conflicts are explicit while later audit failures retain the committed record and selection', async () => {
  const conflict = liveFixture({ conflict: true });
  await assert.rejects(
    () => conflict.service.setLive('7'),
    (error) => error.getStatus() === 409,
  );
  assert.equal(conflict.streams[1].isLive, true);
  const audit = liveFixture({ failAudit: true });
  await assert.rejects(() => audit.service.setLive('7'), /audit failed/);
  assert.equal(audit.streams[0].isLive, true);
  assert.equal(audit.streams[1].isLive, false);
});

test('ending a live broadcast clears the selection, records its end and keeps recordings and platforms', async () => {
  const f = liveFixture({ selected: true });
  const before = Date.now();
  const result = await f.service.endLive('7', { id: 3n });
  assert.equal(result.data.isLive, false);
  assert.ok(result.data.endsAt.getTime() >= before);
  assert.ok(result.data.endsAt.getTime() <= Date.now());
  assert.equal(result.data.slug, 'stable-stream-address');
  assert.deepEqual(
    result.data.platforms.map((p) => p.id),
    [4n],
  );
  assert.deepEqual(
    f.writes.map(([kind]) => kind),
    ['update'],
  );
  assert.equal(f.audits[0].action, 'STREAM_ENDED');
  assert.equal(f.audits[0].userId, 3n);
  const end = result.data.endsAt;
  assert.equal((await f.service.endLive('7')).data.endsAt, end);
});

test('ending legacy selections works without dates or with a future start and does not alter another selection', async () => {
  for (const options of [
    { startsAt: null, endsAt: null },
    { startsAt: null },
    { startsAt: start, endsAt: new Date('2099-10-22T08:00Z') },
  ]) {
    const f = liveFixture({ selected: true, ...options });
    const result = await f.service.endLive('7');
    assert.equal(result.data.isLive, false);
    assert.equal(f.streams[1].isLive, true);
    assert.deepEqual(
      f.writes.map(([kind]) => kind),
      ['update'],
    );
  }
});

test('platform validation accepts canonical public web addresses and rejects credentials, unsafe schemes and storage overflow', async () => {
  assert.deepEqual(
    streamPlatformInput(
      { name: ' Channel ', url: ' https://video.example ' },
      false,
    ),
    { name: 'Channel', url: 'https://video.example/' },
  );
  for (const url of [
    'javascript:bad',
    '//video.example',
    '/local',
    'https://user:secret@example.com',
    'https://example.com/' + 'x'.repeat(180),
    'https://example.com/\\bad',
    'https://example.com/\nsecret',
  ])
    assert.equal(streamPlatformUrl(url), null);
  for (const input of [
    { name: '', url: 'https://example.com' },
    { name: 'x'.repeat(192), url: 'https://example.com' },
    { name: 'Video', url: '' },
  ])
    assert.throws(() => streamPlatformInput(input, false), badRequest);
  const f = fixture();
  const created = await f.service.createPlatform(
    { name: ' New channel ', url: 'https://channel.example' },
    { id: 3n },
  );
  assert.equal(created.data.url, 'https://channel.example/');
  assert.equal(f.audits[0].action, 'PLATFORM_CREATED');
});

test('shared-platform edits preserve omitted fields, update one shared identity and classify conflicts or archived records', async () => {
  const f = fixture();
  const result = await f.service.updatePlatform({
    id: '4',
    url: 'https://video.example/new',
  });
  assert.equal(result.data.id, 4n);
  assert.equal(result.data.name, 'YouTube');
  assert.equal(f.streams[0].platformIds[0], 4n);
  assert.equal(f.audits[0].before.url, 'https://youtu.be/dQw4w9WgXcQ');
  await assert.rejects(
    () => f.service.updatePlatform({ id: '6', name: 'Revive' }),
    (error) => error.getStatus() === 404,
  );
  const conflict = fixture({ duplicate: true });
  await assert.rejects(
    () =>
      conflict.service.createPlatform({
        name: 'YouTube',
        url: 'https://example.com',
      }),
    (error) => error.getStatus() === 409,
  );
});

test('missing records and invalid IDs cannot alter global live selection or platform connections', async () => {
  const f = fixture({ missing: true });
  await assert.rejects(
    () => f.service.update('7', { isLive: true }),
    (error) => error.getStatus() === 404,
  );
  await assert.rejects(
    () => f.service.setLive('7'),
    (error) => error.getStatus() === 404,
  );
  await assert.rejects(
    () => f.service.update('0', { title: 'News' }),
    badRequest,
  );
  assert.equal(f.writes.length, 0);
});

test('actual controller paths retain MEDIA authorization and override spoofed platform IDs with the route identity', () => {
  const calls = [],
    user = { id: 3n },
    body = { title: 'Service', isLive: false };
  const controller = new StreamsController({
    create: (...args) => calls.push(args),
    update: (...args) => calls.push(args),
    updatePlatform: (...args) => calls.push(args),
    setLive: (...args) => calls.push(args),
    endLive: (...args) => calls.push(args),
  });
  controller.create(body, { user });
  controller.update('7', body, { user });
  controller.updatePlatform(
    '4',
    { id: '99', url: 'https://example.com' },
    { user },
  );
  controller.setLive('7', { user });
  controller.endLive('7', { user });
  assert.deepEqual(calls, [
    [body, user],
    ['7', body, user],
    [{ id: '4', url: 'https://example.com' }, user],
    ['7', user],
    ['7', user],
  ]);
  const {
    ROLES_KEY,
  } = require('../src/modules/auth/decorator/roles.decorator.ts');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, StreamsController), [
    'MEDIA',
  ]);
});
