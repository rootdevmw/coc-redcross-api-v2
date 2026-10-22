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
  contentEditorInput,
  extractContentMedia,
} = require('../src/modules/content/content-editor.ts');
const { ContentService } = require('../src/modules/content/content.service.ts');
const {
  ContentController,
} = require('../src/modules/content/content.controller.ts');
const values = {
  title: ' A welcome ',
  body: '<p>Welcome</p><img src="https://church.test/photo.jpg"><audio src="/uploads/audio.mp3"></audio>',
  typeId: '2',
  authorId: '101',
  tags: ['Faith'],
  scriptures: [
    { book: 'John', chapter: 3, verseFrom: 16, verseTo: 18, version: 'ESV' },
  ],
};
function fixture({
  missing = false,
  missingType = false,
  missingAuthor = false,
  archivedTag = false,
  archivedMedia = false,
  failWrite = false,
  failAudit = false,
  duplicate = false,
} = {}) {
  const writes = [],
    audits = [],
    reads = [],
    tags = [],
    media = [],
    slugs = [];
  let transaction = false;
  const before = {
    id: 7n,
    title: 'Old title',
    body: values.body,
    slug: 'stable-public-address',
    typeId: 2n,
    authorId: 101n,
    status: 'Published',
    publishedAt: new Date('2026-10-21T10:00:00Z'),
    seriesId: 99n,
    tags: [{ tagId: 201n, tag: { id: 201n, name: 'Faith' } }],
    scriptures: [
      {
        id: 41n,
        book: 'John',
        chapter: 3,
        verseFrom: 16,
        verseTo: 18,
        version: 'ESV',
      },
    ],
    contentMedia: [{ mediaId: 301n }, { mediaId: 302n }],
  };
  const write = async ({ data }) => {
    assert(transaction);
    if (failWrite) throw new Error('write failed');
    if (duplicate) throw { code: 'P2002' };
    writes.push(data);
    return {
      ...before,
      ...Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    };
  };
  const tx = {
    content: {
      findFirst: async (options) => {
        reads.push(['content', options]);
        return missing ? null : before;
      },
      create: write,
      update: write,
    },
    contentType: {
      findFirst: async (options) => {
        reads.push(['type', options]);
        return missingType ? null : { id: 2n };
      },
    },
    member: {
      findFirst: async (options) => {
        reads.push(['author', options]);
        return missingAuthor ? null : { id: 101n };
      },
    },
    tag: {
      upsert: async (options) => {
        assert(transaction);
        tags.push(options);
        return {
          id: options.where.name.toLowerCase() === 'faith' ? 201n : 202n,
          deletedAt: archivedTag ? new Date() : null,
        };
      },
    },
    media: {
      upsert: async (options) => {
        assert(transaction);
        media.push(options);
        return {
          id: options.where.url.includes('photo')
            ? 301n
            : options.where.url.includes('audio')
              ? 302n
              : 303n,
          deletedAt: archivedMedia ? new Date() : null,
        };
      },
      deleteMany: () =>
        assert.fail('Saving a message must never delete shared media'),
    },
  };
  const prisma = {
    $transaction: async (work) => {
      transaction = true;
      try {
        return await work(tx);
      } finally {
        transaction = false;
      }
    },
  };
  const audit = {
    log: async (data) => {
      assert.equal(transaction, false);
      if (failAudit) throw new Error('audit unavailable');
      audits.push(data);
    },
  };
  const slug = {
    generateUniqueSlug: async (...args) => {
      slugs.push(args);
      return 'new-message';
    },
  };
  return {
    service: new ContentService(prisma, {}, audit, slug),
    before,
    writes,
    audits,
    reads,
    tags,
    media,
    slugs,
  };
}

test('runtime input validation rejects empty rich text, unsafe identifiers and invalid verse ranges while allowing unassigned authors', () => {
  assert.equal(
    contentEditorInput({ ...values, authorId: '' }, false).authorId,
    null,
  );
  assert.equal(contentEditorInput(values, false).title, 'A welcome');
  assert.deepEqual(contentEditorInput({}, true), {});
  for (const input of [
    null,
    [],
    { ...values, title: ' ' },
    { ...values, body: '<p>&nbsp;<br></p>' },
    { ...values, body: '<script>hidden</script>' },
    { ...values, typeId: '9223372036854775808' },
    { ...values, tags: [''] },
    { ...values, scriptures: [{ book: 'John', chapter: 3.5, verseFrom: 16 }] },
    {
      ...values,
      scriptures: [{ book: 'John', chapter: 3, verseFrom: 18, verseTo: 16 }],
    },
    {
      ...values,
      scriptures: [
        { id: '41', book: 'John', chapter: 3, verseFrom: 16 },
        { id: '41', book: 'John', chapter: 3, verseFrom: 17 },
      ],
    },
  ])
    assert.throws(
      () => contentEditorInput(input, false),
      (error) => error.getStatus() === 400,
    );
  assert.equal(
    contentEditorInput(
      { ...values, body: '<audio src="/uploads/audio.mp3"></audio>' },
      false,
    ).body.includes('audio'),
    true,
  );
  assert.equal(
    contentEditorInput(
      {
        ...values,
        tags: [' Faith ', 'faith'],
        seriesId: '8',
        status: 'Published',
      },
      false,
    ).tags.length,
    1,
  );
});

