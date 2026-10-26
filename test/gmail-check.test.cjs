const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { API_DIR, runCheck } = require('../scripts/gmail-check.cjs');

const env = [
  'GMAIL_API_CLIENT_ID="FILE_CLIENT"',
  'GMAIL_API_CLIENT_SECRET="FILE_SECRET"',
  'GMAIL_API_REFRESH_TOKEN="FILE_REFRESH"',
].join('\n');
function fixture(options = {}) {
  const logs = [],
    calls = [],
    reads = [];
  return {
    logs,
    calls,
    reads,
    dependencies: {
      write: (text) => logs.push(text),
      read: async (file) => {
        reads.push(file);
        return env;
      },
      request: async (url, settings) => {
        calls.push({ url, settings });
        return Response.json({
          access_token: 'SECRET_ACCESS',
          expires_in: 3600,
        });
      },
      ...options,
    },
  };
}
function safe(logs) {
  assert.doesNotMatch(
    logs.join('\n'),
    /FILE_CLIENT|FILE_SECRET|FILE_REFRESH|SECRET_ACCESS|RAW_SECRET|OTHER_SECRET/,
  );
}

test('diagnosis tests file credentials over HTTPS without sending mail or using inherited environment', async () => {
  const f = fixture();
  assert.equal(await runCheck([], f.dependencies), 0);
  assert.deepEqual(f.reads, [path.join(API_DIR, '.env')]);
  assert.equal(f.calls.length, 1);
  const { url, settings } = f.calls[0];
  assert.equal(url, 'https://oauth2.googleapis.com/token');
  assert.equal(settings.method, 'POST');
  assert.equal(settings.redirect, 'error');
  assert.equal(settings.cache, 'no-store');
  assert.ok(settings.signal instanceof AbortSignal);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(settings.body)), {
    client_id: 'FILE_CLIENT',
    client_secret: 'FILE_SECRET',
    refresh_token: 'FILE_REFRESH',
    grant_type: 'refresh_token',
  });
  assert.match(f.logs.join('\n'), /GMAIL_CHECK_FILE_OK/);
  safe(f.logs);
});

test('missing settings and unreadable files stop before contacting Google without exposing file errors', async () => {
  for (const read of [
    async () => 'GMAIL_API_CLIENT_ID=FILE_CLIENT',
    async () => {
      throw new Error('RAW_SECRET');
    },
  ]) {
    const f = fixture({ read });
    assert.equal(await runCheck([], f.dependencies), 1);
    assert.equal(f.calls.length, 0);
    assert.match(
      f.logs.join('\n'),
      /GMAIL_CHECK_(SETTINGS_MISSING|ENV_UNREADABLE)/,
    );
    safe(f.logs);
  }
});

test('Google rejection exposes only an allowlisted OAuth code and HTTP status', async () => {
  for (const [status, error, expected] of [
    [401, 'invalid_client', 'INVALID_CLIENT'],
    [400, 'invalid_grant', 'INVALID_GRANT'],
    [400, 'RAW_SECRET', 'UNKNOWN_ERROR'],
    [403, { secret: 'RAW_SECRET' }, 'UNKNOWN_ERROR'],
  ]) {
    const f = fixture({
      request: async () =>
        Response.json(
          {
            error,
            error_description: 'RAW_SECRET',
            access_token: 'SECRET_ACCESS',
          },
          { status },
        ),
    });
    assert.equal(await runCheck([], f.dependencies), 1);
    assert.ok(f.logs.includes(`GMAIL_CHECK_HTTP_${status}: ${expected}`));
    safe(f.logs);
  }
  const f = fixture({
    request: async () => new Response('RAW_SECRET', { status: 401 }),
  });
  assert.equal(await runCheck([], f.dependencies), 1);
  assert.ok(f.logs.includes('GMAIL_CHECK_HTTP_401: UNKNOWN_ERROR'));
  safe(f.logs);
});

test('network errors and malformed success responses never report acceptance or reveal provider data', async () => {
  for (const request of [
    async () => {
      throw new Error('RAW_SECRET');
    },
    async () => new Response('RAW_SECRET'),
    async () => Response.json({ access_token: 'SECRET_ACCESS' }),
    async () =>
      Response.json({ access_token: 'SECRET_ACCESS', expires_in: -1 }),
    async () =>
      Response.json({
        access_token: 'SECRET_ACCESS\nINJECTION',
        expires_in: 3600,
      }),
  ]) {
    const f = fixture({ request });
    assert.equal(await runCheck([], f.dependencies), 1);
    assert.doesNotMatch(f.logs.join('\n'), /GMAIL_CHECK_FILE_OK/);
    safe(f.logs);
  }
});

test('Linux startup check reports only conflicting setting names and still tests the file credentials', async () => {
  const f = fixture({
    platform: 'linux',
    link: async () => API_DIR,
    read: async (file) =>
      file.endsWith('/environ')
        ? 'UNRELATED=RAW_SECRET\0GMAIL_API_CLIENT_ID=FILE_CLIENT\0GMAIL_API_CLIENT_SECRET=OTHER_SECRET\0'
        : env,
  });
  assert.equal(await runCheck(['--pid', '1234'], f.dependencies), 1);
  assert.ok(
    f.logs.includes(
      'GMAIL_CHECK_STARTUP_OVERRIDE_DIFFERS: GMAIL_API_CLIENT_SECRET',
    ),
  );
  assert.match(f.logs.join('\n'), /GMAIL_CHECK_FILE_OK/);
  assert.equal(
    new URLSearchParams(f.calls[0].settings.body).get('client_secret'),
    'FILE_SECRET',
  );
  safe(f.logs);
});

test('matching or absent Linux startup settings do not conflict with the file configuration', async () => {
  for (const initial of ['', 'GMAIL_API_CLIENT_SECRET=FILE_SECRET\0']) {
    const f = fixture({
      platform: 'linux',
      link: async () => API_DIR,
      read: async (file) => (file.endsWith('/environ') ? initial : env),
    });
    assert.equal(await runCheck(['--pid', '1234'], f.dependencies), 0);
    assert.ok(f.logs.includes('GMAIL_CHECK_NO_STARTUP_CONFLICT'));
    safe(f.logs);
  }
});

test('invalid PIDs and unrelated or unreadable processes stop without network requests or sensitive errors', async () => {
  const cases = [
    { args: ['--pid', '../../etc'], options: {} },
    { args: ['--pid', '1234'], options: { platform: 'win32' } },
    {
      args: ['--pid', '1234'],
      options: {
        platform: 'linux',
        link: async () => path.join(API_DIR, 'other'),
      },
    },
    {
      args: ['--pid', '1234'],
      options: {
        platform: 'linux',
        link: async () => {
          throw new Error('RAW_SECRET');
        },
      },
    },
  ];
  for (const { args, options } of cases) {
    const f = fixture(options);
    assert.equal(await runCheck(args, f.dependencies), 1);
    assert.equal(f.calls.length, 0);
    safe(f.logs);
  }
});

test('help does not read configuration or contact Google, including when run as a CLI', async () => {
  const f = fixture();
  assert.equal(await runCheck(['--help'], f.dependencies), 0);
  assert.equal(f.reads.length, 0);
  assert.equal(f.calls.length, 0);
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, '../scripts/gmail-check.cjs'), '--help'],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, GMAIL_API_CLIENT_SECRET: 'RAW_SECRET' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No email is sent/);
  safe([result.stdout, result.stderr]);
});
