const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});
const {
  createMailDelivery,
  mailErrorCode,
} = require('../src/modules/email/mail-delivery.ts');
const {
  composeMimeMessage,
} = require('../src/modules/email/gmail-api-delivery.ts');
const values = {
  GMAIL_TRANSPORT: 'api',
  GMAIL_USER: 'sender@example.test',
  GMAIL_API_CLIENT_ID: 'fixture-client',
  GMAIL_API_CLIENT_SECRET: 'SECRET_CLIENT',
  GMAIL_API_REFRESH_TOKEN: 'SECRET_REFRESH',
  EMAIL_TIMEOUT_MS: '15000',
};
const message = {
  to: 'member@example.test',
  subject: 'Reset your password',
  html: '<p><a href="https://church.example.test/reset-password?token=SECRET_RESET">Reset</a></p>',
};
const tokenResponse = () =>
  Response.json({
    access_token: 'SECRET_ACCESS',
    expires_in: 3600,
    token_type: 'Bearer',
  });
function fixture({ settings = values, request, compose } = {}) {
  const calls = [];
  const delivery = createMailDelivery((name) => settings[name], {
    smtp: () => {
      assert.fail('API mode must not construct or fall back to SMTP');
    },
    compose: compose ?? (() => Promise.resolve(Buffer.from('fixture MIME'))),
    request: async (url, options) => {
      calls.push({ url, options });
      return request
        ? request(url, options, calls.length)
        : url.includes('/token')
          ? tokenResponse()
          : Response.json({ id: 'fixture-message' });
    },
  });
  return { delivery, calls };
}

test('Gmail API mode does not require an app password and submits MIME over HTTPS', async () => {
  const f = fixture({ compose: composeMimeMessage });
  assert.equal(f.delivery.provider, 'gmail-api');
  assert.equal(f.delivery.configured, true);
  assert.deepEqual(await f.delivery.send(message), { status: 'accepted' });
  assert.equal(f.calls.length, 2);
  const [refresh, send] = f.calls;
  assert.equal(refresh.url, 'https://oauth2.googleapis.com/token');
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(refresh.options.body)),
    {
      client_id: values.GMAIL_API_CLIENT_ID,
      client_secret: values.GMAIL_API_CLIENT_SECRET,
      refresh_token: values.GMAIL_API_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  );
  assert.equal(
    send.url,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
  );
  assert.equal(send.options.headers.Authorization, 'Bearer SECRET_ACCESS');
  const { raw } = JSON.parse(send.options.body);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, 'base64url').toString();
  assert.match(mime, /From: sender@example\.test/);
  assert.match(mime, /To: member@example\.test/);
  assert.match(mime, /Subject: Reset your password/);
  assert.match(mime, /Content-Type: text\/html; charset=utf-8/);
  assert.match(
    mime.replace(/=\r\n/g, '').replace(/=3D/g, '='),
    /reset-password\?token=SECRET_RESET/,
  );
  for (const call of f.calls) {
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.cache, 'no-store');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.doesNotMatch(call.url, /SECRET/);
  }
});

test('the MIME composer preserves Unicode and configured sender without sending', async () => {
  const mime = (
    await composeMimeMessage({
      ...message,
      from: 'Church <sender@example.test>',
      subject: 'Mpingo \u2014 Password',
      html: '<p>Welcome \u2014 SECRET_RESET</p>',
    })
  ).toString();
  assert.match(mime, /From: Church <sender@example\.test>/);
  assert.match(mime, /Subject: =\?UTF-8\?/i);
  const body = mime.split('\r\n\r\n').slice(1).join('\r\n\r\n');
  const decoded = Buffer.from(
    body
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      ),
    'latin1',
  ).toString('utf8');
  assert.match(decoded, /Welcome \u2014 SECRET_RESET/);
});

test('missing API credentials never silently use an existing SMTP app password', async () => {
  for (const name of [
    'GMAIL_USER',
    'GMAIL_API_CLIENT_ID',
    'GMAIL_API_CLIENT_SECRET',
    'GMAIL_API_REFRESH_TOKEN',
  ]) {
    const settings = {
      ...values,
      GMAIL_APP_PASSWORD: 'SECRET_APP',
      [name]: undefined,
    };
    const f = fixture({ settings });
    assert.equal(f.delivery.configured, false);
    assert.deepEqual(await f.delivery.send(message), {
      status: 'not_configured',
      code: 'MAIL_NOT_CONFIGURED',
    });
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(
      f.delivery.configurationError,
      /SECRET_CLIENT|SECRET_REFRESH|SECRET_APP/,
    );
  }
  assert.equal(
    fixture({ settings: { ...values, GMAIL_TRANSPORT: 'other' } }).delivery
      .configured,
    false,
  );
});

test('API mode applies an explicit sender and rejects invalid timeouts before requests', async () => {
  const composed = [];
  const f = fixture({
    settings: { ...values, GMAIL_FROM: 'Church <alias@example.test>' },
    compose: (payload) => {
      composed.push(payload);
      return Promise.resolve(Buffer.from('MIME'));
    },
  });
  await f.delivery.send(message);
  assert.equal(composed[0].from, 'Church <alias@example.test>');
  for (const EMAIL_TIMEOUT_MS of ['0', '999', '120001', 'abc']) {
    const bad = fixture({ settings: { ...values, EMAIL_TIMEOUT_MS } });
    assert.equal(bad.delivery.configured, false);
    await bad.delivery.send(message);
    assert.equal(bad.calls.length, 0);
  }
});

