const nodemailer = require('nodemailer')

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const getTransporter = () => {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP_HOST, SMTP_USER and SMTP_PASS are required for email delivery'
    )
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: {
      user,
      pass
    }
  })
}

const getFromAddress = () => {
  return process.env.MAIL_FROM || process.env.SMTP_USER
}

const sendPasswordResetOtpEmail = async ({ to, otpCode, fullName }) => {
  const transporter = getTransporter()
  const from = getFromAddress()

  if (!from) {
    throw new Error('MAIL_FROM or SMTP_USER is required')
  }

  const displayName = fullName ? String(fullName).trim() : 'User'
  const safeName = escapeHtml(displayName)
  const safeOtp = escapeHtml(otpCode)
  const otpDigits = String(otpCode || '')
    .trim()
    .split('')
    .map(
      digit => `
        <span style="display:inline-block;width:48px;height:56px;margin:0 4px 8px;border-radius:14px;background:#f8fafc;border:1px solid #dbe4f0;color:#0f172a;font-size:22px;line-height:56px;font-weight:800;letter-spacing:1px;text-align:center;vertical-align:middle;box-shadow:0 4px 12px rgba(15,23,42,.08);font-family:'Courier New',Courier,monospace">${escapeHtml(
          digit
        )}</span>
      `
    )
    .join('')

  return transporter.sendMail({
    from,
    to,
    subject: 'Your Magic Formula password reset code',
    text: `Hi ${displayName},\n\nUse this 6-digit code to reset your password: ${otpCode}\n\nThis code expires in 10 minutes.\nIf you did not request this, you can ignore this email.\n`,
    html: `
      <div style="margin:0;padding:0;background:#f4f7fb;width:100%">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
          Your Magic Formula password reset code is ${safeOtp}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.12)">
                <tr>
                  <td style="padding:0;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 55%,#38bdf8 100%)">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding:28px 32px 20px">
                          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.14);color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">
                            Magic Formula
                          </div>
                          <h1 style="margin:18px 0 8px;font-size:30px;line-height:1.15;color:#ffffff">Reset your password</h1>
                          <p style="margin:0;color:rgba(255,255,255,.9);font-size:15px;line-height:1.6;max-width:520px">
                            We received a request to reset the password for your account. Use the code below to continue.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px">
                    <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#334155">Hi ${safeName},</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569">
                      Enter this verification code on the password reset page to create a new password.
                      For security, this code expires in <strong>10 minutes</strong>.
                    </p>

                    <div style="margin:0 0 22px;padding:22px;border-radius:22px;background:#f8fbff;border:1px solid #d9e7ff;text-align:center">
                      <div style="font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#2563eb;margin-bottom:14px">
                        Your OTP
                      </div>
                      <div style="font-size:0;line-height:0;text-align:center">
                        ${otpDigits}
                      </div>
                    </div>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px">
                      <tr>
                        <td style="padding:16px 18px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0">
                          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px">What to do next</div>
                          <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#475569">
                            <li>Go back to the password reset screen.</li>
                            <li>Enter the 6-digit code above.</li>
                            <li>Set your new password and sign in again.</li>
                          </ol>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b">
                      If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px">
                    <div style="height:1px;background:#e2e8f0;margin-bottom:18px"></div>
                    <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8">
                      Need help? Contact the Magic Formula support team from your app or website.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  })
}

const sendRegistrationDecisionEmail = async ({
  to,
  fullName,
  decision,
  reason
}) => {
  const transporter = getTransporter()
  const from = getFromAddress()

  if (!from) {
    throw new Error('MAIL_FROM or SMTP_USER is required')
  }

  const displayName = fullName ? String(fullName).trim() : 'User'
  const normalizedDecision = String(decision || '').trim().toUpperCase()
  const isApproved = normalizedDecision === 'APPROVED'
  const subject = isApproved
    ? 'Your Magic Formula registration is approved'
    : 'Your Magic Formula registration was rejected'
  const headline = isApproved ? 'Registration Approved' : 'Registration Rejected'
  const bodyText = isApproved
    ? 'Your account has been approved. You can now log in to Magic Formula.'
    : 'Your registration was rejected. You may register again with the same details.'
  const reasonText = !isApproved && reason ? String(reason).trim() : ''

  return transporter.sendMail({
    from,
    to,
    subject,
    text: `${displayName}, ${bodyText}${reasonText ? ` Reason: ${reasonText}` : ''}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2 style="margin:0 0 12px">${headline}</h2>
        <p style="margin:0 0 12px">Hi ${displayName},</p>
        <p style="margin:0 0 16px">${bodyText}</p>
        ${reasonText ? `<p style="margin:0 0 16px"><strong>Reason:</strong> ${reasonText}</p>` : ''}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">If you need help, please contact support or the admin team.</p>
      </div>
    `
  })
}

module.exports = {
  sendPasswordResetOtpEmail,
  sendRegistrationDecisionEmail
}
