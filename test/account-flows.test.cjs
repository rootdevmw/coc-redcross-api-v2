const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { createHash } = require('node:crypto');
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
  accountEmail,
  accountNewPassword,
  accountTokenInput,
  finishAccountPassword,
} = require('../src/modules/auth/account-flows.ts');
const { AuthService } = require('../src/modules/auth/auth.service.ts');
const { AuthController } = require('../src/modules/auth/auth.controller.ts');
const {
  SessionAuthGuard,
} = require('../src/modules/auth/guard/session.guard.ts');
const { Reflector } = require('@nestjs/core');
const rawToken = 'a'.repeat(64),
  tokenHash = createHash('sha256').update(rawToken).digest('hex');
const oldPassword = ' old password ',
  newPassword = ' new password ';
const oldHash = bcrypt.hashSync(oldPassword, 4);
const badRequest = (error) => error.getStatus() === 400;
function fixture({
  missing = false,
  expired = false,
  archived = false,
  failWrite = false,
  failSessions = false,
  failAudit = false,
  claimFails = false,
  concurrent = false,
} = {}) {
  let user = {
    id: 7n,
    email: 'person@example.test',
    password: oldHash,
    deletedAt: archived ? new Date() : null,
    roles: [{ role: { name: 'VISITOR', deletedAt: null } }],
  };
  let tokens = [
    {
      token: tokenHash,
      email: user.email,
      expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)),
    },
    {
      token: 'other-hash',
      email: user.email,
      expiresAt: new Date(Date.now() + 60000),
    },
  ];
  let sessions = [
      { id: 'one', userId: 7n },
      { id: 'two', userId: 7n },
      { id: 'other', userId: 8n },
    ],
    inTransaction = false;
  const writes = [],
    reads = [],
    audits = [],
    emails = [],
    transactions = [];
  const tx = {
    user: {
      findFirst: async (options) => {
        reads.push(options);
        return missing ||
          user.deletedAt ||
          (options.where.email && options.where.email !== user.email)
          ? null
          : structuredClone(user);
      },
      update: async (options) => {
        writes.push(['password', inTransaction]);
        user.password = options.data.password;
        if (failWrite) throw new Error('password write failed');
        return structuredClone(user);
      },
      updateMany: async (options) => {
        writes.push(['password', inTransaction]);
        if (concurrent || options.where.password !== user.password)
          return { count: 0 };
        user.password = options.data.password;
        if (failWrite) throw new Error('password write failed');
        return { count: 1 };
      },
    },
    passwordResetToken: {
      findUnique: async ({ where }) =>
        structuredClone(
          tokens.find((token) => token.token === where.token) ?? null,
        ),
      deleteMany: async ({ where }) => {
        writes.push(['tokens', inTransaction]);
        if (where.token && claimFails) return { count: 0 };
        const before = tokens.length;
        tokens = tokens.filter(
          (token) =>
            !(
              (!where.token || token.token === where.token) &&
              (!where.email || token.email === where.email) &&
              (!where.expiresAt || token.expiresAt > where.expiresAt.gt)
            ),
        );
        return { count: before - tokens.length };
      },
      create: async ({ data }) => {
        tokens.push(data);
        return data;
      },
    },
    session: {
      create: async ({ data }) => {
        sessions.push(data);
        writes.push(['session-created', inTransaction]);
        return data;
      },
      deleteMany: async ({ where }) => {
        writes.push(['sessions', inTransaction]);
        if (failSessions) throw new Error('session deletion failed');
        const before = sessions.length;
        sessions = sessions.filter((session) =>
          where.userId
            ? session.userId !== where.userId
            : session.id !== where.id,
        );
        return { count: before - sessions.length };
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback, options) => {
      transactions.push(options);
      const snapshot = structuredClone({ user, tokens, sessions });
      inTransaction = true;
      try {
        return await callback(tx);
      } catch (error) {
        ({ user, tokens, sessions } = snapshot);
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  };
  const audit = {
    log: async (data) => {
      audits.push(data);
      if (failAudit) throw new Error('audit failed after commit');
    },
  };
  const config = {
    get: (key) => (key === 'COOKIE_MAX_AGE' ? '3600000' : undefined),
  };
  const email = { sendResetPassword: async (...args) => emails.push(args) };
  return {
    service: new AuthService(prisma, config, email, audit),
    prisma,
    audit,
    writes,
    reads,
    audits,
    emails,
    transactions,
    get user() {
      return user;
    },
    get tokens() {
      return tokens;
    },
    get sessions() {
      return sessions;
    },
    expire() {
      tokens[0].expiresAt = new Date(Date.now() - 1);
    },
  };
}

test('account input normalizes email, preserves password spaces and enforces bcrypt byte bounds and token shape', () => {
  assert.equal(accountEmail(' Person@Example.test '), 'person@example.test');
  assert.equal(accountNewPassword(newPassword), newPassword);
  assert.doesNotThrow(() => accountNewPassword('\u{1F600}'.repeat(18)));
  for (const input of [
    undefined,
    123,
    [],
    {},
    'bad',
    'x'.repeat(185) + '@example.test',
  ])
    assert.throws(() => accountEmail(input), badRequest);
  for (const input of [
    undefined,
    'short',
    'a'.repeat(73),
    '\u{1F600}'.repeat(19),
    'abc\u0000def',
  ])
    assert.throws(() => accountNewPassword(input), badRequest);
  assert.deepEqual(
    accountTokenInput({
      token: rawToken,
      password: newPassword,
      role: 'ADMIN',
    }),
    { token: rawToken, password: newPassword },
  );
  assert.throws(
    () => accountTokenInput({ token: 'wrong', password: newPassword }),
    badRequest,
  );
});

test('actual login validates credentials, returns a safe user projection and does not audit the session bearer token', async () => {
  const f = fixture();
  const result = await f.service.login({
    email: ' Person@Example.test ',
    password: oldPassword,
  });
  assert.equal(result.data.user.email, f.user.email);
  assert.deepEqual(result.data.user.roles, ['VISITOR']);
  assert.equal(result.data.user.password, undefined);
  assert.equal(result.data.sessionId.length, 64);
  assert.equal(f.audits[0].after.sessionId, undefined);
  assert.equal(f.audits[0].after.password, undefined);
  assert.equal(f.sessions.length, 4);
  assert.equal(f.reads[0].where.deletedAt, null);
});

test('bad login input and incorrect passwords create no sessions and archived accounts cannot sign in', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.login({ email: f.user.email, password: 'incorrect' }),
    (error) => error.getStatus() === 401,
  );
  for (const body of [
    { email: [], password: 'x' },
    { email: f.user.email, password: {} },
    null,
  ])
    await assert.rejects(() => f.service.login(body), badRequest);
  const archived = fixture({ archived: true });
  await assert.rejects(
    () =>
      archived.service.login({
        email: archived.user.email,
        password: oldPassword,
      }),
    (error) => error.getStatus() === 401,
  );
  assert.equal(f.sessions.length, 3);
  assert.equal(archived.sessions.length, 3);
});

