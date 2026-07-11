// Transactional email (Part 9.5). Provider = Resend. All styles are inline — email clients ignore
// stylesheets. Georgia heads (closest email-safe match to Fraunces); system-ui body (≈ Inter).
// CR/LF stripped from any header-bound value (Part 11.9). Lazy key read; no-ops in dev without key.
import { site } from '../data/site';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

const stripHeader = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

// Matches the site's formatRand style ("R52,174" — no space, comma groups) so guests see one
// consistent money format on the site and in email.
const randFromCents = (cents: number) =>
  'R' + Math.round(cents / 100).toLocaleString('en-US');

// Date-only strings (YYYY-MM-DD) are anchored to UTC midnight so they display correctly everywhere.
const humanDate = (v: string) =>
  new Date(v.length <= 10 ? `${v}T00:00:00Z` : v).toLocaleDateString('en-ZA', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// Full ISO timestamps (e.g. confirmed_at) are displayed in SAST (UTC+2, no DST).
const humanDateTime = (v: string) =>
  new Date(v).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' SAST';

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// All configured admin addresses (ADMIN_EMAILS comma-separated, legacy ADMIN_EMAIL, else the
// operator notify address). Used for governance alerts that must reach EVERY admin.
export function adminEmailList(): string[] {
  const raw: string = String(
    import.meta.env.ADMIN_EMAILS ??
      import.meta.env.ADMIN_EMAIL ??
      import.meta.env.BOOKINGS_NOTIFY_TO ??
      site.notifyEmail,
  ).trim();
  const list = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e): e is string => e.length > 0);
  return [...new Set(list)];
}

export function pretripUrl(token: string): string {
  const base = (import.meta.env.PUBLIC_SITE_URL ?? site.url).replace(/\/$/, '');
  return `${base}/pretrip/${token}`;
}

export function tripInfoUrl(token: string): string {
  const base = (import.meta.env.PUBLIC_SITE_URL ?? site.url).replace(/\/$/, '');
  return `${base}/trip-info/${token}`;
}

// ---- Shared layout ------------------------------------------------------------------

// 'alert' swaps the header to a dark red — used for ACTION REQUIRED operator emails.
type Variant = 'guest' | 'operator' | 'alert';

