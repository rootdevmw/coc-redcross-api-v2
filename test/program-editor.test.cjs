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
  programEditorDate,
  programEditorInput,
} = require('../src/common/utils/program-editor.ts');
const {
  ProgramsService,
} = require('../src/modules/programs/programs.service.ts');
const {
  ProgramTemplatesService,
} = require('../src/modules/program-templates/program-template.service.ts');
const values = {
  name: ' Sunday outline ',
  date: '2026-10-22',
  location: 'Church',
  typeId: '2',
  homecellId: '9',
  items: [
    {
      title: 'Welcome',
      description: 'Welcome everyone',
      time: '09:00',
      responsibleId: '101',
    },
    {
      title: 'Message',
      description: 'Study together',
      time: 'After the welcome',
      responsibleId: '',
    },
  ],
};
function fixture(
  kind,
  {
    missing = false,
    missingType = false,
    missingHomecell = false,
    missingPerson = false,
    failWrite = false,
    failAudit = false,
    duplicate = false,
  } = {},
) {
  const writes = [],
    reads = [],
    audits = [],
    slugs = [];
  let inTransaction = false;
  const before = {
    id: 7n,
    name: 'Old outline',
    date: new Date('2026-10-21T22:00:00Z'),
    location: 'Old venue',
    slug: 'stable-public-address',
    typeId: 2n,
    homecellId: 9n,
    items: [
      {
        id: 11n,
        title: 'Welcome',
        description: 'Keep notes',
        sequence: 1,
        time: '09:00',
        responsibleId: 101n,
      },
      {
        id: 12n,
        title: 'Message',
        description: 'Study together',
        sequence: 2,
        time: null,
        responsibleId: null,
      },
    ],
  };
  const delegate = {
    findFirst: async (options) => {
      assert(inTransaction);
      reads.push(['record', options]);
      return missing ? null : before;
    },
    create: async ({ data }) => {
      assert(inTransaction);
      if (duplicate) throw { code: 'P2002' };
      if (failWrite) throw new Error('write failed');
      writes.push(data);
      return { ...before, ...data };
    },
    update: async ({ data }) => {
      assert(inTransaction);
      if (failWrite) throw new Error('write failed');
      writes.push(data);
      return {
        ...before,
        ...Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== undefined),
        ),
      };
    },
  };
  const tx = {
    program: delegate,
    programTemplate: delegate,
    programType: {
      findFirst: async (options) => {
        reads.push(['type', options]);
        return missingType ? null : { id: 2n };
      },
    },
    homecell: {
      findFirst: async (options) => {
        reads.push(['homecell', options]);
        return missingHomecell ? null : { id: 9n };
      },
    },
    member: {
      count: async (options) => {
        reads.push(['people', options]);
        return missingPerson ? 0 : options.where.id.in.length;
      },
    },
    programItem: {
      deleteMany: () =>
        assert.fail('Activity removal must stay in the parent transaction'),
    },
    programTemplateItem: {
      deleteMany: () =>
        assert.fail('Activity removal must stay in the parent transaction'),
    },
  };
  const prisma = {
    $transaction: async (work) => {
      inTransaction = true;
      try {
        return await work(tx);
      } finally {
        inTransaction = false;
      }
    },
  };
  const audit = {
    log: async (data) => {
      assert.equal(inTransaction, false);
      if (failAudit) throw new Error('audit unavailable');
      audits.push(data);
    },
  };
  const slug = {
    generateUniqueSlug: async (...args) => {
      slugs.push(args);
      return 'new-program-address';
    },
  };
  return {
    service:
      kind === 'program'
        ? new ProgramsService(prisma, audit, slug)
        : new ProgramTemplatesService(prisma, audit),
    before,
    writes,
    reads,
    audits,
    slugs,
  };
}

test('program calendar dates normalize to Malawi midnight independently of server timezone and reject impossible or ambiguous dates', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.equal(
        programEditorDate('2026-10-22').toISOString(),
        '2026-10-21T22:00:00.000Z',
      );
      assert.equal(
        programEditorDate('2026-10-21T22:30:00Z').toISOString(),
        '2026-10-21T22:00:00.000Z',
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.equal(
    programEditorDate('2024-02-29').toISOString(),
    '2024-02-28T22:00:00.000Z',
  );
  for (const value of [
    '2025-02-29',
    '2026-04-31',
    '2026-10-22T12:00',
    '1000-01-01',
    '',
    null,
  ])
    assert.throws(
      () => programEditorDate(value),
      (error) => error.getStatus() === 400,
    );
});