test('concurrent messages share a token refresh and reuse the cached token', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    request: async (url) => {
      if (url.includes('/token')) {
        await gate;
        return tokenResponse();
      }
      return Response.json({ id: 'fixture-message' });
    },
  });
  const outcomes = Promise.all([
    f.delivery.send(message),
    f.delivery.send(message),
    f.delivery.send(message),
  ]);
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 1);
  release();
  assert.deepEqual(await outcomes, [
    { status: 'accepted' },
    { status: 'accepted' },
    { status: 'accepted' },
  ]);
  await f.delivery.send(message);
  assert.equal(f.calls.filter((c) => c.url.includes('/token')).length, 1);
  assert.equal(
    f.calls.filter((c) => c.url.includes('/messages/send')).length,
    4,
  );
});

test('expiring access tokens are refreshed before another message is sent', async (t) => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const f = fixture();
  await f.delivery.send(message);
  now += 3500000;
  await f.delivery.send(message);
  assert.equal(f.calls.filter((c) => c.url.includes('/token')).length, 1);
  now += 41000;
  await f.delivery.send(message);
  assert.equal(f.calls.filter((c) => c.url.includes('/token')).length, 2);
});

test('OAuth rejection logs only the status and never attempts a Gmail send or retry', async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const f = fixture({
      request: async () =>
        new Response('SECRET_PROVIDER SECRET_REFRESH', { status }),
    });
    assert.deepEqual(await f.delivery.send(message), {
      status: 'failed',
      code: `GMAIL_OAUTH_HTTP_${status}`,
    });
    assert.equal(f.calls.length, 1);
  }
});

test('malformed OAuth responses fail safely and a later request can refresh again', async () => {
  for (const data of [
    null,
    [],
    {},
    { access_token: 'SECRET_ACCESS' },
    { access_token: 'bad\r\nheader', expires_in: 3600 },
    { access_token: 'SECRET_ACCESS', expires_in: 0 },
    { access_token: 'SECRET_ACCESS', expires_in: '3600' },
  ]) {
    const f = fixture({ request: async () => Response.json(data) });
    assert.deepEqual(await f.delivery.send(message), {
      status: 'failed',
      code: 'GMAIL_OAUTH_INVALID_RESPONSE',
    });
    assert.equal(f.calls.length, 1);
  }
  let attempts = 0;
  const f = fixture({
    request: async (url) => {
      if (!url.includes('/token')) return Response.json({ id: 'message' });
      return ++attempts === 1 ? new Response('{SECRET') : tokenResponse();
    },
  });
  assert.deepEqual(await f.delivery.send(message), {
    status: 'failed',
    code: 'GMAIL_OAUTH_INVALID_RESPONSE',
  });
  assert.deepEqual(await f.delivery.send(message), { status: 'accepted' });
  assert.equal(attempts, 2);
});

test('Gmail send errors are not retried and a 401 invalidates the cached access token', async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const f = fixture({
      request: async (url) =>
        url.includes('/token')
          ? tokenResponse()
          : new Response('SECRET_PROVIDER_BODY', { status }),
    });
    assert.deepEqual(await f.delivery.send(message), {
      status: 'failed',
      code: `GMAIL_SEND_HTTP_${status}`,
    });
    assert.equal(f.calls.length, 2);
    await f.delivery.send(message);
    assert.equal(
      f.calls.filter((c) => c.url.includes('/token')).length,
      status === 401 ? 2 : 1,
    );
    assert.equal(
      f.calls.filter((c) => c.url.includes('/messages/send')).length,
      2,
    );
  }
});

test('HTTP success requires a Gmail message ID, including a valid JSON response', async () => {
  for (const data of [null, [], {}, { id: '' }, { id: '  ' }, { id: 123 }]) {
    const f = fixture({
      request: async (url) =>
        url.includes('/token') ? tokenResponse() : Response.json(data),
    });
    assert.deepEqual(await f.delivery.send(message), {
      status: 'failed',
      code: 'GMAIL_SEND_INVALID_RESPONSE',
    });
  }
  const f = fixture({
    request: async (url) =>
      url.includes('/token')
        ? tokenResponse()
        : new Response('SECRET_NOT_JSON'),
  });
  assert.deepEqual(await f.delivery.send(message), {
    status: 'failed',
    code: 'GMAIL_SEND_INVALID_RESPONSE',
  });
});

test('network failures and timeouts have safe codes and uncertain sends are not repeated', async () => {
  for (const error of [
    new DOMException('SECRET_ACCESS', 'TimeoutError'),
    new DOMException('SECRET_REFRESH', 'AbortError'),
    Object.assign(new TypeError('SECRET_CLIENT'), {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'SECRET_ACCESS' },
    }),
    new Error('SECRET_PROVIDER_BODY'),
  ]) {
    const f = fixture({
      request: async (url) => {
        if (url.includes('/token')) return tokenResponse();
        throw error;
      },
    });
    const result = await f.delivery.send(message);
    assert.equal(result.status, 'failed');
    assert.equal(result.code, mailErrorCode(error));
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal(f.calls.length, 2);
  }
});

test('failed MIME composition makes no external request and does not leak reset links', async () => {
  const f = fixture({
    compose: async () => {
      throw new Error('SECRET_RESET SECRET_CLIENT');
    },
  });
  assert.deepEqual(await f.delivery.send(message), {
    status: 'failed',
    code: 'GMAIL_COMPOSE_FAILED',
  });
  assert.equal(f.calls.length, 0);
});
