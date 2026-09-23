import nodemailer from 'nodemailer';
import { escapeEmailHtml } from './contact-emails';

export interface EmailMessage {
  to: string;
  subject: string;
  title: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footnote?: string;
}

export function appUrl(path = ''): string {
  const base = (process.env.APP_URL || 'https://app.viis.app').replace(/\/$/, '');
  return `${base}${path}`;
}

/** Plantilla única de correo transaccional: texto plano + HTML con la marca. */
export function renderEmail(message: EmailMessage): { text: string; html: string } {
  const text = [
    message.title,
    '',
    ...message.paragraphs,
    ...(message.cta ? ['', `${message.cta.label}: ${message.cta.href}`] : []),
    '',
    message.footnote ?? 'OpenV · Este es un mensaje automático; no respondas a este correo con datos sensibles.',
  ].join('\n');

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#eef4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0b2533">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d8e3e7">
    <tr><td style="background:#0c2b3b;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold">OpenV</td></tr>
    <tr><td style="padding:28px">
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${escapeEmailHtml(message.title)}</h1>
      ${message.paragraphs.map((p) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px">${escapeEmailHtml(p)}</p>`).join('')}
      ${
        message.cta
          ? `<p style="margin:24px 0"><a href="${escapeEmailHtml(message.cta.href)}" style="background:#18c6a3;color:#0c2b3b;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">${escapeEmailHtml(message.cta.label)}</a></p>`
          : ''
      }
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f4f7f8;color:#60727b;font-size:12px;line-height:1.5">${escapeEmailHtml(
      message.footnote ?? 'Este es un mensaje automático de OpenV. Nunca te pediremos tu contraseña ni códigos de verificación.',
    )}</td></tr>
  </table></td></tr></table></body></html>`;
  return { text, html };
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD);
}

export async function sendEmail(message: EmailMessage): Promise<string | undefined> {
  if (!mailConfigured()) throw new Error('Servidor de correo no configurado.');
  const user = process.env.SMTP_USER!.trim();
  const secure = process.env.SMTP_SECURE !== 'false';
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: Number(process.env.SMTP_PORT || 465),
    secure,
    requireTLS: !secure,
    auth: { user, pass: process.env.SMTP_PASSWORD },
  });
  try {
    const { text, html } = renderEmail(message);
    const info = await transport.sendMail({
      from: { name: process.env.EMAIL_FROM_NAME?.trim() || 'OpenV', address: user },
      to: message.to,
      subject: message.subject,
      text,
      html,
    });
    return info.messageId;
  } finally {
    transport.close();
  }
}
