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
  contentListWhere,
  publicationListWhere,
  streamListWhere,
} = require('../src/common/utils/editorial-list-filters.ts');
const {
  PublicationService,
} = require('../src/modules/publications/publications.service.ts');
const { ContentService } = require('../src/modules/content/content.service.ts');
const { StreamsService } = require('../src/modules/streams/streams.service.ts');

test('publishing filters separate management and public visibility and preserve false live selection', () => {
  assert.deepEqual(publicationListWhere({}), {
    deletedAt: null,
    publishedAt: { not: null },
  });
  assert.deepEqual(publicationListWhere({ search: ' News ' }, 'management'), {
    deletedAt: null,
    title: { contains: 'News' },
  });
  assert.deepEqual(publicationListWhere({ status: 'Draft' }, 'management'), {
    deletedAt: null,
    publishedAt: null,
  });
  assert.deepEqual(
    publicationListWhere({ status: 'Draft', scope: 'management' }),
    { deletedAt: null, publishedAt: { not: null } },
  );
  assert.deepEqual(
    contentListWhere({ status: 'Draft', typeId: '2', search: ' Faith ' }, true),
    {
      deletedAt: null,
      status: 'Published',
      typeId: 2n,
      OR: [{ title: { contains: 'Faith' } }, { body: { contains: 'Faith' } }],
    },
  );
  assert.deepEqual(
    streamListWhere({ search: ' Sunday ', isLive: 'false', platformId: '4' }),
    {
      deletedAt: null,
      title: { contains: 'Sunday' },
      isLive: false,
      platforms: { some: { platformId: 4n, platform: { deletedAt: null } } },
    },
  );
});

test('unpublished publications remain discoverable privately and disappear from public lists and ID reads', async () => {
  const records = [
    {
      id: 22n,
      title: 'News',
      fileUrl: 'https://files.example/news.pdf',
      publishedAt: new Date('2026-10-21T07:00:00Z'),
      deletedAt: null,
    },
    {
      id: 23n,
      title: 'Removed',
      publishedAt: new Date(),
      deletedAt: new Date(),
    },
  ];
  const calls = {};
  const matching = (where) =>
    records.filter(
      (record) =>
        record.deletedAt === null &&
        (where.id === undefined || record.id === where.id) &&
        (where.publishedAt === null
          ? record.publishedAt === null
          : where.publishedAt?.not === null
            ? record.publishedAt !== null
            : true),
    );
  const prisma = {
    publication: {
      findMany: async (options) => {
        calls.list = options;
        return matching(options.where).map((record) => ({ ...record }));
      },
      count: async (options) => {
        calls.count = options;
        return matching(options.where).length;
      },
      findFirst: async ({ where }) => {
        const record = matching(where)[0];
        return record ? { ...record } : null;
      },
      update: async ({ where, data }) => {
        const record = records.find((item) => item.id === where.id);
        Object.assign(record, data);
        return { ...record };
      },
    },
  };
  const service = new PublicationService(prisma, {}, { log: async () => {} });
  assert.equal((await service.findAll({})).data.length, 1);
  await service.unpublish('22', { id: 'fixture-actor' });
  const privateResult = await service.findAll(
    { status: 'Draft' },
    'management',
  );
  assert.equal(privateResult.data[0].publishedAt, null);
  assert.equal(privateResult.meta.total, 1);
  assert.equal(calls.list.where, calls.count.where);
  assert.deepEqual(calls.list.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(
    (await service.findAll({ status: 'Draft', scope: 'management' })).meta
      .total,
    0,
  );
  assert.deepEqual(calls.list.orderBy, [
    { publishedAt: 'desc' },
    { id: 'desc' },
  ]);
  await assert.rejects(
    () => service.findOne('22'),
    (error) => error.getStatus() === 404,
  );
  assert.equal((await service.findOne('22', 'management')).data.id, 22n);
  await assert.rejects(
    () => service.findOne('23', 'management'),
    (error) => error.getStatus() === 404,
  );
  await service.publish('22', { id: 'fixture-actor' });
  assert.equal((await service.findAll({})).meta.total, 1);
});

test('actual controller metadata keeps management reads authenticated and prevents query-controlled draft access', async () => {
  const { Reflector } = require('@nestjs/core');
  const {
    PublicationsController,
  } = require('../src/modules/publications/publications.controller.ts');
  const {
    PublicPublicationsController,
  } = require('../src/modules/publications/publications.public.controller.ts');
  const {
    ROLES_KEY,
  } = require('../src/modules/auth/decorator/roles.decorator.ts');
  const {
    IS_PUBLIC_KEY,
  } = require('../src/common/decorators/public.decorator.ts');
  const { RolesGuard } = require('../src/modules/auth/guard/roles.guard.ts');
  const {
    SessionAuthGuard,
  } = require('../src/modules/auth/guard/session.guard.ts');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PublicationsController), [
    'MEDIA',
  ]);
  assert.equal(
    Reflect.getMetadata(
      IS_PUBLIC_KEY,
      PublicationsController.prototype.findAll,
    ),
    undefined,
  );
  assert.equal(
    Reflect.getMetadata(
      IS_PUBLIC_KEY,
      PublicPublicationsController.prototype.findAll,
    ),
    true,
  );
  const calls = [];
  const service = {
    findAll: (...args) => calls.push(args),
    findOne: (...args) => calls.push(args),
    findPublic: (...args) => calls.push(args),
    readPublic: (...args) => calls.push(args),
  };
  const query = { status: 'Draft', scope: 'management' };
  new PublicationsController(service).findAll(query);
  new PublicPublicationsController(service).findAll(query);
  new PublicationsController(service).findOne('22');
  new PublicPublicationsController(service).findOne('22');
  assert.deepEqual(calls, [
    [query, 'management'],
    [query],
    ['22', 'management'],
    ['22'],
  ]);
  const context = (Controller, user) => ({
    getHandler: () => Controller.prototype.findAll,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user, cookies: {} }) }),
  });
  const reflector = new Reflector();
  assert.throws(
    () =>
      new RolesGuard(reflector).canActivate(
        context(PublicationsController, { roles: ['MEMBER'] }),
      ),
    (error) => error.getStatus() === 403,
  );
  assert.equal(
    new RolesGuard(reflector).canActivate(
      context(PublicationsController, { roles: ['MEDIA'] }),
    ),
    true,
  );
  const auth = new SessionAuthGuard({}, reflector);
  await assert.rejects(
    () => auth.canActivate(context(PublicationsController)),
    (error) => error.getStatus() === 401,
  );
  assert.equal(
    await auth.canActivate(context(PublicPublicationsController)),
    true,
  );
});

