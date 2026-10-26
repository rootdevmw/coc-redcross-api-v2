// Read-only credential diagnosis. Requests a token but never sends email or saves tokens.
const { readFile, readlink } = require('node:fs/promises');
const path = require('node:path');
const { parseEnv } = require('node:util');

const API_DIR = path.resolve(__dirname, '..');
const SETTINGS = [
  'GMAIL_API_CLIENT_ID',
  'GMAIL_API_CLIENT_SECRET',
  'GMAIL_API_REFRESH_TOKEN',
];
const ERRORS = new Set([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'admin_policy_enforced',
  'temporarily_unavailable',
  'server_error',
]);

function startupSettings(contents) {
  const settings = Object.create(null);
  for (const entry of contents.split('\0')) {
    const separator = entry.indexOf('=');
    const name = entry.slice(0, separator);
    if (separator !== -1 && SETTINGS.includes(name))
      settings[name] = entry.slice(separator + 1).trim();
  }
  return settings;
}

async function runCheck(args = [], dependencies = {}) {
  const read = dependencies.read ?? readFile;
  const link = dependencies.link ?? readlink;
  const request = dependencies.request ?? fetch;
  const write = dependencies.write ?? console.log;
  const platform = dependencies.platform ?? process.platform;
  if (args.length === 1 && args[0] === '--help') {
    write('Usage: node scripts/gmail-check.cjs [--pid API_PID] (Node 20.12+)');
    write('Tests only api/.env; inherited shell variables are not used.');
    write(
      'Optional --pid checks Linux API startup environment for conflicting OAuth settings.',
    );
    write(
      'No email is sent. No credentials, response bodies or tokens are printed or saved.',
    );
    return 0;
  }
  if (
    args.length !== 0 &&
    !(
      args.length === 2 &&
      args[0] === '--pid' &&
      /^[1-9][0-9]{0,9}$/.test(args[1])
    )
  ) {
    write('GMAIL_CHECK_ARGUMENTS_INVALID: use --help.');
    return 1;
  }

  let settings;
  try {
    // Parse the file directly so this diagnosis cannot silently use stale PM2/shell values.
    settings = parseEnv(await read(path.join(API_DIR, '.env'), 'utf8'));
  } catch {
    write('GMAIL_CHECK_ENV_UNREADABLE: cannot read or parse api/.env.');
    return 1;
  }
  const missing = SETTINGS.filter((name) => !settings[name]?.trim());
  if (missing.length) {
    write(`GMAIL_CHECK_SETTINGS_MISSING: ${missing.join(', ')}`);
    return 1;
  }
  for (const name of SETTINGS) settings[name] = settings[name].trim();

  let conflicts = [];
  if (args.length) {
    if (platform !== 'linux') {
      write('GMAIL_CHECK_PID_REQUIRES_LINUX');
      return 1;
    }
    try {
      const processDir = `/proc/${args[1]}`;
      if ((await link(`${processDir}/cwd`)) !== API_DIR) {
        write(
          'GMAIL_CHECK_PID_DIRECTORY_MISMATCH: select the API process PID.',
        );
        return 1;
      }
      const initial = startupSettings(
        await read(`${processDir}/environ`, 'utf8'),
      );
      conflicts = SETTINGS.filter(
        (name) =>
          Object.hasOwn(initial, name) && initial[name] !== settings[name],
      );
      write(
        conflicts.length
          ? `GMAIL_CHECK_STARTUP_OVERRIDE_DIFFERS: ${conflicts.join(', ')}`
          : 'GMAIL_CHECK_NO_STARTUP_CONFLICT',
      );
    } catch {
      write(
        'GMAIL_CHECK_PID_UNREADABLE: check the current PID and run as the API owner.',
      );
      return 1;
    }
  }

  write('Testing credentials from api/.env. No email will be sent.');
  let response;
  try {
    response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.GMAIL_API_CLIENT_ID,
        client_secret: settings.GMAIL_API_CLIENT_SECRET,
        refresh_token: settings.GMAIL_API_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      // Raw provider responses can contain sensitive details. Never surface them.
    }
    if (!response.ok) {
      const error = ERRORS.has(data?.error)
        ? data.error.toUpperCase()
        : 'UNKNOWN_ERROR';
      write(`GMAIL_CHECK_HTTP_${response.status}: ${error}`);
      return 1;
    }
    if (
      typeof data?.access_token !== 'string' ||
      !/^[!-~]+$/.test(data.access_token) ||
      typeof data.expires_in !== 'number' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      write('GMAIL_CHECK_INVALID_RESPONSE');
      return 1;
    }
    write('GMAIL_CHECK_FILE_OK: Google accepted the credentials in api/.env.');
    return conflicts.length ? 1 : 0;
  } catch {
    write('GMAIL_CHECK_CONNECTION_FAILED: token request failed or timed out.');
    return 1;
  }
}

if (require.main === module) {
  void runCheck(process.argv.slice(2)).then(
    (status) => {
      process.exitCode = status;
    },
    () => {
      console.error('GMAIL_CHECK_FAILED');
      process.exitCode = 1;
    },
  );
}

module.exports = { API_DIR, runCheck };
