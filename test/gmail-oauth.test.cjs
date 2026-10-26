const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  SCOPE,
  createAuthorization,
  callbackResult,
  exchangeCode,
  saveRefreshToken,
  authorize,
} = require('../scripts/gmail-oauth.cjs');
const input = {
  clientId: 'fixture-client',
  clientSecret: 'SECRET_CLIENT',
  redirectUri: 'http://127.0.0.1:43123',
  user: 'sender@example.test',
};

test('local OAuth uses independent random state and PKCE with only Gmail send permission', () => {
  const a = createAuthorization(input),
    b = createAuthorization(input);
  const url = new URL(a.url);
  assert.equal(
    url.origin + url.pathname,
    'https://accounts.google.com/o/oauth2/v2/auth',
  );
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.deepEqual(
    new Set(url.searchParams.get('prompt').split(/\s+/)),
    new Set(['select_account', 'consent']),
  );
  assert.equal(url.searchParams.get('redirect_uri'), input.redirectUri);
  assert.equal(url.searchParams.get('login_hint'), input.user);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(a.verifier).digest('base64url'),
  );
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.verifier, b.verifier);
  assert.doesNotMatch(a.url, /SECRET_CLIENT/);
  assert.ok(!a.url.includes(a.verifier));
});

test('authorization setup refuses redirects outside the local loopback listener', () => {
  for (const redirectUri of [
    'https://example.test',
    'http://0.0.0.0:1234',
    'http://localhost:1234',
    'http://127.0.0.1',
    'http://127.0.0.1:1234/path',
    'http://127.0.0.1:1234?query=1',
  ])
    assert.throws(
      () => createAuthorization({ ...input, redirectUri }),
      /LOOPBACK_REQUIRED/,
    );
});

test('OAuth callbacks require matching state and a single code', () => {
  const { state } = createAuthorization(input);
  const valid = `/?state=${state}&code=SECRET_CODE`;
  assert.deepEqual(callbackResult(valid, state), {
    status: 'authorized',
    code: 'SECRET_CODE',
  });
  for (const url of [
    '/',
    '/?code=SECRET_CODE',
    '/?state=wrong&code=SECRET_CODE',
    `/?state=${state}`,
    `${valid}&code=OTHER`,
    `${valid}&state=${state}`,
  ])
    assert.deepEqual(callbackResult(url, state), { status: 'invalid' });
  assert.deepEqual(callbackResult(`/favicon.ico?state=${state}`, state), {
    status: 'not_found',
  });
  assert.deepEqual(
    callbackResult(`/?state=${state}&error=access_denied`, state),
    { status: 'denied' },
  );
});

test('authorization code exchange uses the same redirect and PKCE verifier over HTTPS', async () => {
  const { verifier } = createAuthorization(input);
  const calls = [];
  const token = await exchangeCode(
    { ...input, verifier, code: 'SECRET_CODE' },
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({ refresh_token: 'SECRET_REFRESH', scope: SCOPE });
    },
  );
  assert.equal(token, 'SECRET_REFRESH');
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, 'https://oauth2.googleapis.com/token');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
    code: 'SECRET_CODE',
  });
});

test('OAuth errors never surface raw Google bodies or credentials', async () => {
  const args = { ...input, verifier: 'fixture-verifier', code: 'SECRET_CODE' };
  await assert.rejects(
    exchangeCode(args, async () => {
      throw new Error('SECRET_NETWORK');
    }),
    /^Error: GMAIL_OAUTH_CONNECTION_FAILED$/,
  );
  await assert.rejects(
    exchangeCode(
      args,
      async () => new Response('SECRET_PROVIDER', { status: 400 }),
    ),
    /^Error: GMAIL_OAUTH_HTTP_400$/,
  );
  await assert.rejects(
    exchangeCode(args, async () => new Response('SECRET_NOT_JSON')),
    /^Error: GMAIL_OAUTH_INVALID_RESPONSE$/,
  );
  for (const data of [
    null,
    {},
    { refresh_token: '' },
    { refresh_token: 'SECRET\nINJECTION', scope: SCOPE },
  ])
    await assert.rejects(
      exchangeCode(args, async () => Response.json(data)),
      /REFRESH_TOKEN_MISSING_OR_INVALID/,
    );
  for (const scope of [
    undefined,
    'openid',
    'https://www.googleapis.com/auth/gmail.readonly',
  ])
    await assert.rejects(
      exchangeCode(args, async () =>
        Response.json({ refresh_token: 'SECRET_REFRESH', scope }),
      ),
      /SEND_PERMISSION_MISSING/,
    );
});

test('cancelling local authorization aborts the in-flight token request', async () => {
  const controller = new AbortController();
  const exchange = exchangeCode(
    {
      ...input,
      verifier: 'fixture-verifier',
      code: 'SECRET_CODE',
      signal: controller.signal,
    },
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true },
        );
      }),
  );
  controller.abort();
  await assert.rejects(exchange, /^Error: GMAIL_OAUTH_CONNECTION_FAILED$/);
});

test('refresh token storage creates a private file exclusively and never changes existing configuration', async () => {
  const calls = [];
  await saveRefreshToken('SECRET_REFRESH', 'fixture-output', async (...args) =>
    calls.push(args),
  );
  assert.deepEqual(calls, [
    [
      'fixture-output',
      'GMAIL_API_REFRESH_TOKEN=SECRET_REFRESH\n',
      { flag: 'wx', mode: 0o600 },
    ],
  ]);
  const alreadyExists = Object.assign(new Error('fixture'), { code: 'EEXIST' });
  await assert.rejects(
    saveRefreshToken('SECRET_REFRESH', 'fixture-output', async () => {
      throw alreadyExists;
    }),
    { code: 'EEXIST' },
  );
  for (const invalid of [
    '',
    'SECRET\nSETTING=value',
    'SECRET#value',
    'SECRET"value',
  ])
    assert.throws(
      () => saveRefreshToken(invalid, 'fixture-output'),
      /REFRESH_TOKEN_INVALID/,
    );
});

test('missing OAuth configuration stops before opening a listener or a browser', async () => {
  const logs = [];
  await assert.rejects(
    authorize({}, (text) => logs.push(text)),
    /CLIENT_CONFIGURATION_MISSING/,
  );
  assert.deepEqual(logs, []);
});

test('the help command is safe without configuration and never initiates authorization', () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, '../scripts/gmail-oauth.cjs'), '--help'],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        GMAIL_API_CLIENT_ID: 'fixture-client',
        GMAIL_API_CLIENT_SECRET: 'SECRET_CLIENT',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No email is sent/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SECRET_CLIENT|accounts\.google\.com/,
  );
});
