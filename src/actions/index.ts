// Astro Actions (Part 9.2) — zod-validated, server-side. The price is ALWAYS recomputed here
// (never trusted from the client). All secret access is lazy via the lib/* modules.
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import { computeQuote } from '../lib/pricing';
import { getSupabaseAdmin } from '../lib/supabase';
import { payments } from '../lib/payments';
import { sendInquiryNotification } from '../lib/email';
import { rateLimit, clientIp } from '../lib/ratelimit';
import { signInAdmin, signOutAdmin } from '../lib/auth';
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
      groupSize: z.number().int().min(1).max(12),
      residency: z.enum(['local', 'international']),
      leadName: z.string().trim().min(2, 'Please enter your full name.').max(120),
      leadEmail: z.string().trim().email('Please enter a valid email address.').max(180),
      company: z.string().max(0).optional(), // honeypot — must be empty
    }),
    handler: async (input, ctx) => {
      // Rate limit per IP (A04/A09) — caps scripted hold-spam. 3/min and 10/hour.
      const ip = clientIp(ctx.request);
      if (
        !(await rateLimit(`checkout:min:${ip}`, 3, 60)) ||
        !(await rateLimit(`checkout:hr:${ip}`, 10, 3600))
      ) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many booking attempts. Please wait a moment and try again.',
        });
      }

      if (input.company) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid submission.' });

      // Booking window (server-authoritative): minimum 7 days lead time, maximum 365 days ahead,
      // both inclusive. ISO YYYY-MM-DD strings compare lexicographically, so string comparison is safe.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
      const earliest = addDays(today, 7); // at least 7 days notice
      const latest = addDays(today, 365); // no more than 12 months ahead
      if (input.startDate < earliest) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Bookings require at least 7 days notice. The earliest available start date is ${earliest}.`,
        });
      }
      if (input.startDate > latest) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Choose a start date no more than 12 months (365 days) ahead.',
        });
      }

      // SERVER is the price authority (Part 11.4). startDate drives the split-payment rule: a trip
      // 30+ days out pays a 50% deposit now + 50% balance later; inside 30 days pays in full.
      const quote = computeQuote({
        residency: input.residency,
        groupSize: input.groupSize,
        startDate: input.startDate,
      });

      const supabase = getSupabaseAdmin();

      // One active booking per email. Blocks confirmed bookings (any date) and live pending holds
      // (hold_expires_at still in the future). Expired pending rows are not matched, so a genuine
      // retry after an abandoned checkout (hold expired) is allowed through.
      const now = new Date().toISOString();
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('lead_email', input.leadEmail.trim().toLowerCase())
        .or(`status.eq.confirmed,and(status.eq.pending,hold_expires_at.gt.${now})`)
        .maybeSingle();

      if (existingBooking) {
        throw new ActionError({
          code: 'CONFLICT',
          message:
            'You already have an active booking. Please contact us at hanlie@rooibergwander.co.za if you need to make changes.',
        });
      }

      // Normalise contact fields: collapse whitespace in the name, lowercase the email so
      // lookups, duplicate checks, and Paystack receipts are consistent regardless of how
      // the customer typed them.
      const leadName = input.leadName.trim().replace(/\s+/g, ' ');
      const leadEmail = input.leadEmail.trim().toLowerCase();

      const holdMinutes = Number(import.meta.env.HOLD_MINUTES ?? 30);
      const reference = `rw_${crypto.randomUUID()}`;
      const startDate = input.startDate;
      const endDate = addDays(startDate, 3);

      // Insert pending booking. Staggered groups (Option A): the DB unique-start-date index (active
      // rows only) + the hold prevent two groups starting on the same day; overlapping trip ranges
      // are allowed. The server is the authority — a duplicate start_date fails the insert here.
      // amount_due_cents is the FIRST charge (deposit for deposit_balance, full total otherwise);
      // balance_due_date is computed at confirmation in the webhook (it anchors to confirmed_at for
      // the edge case), so it is left null here.
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          start_date: startDate,
          end_date: endDate,
          group_size: input.groupSize,
          residency: input.residency,
          lead_name: leadName,
          lead_email: leadEmail,
          status: 'pending',
          total_cents: quote.totalCents,
          amount_due_cents: quote.amountDueCents,
          currency: quote.currency,
          payment_plan: quote.paymentPlan,
          deposit_paid_cents: quote.depositCents,
          balance_due_cents: quote.balanceCents,
          processor: 'paystack',
          processor_reference: reference,
          hold_expires_at: new Date(Date.now() + holdMinutes * 60_000).toISOString(),
        })
        .select('id')
        .single();

      if (error || !data) {
        // Unique-start-date violation => that start date was just taken by another group.
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Those dates have just been taken. Please choose another start date.',
        });
      }

      const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? site.url;
      const init = await payments.initCheckout({
        email: leadEmail,
        amountCents: quote.amountDueCents,
        reference,
        callbackUrl: `${siteUrl}/booking/confirm`,
        metadata: { booking_id: data.id },
      });

      return { authorizationUrl: init.authorizationUrl, reference };
    },
  }),

  // Cancel a pending (not-yet-paid) booking by its processor reference — called client-side when
  // the user returns from an abandoned Paystack checkout. Only cancels pending rows; confirmed
  // bookings are unaffected. Rate-limited to prevent abuse.
  cancelPendingCheckout: defineAction({
    accept: 'json',
    input: z.object({
      reference: z.string().max(100),
    }),
    handler: async (input, ctx) => {
      const ip = clientIp(ctx.request);
      if (!(await rateLimit(`cancel:min:${ip}`, 10, 60))) {
        throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests.' });
      }
      const supabase = getSupabaseAdmin();
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', hold_expires_at: null })
        .eq('processor_reference', input.reference)
        .eq('status', 'pending');
      return { ok: true };
    },
  }),

  // Optional "enquire" path — stores the enquiry and notifies the operator.
  createInquiry: defineAction({
    accept: 'json',
    input: z.object({
      name: z.string().trim().min(2, 'Please enter your name.').max(120),
      email: z.string().trim().email('Please enter a valid email address.').max(180),
      groupSize: z.string().trim().max(40).optional(),
      targetDates: z.string().trim().max(120).optional(),
      message: z.string().trim().min(20, 'Please include a message of at least 20 characters.').max(2000),
      company: z.string().max(0).optional(), // honeypot
    }),
    handler: async (input, ctx) => {
      // Rate limit per IP (A04/A09). 3/min and 10/hour.
      const ip = clientIp(ctx.request);
      if (
        !(await rateLimit(`inquiry:min:${ip}`, 3, 60)) ||
        !(await rateLimit(`inquiry:hr:${ip}`, 10, 3600))
      ) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many submissions. Please wait a moment and try again.',
        });
      }

      if (input.company) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid submission.' });

      // Normalise: collapse whitespace in name, lowercase email.
      const name = input.name.trim().replace(/\s+/g, ' ');
      const email = input.email.trim().toLowerCase();

      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('inquiries').insert({
        name,
        email,
        group_size: input.groupSize ?? null,
        target_dates: input.targetDates ?? null,
        message: input.message,
      });
      if (error) {
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Sorry — we could not submit that. Please email us directly.',
        });
      }

      const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;
      try {
        await sendInquiryNotification({
          to: notify,
          replyTo: email,
          name,
          email,
          groupSize: input.groupSize,
          targetDates: input.targetDates,
          message: input.message,
        });
      } catch {
        // Stored already; notification failure shouldn't fail the user's submission.
      }

      return { ok: true };
    },
  }),

  // Pre-trip details (post-payment). Auth = the unguessable pretrip_token in the link. Writes the
  // submission to pretrip_details (submitted_at), which stops the reminder/escalation sequence.
  submitPretrip: defineAction({
    accept: 'json',
    input: z.object({
      token: z.string().uuid('Invalid link.'),
      leadPhone: z.string().trim().min(7, 'Please provide a contact number — guides need this on trail.').max(40),
      guests: z
        .array(
          z.object({
            name: z.string().trim().max(120),
            idNumber: z.string().trim().max(60).optional().default(''),
            emergencyName: z.string().trim().max(120).optional().default(''),
            emergencyPhone: z.string().trim().max(40).optional().default(''),
          }),
        )
        .min(1)
        .max(12),
      medicalNotes: z.string().trim().max(3000).optional(),
      vehicleReg: z.string().trim().max(500).optional(),
      arrivalTime: z.string().trim().max(20).optional(),
      specialRequests: z.string().trim().max(3000).optional(),
      selfCateringAck: z.boolean().refine((v) => v === true, {
        message: 'Please acknowledge the self-catering arrangement before submitting.',
      }),
      company: z.string().max(0).optional(), // honeypot
    }),
    handler: async (input, ctx) => {
      const ip = clientIp(ctx.request);
      if (!(await rateLimit(`pretrip:min:${ip}`, 5, 60))) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many submissions. Please wait a moment and try again.',
        });
      }
      if (input.company) throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid submission.' });
      if (!input.guests[0]?.name?.trim()) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Please enter the lead guest\'s full name.',
        });
      }
      // Emergency contact is required for the lead guest on a Big 5 trail.
      if (!input.guests[0].emergencyName?.trim() || input.guests[0].emergencyName.trim().length < 2) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Please provide an emergency contact name for the lead guest.',
        });
      }
      if (!input.guests[0].emergencyPhone?.trim() || input.guests[0].emergencyPhone.trim().length < 7) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Please provide an emergency contact number for the lead guest.',
        });
      }

      const supabase = getSupabaseAdmin();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, group_size')
        .eq('pretrip_token', input.token)
        .single();
      if (!booking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'We could not find that booking.' });
      }

      // Cap the manifest to the booked group size; drop fully-empty rows.
      const guests = input.guests
        .filter((g) => g.name || g.idNumber || g.emergencyName || g.emergencyPhone)
        .slice(0, booking.group_size);

      // The trail indemnity is signed in person on arrival (solicitor's requirement), so no waiver
      // is captured online.
      const details = {
        leadPhone: input.leadPhone,
        guests,
        medicalNotes: input.medicalNotes ?? '',
        vehicleReg: input.vehicleReg ?? '',
        arrivalTime: input.arrivalTime ?? '',
        specialRequests: input.specialRequests ?? '',
        selfCateringAck: input.selfCateringAck,
      };

      const { error } = await supabase.from('pretrip_details').upsert(
        { booking_id: booking.id, details, submitted_at: new Date().toISOString() },
        { onConflict: 'booking_id' },
      );
      if (error) {
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Sorry — we could not save that. Please try again, or email us.',
        });
      }

      return { ok: true };
    },
  }),

  // ---- Operator dashboard auth (Part 3) ------------------------------------
  // Sign in to the admin dashboard. Rate-limited to blunt password guessing. On success the session
  // cookies are set server-side; the client then navigates to /admin (where the server re-verifies).
  adminLogin: defineAction({
    accept: 'json',
    input: z.object({
      email: z.string().trim().email().max(180),
      password: z.string().min(1).max(200),
    }),
    handler: async (input, ctx) => {
      const ip = clientIp(ctx.request);
      if (
        !(await rateLimit(`adminlogin:min:${ip}`, 5, 60)) ||
        !(await rateLimit(`adminlogin:hr:${ip}`, 20, 3600))
      ) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many sign-in attempts. Please wait a moment and try again.',
        });
      }

      const user = await signInAdmin(ctx.cookies, input.email, input.password);
      if (!user) {
        // Generic message — never reveal whether the email exists (no enumeration).
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' });
      }
      return { ok: true };
    },
  }),

  // Sign out of the admin dashboard — clears the session cookies.
  adminLogout: defineAction({
    accept: 'json',
    input: z.object({}).optional(),
    handler: async (_input, ctx) => {
      signOutAdmin(ctx.cookies);
      return { ok: true };
    },
  }),
};