test('password recovery keeps the same response for known/unknown emails and stores a hash while email delivery is stubbed', async () => {
  const known = fixture(),
    unknown = fixture({ missing: true });
  assert.deepEqual(
    await known.service.requestPasswordReset(' Person@Example.test '),
    await unknown.service.requestPasswordReset('unknown@example.test'),
  );
  assert.equal(known.emails.length, 1);
  assert.equal(unknown.emails.length, 0);
  assert.equal(known.emails[0][0], 'person@example.test');
  assert.notEqual(known.tokens[0].token, known.emails[0][1]);
  assert.equal(
    known.tokens[0].token,
    createHash('sha256').update(known.emails[0][1]).digest('hex'),
  );
  await assert.rejects(
    () => known.service.requestPasswordReset({}),
    badRequest,
  );
});

test('setup saves the password, consumes all reset links and revokes only the target account sessions atomically', async () => {
  const f = fixture();
  await f.service.setPassword({ token: rawToken, password: newPassword });
  assert.equal(await bcrypt.compare(newPassword, f.user.password), true);
  assert.equal(f.tokens.length, 0);
  assert.deepEqual(f.sessions, [{ id: 'other', userId: 8n }]);
  assert.equal(
    f.writes.every(([, transaction]) => transaction),
    true,
  );
  assert.equal(f.transactions[0].isolationLevel, 'Serializable');
  assert.equal(f.audits[0].action, 'PASSWORD_CHANGED_VIA_RESET');
  assert.equal(f.audits[0].after.password, undefined);
  await assert.rejects(
    () =>
      f.service.setPassword({ token: rawToken, password: 'Another password' }),
    (error) => error.getStatus() === 404,
  );
});

