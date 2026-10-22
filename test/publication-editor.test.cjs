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
  publicationEditorInput,
  publicationEditorId,
  validatePublicationUpload,
  storePublicationFile,
  hasPublicationDocument,
  PUBLICATION_FILE_LIMIT,
} = require('../src/modules/publications/publication-editor.ts');
const {
  PublicationService,
} = require('../src/modules/publications/publications.service.ts');
const {
  PublicationsController,
} = require('../src/modules/publications/publications.controller.ts');
const pdf = () => {
  const buffer = Buffer.from('%PDF-1.7\nfixture');
  return {
    buffer,
    size: buffer.length,
    originalname: 'Church news.PDF',
    mimetype: 'application/pdf',
  };
};
const badRequest = (error) => error.getStatus() === 400;
function fixture({
  missing = false,
  failWrite = false,
  failAudit = false,
  failStorage = false,
  fileUrl = 'https://files.example/old.docx',
  publishedAt = new Date('2026-10-22T07:00:00.123Z'),
} = {}) {
  const before = {
    id: 7n,
    title: 'News',
    description: 'Existing introduction',
    fileUrl,
    publishedAt,
    deletedAt: null,
  };
  let record = { ...before };
  const writes = [],
    reads = [],
    uploads = [],
    audits = [];
  const prisma = {
    publication: {
      findFirst: async (options) => {
        reads.push(options);
        return missing ? null : { ...record };
      },
      create: async (options) => {
        writes.push(options);
        if (failWrite) throw new Error('database failed');
        record = { ...options.data, id: 8n };
        return { ...record };
      },
      update: async (options) => {
        writes.push(options);
        if (failWrite) throw new Error('database failed');
        Object.assign(
          record,
          Object.fromEntries(
            Object.entries(options.data).filter(
              ([, value]) => value !== undefined,
            ),
          ),
        );
        return { ...record };
      },
      delete: async (options) => {
        writes.push(options);
        return record;
      },
    },
  };
  const audit = {
    log: async (data) => {
      audits.push(data);
      if (failAudit) throw new Error('audit failed after commit');
    },
  };
  const service = new PublicationService(prisma, {}, audit);
  service.saveFile = async (file) => {
    uploads.push(file);
    if (failStorage) throw new Error('storage failed');
    return 'https://files.example/new.pdf';
  };
  return {
    service,
    before,
    writes,
    reads,
    uploads,
    audits,
    get record() {
      return record;
    },
  };
}

test('publication runtime validation trims titles, bounds text and distinguishes omission from explicit multipart clears', () => {
  assert.deepEqual(
    publicationEditorInput(
      { title: ' News ', fileUrl: 'https://attacker.example/file' },
      false,
    ),
    { title: 'News', publishedAt: null },
  );
  assert.deepEqual(
    publicationEditorInput({ description: '', publishedAt: '' }, true),
    { description: '', publishedAt: null },
  );
  assert.deepEqual(publicationEditorInput({ publishedAt: null }, true), {
    publishedAt: null,
  });
  assert.deepEqual(publicationEditorInput({}, true), {});
  for (const input of [
    null,
    [],
    {},
    { title: ' ' },
    { title: 'a'.repeat(192) },
    { title: ['News'] },
    { title: 'News', description: null },
    { title: 'News', description: '\u00e9'.repeat(32768) },
  ])
    assert.throws(() => publicationEditorInput(input, false), badRequest);
});

test('publication dates validate real calendar values and explicit timezones, including milliseconds and CAT', () => {
  assert.equal(
    publicationEditorInput(
      { publishedAt: '2026-10-22T09:00:00.123+02:00' },
      true,
    ).publishedAt.toISOString(),
    '2026-10-22T07:00:00.123Z',
  );
  for (const publishedAt of [
    '2026-02-30T09:00Z',
    '2026-10-22T09:00',
    '2026-10-22T25:00Z',
    '2026-10-22T09:00+14:01',
    ['2026-10-22T09:00Z'],
    1,
  ])
    assert.throws(
      () => publicationEditorInput({ publishedAt }, true),
      badRequest,
    );
  for (const id of [
    '',
    '0',
    '01',
    '-1',
    '7/edit',
    '9223372036854775808',
    undefined,
    7,
  ])
    assert.throws(() => publicationEditorId(id), badRequest);
  assert.equal(
    publicationEditorId('9223372036854775807'),
    9223372036854775807n,
  );
});

