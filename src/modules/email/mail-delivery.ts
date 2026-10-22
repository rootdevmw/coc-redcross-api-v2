import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import {
  mailErrorCode,
  type EmailMessage,
  type MailDelivery,
  type MailDeliveryResult,
} from './mail-types';
import {
  createGmailApiDelivery,
  type MimeComposer,
} from './gmail-api-delivery';
export { mailErrorCode } from './mail-types';
export type {
  EmailMessage,
  MailDelivery,
  MailDeliveryResult,
} from './mail-types';
type DeliveryFactories = {
  request?: typeof fetch;
  compose?: MimeComposer;
  smtp(options: SMTPTransport.Options): {
    sendMail(
      message: EmailMessage & { from: string },
    ): Promise<{ accepted?: unknown[] }>;
  };
};
const defaultFactories: DeliveryFactories = {
  smtp: (options) => nodemailer.createTransport(options),
};

function unconfigured(message: string): MailDelivery {
  return {
    provider: 'unconfigured',
    configured: false,
    configurationError: message,
    send: () =>
      Promise.resolve<MailDeliveryResult>({
        status: 'not_configured',
        code: 'MAIL_NOT_CONFIGURED',
      }),
  };
}

export function createMailDelivery(
  setting: (name: string) => string | undefined,
  factories: DeliveryFactories = defaultFactories,
): MailDelivery {
  const transport = setting('GMAIL_TRANSPORT')?.trim().toLowerCase() || 'smtp';
  if (transport !== 'smtp' && transport !== 'api')
    return unconfigured('GMAIL_TRANSPORT must be smtp or api.');
  const timeout = Number(setting('EMAIL_TIMEOUT_MS') || 20000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000)
    return unconfigured(
      'EMAIL_TIMEOUT_MS must be between 1000 and 120000 milliseconds.',
    );

  const user = setting('GMAIL_USER')?.trim();
  const from = setting('GMAIL_FROM')?.trim() || user;
  if (transport === 'api') {
    const clientId = setting('GMAIL_API_CLIENT_ID')?.trim();
    const clientSecret = setting('GMAIL_API_CLIENT_SECRET')?.trim();
    const refreshToken = setting('GMAIL_API_REFRESH_TOKEN')?.trim();
    if (!user || !from || !clientId || !clientSecret || !refreshToken)
      return unconfigured(
        'Gmail API requires GMAIL_USER, GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET and GMAIL_API_REFRESH_TOKEN.',
      );
    return createGmailApiDelivery(
      { clientId, clientSecret, refreshToken, from, timeout },
      factories,
    );
  }
  const password = setting('GMAIL_APP_PASSWORD');
  if (!user || !password || !from)
    return unconfigured(
      'Gmail SMTP requires GMAIL_USER and GMAIL_APP_PASSWORD; GMAIL_FROM is optional.',
    );
  const transporter = factories.smtp({
    service: 'gmail',
    auth: { user, pass: password },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    dnsTimeout: Math.min(timeout, 10000),
  });
  return {
    provider: 'smtp',
    configured: true,
    async send(message) {
      try {
        const info = await transporter.sendMail({ ...message, from });
        const accepted = info.accepted?.some((recipient) => {
          const address =
            typeof recipient === 'string'
              ? recipient
              : recipient &&
                  typeof recipient === 'object' &&
                  'address' in recipient
                ? recipient.address
                : undefined;
          return (
            typeof address === 'string' &&
            address.trim().toLowerCase() === message.to.trim().toLowerCase()
          );
        });
        return accepted
          ? { status: 'accepted' }
          : { status: 'failed', code: 'RECIPIENT_NOT_ACCEPTED' };
      } catch (error) {
        return { status: 'failed', code: mailErrorCode(error) };
      }
    },
  };
}