test('reset rejects missing, expired, malformed or archived-account links without changing credentials', async () => {
  for (const options of [
    { expired: true },
    { archived: true },
    { missing: true },
  ]) {
    const f = fixture(options);
    await assert.rejects(
      () => f.service.resetPassword({ token: rawToken, password: newPassword }),
      (error) => error.getStatus() === 404,
    );
    assert.equal(f.user.password, oldHash);
    assert.equal(f.sessions.length, 3);
  }
  const f = fixture();
  await assert.rejects(
    () => f.service.resetPassword({ token: rawToken, password: 'short' }),
    badRequest,
  );
  assert.equal(f.writes.length, 0);
});

test('reset transaction rolls back a password update and token claim when password/session writes fail', async () => {
  for (const options of [{ failWrite: true }, { failSessions: true }]) {
    const f = fixture(options);
    await assert.rejects(
      () => f.service.resetPassword({ token: rawToken, password: newPassword }),
      /failed/,
    );
    assert.equal(f.user.password, oldHash);
    assert.equal(f.tokens.length, 2);
    assert.equal(f.sessions.length, 3);
    assert.equal(f.audits.length, 0);
  }
});

test('a link must still be valid and claimable after hashing, and a failed claim cannot write a password', async () => {
  const claim = fixture({ claimFails: true });
  await assert.rejects(
    () =>
      claim.service.resetPassword({ token: rawToken, password: newPassword }),
    (error) => error.getStatus() === 404,
  );
  assert.equal(claim.user.password, oldHash);
  const expiry = fixture();
  await assert.rejects(
    () =>
      finishAccountPassword(
        expiry.prisma,
        expiry.audit,
        { token: rawToken, password: newPassword },
        'reset',
        {
          hash: async () => {
            expiry.expire();
            return 'fixture-hash';
          },
          compare: async () => true,
        },
      ),
    (error) => error.getStatus() === 404,
  );
  assert.equal(expiry.writes.length, 0);
});

test('change-password verifies the untrimmed current password and atomically revokes sessions and links', async () => {
  const f = fixture();
  await f.service.changePassword(
    7n,
    { currentPassword: oldPassword, newPassword },
    { id: 7n },
  );
  assert.equal(await bcrypt.compare(newPassword, f.user.password), true);
  assert.equal(f.tokens.length, 0);
  assert.deepEqual(f.sessions, [{ id: 'other', userId: 8n }]);
  assert.equal(f.audits[0].action, 'PASSWORD_CHANGED');
  assert.equal(f.audits[0].userId, 7n);
  assert.equal(
    f.writes.every(([, transaction]) => transaction),
    true,
  );
});

test('incorrect current passwords, overlapping changes and write failures preserve the previous account state', async () => {
  const wrong = fixture();
  await assert.rejects(
    () =>
      wrong.service.changePassword('7', {
        currentPassword: 'wrong',
        newPassword,
      }),
    (error) => error.getStatus() === 409,
  );
  assert.equal(wrong.writes.length, 0);
  for (const options of [{ concurrent: true }, { failSessions: true }]) {
    const f = fixture(options);
    await assert.rejects(() =>
      f.service.changePassword('7', {
        currentPassword: oldPassword,
        newPassword,
      }),
    );
    assert.equal(f.user.password, oldHash);
    assert.equal(f.tokens.length, 2);
    assert.equal(f.sessions.length, 3);
  }
});