test('media extraction handles quoted/unquoted uppercase sources and entities, deduplicates URLs and ignores attributes, comments and unsafe destinations', () => {
  const html =
    '<IMG SRC="https://church.test/photo.jpg?x=1&amp;y=2" alt="src=\'https://not-a-source.test/fake\'"><img src=\'https://church.test/photo.jpg?x=1&y=2\'><audio controls><source SRC=/uploads/audio.mp3></audio><video src="/uploads/video.mp4"></video><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><img data-src="https://not-a-source.test/lazy"><img src="javascript&#58;alert(1)"><img src="file:///private"><!-- <img src="/ignored.png"> -->';
  assert.deepEqual(extractContentMedia(html), [
    { url: 'https://church.test/photo.jpg?x=1&y=2', type: 'image' },
    { url: '/uploads/audio.mp3', type: 'audio' },
    { url: '/uploads/video.mp4', type: 'video' },
    { url: 'https://www.youtube.com/embed/abcdefghijk', type: 'video' },
  ]);
  assert.throws(
    () =>
      extractContentMedia(
        '<img src="https://church.test/' + 'x'.repeat(200) + '">',
      ),
    (error) => error.getStatus() === 400,
  );
});

test('new messages always start as drafts and link validated tags, references and media in the same transaction', async () => {
  const f = fixture();
  const response = await f.service.create(
    { ...values, status: 'Published', seriesId: '8' },
    { id: 4n },
  );
  assert.equal(response.data.id, 7n);
  assert.equal(f.writes[0].status, 'Draft');
  assert.equal(f.writes[0].seriesId, undefined);
  assert.equal(f.writes[0].slug, 'new-message');
  assert.deepEqual(f.writes[0].contentMedia.create, [
    { mediaId: 301n },
    { mediaId: 302n },
  ]);
  assert.deepEqual(f.writes[0].tags.create, [{ tagId: 201n }]);
  assert.equal(f.writes[0].scriptures.create[0].version, 'ESV');
  assert.equal(f.audits[0].action, 'CONTENT_CREATED');
  assert.equal(f.audits[0].userId, 4n);
});

test('metadata edits preserve body/media, omitted relationships, publishing state, series and public URLs without media sync', async () => {
  const f = fixture();
  await f.service.update('7', {
    title: 'Renamed message',
    status: 'Draft',
    seriesId: '8',
  });
  const data = f.writes[0];
  for (const key of [
    'body',
    'contentMedia',
    'tags',
    'scriptures',
    'typeId',
    'authorId',
    'status',
    'publishedAt',
    'seriesId',
    'slug',
  ])
    assert.equal(data[key], undefined);
  assert.deepEqual(f.media, []);
  assert.deepEqual(f.tags, []);
  assert.deepEqual(f.slugs, []);
  assert.equal(f.audits[0].after.status, 'Published');
  assert.equal(f.audits[0].after.seriesId, 99n);
});

test('tag changes deduplicate names and change only active association deltas; explicit empty selections clear requested links and author', async () => {
  const f = fixture();
  await f.service.update('7', {
    tags: ['Faith', 'faith', 'Hope'],
    authorId: '',
  });
  assert.equal(f.writes[0].authorId, null);
  assert.deepEqual(f.writes[0].tags, {
    deleteMany: { tagId: { in: [] } },
    create: [{ tagId: 202n }],
  });
  const clear = fixture();
  await clear.service.update('7', { tags: [] });
  assert.deepEqual(clear.writes[0].tags, {
    deleteMany: { tagId: { in: [201n] } },
    create: [],
  });
  assert.equal(f.reads[0][1].include.tags.where.tag.deletedAt, null);
});

