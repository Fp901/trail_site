// Transactional email seam (Part 9.5). Provider = Resend (decided). Lazy key read; in dev with
// no key it no-ops. CR/LF stripped from any header-bound value (Part 11.9).
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

const stripHeader = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = import.meta.env.EMAIL_API_KEY;
  const from = import.meta.env.EMAIL_FROM ?? 'The Rooiberg Wander <bookings@example.com>';
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