function layout(variant: Variant, preheader: string, body: string): string {
  const hBg = variant === 'alert' ? '#6b1a0f' : '#3D2B1F';
  const accent = variant === 'alert' ? '#c0422a' : '#C19A6B';
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL ?? site.url).replace(/\/$/, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background-color:#dcd7cc;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#dcd7cc;">
<tr><td align="center" style="padding:32px 12px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;">

  <!-- HEADER -->
  <tr>
    <td style="background-color:${hBg};border-radius:14px 14px 0 0;padding:32px 40px 28px;">
      <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:bold;color:#F5F0E6;letter-spacing:0.2px;line-height:1.2;">The Rooiberg Wander</p>
      <p style="margin:8px 0 0;font-size:10px;font-weight:700;letter-spacing:2.8px;text-transform:uppercase;color:${accent};">RoiSan Reserve &middot; Limpopo Waterberg</p>
    </td>
  </tr>
  <!-- Accent rule -->
  <tr><td style="background-color:${accent};height:3px;font-size:0;line-height:0;"></td></tr>

  <!-- BODY -->
  <tr>
    <td style="background-color:#F5F0E6;padding:40px 40px 36px;">
      ${body}
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background-color:#2e2016;border-radius:0 0 14px 14px;padding:24px 40px;text-align:center;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C19A6B;">${siteUrl.replace(/^https?:\/\//, '')}</p>
      <p style="margin:10px 0 0;font-size:11px;color:rgba(245,240,230,0.45);line-height:1.6;">The Rooiberg Wander &middot; Limpopo Waterberg, South Africa</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---- Shared components --------------------------------------------------------------

function btn(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:28px 0 6px;">
<tr><td style="background-color:#C19A6B;border-radius:8px;mso-padding-alt:0;">
  <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#3D2B1F;text-decoration:none;border-radius:8px;letter-spacing:0.15px;">${label}</a>
</td></tr></table>
<p style="margin:10px 0 24px;font-size:12px;color:#9a8e83;line-height:1.5;">Button not working? Copy this link into your browser:<br><a href="${url}" style="color:#4A5D23;word-break:break-all;">${url}</a></p>`;
}

function infoTable(rows: Array<[string, string]>): string {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr>
      <td style="padding:11px 16px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a7868;white-space:nowrap;border-bottom:1px solid rgba(61,43,31,0.09);vertical-align:top;width:38%;">${label}</td>
      <td style="padding:11px 16px;font-size:14px;color:#2C2C2C;border-bottom:1px solid rgba(61,43,31,0.09);vertical-align:top;">${value}</td>
    </tr>`,
    )
    .join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid rgba(61,43,31,0.13);border-radius:10px;overflow:hidden;margin:20px 0;">
${rowsHtml}
</table>`;
}

const hr = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:28px 0;"><tr><td style="border-top:1px solid rgba(61,43,31,0.12);font-size:0;line-height:0;"></td></tr></table>`;

const h1 = (t: string) =>
  `<h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#3D2B1F;line-height:1.2;">${t}</h1>`;

const eyebrow = (t: string) =>
  `<p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#C19A6B;">${t}</p>`;

const p = (t: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#2C2C2C;">${t}</p>`;

const small = (t: string) =>
  `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#7a6e64;">${t}</p>`;

const alertBadge = `<p style="margin:0 0 20px;display:inline-block;padding:5px 12px;background-color:#c0422a;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#fff;">&#9888; Action required</p>`;

// ---- sendEmail (base) ---------------------------------------------------------------

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = import.meta.env.EMAIL_API_KEY;
  const from = import.meta.env.EMAIL_FROM ?? 'The Rooiberg Wander <hanlie@rooibergwander.co.za>';
  if (!key) {
    console.warn('[email] EMAIL_API_KEY not set — email not sent, subject:', msg.subject);
    return;
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

// ---- Guest emails -------------------------------------------------------------------

export async function sendBookingConfirmation(opts: {
  to: string;
  leadName: string;
  startDate: string;
  pretripToken: string;
  paymentPlan?: 'full' | 'deposit_balance';
  depositCents?: number;
  balanceCents?: number;
  balanceDueDate?: string | null;
  balanceLinkImminent?: boolean;
  // Complimentary (gift) booking: no payment occurred, so the payment row reads
  // "Complimentary" and no receipt line is shown.
  complimentary?: boolean;
  // Booking v2: shown as extra rows when provided.
  bookingType?: string; // 'exclusive' | 'shared'
  catering?: string; // 'catered' | 'uncatered'
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const tripInfo = tripInfoUrl(opts.pretripToken);
  const name = opts.leadName ? escapeHtml(opts.leadName) : 'there';
  const isDeposit = opts.paymentPlan === 'deposit_balance' && opts.depositCents && opts.balanceCents;

  let paymentBlock = '';
  if (isDeposit) {
    const balanceLine = opts.balanceLinkImminent
      ? `Your remaining balance of <strong>${randFromCents(opts.balanceCents!)}</strong> is due now. A separate email with a secure payment link is on its way.`
      : opts.balanceDueDate
        ? `Your remaining balance of <strong>${randFromCents(opts.balanceCents!)}</strong> is due by <strong>${humanDate(opts.balanceDueDate)}</strong>. We'll email you a secure payment link about 45 days before your trip, so there is nothing to do right now.`
        : `Your remaining balance of <strong>${randFromCents(opts.balanceCents!)}</strong> will be collected via a secure payment link we'll email you about 45 days before your trip.`;

    paymentBlock =
      infoTable([
        ['Deposit paid', randFromCents(opts.depositCents!)],
        ['Balance due', randFromCents(opts.balanceCents!)],
        ...(opts.balanceDueDate && !opts.balanceLinkImminent
          ? ([['Balance by', humanDate(opts.balanceDueDate)]] as Array<[string, string]>)
          : []),
      ]) +
      p(balanceLine);
  }

  const body =
    eyebrow('Booking confirmation') +
    h1(`You're confirmed, ${name}.`) +
    infoTable([
      ['Trail', 'The Rooiberg Wander'],
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ...(opts.bookingType === 'shared'
        ? ([['Departure', 'Shared Monday departure']] as Array<[string, string]>)
        : []),
      ...(opts.catering
        ? ([['Catering', opts.catering === 'catered' ? 'Fully catered' : 'Self-catered']] as Array<[string, string]>)
        : []),
      ['Payment', opts.complimentary ? 'Complimentary' : isDeposit ? '50% deposit paid' : 'Paid in full'],
    ]) +
    paymentBlock +
    hr +
    `<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#3D2B1F;font-family:Georgia,'Times New Roman',serif;">Next: complete your pre-trip details</p>` +
    p('We need a few details from your group before the trail. The short form takes about five minutes. Please complete it <strong>within 7 days</strong> of this email.') +
    btn(url, 'Complete pre-trip details') +
    hr +
    `<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#3D2B1F;font-family:Georgia,'Times New Roman',serif;">Your trip-info page</p>` +
    p('Your itinerary, packing list, and private gate coordinates are all on your personal trip-info page. Bookmark it for your drive up.') +
    `<p style="margin:0 0 24px;font-size:14px;"><a href="${tripInfo}" style="color:#4A5D23;word-break:break-all;">${tripInfo}</a></p>` +
    (opts.complimentary ? '' : small('A receipt accompanies your payment confirmation from Paystack.'));

  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander booking is confirmed',
    html: layout('guest', `Booking confirmed: arrival ${humanDate(opts.startDate)}`, body),
  });
}

export async function sendPretripReminder(opts: {
  to: string;
  leadName: string;
  startDate: string;
  pretripToken: string;
  stage: 'day3' | 'day6';
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);
  const name = opts.leadName ? escapeHtml(opts.leadName) : 'there';
  const isLate = opts.stage === 'day6';

  const body =
    eyebrow('Pre-trip reminder') +
    h1(isLate ? `Still waiting on your details, ${name}.` : `Quick reminder, ${name}.`) +
    p(
      isLate
        ? `We haven't received your pre-trip details for The Rooiberg Wander (arrival <strong>${humanDate(opts.startDate)}</strong>). Please complete the form as soon as possible so we can prepare for your group.`
        : `We're still waiting on your pre-trip details for The Rooiberg Wander (arrival <strong>${humanDate(opts.startDate)}</strong>). The form only takes a few minutes.`,
    ) +
    btn(url, 'Complete pre-trip details') +
    small('If you have already submitted your details, please disregard this reminder.');

  await sendEmail({
    to: opts.to,
    subject: `Reminder: complete your Rooiberg Wander pre-trip details`,
    html: layout('guest', `Please complete your pre-trip details before your arrival on ${humanDate(opts.startDate)}`, body),
  });
}

export async function sendBalanceLinkEmail(opts: {
  to: string;
  leadName: string;
  startDate: string;
  amountCents: number;
  dueDate: string | null;
  url: string;
}): Promise<void> {
  const name = opts.leadName ? escapeHtml(opts.leadName) : 'there';

  const body =
    eyebrow('Balance payment') +
    h1(`Your balance is due, ${name}.`) +
    p(`Your Rooiberg Wander trip is coming up and your remaining balance is now ready to pay.`) +
    infoTable([
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ['Amount due', `<strong>${randFromCents(opts.amountCents)}</strong>`],
      ...(opts.dueDate ? ([['Pay by', humanDate(opts.dueDate)]] as Array<[string, string]>) : []),
    ]) +
    btn(opts.url, 'Pay your balance securely') +
    small('Your deposit is already paid; this covers the outstanding 50%. A receipt accompanies your payment.');

  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander balance is due: secure payment link',
    html: layout('guest', `Balance of ${randFromCents(opts.amountCents)} due for your trip arriving ${humanDate(opts.startDate)}`, body),
  });
}

