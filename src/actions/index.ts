// Astro Actions (Part 9.2) — zod-validated, server-side. The price is ALWAYS recomputed here
// (never trusted from the client). All secret access is lazy via the lib/* modules.
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import { computeQuote } from '../lib/pricing';
import { getSupabaseAdmin } from '../lib/supabase';
import { payments } from '../lib/payments';
import { sendEmail } from '../lib/email';
import { site } from '../data/site';

// 4-day window: Day 1 arrival → Day 4 departure. end = start + 3 days.
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const server = {
  // Create a pending booking + Paystack hosted-checkout session; returns authorization_url.
  createCheckout: defineAction({
    accept: 'json',
    input: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
      groupSize: z.number().int().min(1).max(10),
      residency: z.enum(['local', 'international']),
      leadName: z.string().trim().min(1).max(120),
      leadEmail: z.string().trim().email().max(180),
      company: z.string().max(0).optional(), // honeypot — must be empty
    }),
    handler: async (input) => {
      if (input.company) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid submission.' });

      // SERVER is the price authority (Part 11.4).
      const quote = computeQuote({ residency: input.residency, groupSize: input.groupSize });

      const supabase = getSupabaseAdmin();
      const holdMinutes = Number(import.meta.env.HOLD_MINUTES ?? 30);
      const reference = `rw_${crypto.randomUUID()}`;
      const startDate = input.startDate;
      const endDate = addDays(startDate, 3);

      // Insert pending booking. The DB overlap exclusion constraint + hold prevent double-booking.
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          start_date: startDate,
          end_date: endDate,
          group_size: input.groupSize,
          residency: input.residency,
          lead_name: input.leadName,
          lead_email: input.leadEmail,
          status: 'pending',
          total_cents: quote.totalCents,
          amount_due_cents: quote.amountDueCents,
          currency: quote.currency,
          processor: 'paystack',
          processor_reference: reference,
          hold_expires_at: new Date(Date.now() + holdMinutes * 60_000).toISOString(),
        })
        .select('id')
        .single();

      if (error || !data) {
        // Exclusion-constraint violation => the dates were just taken.
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Those dates have just been taken. Please choose another start date.',
        });
      }

      const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? site.url;
      const init = await payments.initCheckout({
        email: input.leadEmail,
        amountCents: quote.amountDueCents,
        reference,
        callbackUrl: `${siteUrl}/booking/confirm`,
        metadata: { booking_id: data.id },
      });

      return { authorizationUrl: init.authorizationUrl };
    },
  }),

  // Optional "enquire" path — stores the enquiry and notifies the operator.
  createInquiry: defineAction({
    accept: 'json',
    input: z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(180),
      groupSize: z.string().trim().max(40).optional(),
      targetDates: z.string().trim().max(120).optional(),
      message: z.string().trim().max(2000).optional(),
      company: z.string().max(0).optional(), // honeypot
    }),
    handler: async (input) => {
      if (input.company) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid submission.' });

      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('inquiries').insert({
        name: input.name,
        email: input.email,
        group_size: input.groupSize ?? null,
        target_dates: input.targetDates ?? null,
        message: input.message ?? null,
      });
      if (error) {
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Sorry — we could not submit that. Please email us directly.',
        });
      }

      const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;
      try {
        await sendEmail({
          to: notify,
          replyTo: input.email,
          subject: `New enquiry — ${input.name}`,
          html: `<p>New enquiry from the website.</p>
<ul>
<li><strong>Name:</strong> ${escapeHtml(input.name)}</li>
<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>
<li><strong>Group size:</strong> ${escapeHtml(input.groupSize ?? '—')}</li>
<li><strong>Target dates:</strong> ${escapeHtml(input.targetDates ?? '—')}</li>
</ul>
<p>${escapeHtml(input.message ?? '')}</p>`,
        });
      } catch {
        // Stored already; notification failure shouldn't fail the user's submission.
      }

      return { ok: true };
    },
  }),
};