test('audit failures can follow committed password changes, but no password/hash/token is included in these audit records', async () => {
  const f = fixture({ failAudit: true });
  await assert.rejects(
    () => f.service.resetPassword({ token: rawToken, password: newPassword }),
    /audit failed/,
  );
  assert.equal(await bcrypt.compare(newPassword, f.user.password), true);
  assert.equal(f.tokens.length, 0);
  assert.equal(f.sessions.length, 1);
  const serialized = JSON.stringify(f.audits);
  for (const secret of [oldPassword, newPassword, oldHash, rawToken, tokenHash])
    assert.equal(serialized.includes(secret), false);
});

test('controller login uses the configured cookie and returns no session token; password/logout responses clear without a new maxAge', async () => {
  const calls = [],
    clears = [],
    user = { id: '7', email: 'person@example.test', roles: ['VISITOR'] };
  const service = {
    login: async () => ({ data: { sessionId: 'fixture-session', user } }),
    logout: async (id) => {
      calls.push(id);
      return { success: true, data: {} };
    },
    setPassword: async () => ({ success: true, data: {} }),
    resetPassword: async () => ({ success: true, data: {} }),
    changePassword: async (...args) => {
      calls.push(args);
      return { success: true, data: {} };
    },
  };
  const config = {
    get: (key) =>
      ({
        COOKIE_NAME: 'church_session',
        COOKIE_HTTP_ONLY: 'true',
        COOKIE_SECURE: 'true',
        COOKIE_SAME_SITE: 'lax',
        COOKIE_MAX_AGE: '3600000',
      })[key],
  };
  const controller = new AuthController(service, config),
    res = {
      cookie: (...args) => calls.push(args),
      clearCookie: (...args) => clears.push(args),
    };
  const result = await controller.login({}, res);
  assert.deepEqual(result.data, user);
  assert.equal(result.data.sessionId, undefined);
  assert.equal(calls[0][0], 'church_session');
  await controller.logout(
    { cookies: { church_session: 'fixture-session', session_id: 'wrong' } },
    res,
  );
  await controller.setPassword({}, res);
  await controller.resetPassword({}, res);
  await controller.changePassword(
    { user: { id: 7n } },
    { currentPassword: oldPassword, newPassword },
    res,
  );
  assert.equal(calls[1], 'fixture-session');
  assert.equal(clears.length, 4);
  for (const [name, options] of clears) {
    assert.equal(name, 'church_session');
    assert.equal(options.maxAge, undefined);
    assert.equal(options.httpOnly, true);
  }
  assert.equal(AuthController.prototype.register, undefined);
});

test('session guard honors the configured cookie, rejects expired/deleted accounts and excludes archived roles', async () => {
  const config = { get: () => 'church_session' },
    session = {
      expiresAt: new Date(Date.now() + 60000),
      user: {
        id: 7n,
        email: 'person@example.test',
        deletedAt: null,
        roles: [
          { role: { name: 'VISITOR', deletedAt: null } },
          { role: { name: 'ADMIN', deletedAt: new Date() } },
        ],
        member: null,
      },
    };
  let requested;
  const prisma = {
    session: {
      findUnique: async (options) => {
        requested = options;
        return session;
      },
    },
  };
  const req = {
    cookies: { church_session: 'correct', session_id: 'wrong' },
    ip: 'fixture',
    url: '/auth/me',
  };
  const context = {
    getHandler: () => AuthController.prototype.me,
    getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => req }),
  };
  const guard = new SessionAuthGuard(prisma, new Reflector(), config);
  assert.equal(await guard.canActivate(context), true);
  assert.equal(requested.where.id, 'correct');
  assert.deepEqual(req.user.roles, ['VISITOR']);
  session.user.deletedAt = new Date();
  await assert.rejects(
    () => guard.canActivate(context),
    (error) => error.getStatus() === 401,
  );
  session.user.deletedAt = null;
  session.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(
    () => guard.canActivate(context),
    (error) => error.getStatus() === 401,
  );
});