export async function sendBalancePaidConfirmation(opts: {
  to: string;
  leadName: string;
  startDate: string;
}): Promise<void> {
  const name = opts.leadName ? escapeHtml(opts.leadName) : 'there';

  const body =
    eyebrow('Payment complete') +
    h1(`You're paid in full, ${name}.`) +
    p(`We've received your balance payment. Your Rooiberg Wander trip is now <strong>fully paid</strong>. There is nothing further to take care of on the payment side.`) +
    infoTable([['Arrival (Day 1)', humanDate(opts.startDate)]]) +
    p('We look forward to welcoming your group to the Rooiberg.') +
    small('A receipt accompanies your payment confirmation from Paystack.');

  await sendEmail({
    to: opts.to,
    subject: 'Your Rooiberg Wander trip is paid in full',
    html: layout('guest', `Trip paid in full. See you in the Rooiberg!`, body),
  });
}

// ---- Operator emails ----------------------------------------------------------------

export async function sendBookingOperatorNotification(opts: {
  to: string;
  leadName: string;
  leadEmail: string;
  startDate: string;
  groupSize: number;
  bookingType: string; // 'exclusive' | 'shared'
  catering: string; // 'catered' | 'uncatered'
  bookingId: string;
  paymentPlan: string;
  totalCents: number;
  depositCents?: number;
}): Promise<void> {
  const isDeposit = opts.paymentPlan === 'deposit_balance';

  const body =
    eyebrow('New booking') +
    h1('Booking confirmed.') +
    p('A new booking has been confirmed and paid. The guest has been sent their confirmation email and pre-trip link.') +
    infoTable([
      ['Guest', escapeHtml(opts.leadName)],
      ['Email', escapeHtml(opts.leadEmail)],
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ['Group size', String(opts.groupSize)],
      ['Type', opts.bookingType === 'shared' ? 'Shared Monday departure' : 'Private (exclusive)'],
      ['Catering', opts.catering === 'catered' ? 'Fully catered' : 'Self-catered'],
      ['Payment', isDeposit ? `Deposit paid: ${randFromCents(opts.depositCents ?? 0)} (50%)` : `Paid in full: ${randFromCents(opts.totalCents)}`],
      ['Plan', opts.paymentPlan],
      ['Booking ID', `<span style="font-family:monospace;font-size:12px;">${opts.bookingId}</span>`],
    ]);

  await sendEmail({
    to: opts.to,
    subject: `Booking confirmed: ${opts.leadName}`,
    html: layout('operator', `New booking from ${opts.leadName}, arriving ${humanDate(opts.startDate)}`, body),
  });
}