test('scripture edits retain identity/version, soft-remove omitted active references and reject foreign or archived IDs', async () => {
  const f = fixture();
  await f.service.update('7', {
    scriptures: [
      { id: '41', book: 'John', chapter: 3, verseFrom: 16, verseTo: null },
      { book: 'Romans', chapter: 8, verseFrom: 1 },
    ],
  });
  const data = f.writes[0].scriptures;
  assert.equal(data.update[0].where.id, 41n);
  assert.equal(data.update[0].data.version, undefined);
  assert.equal(data.update[0].data.verseTo, null);
  assert.deepEqual(data.updateMany.where, {
    deletedAt: null,
    id: { notIn: [41n] },
  });
  assert.equal(data.create[0].book, 'Romans');
  const clear = fixture();
  await clear.service.update('7', { scriptures: [] });
  assert.deepEqual(clear.writes[0].scriptures.updateMany.where.id.notIn, []);
  await assert.rejects(
    () =>
      fixture().service.update('7', {
        scriptures: [{ id: '99', book: 'John', chapter: 3, verseFrom: 16 }],
      }),
    (error) => error.getStatus() === 400,
  );
});

test('body edits detach removed media links without deleting shared media records or files', async () => {
  const f = fixture();
  await f.service.update('7', {
    body: '<p>Updated</p><img src="https://church.test/photo.jpg">',
  });
  assert.deepEqual(f.writes[0].contentMedia, {
    deleteMany: { mediaId: { in: [302n] } },
    create: [],
  });
  assert.equal(f.media.length, 1);
  assert.equal(f.writes[0].scriptures, undefined);
  const textOnly = fixture();
  await textOnly.service.update('7', { body: '<p>Text only</p>' });
  assert.deepEqual(textOnly.writes[0].contentMedia.deleteMany.mediaId.in, [
    301n,
    302n,
  ]);
});

test('unavailable records/targets reject writes while unchanged historical assignments remain editable', async () => {
  for (const [options, data, status] of [
    [{ missing: true }, { title: 'New' }, 404],
    [{ missingType: true }, { typeId: '3' }, 400],
    [{ missingAuthor: true }, { authorId: '102' }, 400],
    [{ archivedTag: true }, { tags: ['Hope'] }, 400],
    [{ archivedMedia: true }, { body: values.body }, 400],
  ]) {
    const f = fixture(options);
    await assert.rejects(
      () => f.service.update('7', data),
      (error) => error.getStatus() === status,
    );
    assert.equal(f.writes.length, 0);
    assert.equal(f.audits.length, 0);
  }
  const historical = fixture({ missingAuthor: true, missingType: true });
  await historical.service.update('7', {
    typeId: '2',
    authorId: '101',
    title: 'Keep original authorship',
  });
  assert.equal(
    historical.reads.some(([kind]) => ['type', 'author'].includes(kind)),
    false,
  );
});

test('failed writes never report audit success, public-address conflicts are explicit and later audit failures remain uncertain', async () => {
  const failed = fixture({ failWrite: true });
  await assert.rejects(
    () => failed.service.update('7', { body: '<p>New</p>', scriptures: [] }),
    /write failed/,
  );
  assert.equal(failed.audits.length, 0);
  await assert.rejects(
    () => fixture({ duplicate: true }).service.create(values),
    (error) => error.getStatus() === 409,
  );
  const audited = fixture({ failAudit: true });
  await assert.rejects(
    () => audited.service.create(values),
    /audit unavailable/,
  );
  assert.equal(audited.writes.length, 1);
});

test('author lookup pages stable active names with minimal fields under the existing MEDIA controller permission', async () => {
  const calls = {};
  const prisma = {
    member: {
      findMany: async (options) => {
        calls.rows = options;
        return [{ id: 101n, firstName: 'A', lastName: 'Writer' }];
      },
      count: async (options) => {
        calls.count = options;
        return 101;
      },
    },
    $transaction: async (reads, options) => {
      calls.transaction = options;
      return Promise.all(reads);
    },
  };
  const service = new ContentService(prisma, {}, {}, {});
  const result = await service.authorOptions({
    page: '6',
    limit: '20',
    search: ' A Writer ',
  });
  assert.equal(calls.rows.skip, 100);
  assert.deepEqual(calls.rows.select, {
    id: true,
    firstName: true,
    lastName: true,
  });
  assert.equal(calls.rows.where, calls.count.where);
  assert.equal(calls.rows.where.deletedAt, null);
  assert.equal(calls.transaction.isolationLevel, 'RepeatableRead');
  assert.equal(result.meta.total, 101);
  assert.deepEqual(Reflect.getMetadata('roles', ContentController), ['MEDIA']);
  assert.equal(
    Reflect.getMetadata('path', ContentController.prototype.authorOptions),
    'author-options',
  );
  for (const query of [
    { page: '0' },
    { limit: '101' },
    { search: ['A', 'B'] },
    { search: 'x'.repeat(201) },
  ])
    await assert.rejects(
      () => service.authorOptions(query),
      (error) => error.getStatus() === 400,
    );
});
