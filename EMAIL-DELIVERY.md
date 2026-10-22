# Gmail delivery on DigitalOcean

The API supports Gmail SMTP with an app password and Gmail API sending over HTTPS. SMTP remains the default. Set `GMAIL_TRANSPORT=api` on DigitalOcean after completing the OAuth setup below. All account invitations, password resets and prayer notifications use the selected transport.

## Why production SMTP times out

[DigitalOcean blocks outbound SMTP ports 25, 465 and 587 on Droplets by default](https://docs.digitalocean.com/support/why-is-smtp-blocked/). A working Gmail app password authenticates only after a connection is established. Local success followed by a two-minute production connection timeout is consistent with that restriction; the actual Droplet connection has not been tested here.

Gmail API uses HTTPS instead of SMTP. It requires Google OAuth credentials and a refresh token; the Gmail app password cannot authenticate API requests. [Google documents Gmail API sending and its authorization requirements](https://developers.google.com/workspace/gmail/api/guides/sending).

## One-time Google setup

Perform authorization on your own computer, where you can open a browser. Node 22 or later is required. The helper does not send an email.

1. In your Google Cloud project, enable **Gmail API**.
2. Configure the OAuth consent screen for your application. Request `https://www.googleapis.com/auth/gmail.send`. If the external app is in Testing, add your sending Gmail address as a test user.
3. Create an OAuth client with application type **Desktop app**. This client is for the local authorization helper, which uses a temporary loopback callback and PKCE. No public callback route or website login change is needed. See [Google's desktop OAuth setup](https://developers.google.com/identity/protocols/oauth2/native-app).
4. Add the following names and their real values privately to your local `api/.env`. Keep using your existing sending Gmail account:

   ```dotenv
   GMAIL_USER=your-sending-account@gmail.com
   GMAIL_API_CLIENT_ID=your-google-oauth-client-id
   GMAIL_API_CLIENT_SECRET=your-google-oauth-client-secret
   ```

5. From the `api` folder, run:

   ```bash
   npm run gmail:authorize
   ```

   The command intentionally loads local `.env`. Open the printed Google URL in a browser **on that same computer**, select the Gmail account that matches `GMAIL_USER`, and approve sending. The helper listens only on `127.0.0.1`, validates callback state and PKCE, and stops after completion, cancellation or ten minutes.

6. On success, the helper creates `api/.gmail-oauth.env`, containing only `GMAIL_API_REFRESH_TOKEN`. It never prints the token or changes `.env`. The file is Git-ignored, created exclusively, and uses owner-only permissions where supported. On Windows, keep it in your private user workspace with appropriate file permissions. The helper refuses to overwrite an existing token file; securely retain or remove that file before authorizing again.

**Production token lifetime:** Google issues seven-day refresh tokens for external OAuth apps in Testing when requesting Gmail scopes. Set the app to the appropriate production publishing status and complete any verification Google requires, then authorize again for production. Revocation, Gmail password changes and other account policies can also invalidate tokens. See [Google's refresh-token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## Production configuration

Copy the refresh-token setting privately into your production API environment along with the **same** OAuth client ID and client secret. Use the Gmail account you authorized:

```dotenv
GMAIL_TRANSPORT=api
GMAIL_USER=your-sending-account@gmail.com
GMAIL_API_CLIENT_ID=your-google-oauth-client-id
GMAIL_API_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_API_REFRESH_TOKEN=your-refresh-token
FRONTEND_URL=https://churchofchrist.mw
EMAIL_TIMEOUT_MS=20000
```

`GMAIL_FROM` is optional and defaults to `GMAIL_USER`. If set, use the authorized account or one of its configured Gmail send-as aliases. Keep all OAuth values on the server, outside frontend configuration, source control and logs.

API mode ignores `GMAIL_APP_PASSWORD`. It does not fall back to SMTP if OAuth configuration or delivery fails. For local SMTP, omit `GMAIL_TRANSPORT` or set it to `smtp`, and retain `GMAIL_USER` and `GMAIL_APP_PASSWORD`.

Deploy the updated API code, build it and restart the existing process with refreshed configuration:

```bash
npm run build
pm2 restart api --update-env
```

No database migration or new package is required. These commands are deployment instructions; production has not been changed from this workspace. After setup, request a reset for an account you control and check the inbox and server logs. Provider acceptance alone does not establish inbox delivery.

## Delivery behavior and troubleshooting

- Startup logs show `Email transport initialized: gmail-api` when API mode is configured. Missing or invalid configuration logs the required setting names, without their values.
- Short-lived access tokens are refreshed automatically and cached in memory. Concurrent sends share a token refresh. Each HTTPS request has a bounded timeout, defaulting to 20 seconds. `EMAIL_TIMEOUT_MS` accepts whole milliseconds from 1,000 through 120,000.
- SMTP connection, greeting and socket timeouts use the same setting; DNS waiting is capped at ten seconds. [Nodemailer documents these transport settings](https://nodemailer.com/smtp).
- A send returns `accepted`, `failed` or `not_configured`. API acceptance requires a successful Gmail response with a message ID; SMTP acceptance requires the requested recipient in the accepted list.
- Reset logs now say `RESET_EMAIL_ACCEPTED` only after acceptance, or `RESET_EMAIL_NOT_ACCEPTED` after failure. The false `RESET_EMAIL_SENT` following a swallowed timeout has been removed. Provider errors are reduced to safe machine codes; raw responses, OAuth values and reset links are not logged.
- The public password-reset response stays generic for both unknown accounts and delivery failures. The anonymous `/auth/me` 401 in the reported logs is a separate missing-session-cookie request.
- Failed or uncertain sends are not retried automatically, avoiding duplicate mail. A send-time 401 invalidates the cached access token for the next separate request.

| Log code                                                       | What to check                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `MAIL_NOT_CONFIGURED`                                          | Startup warning, selected transport and required settings.                                               |
| `GMAIL_OAUTH_HTTP_400` / `401`                                 | Matching client credentials and refresh token; expired or revoked authorization. Re-authorize if needed. |
| `GMAIL_SEND_HTTP_401`                                          | Authorization; the next request will refresh its access token.                                           |
| `GMAIL_SEND_HTTP_403`                                          | Gmail API enabled in the correct project, send permission granted, account policies and quota.           |
| `GMAIL_SEND_HTTP_429` / `5xx`                                  | Google quota or temporary provider failure. Check before issuing another request.                        |
| `GMAIL_OAUTH_INVALID_RESPONSE` / `GMAIL_SEND_INVALID_RESPONSE` | An unexpected provider response. Check connectivity and provider status without logging credentials.     |
| `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT`                        | Outbound HTTPS connectivity in API mode; SMTP connectivity in SMTP mode.                                 |
| `EAUTH`                                                        | SMTP account or app-password authentication.                                                             |

For SMTP connection-only diagnosis on the Droplet, `nc -vz -w 10 smtp.gmail.com 465` and the equivalent for port `587` do not require credentials or send mail. Changing ports or disabling certificate checks does not remove DigitalOcean's documented restriction.

## Validation

```bash
npm run test:email-delivery
npm run test:account-flows
npm run build
```

Tests use fake provider responses and an in-memory MIME composer. They cover both transports, OAuth scope and callback validation, PKCE, token caching and expiry, safe failure codes, exclusive token-file creation, sender and recipient handling, and truthful reset logging. They do not load environment files, contact Google or send real email. Live authorization and delivery require your Google consent and production configuration.