export async function sendInquiryNotification(opts: {
  to: string;
  replyTo: string;
  name: string;
  email: string;
  groupSize?: string;
  targetDates?: string;
  message?: string;
}): Promise<void> {
  const body =
    eyebrow('New enquiry') +
    h1('New enquiry received.') +
    p('A new enquiry has come in from the website. Reply directly to this email to respond to the guest.') +
    infoTable([
      ['Name', escapeHtml(opts.name)],
      ['Email', escapeHtml(opts.email)],
      ...(opts.groupSize ? ([['Group size', escapeHtml(opts.groupSize)]] as Array<[string, string]>) : []),
      ...(opts.targetDates ? ([['Target dates', escapeHtml(opts.targetDates)]] as Array<[string, string]>) : []),
    ]) +
    (opts.message
      ? `<div style="margin:20px 0;padding:16px 20px;background-color:rgba(61,43,31,0.05);border-left:3px solid #C19A6B;border-radius:0 8px 8px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a7868;">Message</p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#2C2C2C;">${escapeHtml(opts.message)}</p>
        </div>`
      : '');

  await sendEmail({
    to: opts.to,
    replyTo: opts.replyTo,
    subject: `New enquiry: ${opts.name}`,
    html: layout('operator', `Enquiry from ${opts.name}`, body),
  });
}

export async function sendPretripOverdueAlert(opts: {
  to: string;
  leadName: string;
  reference: string;
  startDate: string;
  confirmedAt: string;
  pretripToken: string;
}): Promise<void> {
  const url = pretripUrl(opts.pretripToken);

  const body =
    alertBadge +
    h1('Pre-trip details overdue.') +
    p('A confirmed guest has not submitted their pre-trip details within 7 days of their booking confirmation. Please follow up directly. <strong>The booking is not affected.</strong>') +
    infoTable([
      ['Guest', escapeHtml(opts.leadName)],
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ['Confirmed', humanDateTime(opts.confirmedAt)],
      ['Reference', `<span style="font-family:monospace;font-size:12px;">${opts.reference}</span>`],
    ]) +
    btn(url, 'View pre-trip form link');

  await sendEmail({
    to: opts.to,
    subject: 'ACTION REQUIRED: pre-trip details overdue',
    html: layout('alert', `Pre-trip details overdue for ${opts.leadName}, arriving ${humanDate(opts.startDate)}`, body),
  });
}

