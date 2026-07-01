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

// Money/date formatting for guest-facing emails. Cents → "R12,345"; ISO/timestamp → "1 July 2026".
const randFromCents = (cents: number) =>
  'R' + Math.round(cents / 100).toLocaleString('en-US');
const humanDate = (v: string) =>
  new Date(v.length <= 10 ? `${v}T00:00:00Z` : v).toLocaleDateString('en-ZA', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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

// Absolute trip-info link (Part 4) — orientation + the private gate coordinates for confirmed
// guests. Same token as the pre-trip form.
export function tripInfoUrl(token: string): string {
  const base = (import.meta.env.PUBLIC_SITE_URL ?? site.url).replace(/\/$/, '');
  return `${base}/trip-info/${token}`;
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
  // Split payment (optional). When paymentPlan is 'deposit_balance', the email notes the deposit
  // paid and the balance still due. Omitted / 'full' keeps the original single-payment copy.
  paymentPlan?: 'full' | 'deposit_balance';
  depositCents?: number;
  balanceCents?: number;
  balanceDueDate?: string | null;
  balanceLinkImminent?: boolean; // true when the balance link is being sent now (edge case)
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const tripInfo = tripInfoUrl(opts.pretripToken);
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';

  // Payment summary block. For a deposit_balance booking, state what was paid and what remains.
  let paymentBlock = '';
  if (opts.paymentPlan === 'deposit_balance' && opts.balanceCents && opts.depositCents) {
    const balanceLine = opts.balanceLinkImminent
      ? `The remaining balance of <strong>${randFromCents(opts.balanceCents)}</strong> is now due — a separate email with a secure payment link is on its way.`
      : opts.balanceDueDate
        ? `The remaining balance of <strong>${randFromCents(opts.balanceCents)}</strong> is due by <strong>${humanDate(opts.balanceDueDate)}</strong>. We will email you a secure payment link about 45 days before your trip — there is nothing to do now.`
        : `The remaining balance of <strong>${randFromCents(opts.balanceCents)}</strong> will be collected via a secure payment link we email you about 45 days before your trip.`;
    paymentBlock = `<p style="margin-top:20px;">You have paid your <strong>50% deposit of ${randFromCents(opts.depositCents)}</strong>. ${balanceLine}</p>`;
  }

  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander booking is confirmed',
    html: `<p>Thank you${name} — your booking for The Rooiberg Wander is confirmed.</p>
<p>Start date (arrival, Day 1): <strong>${opts.startDate}</strong></p>
${paymentBlock}
<p style="margin-top:20px;font-size:16px;"><strong>Next step: complete your pre-trip details within 7 days.</strong></p>
<p>We need a few details from your group to prepare for your trail. Please complete the short pre-trip form now — it only takes a few minutes.</p>
${ctaButton(url, 'Complete your pre-trip details')}
<p>Please complete this <strong>within 7 days</strong> of this email. We will send a reminder if we have not heard from you.</p>
<p style="margin-top:24px;">Everything you need before you arrive — your itinerary, what to pack, and your reserve gate coordinates — is on your trip-info page. <strong>Bookmark it</strong> for your drive up:</p>
<p><a href="${tripInfo}">${tripInfo}</a></p>
<p>A tax invoice accompanies your payment receipt.</p>`,
  });
}

// Pre-trip reminder (guest) — sent at confirmed_at + 72h (day 3) and again at + 144h (day 6) if
// still not submitted.
export async function sendPretripReminder(opts: {
  to: string;
  leadName: string;
  startDate: string;
  pretripToken: string;
  stage: 'day3' | 'day6';
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';
  await sendEmail({
    to: opts.to,
    subject: 'Reminder: complete your Rooiberg Wander pre-trip details',
    html: `<p>Hi${name},</p>
<p>We are still waiting on your pre-trip details for The Rooiberg Wander (arrival ${opts.startDate}). Please complete the short form so we can prepare for your trail.</p>
${ctaButton(url, 'Complete your pre-trip details')}
<p>Please complete this <strong>within 7 days</strong> of your booking confirmation.</p>`,
  });
}

// Internal escalation (operator) at confirmed_at + 168h (day 7) if still not submitted. Mirrors the
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
    html: `<p>A confirmed booking has not completed its pre-trip details within 7 days of confirmation.
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

// ---- Split payment: balance emails --------------------------------------------------------------

// Balance payment link (guest) — the secure Paystack checkout for the outstanding 50%. Sent 45 days
// before the trip by the balance-reminders cron, or immediately at confirmation for the edge case.
export async function sendBalanceLinkEmail(opts: {
  to: string;
  leadName: string;
  startDate: string;
  amountCents: number;
  dueDate: string | null;
  url: string;
}): Promise<void> {
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';
  const dueLine = opts.dueDate
    ? `<p>Please complete this payment by <strong>${humanDate(opts.dueDate)}</strong> to secure your trip.</p>`
    : '';
  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander balance is due — secure payment link',
    html: `<p>Hi${name},</p>
<p>Your Rooiberg Wander trip (arrival <strong>${opts.startDate}</strong>) is coming up, and the
remaining balance of <strong>${randFromCents(opts.amountCents)}</strong> is now due.</p>
${dueLine}
${ctaButton(opts.url, 'Pay your balance securely')}
<p>Your deposit is already paid; this covers the outstanding 50%. A tax invoice accompanies your
receipt.</p>`,
  });
}

// Balance payment confirmation (guest) — the trip is now paid in full.
export async function sendBalancePaidConfirmation(opts: {
  to: string;
  leadName: string;
  startDate: string;
}): Promise<void> {
  const name = opts.leadName ? ` ${escapeHtml(opts.leadName)}` : '';
  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander trip is paid in full',
    html: `<p>Thank you${name} — we have received your balance payment. Your Rooiberg Wander trip
(arrival <strong>${opts.startDate}</strong>) is now <strong>paid in full</strong>.</p>
<p>There is nothing further to pay. A tax invoice accompanies your receipt. We look forward to
welcoming your group to the Rooiberg.</p>`,
  });
}

// Internal escalation (operator) — balance still unpaid once the trip is within 30 days. Mirrors the
// pre-trip overdue alert: a manual-follow-up FLAG only. The booking is NOT cancelled and the date is
// NOT released (business policy — reconfirm before go-live).
export async function sendBalanceOverdueAlert(opts: {
  to: string;
  leadName: string;
  reference: string;
  startDate: string;
  balanceCents: number;
  balanceDueDate: string | null;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: 'ACTION REQUIRED: balance payment overdue',
    html: `<p>A confirmed deposit booking has not paid its balance and the trip is now within 30 days.
Please follow up with the guest personally. This is a flag for manual follow-up only — the booking
remains confirmed and its dates are NOT released.</p>
<ul>
<li><strong>Guest:</strong> ${escapeHtml(opts.leadName)}</li>
<li><strong>Deposit reference:</strong> ${opts.reference}</li>
<li><strong>Trip start date:</strong> ${opts.startDate}</li>
<li><strong>Balance outstanding:</strong> ${randFromCents(opts.balanceCents)}</li>
${opts.balanceDueDate ? `<li><strong>Balance was due:</strong> ${humanDate(opts.balanceDueDate)}</li>` : ''}
</ul>`,
  });
}
