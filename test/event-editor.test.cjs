const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true, compilerOptions: { emitDecoratorMetadata: false } });
require('tsconfig-paths').register({ baseUrl: path.resolve(__dirname, '..'), paths: {} });
require('@nestjs/common').Logger.overrideLogger(false);
const { eventTimestamp, eventEditorInput } = require('../src/modules/events/event-editor.ts');
const { EventsService } = require('../src/modules/events/events.service.ts');
const values = { title: ' Community gathering ', location: ' Church ', description: '<p>Welcome</p>', typeId: '2', ministryIds: ['101', '102'], startTime: '2026-12-31T23:30:00+02:00', endTime: '2027-01-01T01:00:00+02:00' };

function fixture({ missing = false, missingType = false, missingMinistry = false, duplicate = false, failWrite = false, failAudit = false } = {}) {
  const writes = [], audits = [], reads = [], slugs = [];
  const before = { id: 7n, title: 'Old event', slug: 'old-stable-address', typeId: 2n, startTime: new Date('2026-12-31T21:30:00Z'), endTime: new Date('2026-12-31T23:00:00Z'), ministries: [{ ministryId: 101n }, { ministryId: 102n }] };
  const write = async ({ data }) => {
    if (duplicate) throw { code: 'P2002' };
    if (failWrite) throw new Error('write failed');
    writes.push(data);
    return { ...before, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
  };
  const eventType = { findFirst: async (options) => { reads.push(['type', options]); return missingType ? null : { id: options.where.id }; }, create: async ({ data }) => { if (duplicate) throw { code: 'P2002' }; writes.push(data); return { id: 9n, ...data }; } };
  const prisma = { eventType, $transaction: async (work) => work({ event: { findFirst: async (options) => { reads.push(['event', options]); return missing ? null : before; }, create: write, update: write }, eventType, ministry: { count: async (options) => { reads.push(['ministries', options]); return missingMinistry ? 0 : options.where.id.in.length; } }, eventMinistry: { deleteMany: () => assert.fail('Links must not be removed in a separate write') } }) };
  const audit = { log: async (entry) => { if (failAudit) throw new Error('audit unavailable'); audits.push(entry); } };
  const slug = { generateUniqueSlug: async (...args) => { slugs.push(args); return 'new-event'; } };
  return { service: new EventsService(prisma, audit, slug), writes, audits, reads, slugs };
}

test('timestamps require explicit offsets and reject impossible calendar days, clock values and database bounds', () => {
  assert.equal(eventTimestamp(values.startTime).toISOString(), '2026-12-31T21:30:00.000Z');
  assert.equal(eventTimestamp('2024-02-29T23:00:00.123-05:30').toISOString(), '2024-03-01T04:30:00.123Z');
  for (const value of ['2025-02-29T10:00:00Z', '2026-04-31T10:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z', '2026-01-01T12:00:60Z', '2026-01-01T12:00:00+00:99', '2026-01-01T12:00:00+14:01', '2026-01-01T12:00', '0999-01-01T12:00:00Z', '1000-01-01T00:00:00+02:00', '9999-12-31T23:00:00-02:00', null]) assert.throws(() => eventTimestamp(value), (error) => error.getStatus() === 400);
});

test('runtime input validation rejects invalid fields without depending on a global validation pipe', () => {
  assert.equal(eventEditorInput(values, false).title, 'Community gathering');
  assert.deepEqual(eventEditorInput({ ministryIds: ['101', '101'] }, true).ministryIds, [101n]);
  assert.deepEqual(eventEditorInput({}, true), {});
  for (const invalid of [null, [], { ...values, title: ' ' }, { ...values, title: 'x'.repeat(192) }, { ...values, location: 8 }, { ...values, typeId: '9223372036854775808' }, { ...values, ministryIds: '101' }, { ...values, ministryIds: [''] }, { ...values, description: 'é'.repeat(32768) }]) assert.throws(() => eventEditorInput(invalid, false), (error) => error.getStatus() === 400);
});

test('event creation validates active targets and writes ministry links with the event in one transaction', async () => {
  const f = fixture(); const response = await f.service.create(values, { id: 4n });
  assert.equal(response.data.id, 7n); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].slug, 'new-event'); assert.deepEqual(f.writes[0].ministries.create, [{ ministryId: 101n }, { ministryId: 102n }]);
  assert.equal(f.writes[0].startTime.toISOString(), '2026-12-31T21:30:00.000Z');
  assert.equal(f.reads.find(([key]) => key === 'type')[1].where.deletedAt, null);
  assert.equal(f.reads.find(([key]) => key === 'ministries')[1].where.deletedAt, null);
  assert.equal(f.audits[0].action, 'EVENT_CREATED'); assert.equal(f.audits[0].userId, 4n);
});

