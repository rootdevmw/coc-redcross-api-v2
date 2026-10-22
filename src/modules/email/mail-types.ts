export type EmailMessage = { to: string; subject: string; html: string };
export type MailDeliveryResult =
  | { status: 'accepted' }
  | { status: 'failed'; code: string }
  | { status: 'not_configured'; code: string };
export type MailDelivery = {
  provider: 'smtp' | 'gmail-api' | 'unconfigured';
  configured: boolean;
  configurationError?: string;
  send(message: EmailMessage): Promise<MailDeliveryResult>;
};

// Provider errors can contain authentication data and message bodies.
export function mailErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'MAIL_ERROR';
  if (
    'name' in error &&
    ['TimeoutError', 'AbortError'].includes(String(error.name))
  )
    return 'ETIMEDOUT';
  const code = 'code' in error ? error.code : undefined;
  if (
    typeof code === 'string' &&
    [
      'ETIMEDOUT',
      'ECONNABORTED',
      'ECONNECTION',
      'ECONNREFUSED',
      'ECONNRESET',
      'EAUTH',
      'EDNS',
      'ESOCKET',
      'ETLS',
      'EENVELOPE',
      'EMESSAGE',
      'ESMTP',
      'ENOTFOUND',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(code)
  )
    return code;
  if (
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'code' in error.cause
  ) {
    const nestedCode = error.cause.code;
    if (
      typeof nestedCode === 'string' &&
      [
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNREFUSED',
        'ECONNRESET',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_SOCKET',
      ].includes(nestedCode)
    )
      return nestedCode;
  }
  return 'MAIL_ERROR';
}
