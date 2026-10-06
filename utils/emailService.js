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

const sendWelcomeEmail = async ({ to, name, email, password, organizationName }) => {
  const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
  const loginUrl = frontendUrl ? `${frontendUrl}/login` : null;
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Welcome to ${organizationName || 'Task Management'} – Your Account is Ready`,
    text: [
      `Hi ${name},`,
      ``,
      `You have been added to ${organizationName || 'the organization'} on Task Management.`,
      ``,
      `Your login credentials:`,
      `  Email:    ${email}`,
      `  Password: ${password}`,
      ``,
      loginUrl ? `Login here: ${loginUrl}` : '',
      ``,
      `Please change your password after your first login.`,
      ``,
      `If you have any questions, contact your organization admin.`,
    ].filter(line => line !== undefined).join('\n'),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9fafb;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">Welcome to ${organizationName || 'Task Management'}!</h1>
          <p style="color:#e0e7ff;margin:8px 0 0;font-size:14px;">Your account has been created</p>
        </div>
        <div style="padding:32px;background:#fff;">
          <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">You've been added to <strong>${organizationName || 'the organization'}</strong>. Here are your login credentials:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;"><span style="font-weight:600;color:#374151;">Email:</span> ${email}</p>
            <p style="margin:0;font-size:13px;color:#6b7280;"><span style="font-weight:600;color:#374151;">Password:</span> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:13px;">${password}</code></p>
          </div>
          ${loginUrl ? `<div style="text-align:center;margin-bottom:24px;"><a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Login to your account</a></div>` : ''}
          <p style="color:#9ca3af;font-size:12px;margin:0;">⚠️ Please change your password after your first login for security.</p>
        </div>
        <div style="padding:16px 32px;background:#f9fafb;text-align:center;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">This email was sent by Task Management. If you weren't expecting this, please contact your administrator.</p>
        </div>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
