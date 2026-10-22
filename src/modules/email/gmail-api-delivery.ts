import * as nodemailer from 'nodemailer';
import {
  mailErrorCode,
  type EmailMessage,
  type MailDelivery,
} from './mail-types';

type GmailApiSettings = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
  timeout: number;
};
export type MimeComposer = (
  message: EmailMessage & { from: string },
) => Promise<Buffer>;

export const composeMimeMessage: MimeComposer = async (message) => {
  // This transport builds MIME in memory; it never connects to an SMTP server.
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const result = await composer.sendMail({
    ...message,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  if (!Buffer.isBuffer(result.message))
    throw new Error('MIME composition failed.');
  return result.message;
};

class GmailDeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createGmailApiDelivery(
  settings: GmailApiSettings,
  dependencies: { request?: typeof fetch; compose?: MimeComposer } = {},
): MailDelivery {
  const request = dependencies.request ?? fetch;
  const compose = dependencies.compose ?? composeMimeMessage;
  let cached: { token: string; validUntil: number } | undefined;
  let pending: Promise<string> | undefined;
  async function refresh(): Promise<string> {
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: settings.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(settings.timeout),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new GmailDeliveryError(`GMAIL_OAUTH_HTTP_${response.status}`);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new GmailDeliveryError('GMAIL_OAUTH_INVALID_RESPONSE');
    }
    if (
      !object(data) ||
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      !/^[!-~]+$/.test(data.access_token) ||
      typeof data.expires_in !== 'number' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    )
      throw new GmailDeliveryError('GMAIL_OAUTH_INVALID_RESPONSE');
    cached = {
      token: data.access_token,
      validUntil: Date.now() + Math.max(0, data.expires_in * 1000 - 60000),
    };
    return cached.token;
  }
  async function accessToken(): Promise<string> {
    if (cached && cached.validUntil > Date.now()) return cached.token;
    if (!pending)
      pending = refresh().finally(() => {
        pending = undefined;
      });
    return pending;
  }
  return {
    provider: 'gmail-api',
    configured: true,
    async send(message) {
      try {
        let mime: Buffer;
        try {
          mime = await compose({ ...message, from: settings.from });
        } catch {
          return { status: 'failed', code: 'GMAIL_COMPOSE_FAILED' };
        }
        const token = await accessToken();
        const response = await request(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            redirect: 'error',
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: mime.toString('base64url') }),
            signal: AbortSignal.timeout(settings.timeout),
          },
        );
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if (response.status === 401 && cached?.token === token)
            cached = undefined;
          return {
            status: 'failed',
            code: `GMAIL_SEND_HTTP_${response.status}`,
          };
        }
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          return { status: 'failed', code: 'GMAIL_SEND_INVALID_RESPONSE' };
        }
        return object(result) &&
          typeof result.id === 'string' &&
          !!result.id.trim()
          ? { status: 'accepted' }
          : { status: 'failed', code: 'GMAIL_SEND_INVALID_RESPONSE' };
      } catch (error) {
        return {
          status: 'failed',
          code:
            error instanceof GmailDeliveryError
              ? error.code
              : mailErrorCode(error),
        };
      }
    },
  };
}