export async function sendBalanceOverdueAlert(opts: {
  to: string;
  leadName: string;
  reference: string;
  startDate: string;
  balanceCents: number;
  balanceDueDate: string | null;
}): Promise<void> {
  const body =
    alertBadge +
    h1('Balance payment overdue.') +
    p('A confirmed deposit booking has not paid its balance and the trip is now within 30 days. Please follow up directly. <strong>The booking and dates are not released automatically.</strong>') +
    infoTable([
      ['Guest', escapeHtml(opts.leadName)],
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ['Balance outstanding', `<strong>${randFromCents(opts.balanceCents)}</strong>`],
      ...(opts.balanceDueDate
        ? ([['Was due', humanDate(opts.balanceDueDate)]] as Array<[string, string]>)
        : []),
      ['Reference', `<span style="font-family:monospace;font-size:12px;">${opts.reference}</span>`],
    ]);

  await sendEmail({
    to: opts.to,
    subject: 'ACTION REQUIRED: balance payment overdue',
    html: layout('alert', `Balance overdue for ${opts.leadName}, arriving ${humanDate(opts.startDate)}`, body),
  });
}

// ---- Payment receipt (not a tax invoice — the operator is not VAT-registered) --------
// Sent as a separate email after every confirmed payment (deposit, balance, or full).
// Receipt number: RW-YYYYMM-{first8charsOfBookingId}. No VAT is charged or shown; the amount
// shown is the full payment received.