test('public message list and slug reads enforce Published while private draft reads remain available', async () => {
  const {
    PublicContentController,
  } = require('../src/modules/content/content.public.controller.ts');
  const records = [
    {
      id: 21n,
      title: 'Draft',
      slug: 'draft',
      status: 'Draft',
      deletedAt: null,
    },
    {
      id: 22n,
      title: 'Published',
      slug: 'published',
      status: 'Published',
      deletedAt: null,
    },
  ];
  const calls = {};
  const matching = (where) =>
    records.filter(
      (record) =>
        (!where.status || record.status === where.status) &&
        (where.id === undefined || record.id === where.id) &&
        (!where.OR ||
          where.OR.some(
            (item) => item.slug === record.slug || item.id === record.id,
          )),
    );
  const service = new ContentService(
    {
      content: {
        findMany: async (options) => {
          calls.list = options;
          return matching(options.where);
        },
        count: async (options) => {
          calls.count = options;
          return matching(options.where).length;
        },
        findFirst: async ({ where }) => matching(where)[0] || null,
      },
    },
    {},
    {},
    {},
  );
  const publicController = new PublicContentController(service);
  const published = await publicController.findAll({ status: 'Draft' });
  assert.deepEqual(
    published.data.map((record) => record.status),
    ['Published'],
  );
  assert.equal(calls.list.where, calls.count.where);
  assert.deepEqual(calls.list.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(
    (await service.findAll({ status: 'Draft' })).data[0].status,
    'Draft',
  );
  assert.equal((await service.findOne('21')).data.status, 'Draft');
  await assert.rejects(
    () => publicController.findOne('draft'),
    (error) => error.getStatus() === 404,
  );
  assert.equal(
    (await publicController.findOne('published')).data.status,
    'Published',
  );
});

test('actual private stream queries apply title, selection and platform filters to both rows and totals', async () => {
  const calls = {};
  const platform = {
    id: 4n,
    name: 'Video',
    url: 'https://video.example/church',
  };
  const service = new StreamsService(
    {
      stream: {
        findMany: async (options) => {
          calls.list = options;
          return [{ id: 23n, isLive: false, platforms: [{ platform }] }];
        },
        count: async (options) => {
          calls.count = options;
          return 21;
        },
      },
    },
    {},
    {},
  );
  const result = await service.findAll({
    page: '2',
    limit: '10',
    search: 'Sunday',
    isLive: 'false',
    platformId: '4',
  });
  assert.deepEqual(
    calls.list.where,
    streamListWhere({ search: 'Sunday', isLive: 'false', platformId: '4' }),
  );
  assert.equal(calls.list.where, calls.count.where);
  assert.deepEqual(calls.list.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(calls.list.skip, 10);
  assert.equal(result.meta.total, 21);
  assert.deepEqual(result.data[0].platforms, [platform]);
});

test('invalid publishing statuses, duplicate search values, platform IDs and live selections are bad requests', () => {
  for (const action of [
    () => publicationListWhere({ status: 'Scheduled' }, 'management'),
    () => contentListWhere({ status: 'Unknown' }),
    () => contentListWhere({ typeId: '3/edit' }),
    () => streamListWhere({ isLive: 'yes' }),
    () => streamListWhere({ platformId: '-1' }),
    () => publicationListWhere({ search: ['one', 'two'] }),
  ])
    assert.throws(action, (error) => error.getStatus() === 400);
});
