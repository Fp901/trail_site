// Transactional email seam (Part 9.5). Provider = Resend (decided). Lazy key read; in dev with
// no key it no-ops. CR/LF stripped from any header-bound value (Part 11.9).
import { site } from '../data/site';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

const stripHeader = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

// Escape any user-derived value placed in an HTML body (A03 / XSS).
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// Absolute pre-trip form link for a booking's token. Built once here so the webhook and the cron
// produce identical URLs. The /pretrip/<token> page that consumes it is separate (future) work.
export function pretripUrl(token: string): string {
  const base = (import.meta.env.PUBLIC_SITE_URL ?? site.url).replace(/\/$/, '');
  return `${base}/pretrip/${token}`;
}

// Shared ochre CTA button (inline styles — email clients ignore stylesheets). Tokens: ochre / earth.
const ctaButton = (url: string, label: string) =>
  `<p style="margin:20px 0;">
  <a href="${url}" style="display:inline-block;background:#C19A6B;color:#3D2B1F;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;">${label}</a>
</p>
<p style="font-size:14px;color:#555;">If the button does not work, copy this link into your browser:<br/><a href="${url}">${url}</a></p>`;

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = import.meta.env.EMAIL_API_KEY;
  const from = import.meta.env.EMAIL_FROM ?? 'The Rooiberg Wander <hanlie@rooibergwander.co.za>';
  if (!key) {
    if (import.meta.env.DEV) {
      console.warn('[email] EMAIL_API_KEY not set — skipping send to', stripHeader(msg.to));
    }
    return; // no-op until configured
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [stripHeader(msg.to)],
      subject: stripHeader(msg.subject),
      html: msg.html,
      reply_to: msg.replyTo ? stripHeader(msg.replyTo) : undefined,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email send failed: ${res.status} ${detail}`);
  }
}

// Booking confirmation (guest) — sent by the webhook on pending→confirmed. The pre-trip details
// link + 72-hour deadline are the headline call to action, not a footnote.
export async function sendBookingConfirmation(opts: {
  to: string;
  leadName: string;
  startDate: string;
  pretripToken: string;
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';
  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander booking is confirmed',
    html: `<p>Thank you${name} — your booking for The Rooiberg Wander is confirmed.</p>
<p>Start date (arrival, Day 1): <strong>${opts.startDate}</strong></p>
<p style="margin-top:20px;font-size:16px;"><strong>Next step: complete your pre-trip details within 72 hours.</strong></p>
<p>We need a few details from your group to prepare for your trail. Please complete the short pre-trip form now — it only takes a few minutes.</p>
${ctaButton(url, 'Complete your pre-trip details')}
<p>Please complete this <strong>within 72 hours</strong> of this email. We will send a reminder if we have not heard from you.</p>
<p>A tax invoice accompanies your payment receipt.</p>`,
  });
}

// Pre-trip reminder (guest) — sent at confirmed_at + 24h and again at + 60h if still not submitted.
export async function sendPretripReminder(opts: {
  to: string;
  leadName: string;
  startDate: string;
  pretripToken: string;
  stage: '24h' | '60h';
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';
  await sendEmail({
    to: opts.to,
    subject: 'Reminder: complete your Rooiberg Wander pre-trip details',
    html: `<p>Hi${name},</p>
<p>We are still waiting on your pre-trip details for The Rooiberg Wander (arrival ${opts.startDate}). Please complete the short form so we can prepare for your trail.</p>
${ctaButton(url, 'Complete your pre-trip details')}
<p>Please complete this <strong>within 72 hours</strong> of your booking confirmation.</p>`,
  });
}

// Internal escalation (operator) at confirmed_at + 72h if still not submitted. Mirrors the
// "ACTION REQUIRED: ..." convention used for the webhook's manual-review alerts. Flag only —
// the booking is NOT cancelled, blocked or restricted.
export async function sendPretripOverdueAlert(opts: {
  to: string;
  leadName: string;
  reference: string;
  startDate: string;
  confirmedAt: string;
  pretripToken: string;
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  await sendEmail({
    to: opts.to,
    subject: 'ACTION REQUIRED: pre-trip details overdue',
    html: `<p>A confirmed booking has not completed its pre-trip details within 72 hours of confirmation.
Please follow up with the guest personally. This is a flag for manual follow-up only — the booking
remains confirmed and is not affected.</p>
<ul>
<li><strong>Guest:</strong> ${escapeHtml(opts.leadName)}</li>
<li><strong>Booking reference:</strong> ${opts.reference}</li>
<li><strong>Trip start date:</strong> ${opts.startDate}</li>
<li><strong>Confirmed at:</strong> ${opts.confirmedAt}</li>
<li><strong>Pre-trip link:</strong> <a href="${url}">${url}</a></li>
</ul>`,
  });
}