test('runtime schemas validate both families, canonical clock conflicts, lengths and IDs while allowing empty outlines and timing instructions', () => {
  for (const kind of ['program', 'template']) {
    assert.equal(
      programEditorInput(kind, { ...values, items: [] }, false).items.length,
      0,
    );
    assert.deepEqual(programEditorInput(kind, {}, true), {});
    for (const invalid of [
      { typeId: '0' },
      { homecellId: '9223372036854775808' },
      { items: null },
      { items: [{ title: ' ' }] },
      { items: [{ title: 'Long', description: 'é'.repeat(32768) }] },
      { items: [{ title: 'A', time: '25:00' }] },
      {
        items: [
          { title: 'A', time: '9:30' },
          { title: 'B', time: '09:30:00' },
        ],
      },
      {
        items: [
          { id: '11', title: 'A' },
          { id: '11', title: 'B' },
        ],
      },
    ])
      assert.throws(
        () => programEditorInput(kind, { ...values, ...invalid }, false),
        (error) => error.getStatus() === 400,
      );
    assert.equal(
      programEditorInput(
        kind,
        {
          ...values,
          items: [
            { title: 'A', time: 'After prayer' },
            { title: 'B', time: 'After prayer' },
          ],
        },
        false,
      ).items.length,
      2,
    );
  }
  assert.throws(() =>
    programEditorInput('template', { ...values, name: ' ' }, false),
  );
});

test('both service create entry points validate active targets and persist reindexed activities with the correct actor', async () => {
  for (const kind of ['program', 'template']) {
    const f = fixture(kind);
    const result = await f.service.create(
      {
        ...values,
        items: values.items.map((item) => ({ ...item, sequence: 90 })),
      },
      { id: 4n },
    );
    assert.equal(result.data.id, 7n);
    assert.equal(f.writes.length, 1);
    assert.deepEqual(
      f.writes[0].items.create.map((item) => item.sequence),
      [1, 2],
    );
    assert.equal(f.writes[0].items.create[0].responsibleId, 101n);
    assert.equal(f.writes[0].items.create[1].responsibleId, null);
    assert.equal(
      f.reads.find(([key]) => key === 'people')[1].where.deletedAt,
      null,
    );
    assert.equal(f.audits[0].userId, 4n);
    assert.equal(
      f.audits[0].action,
      kind === 'program' ? 'PROGRAM_CREATED' : 'PROGRAM_TEMPLATE_CREATED',
    );
    if (kind === 'program') {
      assert.equal(f.writes[0].date.toISOString(), '2026-10-21T22:00:00.000Z');
      assert.match(f.slugs[0][0], /2026-10-22/);
    }
  }
});

test('activity updates retain record identities, omitted notes and responsibility, and soft-remove only omitted active activities', async () => {
  for (const kind of ['program', 'template']) {
    const f = fixture(kind);
    await f.service.update('7', {
      items: [
        { id: '12', title: 'Message first' },
        { title: 'New closing', responsibleId: '103' },
      ],
    });
    const change = f.writes[0].items;
    assert.deepEqual(
      change.update.map((entry) => entry.where.id),
      [12n],
    );
    assert.equal(change.update[0].data.description, undefined);
    assert.equal(change.update[0].data.responsibleId, undefined);
    assert.deepEqual(change.updateMany.where, {
      deletedAt: null,
      id: { notIn: [12n] },
    });
    assert(change.updateMany.data.deletedAt instanceof Date);
    assert.equal(change.create[0].sequence, 2);
    assert.equal(change.create[0].responsibleId, 103n);
    assert.equal(f.reads[0][1].include.items.where.deletedAt, null);
  }
});

test('metadata edits preserve omitted activities and associations, and program date/location changes retain the public slug', async () => {
  for (const kind of ['program', 'template']) {
    const f = fixture(kind);
    await f.service.update(
      '7',
      kind === 'program'
        ? { date: '2026-11-01', location: '' }
        : { name: 'Renamed outline' },
    );
    assert.equal(f.writes[0].items, undefined);
    assert.equal(f.writes[0].typeId, undefined);
    assert.equal(f.writes[0].homecellId, undefined);
    assert.equal(f.writes[0].slug, undefined);
    assert.deepEqual(f.slugs, []);
    if (kind === 'program') assert.equal(f.writes[0].location, '');
  }
});