export async function sendPaymentReceipt(opts: {
  to: string;
  leadName: string;
  bookingId: string;
  startDate: string;
  issuedAt: string;          // ISO timestamp of payment confirmation
  amountCents: number;       // the amount received (deposit or balance or full total)
  receiptType: 'full' | 'deposit' | 'balance';
  groupSize: number;
  bookingType?: string; // 'exclusive' (default) | 'shared'
  catering?: string; // 'catered' | 'uncatered'
}): Promise<void> {
  const issued = new Date(opts.issuedAt);
  const ym = issued.toISOString().slice(0, 7).replace('-', '');
  const shortId = opts.bookingId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const receiptNo = `RW-${ym}-${shortId}${opts.receiptType === 'balance' ? '-B' : ''}`;

  const issuedStr = issued.toLocaleDateString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const guestsLabel = `${opts.groupSize} ${opts.groupSize === 1 ? 'guest' : 'guests'}`;
  // Product wording per booking type + catering (Booking v2). Defaults preserve the
  // pre-v2 phrasing for legacy re-issues.
  const productLabel =
    opts.bookingType === 'shared'
      ? `shared Monday departure, fully catered (${guestsLabel})`
      : `private group (up to ${guestsLabel})${opts.catering === 'catered' ? ', fully catered' : opts.catering === 'uncatered' ? ', self-catered' : ''}`;
  const descriptionLine =
    opts.receiptType === 'deposit'
      ? `The Rooiberg Wander: 50% deposit. 3-night guided walking trail, ${productLabel}. Arrival: ${humanDate(opts.startDate)}.`
      : opts.receiptType === 'balance'
        ? `The Rooiberg Wander: balance payment (50%). ${productLabel.charAt(0).toUpperCase() + productLabel.slice(1)}. Arrival: ${humanDate(opts.startDate)}.`
        : `The Rooiberg Wander: 3-night guided walking trail, ${productLabel}. Arrival: ${humanDate(opts.startDate)}.`;

  // Receipt keeps 2 decimals (money document) but matches the site's no-space "R52,174.00" style.
  const fmt = (c: number) => 'R' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const name = escapeHtml(opts.leadName);

  const body = `
<p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#C19A6B;">Payment Receipt</p>
<h1 style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;color:#3D2B1F;line-height:1.2;">Receipt ${escapeHtml(receiptNo)}</h1>

<!-- Receipt meta + parties -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px;">
  <tr valign="top">
    <td style="width:50%;padding-right:20px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#8a7868;">From</p>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#2C2C2C;">
        <strong>The Rooiberg Wander</strong><br>
        Rooiberg, Waterberg, Limpopo, South Africa
      </p>
    </td>
    <td style="width:50%;padding-left:20px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#8a7868;">Paid by</p>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#2C2C2C;">
        <strong>${name}</strong><br>
        ${escapeHtml(opts.to)}
      </p>
    </td>
  </tr>
</table>

<!-- Receipt details -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid rgba(61,43,31,0.13);border-radius:10px 10px 0 0;overflow:hidden;margin:0 0 0;">
  <tr>
    <td style="padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a7868;border-bottom:1px solid rgba(61,43,31,0.09);white-space:nowrap;width:38%;">Receipt number</td>
    <td style="padding:10px 16px;font-size:13px;color:#2C2C2C;border-bottom:1px solid rgba(61,43,31,0.09);font-family:monospace;">${escapeHtml(receiptNo)}</td>
  </tr>
  <tr>
    <td style="padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a7868;white-space:nowrap;">Date received</td>
    <td style="padding:10px 16px;font-size:13px;color:#2C2C2C;">${escapeHtml(issuedStr)}</td>
  </tr>
</table>

<!-- Line item -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border:1px solid rgba(61,43,31,0.13);border-top:none;border-radius:0;overflow:hidden;margin:0 0 0;">
  <tr style="background-color:rgba(61,43,31,0.05);">
    <th style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a7868;text-align:left;border-bottom:1px solid rgba(61,43,31,0.13);">Description</th>
    <th style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a7868;text-align:right;border-bottom:1px solid rgba(61,43,31,0.13);white-space:nowrap;">Amount</th>
  </tr>
  <tr>
    <td style="padding:14px 16px;font-size:13px;color:#2C2C2C;line-height:1.5;border-bottom:1px solid rgba(61,43,31,0.09);">${escapeHtml(descriptionLine)}</td>
    <td style="padding:14px 16px;font-size:13px;color:#2C2C2C;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(61,43,31,0.09);">${fmt(opts.amountCents)}</td>
  </tr>
  <tr style="background-color:#3D2B1F;">
    <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#F5F0E6;text-align:right;border-radius:0 0 0 10px;">Total received</td>
    <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#C19A6B;text-align:right;white-space:nowrap;border-radius:0 0 10px 0;">${fmt(opts.amountCents)}</td>
  </tr>
</table>

<p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#9a8e83;">No VAT is charged on this amount. Payment has been received via Paystack. Please retain this document for your records.</p>
`;

  await sendEmail({
    to: opts.to,
    subject: `Receipt ${receiptNo} from The Rooiberg Wander`,
    html: layout('guest', `Payment receipt ${receiptNo} for your Rooiberg Wander booking`, body),
  });
}

export async function sendManualReviewAlert(opts: {
  to: string;
  reference: string;
  amountCents: number;
  subject: string;
  reason: string;
  bookingId?: string;
  at: string;
}): Promise<void> {
  const body =
    alertBadge +
    h1('Manual review required.') +
    p(opts.reason) +
    infoTable([
      ['Paystack reference', `<span style="font-family:monospace;font-size:12px;">${opts.reference}</span>`],
      ['Amount paid', randFromCents(opts.amountCents)],
      ...(opts.bookingId
        ? ([['Booking ID', `<span style="font-family:monospace;font-size:12px;">${opts.bookingId}</span>`]] as Array<[string, string]>)
        : []),
      ['Time', opts.at],
    ]) +
    p('Please check the Paystack dashboard to confirm or refund this transaction.');

  await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: layout('alert', opts.subject, body),
  });
}

