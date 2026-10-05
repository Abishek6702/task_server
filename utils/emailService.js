const getTransporter = () => {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (error) { throw new Error('Email provider dependency is not installed'); }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) throw new Error('SMTP configuration is incomplete');
  return nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: String(SMTP_PORT) === '465', auth: { user: SMTP_USER, pass: SMTP_PASSWORD } });
};

const sendPasswordResetEmail = async ({ to, name, token }) => {
  const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
  if (!frontendUrl) throw new Error('Frontend URL is not configured');
  const resetUrl = `${frontendUrl}/reset-password/${encodeURIComponent(token)}`;
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your Task Management password',
    text: `Hi ${name || 'there'},\n\nA password reset was requested for your account. Reset it here: ${resetUrl}\n\nThis link expires in 20 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Hi ${name || 'there'},</p><p>A password reset was requested for your account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 20 minutes. If you did not request this, you can ignore this email.</p>`,
  });
};

module.exports = { sendPasswordResetEmail };
