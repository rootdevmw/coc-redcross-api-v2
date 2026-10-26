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
  memberEditorInput,
  memberEditorId,
} = require('../src/modules/members/member-editor.ts');
const { MembersService } = require('../src/modules/members/members.service.ts');
const values = {
  firstName: ' A ',
  lastName: 'Person',
  prefix: 'BROTHER',
  status: 'MEMBER',
  isBaptized: true,
  baptismDate: '2026-10-21',
  homecellId: '2',
  ministryIds: ['3'],
  bio: '<p>Story</p>',
  imageUrl: '/uploads/photo.webp',
};

function fixture({
  missing = false,
  unavailableGroup = false,
  failure = false,
  auditFailure = false,
} = {}) {
  const writes = [],
    audits = [],
    reads = [];
  const tx = {
    member: {
      findFirst: async (options) => {
        reads.push(options);
        return missing
          ? null
          : {
              id: 7n,
              baptized: true,
              ministries: [{ ministryId: 3n }, { ministryId: 4n }],
            };
      },
      create: async (options) => {
        if (failure) throw new Error('write failed');
        writes.push(options.data);
        return { id: 7n, ...options.data };
      },
      update: async (options) => {
        if (failure) throw new Error('write failed');
        writes.push(options.data);
        return { id: 7n, ...options.data };
      },
    },
    homecell: {
      findFirst: async (options) => {
        assert.equal(options.where.deletedAt, null);
        return unavailableGroup ? null : { id: 2n };
      },
    },
    ministry: {
      findMany: async (options) => {
        assert.equal(options.where.deletedAt, null);
        return unavailableGroup
          ? []
          : options.where.id.in.map((id) => ({ id }));
      },
    },
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const service = new MembersService(prisma, {
    log: async (entry) => {
      if (auditFailure) throw new Error('audit unavailable');
      audits.push(entry);
    },
  });
  return { service, writes, audits, reads };
}

test('member inputs reject invalid names/enums/IDs/dates/relations before writes, support optional phone and default missing baptism to false', () => {
  assert.equal(memberEditorInput(values).firstName, 'A');
  assert.equal(
    memberEditorInput({ ...values, isBaptized: undefined }).isBaptized,
    false,
  );
  for (const invalid of [
    { firstName: ' ' },
    { prefix: 'UNKNOWN' },
    { status: 'BAPTIZED' },
    { isBaptized: 'false' },
    { baptismDate: '2026-02-30' },
    { homecellId: 'invalid' },
    { ministryIds: ['3', '3'] },
    { ministryIds: '3' },
    { imageUrl: 'javascript:alert(1)' },
    { bio: 'x'.repeat(65536) },
  ])
    assert.throws(
      () => memberEditorInput({ ...values, ...invalid }),
      (error) => error.getStatus() === 400,
    );
  for (const value of ['0', '-1', '900719925474099199999', {}, null])
    assert.throws(
      () => memberEditorId(value),
      (error) => error.getStatus() === 400,
    );
});

test('creation saves biography/homecell/ministry links in the same member write and records the authenticated actor', async () => {
  const f = fixture();
  const result = await f.service.create(values, { id: 9n });
  assert.equal(result.data.id, 7n);
  const data = f.writes[0];
  assert.equal(data.firstName, 'A');
  assert.deepEqual(data.homecell, { connect: { id: 2n } });
  assert.deepEqual(data.ministries.create, [
    { ministry: { connect: { id: 3n } } },
  ]);
  assert.equal(data.bio.create.bio, values.bio);
  assert.equal(data.baptismDate.toISOString(), '2026-10-21T00:00:00.000Z');
  assert.equal(f.audits[0].userId, 9n);
  assert.equal(f.audits[0].action, 'MEMBER_CREATED');
});

test('historical Elder input is saved as Pastor for both create and update', async () => {
  const input = { ...values, prefix: 'ELDER' };
  assert.equal(memberEditorInput(input).prefix, 'PASTOR');
  assert.equal(input.prefix, 'ELDER', 'input remains unchanged');
  const f = fixture();
  await f.service.create(input, { id: 9n });
  await f.service.update('7', { prefix: 'ELDER' }, { id: 9n });
  assert.deepEqual(
    f.writes.map(({ prefix }) => prefix),
    ['PASTOR', 'PASTOR'],
  );
});

test('updates clear homecell/date/photo explicitly and keep omitted optional values and relationships untouched', async () => {
  const f = fixture();
  await f.service.update(
    '7',
    { isBaptized: false, homecellId: '', imageUrl: '' },
    { id: 9n },
  );
  const data = f.writes[0];
  assert.deepEqual(data.homecell, { disconnect: true });
  assert.equal(data.baptismDate, null);
  assert.equal(data.imageUrl, null);
  assert.equal(data.ministries, undefined);
  assert.equal(data.bio, undefined);
  const kept = fixture();
  await kept.service.update('7', { firstName: 'Changed' });
  assert.equal(kept.writes[0].homecell, undefined);
  assert.equal(kept.writes[0].baptismDate, undefined);
  assert.equal(kept.writes[0].imageUrl, undefined);
});

test('ministry replacement changes only the active membership delta, avoiding duplicate inserts and preserving archived links', async () => {
  const f = fixture();
  await f.service.update('7', { ministryIds: ['4', '5'] });
  const data = f.writes[0].ministries;
  assert.deepEqual(data.deleteMany, { ministryId: { in: [3n] } });
  assert.deepEqual(data.create, [{ ministry: { connect: { id: 5n } } }]);
  assert.deepEqual(f.reads[0].include.ministries.where, {
    ministry: { deletedAt: null },
  });
  const cleared = fixture();
  await cleared.service.update('7', { ministryIds: [] });
  assert.deepEqual(cleared.writes[0].ministries.deleteMany.ministryId.in, [
    3n,
    4n,
  ]);
});

test('missing records and inactive connection targets reject the entire save before any member or audit write', async () => {
  const absent = fixture({ missing: true });
  await assert.rejects(
    () => absent.service.update('7', values),
    (error) => error.getStatus() === 404,
  );
  assert.equal(absent.writes.length, 0);
  for (const input of [{ ...values }, { ...values, homecellId: '' }]) {
    const f = fixture({ unavailableGroup: true });
    await assert.rejects(
      () => f.service.create(input),
      (error) => error.getStatus() === 400,
    );
    assert.equal(f.writes.length, 0);
    assert.equal(f.audits.length, 0);
  }
});

test('blank baptism dates clear existing dates and blank biography is written deliberately rather than being ignored', async () => {
  const f = fixture();
  await f.service.update('7', { isBaptized: true, baptismDate: '', bio: '' });
  assert.equal(f.writes[0].baptismDate, null);
  assert.deepEqual(f.writes[0].bio.upsert, {
    create: { bio: '' },
    update: { bio: '' },
  });
  const { validate } = require('class-validator');
  const {
    CreateMemberDto,
  } = require('../src/modules/members/dto/create-member.dto.ts');
  assert.deepEqual(
    await validate(
      Object.assign(new CreateMemberDto(), { ...values, baptismDate: '' }),
    ),
    [],
  );
});

test('write failure creates no audit, while a later audit failure reports an uncertain already-committed save', async () => {
  const failed = fixture({ failure: true });
  await assert.rejects(() => failed.service.create(values), /write failed/);
  assert.equal(failed.writes.length, 0);
  assert.equal(failed.audits.length, 0);
  const uncertain = fixture({ auditFailure: true });
  await assert.rejects(
    () => uncertain.service.create(values),
    /audit unavailable/,
  );
  assert.equal(uncertain.writes.length, 1);
});