test('PDF checks require the extension, permitted MIME, bounded actual bytes and a PDF header', () => {
  assert.doesNotThrow(() => validatePublicationUpload(pdf()));
  assert.doesNotThrow(() =>
    validatePublicationUpload({
      ...pdf(),
      mimetype: 'application/octet-stream',
    }),
  );
  for (const file of [
    { ...pdf(), buffer: Buffer.from('wrong file bytes') },
    { ...pdf(), buffer: Buffer.alloc(0), size: 0 },
    { ...pdf(), originalname: 'payload.html' },
    { ...pdf(), mimetype: 'text/html' },
    { ...pdf(), size: 1 },
    { ...pdf(), size: PUBLICATION_FILE_LIMIT + 1 },
    { ...pdf(), buffer: undefined },
  ])
    assert.throws(() => validatePublicationUpload(file), badRequest);
});

test('storage uses unique exclusive PDF leaves without trusting original paths and validates configuration before I/O', async () => {
  const calls = [];
  const io = {
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    writeFile: async (...args) => calls.push(['write', ...args]),
  };
  const first = await storePublicationFile(
    { ...pdf(), originalname: '../../overwrite.pdf' },
    'https://api.example/',
    io,
  );
  const second = await storePublicationFile(pdf(), 'https://api.example', io);
  assert.notEqual(first, second);
  assert.match(
    first,
    /^https:\/\/api\.example\/uploads\/publications\/[a-f0-9-]{36}\.pdf$/,
  );
  for (const call of calls.filter((item) => item[0] === 'write')) {
    assert.equal(
      path.dirname(call[1]),
      path.resolve(process.cwd(), 'uploads', 'publications'),
    );
    assert.equal(call[3].flag, 'wx');
    assert.equal(path.basename(call[1]).includes('overwrite'), false);
  }
  const count = calls.length;
  for (const base of [
    undefined,
    '/local',
    'javascript:bad',
    'https://user:secret@api.example',
    'https://api.example?secret=x',
    'https://api.example/' + 'a'.repeat(180),
  ])
    await assert.rejects(
      () => storePublicationFile(pdf(), base, io),
      (error) => error.getStatus() === 500,
    );
  assert.equal(calls.length, count);
});

test('actual create path permits fileless drafts, ignores client file URLs and audits the created identity', async () => {
  const f = fixture();
  const result = await f.service.create(
    { title: ' New resource ', fileUrl: '/fake.pdf' },
    { id: 3n },
  );
  assert.equal(result.data.title, 'New resource');
  assert.equal(result.data.publishedAt, null);
  assert.equal(result.data.fileUrl, '');
  assert.equal(f.uploads.length, 0);
  assert.equal(f.audits[0].entityId, '8');
  assert.equal(f.audits[0].userId, 3n);
});

test('metadata edits retain the existing document and publication timestamp while explicit blanks clear only requested fields', async () => {
  const f = fixture();
  await f.service.update('7', { title: 'Renamed', fileUrl: '/fake.pdf' });
  assert.equal(f.record.fileUrl, f.before.fileUrl);
  assert.equal(f.record.publishedAt, f.before.publishedAt);
  assert.equal(f.record.description, f.before.description);
  assert.deepEqual(f.writes[0].data, { title: 'Renamed' });
  await f.service.update('7', { description: '', publishedAt: '' });
  assert.equal(f.record.description, '');
  assert.equal(f.record.publishedAt, null);
  assert.equal(f.record.fileUrl, f.before.fileUrl);
  assert.equal(f.uploads.length, 0);
  assert.deepEqual(f.reads[0].where, { id: 7n, deletedAt: null });
});

