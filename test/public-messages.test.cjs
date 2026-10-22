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
const { ContentService } = require('../src/modules/content/content.service.ts');
const {
  PublicContentController,
} = require('../src/modules/content/content.public.controller.ts');
const {
  publicMessageQuery,
  publicMessageIdentifier,
} = require('../src/modules/content/public-messages.ts');
const badRequest = (error) => error.getStatus() === 400,
  missing = (error) => error.getStatus() === 404;
const record = (id, values = {}) => ({
  id: BigInt(id),
  title: 'Faith and care',
  slug: 'faith-' + id,
  body: '<p>Hope for our community.</p>',
  status: 'Published',
  createdAt: new Date('2026-10-22'),
  publishedAt: new Date('2026-10-22'),
  deletedAt: null,
  typeId: 2n,
  authorId: 3n,
  seriesId: null,
  type: { id: 2n, name: 'Teaching', deletedAt: null, createdAt: new Date() },
  author: {
    id: 3n,
    firstName: 'Test',
    lastName: 'Author',
    phone: 'PRIVATE_PHONE',
    userId: 9n,
    location: 'PRIVATE_LOCATION',
    baptized: true,
    deletedAt: null,
  },
  tags: [
    {
      contentId: BigInt(id),
      tagId: 4n,
      tag: { id: 4n, name: 'Faith & hope', deletedAt: null },
    },
    { tag: { id: 5n, name: 'Archived', deletedAt: new Date() } },
  ],
  scriptures: [
    {
      id: 6n,
      contentId: BigInt(id),
      book: 'JOHN',
      chapter: 3,
      verseFrom: 16,
      verseTo: null,
      version: null,
      deletedAt: null,
    },
    { id: 7n, deletedAt: new Date() },
  ],
  contentMedia: [],
  ...values,
});
function matches(row, where) {
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.typeId !== undefined && row.typeId !== where.typeId) return false;
  if (
    where.OR &&
    !where.OR.some((condition) =>
      condition.slug
        ? row.slug === condition.slug
        : condition.title
          ? row.title.includes(condition.title.contains)
          : row.body.includes(condition.body.contains),
    )
  )
    return false;
  if (
    where.tags &&
    !row.tags.some(
      ({ tag }) =>
        tag.deletedAt === null && tag.name === where.tags.some.tag.name,
    )
  )
    return false;
  return true;
}
function project(value, select) {
  if (value === null) return null;
  return Object.fromEntries(
    Object.entries(select).map(([key, spec]) => {
      let child = value[key];
      if (spec === true) return [key, child];
      if (Array.isArray(child)) {
        if (spec.where?.deletedAt === null)
          child = child.filter((row) => row.deletedAt === null);
        if (spec.where?.tag?.deletedAt === null)
          child = child.filter((row) => row.tag.deletedAt === null);
        return [key, child.map((row) => project(row, spec.select))];
      }
      return [key, project(child, spec.select)];
    }),
  );
}
function fixture(rows = [record(21)]) {
  const calls = { lists: [], counts: [], details: [] };
  const service = new ContentService(
    {
      content: {
        findMany: async (options) => {
          calls.lists.push(options);
          return rows
            .filter((row) => matches(row, options.where))
            .sort((a, b) => Number(b.id - a.id))
            .slice(options.skip, options.skip + options.take)
            .map((row) =>
              options.select ? project(row, options.select) : row,
            );
        },
        count: async (options) => {
          calls.counts.push(options);
          return rows.filter((row) => matches(row, options.where)).length;
        },
        findFirst: async (options) => {
          calls.details.push(options);
          const row = rows.find((row) => matches(row, options.where));
          return row
            ? options.select
              ? project(row, options.select)
              : row
            : null;
        },
      },
    },
    {},
    {},
    {},
  );
  return { service, controller: new PublicContentController(service), calls };
}

test('public message query validation bounds pagination, search, type IDs and topic names before database reads', () => {
  assert.deepEqual(
    publicMessageQuery({
      page: '2',
      limit: '6',
      search: ' Hope ',
      typeId: '2',
      tags: ' Faith & hope ',
    }),
    {
      page: 2,
      limit: 6,
      where: {
        deletedAt: null,
        status: 'Published',
        typeId: 2n,
        OR: [{ title: { contains: 'Hope' } }, { body: { contains: 'Hope' } }],
        tags: { some: { tag: { name: 'Faith & hope', deletedAt: null } } },
      },
    },
  );
  for (const query of [
    { page: '-1' },
    { page: '1.5' },
    { page: '1000001' },
    { limit: '51' },
    { limit: 0 },
    { typeId: '9223372036854775808' },
    { typeId: 'x' },
    { search: ['one', 'two'] },
    { search: 'x'.repeat(201) },
    { tags: ['one', 'two'] },
    { tags: 'x'.repeat(192) },
  ])
    assert.throws(() => publicMessageQuery(query), badRequest);
});

