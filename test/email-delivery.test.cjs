const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
require('ts-node').register({
  project: path.resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  compilerOptions: { emitDecoratorMetadata: false },
});
require('@nestjs/common').Logger.overrideLogger(false);
const {
  createMailDelivery,
  mailErrorCode,
} = require('../src/modules/email/mail-delivery.ts');
const { EmailService } = require('../src/modules/email/email.service.ts');
const message = {
  to: 'person@example.test',
  subject: 'Account recovery',
  html: '<p>SECRET_RESET_LINK</p>',
};
const settings = {
  GMAIL_USER: 'sender@example.test',
  GMAIL_APP_PASSWORD: 'SECRET_APP_PASSWORD',
};
function fixture(
  values = settings,
  send = async () => ({ accepted: [message.to] }),
) {
  const options = [],
    messages = [];
  const delivery = createMailDelivery((name) => values[name], {
    smtp: (value) => {
      options.push(value);
      return {
        sendMail: async (payload) => {
          messages.push(payload);
          return send(payload);
        },
      };
    },
  });
  return { delivery, options, messages };
}
test('missing Gmail credentials do not create a connection or report acceptance', async () => {
  for (const values of [
    {},
    { GMAIL_USER: settings.GMAIL_USER },
    { GMAIL_APP_PASSWORD: settings.GMAIL_APP_PASSWORD },
  ]) {
    const f = fixture(values);
    assert.equal(f.delivery.configured, false);
    assert.equal(f.options.length, 0);
    assert.deepEqual(await f.delivery.send(message), {
      status: 'not_configured',
      code: 'MAIL_NOT_CONFIGURED',
    });
    assert.equal(f.messages.length, 0);
  }
});
test('the Gmail sender fallback is used consistently when GMAIL_FROM is omitted', async () => {
  const f = fixture();
  assert.equal(f.delivery.provider, 'smtp');
  assert.equal(f.options[0].service, 'gmail');
  assert.deepEqual(f.options[0].auth, {
    user: settings.GMAIL_USER,
    pass: settings.GMAIL_APP_PASSWORD,
  });
  assert.deepEqual(await f.delivery.send(message), { status: 'accepted' });
  assert.equal(f.messages[0].from, settings.GMAIL_USER);
  assert.equal(f.messages[0].html, message.html);
});
test('an explicit sender is retained and transport timeouts bound the wait', async () => {
  const f = fixture({
    ...settings,
    GMAIL_FROM: 'Church <sender@example.test>',
    EMAIL_TIMEOUT_MS: '17000',
  });
  await f.delivery.send(message);
  assert.equal(f.messages[0].from, 'Church <sender@example.test>');
  for (const name of ['connectionTimeout', 'greetingTimeout', 'socketTimeout'])
    assert.equal(f.options[0][name], 17000);
  assert.equal(f.options[0].dnsTimeout, 10000);
  assert.equal(
    'tls' in f.options[0],
    false,
    'Certificate verification is not disabled',
  );
});
test('invalid timeout settings cannot create a transport', () => {
  for (const timeout of ['0', '999', '120001', '1.5', 'invalid']) {
    const f = fixture({ ...settings, EMAIL_TIMEOUT_MS: timeout });
    assert.equal(f.delivery.configured, false);
    assert.equal(f.options.length, 0);
  }
});
test('acceptance requires the requested recipient, including normalized address objects', async () => {
  for (const accepted of [[], ['other@example.test'], undefined]) {
    const f = fixture(settings, async () => ({ accepted }));
    assert.deepEqual(await f.delivery.send(message), {
      status: 'failed',
      code: 'RECIPIENT_NOT_ACCEPTED',
    });
  }
  const f = fixture(settings, async () => ({
    accepted: [{ address: ' PERSON@EXAMPLE.TEST ' }],
  }));
  assert.deepEqual(await f.delivery.send(message), { status: 'accepted' });
});
test('SMTP failures preserve safe machine codes and do not retry or expose provider details', async () => {
  const error = Object.assign(
    new Error('SECRET_APP_PASSWORD SECRET_RESET_LINK'),
    { code: 'ETIMEDOUT', response: 'SECRET_PROVIDER_RESPONSE' },
  );
  const f = fixture(settings, async () => {
    throw error;
  });
  const result = await f.delivery.send(message);
  assert.deepEqual(result, { status: 'failed', code: 'ETIMEDOUT' });
  assert.equal(f.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  for (const value of [
    null,
    'SECRET',
    { code: 'SECRET_APP_PASSWORD' },
    new Error('SECRET_RESET_LINK'),
  ])
    assert.equal(mailErrorCode(value), 'MAIL_ERROR');
  assert.equal(mailErrorCode({ code: 'EAUTH' }), 'EAUTH');
});
test('account-email methods propagate failure or acceptance and never log reset tokens', async () => {
  for (const status of ['accepted', 'failed', 'not_configured']) {
    const service = new EmailService({ get: () => undefined }),
      calls = [],
      logs = [];
    const outcome =
      status === 'accepted'
        ? { status }
        : {
            status,
            code: status === 'failed' ? 'ETIMEDOUT' : 'MAIL_NOT_CONFIGURED',
          };
    service.delivery = {
      provider: 'smtp',
      configured: true,
      send: async (payload) => {
        calls.push(payload);
        return outcome;
      },
    };
    service.logger = Object.fromEntries(
      ['log', 'warn', 'error'].map((level) => [
        level,
        (text) => logs.push({ level, text }),
      ]),
    );
    assert.deepEqual(
      await service.sendResetPassword(message.to, 'SECRET_RESET_TOKEN'),
      outcome,
    );
    assert.deepEqual(
      await service.sendSetPassword(message.to, 'SECRET_SETUP_TOKEN'),
      outcome,
    );
    assert.equal(calls.length, 2);
    assert.match(calls[0].html, /SECRET_RESET_TOKEN/);
    assert.match(calls[1].html, /SECRET_SETUP_TOKEN/);
    assert.doesNotMatch(
      JSON.stringify(logs),
      /SECRET_RESET_TOKEN|SECRET_SETUP_TOKEN/,
    );
    assert.equal(
      logs.some((item) => item.text.includes('accepted by')),
      status === 'accepted',
    );
    assert.equal(
      logs.some((item) => item.level === 'error'),
      status === 'failed',
    );
  }
});
