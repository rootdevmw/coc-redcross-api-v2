import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    if (!process.env.SENDGRID_API_KEY) {
      this.logger.error('SENDGRID_API_KEY is not set');
    } else {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.logger.log('SendGrid initialized');
    }
  }

  // --------------------------------------------------
  // SET PASSWORD (NEW USER INVITE)
  // --------------------------------------------------
  async sendSetPassword(email: string, token: string) {
    const link = `${process.env.FRONTEND_URL}/set-password?token=${token}`;

    this.logger.log(`Sending set password email → ${email}`);

    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM!,
      subject: 'Set Your Password — Church of Christ at Redcross',
      html: this.wrapEmail(`
        <p style="
          margin:0 0 8px;
          font-size:11px;
          text-transform:uppercase;
          letter-spacing:2px;
          color:#9ca3af;
        ">
          Account Setup
        </p>

        <h2 style="
          margin:0 0 12px;
          font-size:20px;
          color:#ffffff;
        ">
          Set your password
        </h2>

        <p style="
          margin:0 0 20px;
          font-size:14px;
          line-height:1.6;
          color:#9ca3af;
        ">
          Your account has been created. Click below to set your password and access the system.
        </p>

        <a href="${link}" style="
          display:block;
          background:#d4af37;
          color:#000;
          padding:12px;
          border-radius:8px;
          text-align:center;
          text-decoration:none;
          font-weight:600;
        ">
          Set Password →
        </a>

        <div style="
          margin-top:20px;
          padding:14px;
          border-radius:8px;
          background:#0f172a;
          border:1px solid #1f2937;
          font-size:12px;
          color:#9ca3af;
          word-break:break-all;
        ">
          ${link}
        </div>

        <p style="
          margin-top:20px;
          font-size:12px;
          color:#6b7280;
        ">
          This link expires in 1 hour. If you did not expect this email, you can ignore it.
        </p>
      `),
    });
  }

  // --------------------------------------------------
  // RESET PASSWORD
  // --------------------------------------------------
  async sendResetPassword(email: string, token: string) {
    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    this.logger.log(`Sending reset password email → ${email}`);

    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM!,
      subject: 'Reset Your Password — Church of Christ at Redcross',
      html: this.wrapEmail(`
        <p style="
          margin:0 0 8px;
          font-size:11px;
          text-transform:uppercase;
          letter-spacing:2px;
          color:#9ca3af;
        ">
          Password Reset
        </p>

        <h2 style="
          margin:0 0 12px;
          font-size:20px;
          color:#ffffff;
        ">
          Reset your password
        </h2>

        <p style="
          margin:0 0 20px;
          font-size:14px;
          line-height:1.6;
          color:#9ca3af;
        ">
          We received a request to reset your password. Click below to choose a new one.
        </p>

        <a href="${link}" style="
          display:block;
          background:#d4af37;
          color:#000;
          padding:12px;
          border-radius:8px;
          text-align:center;
          text-decoration:none;
          font-weight:600;
        ">
          Reset Password →
        </a>

        <div style="
          margin-top:20px;
          padding:14px;
          border-radius:8px;
          background:#0f172a;
          border:1px solid #1f2937;
          font-size:12px;
          color:#9ca3af;
          word-break:break-all;
        ">
          ${link}
        </div>

        <p style="
          margin-top:20px;
          font-size:12px;
          color:#6b7280;
        ">
          This link expires in 1 hour. If you did not request this, you can ignore this email.
        </p>
      `),
    });
  }

  // --------------------------------------------------
  // SHARED EMAIL LAYOUT (ALIGNED WITH UI)
  // --------------------------------------------------
  private wrapEmail(content: string) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    </head>

    <body style="
      margin:0;
      padding:0;
      background:#0f172a;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#e5e7eb;
    ">

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:60px 16px;">

            <table width="100%" style="
              max-width:520px;
              background:#111827;
              border-radius:16px;
              overflow:hidden;
              border:1px solid #1f2937;
            ">

              <!-- Accent -->
              <tr>
                <td style="
                  height:3px;
                  background:linear-gradient(to right,#d4af37,#facc15,#d4af37);
                "></td>
              </tr>

              <!-- Header -->
              <tr>
                <td style="padding:28px 32px 20px;text-align:center;">
                  <h1 style="
                    margin:0;
                    font-size:18px;
                    font-weight:600;
                    color:#ffffff;
                  ">
                    Church of Christ at Redcross
                  </h1>

                  <p style="
                    margin:6px 0 0;
                    font-size:12px;
                    color:#9ca3af;
                  ">
                    Internal Management System
                  </p>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="border-top:1px solid #1f2937;"></td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:28px 32px;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="
                  border-top:1px solid #1f2937;
                  padding:16px 32px;
                  text-align:center;
                  font-size:11px;
                  color:#6b7280;
                ">
                  Church of Christ at Redcross • Malawi
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
    `;
  }
}
