/**
 * Outgoing email (docs/adr/0006-festiplus-delegate-confirmation-email.md).
 *
 * Uses the MAIL_* keys from .env (the same names as the Freecomers Laravel .env). When MAIL_HOST
 * isn't set, sendMail() returns { sent: false, reason } instead of throwing, so callers can save
 * their changes and report that no email went out.
 */
const nodemailer = require('nodemailer');
const env = require('../../config/environment');

let transporter = null;

function isMailConfigured() {
  return Boolean(env.mail.host && env.mail.fromAddress);
}

function getTransporter() {
  if (transporter) return transporter;
  const m = env.mail;
  transporter = nodemailer.createTransport({
    host: m.host,
    port: m.port,
    // Port 465 is implicit TLS (Laravel calls it 'tls' or 'ssl' there); other ports upgrade with STARTTLS
    secure: m.port === 465 || m.encryption === 'ssl',
    auth: m.username ? { user: m.username, pass: m.password } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
  return transporter;
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string, replyTo?: string, attachments?: Array }} message
 *        attachments: nodemailer attachments, e.g. inline images { filename, content, cid }
 * @returns {Promise<{ sent: boolean, to: string, reason?: string, messageId?: string }>}
 */
async function sendMail({ to, subject, html, text, replyTo, attachments }) {
  if (!to) return { sent: false, to: '', reason: 'No email address.' };
  if (!isMailConfigured()) return { sent: false, to, reason: "Email isn't set up on the server." };
  try {
    const info = await getTransporter().sendMail({
      from: { name: env.mail.fromName, address: env.mail.fromAddress },
      to,
      subject,
      html,
      text,
      replyTo,
      attachments
    });
    const accepted = (info.accepted || []).map(String);
    console.log(`[Mail] Sent "${subject}" to ${to}: ${info.response || 'ok'}`);
    return accepted.length ? { sent: true, to, messageId: info.messageId } : { sent: false, to, reason: 'The mail server did not accept the address.' };
  } catch (err) {
    console.error(`[Mail] Failed to send "${subject}" to ${to}:`, err.message);
    return { sent: false, to, reason: 'The mail server could not be reached. Try again later.' };
  }
}

module.exports = { sendMail, isMailConfigured };