test('public message rows and counts apply the same search, type, active topic and published constraints', async () => {
  const { controller, calls } = fixture([
    record(21),
    record(22, { status: 'Draft' }),
    record(23, { deletedAt: new Date() }),
    record(24, { typeId: 8n }),
    record(25, { title: 'Another reflection', body: '<p>Other text</p>' }),
  ]);
  const result = await controller.findAll({
    page: '1',
    limit: '6',
    typeId: '2',
    tags: 'Faith & hope',
    search: 'care',
    status: 'Draft',
  });
  assert.deepEqual(
    result.data.map((row) => row.id),
    [21n],
  );
  assert.equal(result.meta.total, 1);
  assert.equal(calls.lists[0].where, calls.counts[0].where);
  assert.deepEqual(calls.lists[0].orderBy, [
    { createdAt: 'desc' },
    { id: 'desc' },
  ]);
  assert.equal((await controller.findAll({ tags: 'Archived' })).meta.total, 0);
  assert.equal((await controller.findAll({ tags: 'Missing' })).meta.total, 0);
});

test('public message pagination returns the requested slice and totals without changing management defaults', async () => {
  const { controller, calls } = fixture(
    Array.from({ length: 13 }, (_, index) => record(index + 1)),
  );
  const result = await controller.findAll({ page: '2', limit: '6' });
  assert.deepEqual(
    result.data.map((row) => row.id),
    [7n, 6n, 5n, 4n, 3n, 2n],
  );
  assert.deepEqual(result.meta, {
    page: 2,
    limit: 6,
    total: 13,
    totalPages: 3,
  });
  assert.equal(calls.lists[0].skip, 6);
  assert.deepEqual(
    (await controller.findAll({ page: '99', limit: '6' })).data,
    [],
  );
});

test('public list and detail projections keep attribution and teaching while excluding personal and administrative fields', async () => {
  const { controller } = fixture();
  for (const data of [
    (await controller.findAll({})).data[0],
    (await controller.findOne('faith-21')).data,
  ]) {
    assert.deepEqual(Object.keys(data.author).sort(), [
      'firstName',
      'id',
      'lastName',
    ]);
    assert.deepEqual(Object.keys(data.type).sort(), ['id', 'name']);
    assert.deepEqual(Object.keys(data.tags[0].tag).sort(), ['id', 'name']);
    assert.equal(data.tags.length, 1);
    assert.equal(data.scriptures.length, 1);
    assert.equal(data.body, '<p>Hope for our community.</p>');
    for (const key of ['authorId', 'seriesId', 'deletedAt', 'contentMedia'])
      assert.ok(!(key in data));
    assert.doesNotMatch(
      JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? String(value) : value,
      ),
      /PRIVATE_/,
    );
  }
});

test('public detail addresses cannot reveal drafts or archived content and missing messages remain 404', async () => {
  const { controller } = fixture([
    record(21, { status: 'Draft' }),
    record(22, { deletedAt: new Date() }),
    record(23),
  ]);
  for (const address of ['faith-21', '21', 'faith-22', '22', 'missing'])
    await assert.rejects(() => controller.findOne(address), missing);
  assert.equal((await controller.findOne('faith-23')).data.status, 'Published');
});

test('exact numeric slugs win over legacy IDs and legacy addresses still resolve published records', async () => {
  const { controller, calls } = fixture([
    record(21, { slug: '22' }),
    record(22, { slug: 'another-message' }),
  ]);
  assert.equal((await controller.findOne('22')).data.id, 21n);
  assert.equal(calls.details.length, 1);
  assert.equal((await controller.findOne('21')).data.id, 21n);
  assert.deepEqual(calls.details.at(-1).where, {
    id: 21n,
    deletedAt: null,
    status: 'Published',
  });
});

test('numeric addresses outside the database ID range are treated as slugs without bigint query overflow', async () => {
  const value = '9'.repeat(100),
    { controller, calls } = fixture();
  assert.equal(publicMessageIdentifier(value).legacyId, null);
  await assert.rejects(() => controller.findOne(value), missing);
  assert.equal(calls.details.length, 1);
  assert.deepEqual(calls.details[0].where.OR, [{ slug: value }]);
  for (const input of ['', 'x'.repeat(301), 'bad\u0000address'])
    assert.throws(() => publicMessageIdentifier(input), badRequest);
});

test('private draft list/detail reads retain their existing member and editor relationships', async () => {
  const { service, calls } = fixture([record(21, { status: 'Draft' })]);
  const result = await service.findAll({ status: 'Draft' });
  assert.equal(result.data[0].author.phone, 'PRIVATE_PHONE');
  assert.ok(calls.lists[0].include.contentMedia);
  assert.equal((await service.findOne('21')).data.status, 'Draft');
});