test('publishing guards apply to create, update and the separate publish action while legacy usable attachments remain supported', async () => {
  const f = fixture({ fileUrl: '', publishedAt: null });
  await assert.rejects(
    () => f.service.create({ title: 'News', publishedAt: '2026-10-22T09:00Z' }),
    badRequest,
  );
  await assert.rejects(
    () => f.service.update('7', { publishedAt: '2026-10-22T09:00Z' }),
    badRequest,
  );
  await assert.rejects(() => f.service.publish('7'), badRequest);
  assert.equal(f.writes.length, 0);
  const old = fixture();
  await old.service.publish('7');
  assert.equal(old.record.fileUrl, old.before.fileUrl);
  for (const unsafe of [
    'javascript:alert(1)',
    '//evil.example/file.pdf',
    'https://user:secret@evil.example/file.pdf',
    '/\\evil.pdf',
  ])
    assert.equal(hasPublicationDocument(unsafe), false);
});

test('a validated replacement and publishing timestamp are saved together and failed database saves preserve the old attachment', async () => {
  const f = fixture();
  const result = await f.service.update(
    '7',
    { title: 'Updated', publishedAt: '2026-10-22T09:00:00.123+02:00' },
    { id: 3n },
    pdf(),
  );
  assert.equal(result.data.fileUrl, 'https://files.example/new.pdf');
  assert.equal(
    f.writes[0].data.publishedAt.toISOString(),
    '2026-10-22T07:00:00.123Z',
  );
  assert.equal(f.audits[0].before.fileUrl, 'https://files.example/old.docx');
  assert.equal(f.uploads.length, 1);
  const failed = fixture({ failWrite: true });
  await assert.rejects(
    () => failed.service.update('7', {}, undefined, pdf()),
    /database failed/,
  );
  assert.equal(failed.record.fileUrl, failed.before.fileUrl);
  assert.equal(failed.uploads.length, 1);
  assert.equal(failed.audits.length, 0);
});

test('missing records and invalid input or files cannot write an attachment or a database record', async () => {
  const f = fixture({ missing: true });
  for (const action of [
    () => f.service.update('7', {}, undefined, pdf()),
    () => f.service.publish('7'),
    () => f.service.unpublish('7'),
    () => f.service.remove('7'),
  ])
    await assert.rejects(action, (error) => error.getStatus() === 404);
  const invalid = fixture();
  await assert.rejects(
    () => invalid.service.update('7', { title: ' ' }, undefined, pdf()),
    badRequest,
  );
  await assert.rejects(
    () =>
      invalid.service.update('7', {}, undefined, {
        ...pdf(),
        mimetype: 'text/html',
      }),
    badRequest,
  );
  assert.equal(
    f.uploads.length +
      f.writes.length +
      invalid.uploads.length +
      invalid.writes.length,
    0,
  );
});

test('storage failures leave the record untouched and audit failures retain committed attachments without destructive cleanup', async () => {
  const storage = fixture({ failStorage: true });
  await assert.rejects(
    () => storage.service.update('7', {}, undefined, pdf()),
    /storage failed/,
  );
  assert.equal(storage.record.fileUrl, storage.before.fileUrl);
  assert.equal(storage.writes.length, 0);
  const audit = fixture({ failAudit: true });
  await assert.rejects(
    () => audit.service.update('7', {}, undefined, pdf()),
    /audit failed/,
  );
  assert.equal(audit.record.fileUrl, 'https://files.example/new.pdf');
  assert.equal(audit.before.fileUrl, 'https://files.example/old.docx');
  assert.equal(audit.writes.length, 1);
});

test('actual controllers pass the multipart body and optional attachment to the authorized service paths', async () => {
  const calls = [],
    body = { title: 'News', description: '', publishedAt: '' },
    file = pdf(),
    user = { id: 3n };
  const controller = new PublicationsController({
    create: (...args) => calls.push(args),
    update: (...args) => calls.push(args),
  });
  controller.create(file, body, { user });
  controller.update('7', file, body, { user });
  assert.deepEqual(calls, [
    [body, user, file],
    ['7', body, user, file],
  ]);
  assert.equal(
    Reflect.getMetadata(
      '__interceptors__',
      PublicationsController.prototype.create,
    ).length,
    1,
  );
  assert.equal(
    Reflect.getMetadata(
      '__interceptors__',
      PublicationsController.prototype.update,
    ).length,
    1,
  );
});