test('renaming an event preserves its public address, omitted schedule and ministry links', async () => {
  const f = fixture(); await f.service.update('7', { title: 'Renamed event' });
  assert.deepEqual(f.slugs, []); assert.equal(f.writes[0].slug, undefined);
  assert.equal(f.writes[0].ministries, undefined); assert.equal(f.writes[0].typeId, undefined); assert.equal(f.writes[0].startTime, undefined);
  assert.equal(f.audits[0].action, 'EVENT_UPDATED');
});

test('ministry changes only remove active links explicitly omitted and create only new links', async () => {
  const f = fixture(); await f.service.update('7', { ministryIds: ['102', '103', '103'] });
  assert.deepEqual(f.writes[0].ministries, { deleteMany: { ministryId: { in: [101n] } }, create: [{ ministryId: 103n }] });
  assert.equal(f.reads[0][1].include.ministries.where.ministry.deletedAt, null);
  const cleared = fixture(); await cleared.service.update('7', { ministryIds: [] });
  assert.deepEqual(cleared.writes[0].ministries, { deleteMany: { ministryId: { in: [101n, 102n] } }, create: [] });
});

test('partial rescheduling checks against the stored other boundary and records the correct audit action', async () => {
  const f = fixture(); await f.service.update('7', { endTime: '2027-01-01T02:00:00+02:00' });
  assert.equal(f.audits[0].action, 'EVENT_RESCHEDULED');
  for (const update of [{ startTime: '2027-01-01T01:00:00+02:00' }, { endTime: '2026-12-31T23:30:00+02:00' }]) { const invalid = fixture(); await assert.rejects(() => invalid.service.update('7', update), (error) => error.getStatus() === 400); assert.equal(invalid.writes.length, 0); }
});

test('missing or unavailable targets and failed writes never send an audit success or remove links separately', async () => {
  for (const [options, data, status] of [[{ missing: true }, { title: 'New' }, 404], [{ missingType: true }, { typeId: '3' }, 400], [{ missingMinistry: true }, { ministryIds: ['103'] }, 400]]) {
    const f = fixture(options); await assert.rejects(() => f.service.update('7', data), (error) => error.getStatus() === status); assert.equal(f.writes.length, 0); assert.equal(f.audits.length, 0);
  }
  const failed = fixture({ failWrite: true }); await assert.rejects(() => failed.service.update('7', { ministryIds: [] })); assert.equal(failed.audits.length, 0);
  const duplicate = fixture({ duplicate: true }); await assert.rejects(() => duplicate.service.create(values), (error) => error.getStatus() === 409);
});

test('unchanged historical event types are preserved while selecting a different archived type is rejected', async () => {
  const f = fixture({ missingType: true }); await f.service.update('7', { typeId: '2', title: 'Same historical type' });
  assert.equal(f.reads.some(([key]) => key === 'type'), false);
  await assert.rejects(() => fixture({ missingType: true }).service.update('7', { typeId: '3' }), (error) => error.getStatus() === 400);
});

test('event type creation validates and trims names, audits confirmed IDs, and returns duplicate conflicts', async () => {
  const f = fixture(); const response = await f.service.createType(' Community ', { id: 4n });
  assert.deepEqual(f.writes, [{ name: 'Community' }]); assert.equal(response.data.id, 9n); assert.equal(f.audits[0].action, 'EVENT_TYPE_CREATED');
  for (const value of [undefined, null, '', ' ', 'x'.repeat(192)]) await assert.rejects(() => f.service.createType(value), (error) => error.getStatus() === 400);
  await assert.rejects(() => fixture({ duplicate: true }).service.createType('Community'), (error) => error.getStatus() === 409);
});

test('audit failures after a committed event or type reject confirmation so clients can reconcile before retrying', async () => {
  const f = fixture({ failAudit: true }); await assert.rejects(() => f.service.create(values), /audit unavailable/); assert.equal(f.writes.length, 1);
  const type = fixture({ failAudit: true }); await assert.rejects(() => type.service.createType('Community'), /audit unavailable/); assert.equal(type.writes.length, 1);
});