// Fired once per attacked account per hour (guarded by the caller via rateLimit) when the
// per-email admin-login limiter trips — i.e. sustained failed sign-in attempts against one
// specific admin account, which per-IP limiting alone cannot catch (many IPs, one target).
export async function sendLoginAttackAlert(opts: {
  to: string;
  attemptedEmail: string;
  ip: string;
  at: string;
}): Promise<void> {
  const body =
    alertBadge +
    h1('Repeated failed sign-ins.') +
    p(
      `There have been repeated failed sign-in attempts against the admin account <strong>${escapeHtml(opts.attemptedEmail)}</strong>. The account has not been compromised (the password was not accepted), but this may indicate an attack in progress.`,
    ) +
    infoTable([
      ['Account targeted', escapeHtml(opts.attemptedEmail)],
      ['Most recent attempt from', escapeHtml(opts.ip)],
      ['Time', opts.at],
    ]) +
    p('No action is required unless attempts continue. If you did not attempt to sign in yourself, consider changing this account’s password.');

  await sendEmail({
    to: opts.to,
    subject: 'ACTION REQUIRED: repeated failed admin sign-ins',
    html: layout('alert', `Repeated failed sign-ins for ${opts.attemptedEmail}`, body),
  });
}

// ---- All-admin governance alerts ------------------------------------------------------
// Sent to EVERY configured admin (adminEmailList) so payment-bypassing and calendar-changing
// actions are visible to the whole team, not just the actor. Best-effort per recipient.

async function sendToAll(tos: string[], build: (to: string) => EmailMessage): Promise<void> {
  const results = await Promise.allSettled(tos.map((to) => sendEmail(build(to))));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[email] all-admin alert failed for', tos[i], (r.reason as Error)?.message);
    }
  });
}

export async function sendCompBookingAdminAlert(opts: {
  tos: string[];
  createdBy: string;
  leadName: string;
  leadEmail: string;
  startDate: string;
  groupSize: number;
  reason: string;
  bookingId: string;
}): Promise<void> {
  const body =
    eyebrow('Complimentary booking') +
    h1('Comp booking created (payment bypassed).') +
    p(
      `${escapeHtml(opts.createdBy)} created a complimentary booking from the admin dashboard. No payment was taken. The action is logged in the audit trail.`,
    ) +
    infoTable([
      ['Created by', escapeHtml(opts.createdBy)],
      ['Guest', escapeHtml(opts.leadName)],
      ['Guest email', escapeHtml(opts.leadEmail)],
      ['Arrival (Day 1)', humanDate(opts.startDate)],
      ['Group size', String(opts.groupSize)],
      ['Booking ID', `<span style="font-family:monospace;font-size:12px;">${opts.bookingId}</span>`],
    ]) +
    `<div style="margin:20px 0;padding:16px 20px;background-color:rgba(61,43,31,0.05);border-left:3px solid #C19A6B;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a7868;">Reason</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#2C2C2C;">${escapeHtml(opts.reason)}</p>
    </div>`;

  await sendToAll(opts.tos, (to) => ({
    to,
    subject: `Comp booking created: ${opts.leadName} (payment bypassed)`,
    html: layout('operator', `Comp booking by ${opts.createdBy} for ${opts.leadName}, arriving ${humanDate(opts.startDate)}`, body),
  }));
}

export async function sendBlockedDatesAdminAlert(opts: {
  tos: string[];
  actedBy: string;
  action: 'blocked' | 'unblocked';
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<void> {
  const blocked = opts.action === 'blocked';
  const body =
    eyebrow('Calendar change') +
    h1(blocked ? 'Dates blocked.' : 'Blocked dates removed.') +
    p(
      blocked
        ? `${escapeHtml(opts.actedBy)} blocked a window in the booking calendar. Days inside it cannot be chosen as a start date until the block is removed.`
        : `${escapeHtml(opts.actedBy)} removed a blocked window. Those days are bookable again.`,
    ) +
    infoTable([
      [blocked ? 'Blocked by' : 'Removed by', escapeHtml(opts.actedBy)],
      ['From', humanDate(opts.startDate)],
      ['To', humanDate(opts.endDate)],
    ]) +
    `<div style="margin:20px 0;padding:16px 20px;background-color:rgba(61,43,31,0.05);border-left:3px solid #C19A6B;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a7868;">Reason</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#2C2C2C;">${escapeHtml(opts.reason)}</p>
    </div>`;

  await sendToAll(opts.tos, (to) => ({
    to,
    subject: blocked
      ? `Dates blocked: ${opts.startDate} to ${opts.endDate}`
      : `Blocked dates removed: ${opts.startDate} to ${opts.endDate}`,
    html: layout('operator', `Calendar ${opts.action} by ${opts.actedBy}`, body),
  }));
}
