// One-time local authorization. Never run this inside the production API process.
const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { lstat, writeFile } = require('node:fs/promises');
const path = require('node:path');

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const OUTPUT = path.resolve(__dirname, '../.gmail-oauth.env');

function createAuthorization({ clientId, redirectUri, user }) {
  const redirect = new URL(redirectUri);
  if (
    redirect.protocol !== 'http:' ||
    redirect.hostname !== '127.0.0.1' ||
    !redirect.port ||
    redirect.pathname !== '/' ||
    redirect.search ||
    redirect.hash
  )
    throw new Error('GMAIL_OAUTH_LOOPBACK_REQUIRED');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    ...(user ? { login_hint: user } : {}),
  }).toString();
  return { url: url.toString(), state, verifier };
}

function callbackResult(requestUrl, expectedState) {
  let url;
  try {
    url = new URL(requestUrl, 'http://127.0.0.1');
  } catch {
    return { status: 'invalid' };
  }
  if (url.pathname !== '/') return { status: 'not_found' };
  const state = url.searchParams.getAll('state');
  if (state.length !== 1) return { status: 'invalid' };
  const actual = Buffer.from(state[0]),
    expected = Buffer.from(expectedState);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return { status: 'invalid' };
  if (url.searchParams.has('error')) return { status: 'denied' };
  const code = url.searchParams.getAll('code');
  if (code.length !== 1 || !code[0]) return { status: 'invalid' };
  return { status: 'authorized', code: code[0] };
}

async function exchangeCode(
  { clientId, clientSecret, redirectUri, verifier, code, signal },
  request = fetch,
) {
  let response;
  try {
    response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
        code,
      }).toString(),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('GMAIL_OAUTH_CONNECTION_FAILED');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`GMAIL_OAUTH_HTTP_${response.status}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('GMAIL_OAUTH_INVALID_RESPONSE');
  }
  if (
    !data ||
    typeof data.refresh_token !== 'string' ||
    !/^[A-Za-z0-9._~+/=-]+$/.test(data.refresh_token)
  )
    throw new Error('GMAIL_OAUTH_REFRESH_TOKEN_MISSING_OR_INVALID');
  if (
    typeof data.scope !== 'string' ||
    !data.scope.split(/\s+/).includes(SCOPE)
  )
    throw new Error('GMAIL_OAUTH_SEND_PERMISSION_MISSING');
  return data.refresh_token;
}

function saveRefreshToken(token, output = OUTPUT, save = writeFile) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/=-]+$/.test(token))
    throw new Error('GMAIL_OAUTH_REFRESH_TOKEN_INVALID');
  // Exclusive creation prevents accidental replacement or following a symlink.
  return save(output, `GMAIL_API_REFRESH_TOKEN=${token}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
}

async function authorize(env = process.env, write = console.log) {
  const clientId = env.GMAIL_API_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_API_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error('GMAIL_OAUTH_CLIENT_CONFIGURATION_MISSING');
  try {
    await lstat(OUTPUT);
    throw new Error('GMAIL_OAUTH_OUTPUT_ALREADY_EXISTS');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let authorization,
    redirectUri,
    busy = false;
  const controller = new AbortController();
  let finish;
  const completion = new Promise((resolve, reject) => {
    finish = (error) => (error ? reject(error) : resolve());
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' || !authorization) {
      res.writeHead(405).end('Unsupported request.');
      return;
    }
    const callback = callbackResult(req.url, authorization.state);
    if (callback.status === 'not_found') {
      res.writeHead(404).end('Not found.');
      return;
    }
    if (callback.status === 'invalid') {
      res.writeHead(400).end('Invalid authorization callback.');
      return;
    }
    if (busy) {
      res.writeHead(409).end('Authorization is already being processed.');
      return;
    }
    busy = true;
    if (callback.status === 'denied') {
      res
        .writeHead(400)
        .end('Permission was declined. You can close this tab.', () =>
          finish(new Error('GMAIL_OAUTH_PERMISSION_DECLINED')),
        );
      return;
    }
    void (async () => {
      try {
        const token = await exchangeCode({
          clientId,
          clientSecret,
          redirectUri,
          verifier: authorization.verifier,
          code: callback.code,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        await saveRefreshToken(token);
        res.end(
          'Authorization saved locally. Return to your terminal for the next steps. You can close this tab.',
          () => finish(),
        );
      } catch (error) {
        res
          .writeHead(500)
          .end(
            'Authorization could not be saved. Check the terminal for the next steps.',
            () => finish(error),
          );
      }
    })();
  });
  const stop = (code) => {
    controller.abort();
    finish(new Error(code));
  };
  const cancel = () => stop('GMAIL_OAUTH_CANCELLED');
  const timer = setTimeout(() => stop('GMAIL_OAUTH_TIMED_OUT'), 10 * 60 * 1000);
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  // Handle rejection even if the listener fails before the completion is awaited.
  void completion.catch(() => {});
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    server.on('error', () => finish(new Error('GMAIL_OAUTH_LISTENER_FAILED')));
    redirectUri = `http://127.0.0.1:${server.address().port}`;
    authorization = createAuthorization({
      clientId,
      redirectUri,
      user: env.GMAIL_USER?.trim(),
    });
    write(
      'Open this URL in a browser on this same computer. Select your sending Gmail account and allow sending:',
    );
    write(authorization.url);
    write(
      'Waiting up to 10 minutes. This authorizes sending; it does not send an email.',
    );
    await completion;
    write(
      'Saved .gmail-oauth.env in the api folder. The token is not printed.',
    );
    write(
      'Copy its setting privately into production configuration alongside the same client ID and client secret.',
    );
    write(
      'Set GMAIL_TRANSPORT=api, deploy the updated API, and restart its process. See EMAIL-DELIVERY.md.',
    );
  } finally {
    controller.abort();
    clearTimeout(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    server.close();
    server.closeAllConnections();
  }
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log(
      'Gmail OAuth setup (Node 22+). Run locally from the api folder:',
    );
    console.log(
      '1. Create a Google Desktop app OAuth client and enable Gmail API.',
    );
    console.log(
      '2. Set GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET and GMAIL_USER in local .env.',
    );
    console.log('3. Run: npm run gmail:authorize');
    console.log("4. Complete Google consent in the same computer's browser.");
    console.log(
      'The refresh token is saved exclusively to git-ignored .gmail-oauth.env, never printed.',
    );
    console.log(
      'No email is sent. See EMAIL-DELIVERY.md for production setup and token expiry.',
    );
  } else {
    void authorize().catch((error) => {
      // Never print raw provider errors, response bodies, authorization codes, tokens or env values.
      const safe =
        typeof error.message === 'string' &&
        /^GMAIL_OAUTH_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : error.code === 'EEXIST'
            ? 'GMAIL_OAUTH_OUTPUT_ALREADY_EXISTS'
            : 'GMAIL_OAUTH_SETUP_FAILED';
      console.error(
        `Gmail authorization failed: ${safe}. See EMAIL-DELIVERY.md.`,
      );
      process.exitCode = 1;
    });
  }
}

module.exports = {
  SCOPE,
  createAuthorization,
  callbackResult,
  exchangeCode,
  saveRefreshToken,
  authorize,
};
