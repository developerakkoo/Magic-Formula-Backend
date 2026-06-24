const nodemailer = require('nodemailer')

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

  return transporter.sendMail({
    from,
    to,
    subject: 'Your Magic Formula password reset OTP',
    text: `Hi ${displayName}, your password reset OTP is ${otpCode}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2 style="margin:0 0 12px">Password Reset OTP</h2>
        <p style="margin:0 0 12px">Hi ${displayName},</p>
        <p style="margin:0 0 16px">Use the OTP below to reset your password. It expires in 10 minutes.</p>
        <div style="display:inline-block;padding:14px 20px;border-radius:8px;background:#111827;color:#fff;font-size:22px;font-weight:700;letter-spacing:4px">
          ${otpCode}
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">If you did not request this, you can ignore this email.</p>
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