test('explicit empty homecell/responsibility and an empty activity list clear only the requested fields', async () => {
  for (const kind of ['program', 'template']) {
    const f = fixture(kind);
    await f.service.update('7', {
      homecellId: '',
      items: [{ id: '11', title: 'Welcome', responsibleId: '' }],
    });
    assert.equal(f.writes[0].homecellId, null);
    assert.equal(f.writes[0].items.update[0].data.responsibleId, null);
    const empty = fixture(kind);
    await empty.service.update('7', { items: [] });
    assert.deepEqual(empty.writes[0].items.updateMany.where.id.notIn, []);
    assert.deepEqual(empty.writes[0].items.create, []);
  }
});

test('foreign, archived or repeated activity IDs cannot be attached; unavailable targets and failed writes leave no audit success', async () => {
  for (const kind of ['program', 'template']) {
    for (const [options, input, status] of [
      [{}, { items: [{ id: '999', title: 'Foreign' }] }, 400],
      [
        {},
        { items: [{ id: '11', title: 'Keep stored time' }, { title: 'Conflict', time: '09:00:00' }] },
        400,
      ],
      [{ missing: true }, {}, 404],
      [{ missingType: true }, { typeId: '3' }, 400],
      [{ missingHomecell: true }, { homecellId: '10' }, 400],
      [
        { missingPerson: true },
        { items: [{ id: '11', title: 'New person', responsibleId: '103' }] },
        400,
      ],
    ]) {
      const f = fixture(kind, options);
      await assert.rejects(
        () => f.service.update('7', input),
        (error) => error.getStatus() === status,
      );
      assert.equal(f.writes.length, 0);
      assert.equal(f.audits.length, 0);
    }
    const failed = fixture(kind, { failWrite: true });
    await assert.rejects(
      () => failed.service.update('7', { items: [] }),
      /write failed/,
    );
    assert.equal(failed.audits.length, 0);
  }
});

test('unchanged historical assignments remain editable while newly selected unavailable profiles are rejected', async () => {
  for (const kind of ['program', 'template']) {
    const f = fixture(kind, {
      missingPerson: true,
      missingType: true,
      missingHomecell: true,
    });
    await f.service.update('7', {
      typeId: '2',
      homecellId: '9',
      items: [{ id: '11', title: 'Updated title', responsibleId: '101' }],
    });
    assert.equal(
      f.reads.some(([key]) => ['people', 'type', 'homecell'].includes(key)),
      false,
    );
  }
});

test('creation from a template reads and copies active activities in the same transaction and validates the resulting assignments', async () => {
  const f = fixture('program');
  const result = await f.service.createFromTemplate(
    { templateId: '7', date: '2026-10-22', homecellId: '' },
    { id: 4n },
  );
  assert.equal(result.data.id, 7n);
  assert.equal(f.writes[0].homecellId, null);
  assert.equal(f.writes[0].typeId, 2n);
  assert.equal(f.writes[0].items.create[0].description, 'Keep notes');
  assert.equal(f.writes[0].items.create[0].id, undefined);
  assert.equal(f.audits[0].action, 'PROGRAM_CREATED_FROM_TEMPLATE');
  assert.equal(f.audits[0].userId, 4n);
  await assert.rejects(
    () =>
      fixture('program', { missing: true }).service.createFromTemplate({
        templateId: '7',
        date: '2026-10-22',
      }),
    (error) => error.getStatus() === 404,
  );
  await assert.rejects(
    () =>
      fixture('program', { missingPerson: true }).service.createFromTemplate({
        templateId: '7',
        date: '2026-10-22',
      }),
    (error) => error.getStatus() === 400,
  );
});

test('slug conflicts are explicit and audit failures after committed writes remain uncertain without retrying', async () => {
  await assert.rejects(
    () => fixture('program', { duplicate: true }).service.create(values),
    (error) => error.getStatus() === 409,
  );
  for (const kind of ['program', 'template']) {
    const f = fixture(kind, { failAudit: true });
    await assert.rejects(() => f.service.create(values), /audit unavailable/);
    assert.equal(f.writes.length, 1);
  }
});
