// Astro Actions (Part 9.2) — zod-validated, server-side. The price is ALWAYS recomputed here
// (never trusted from the client). All secret access is lazy via the lib/* modules.
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import { computeQuote, BALANCE_LEAD_DAYS } from '../lib/pricing';
import { getSupabaseAdmin } from '../lib/supabase';
import { payments } from '../lib/payments';
import {
  sendInquiryNotification,
  sendBookingConfirmation,
  sendPretripReminder,
  sendBalancePaidConfirmation,
  sendTaxInvoice,
  sendLoginAttackAlert,
} from '../lib/email';
import { sendBalancePaymentLink } from '../lib/balance';
import { rateLimit, clientIp } from '../lib/ratelimit';
import { signInAdmin, signOutAdmin } from '../lib/auth';
import { requireAdmin, recordAdminEvent } from '../lib/admin';
import { recordPaymentEvent } from '../lib/audit';
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
      leadPhone: z.string().trim().min(7, 'Please enter a mobile number.').max(40),
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
      const leadName  = input.leadName.trim().replace(/\s+/g, ' ');
      const leadEmail = input.leadEmail.trim().toLowerCase();
      const leadPhone = input.leadPhone.trim();

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
          lead_phone: leadPhone,
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
          message: 'Sorry, we could not submit that. Please email us directly.',
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
      leadPhone: z.string().trim().min(7, 'Please provide a contact number. Guides need this on trail.').max(40),
      guests: z
        .array(
          z.object({
            name: z.string().trim().max(120),
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

      const supabase = getSupabaseAdmin();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, group_size')
        .eq('pretrip_token', input.token)
        .single();
      if (!booking) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'We could not find that booking.' });
      }

      // Cap the manifest to the booked group size; drop rows with no name.
      const guests = input.guests
        .filter((g) => g.name)
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
          message: 'Sorry, we could not save that. Please try again, or email us.',
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
      const emailKey = input.email.trim().toLowerCase();

      // Per-IP AND per-email limits. Per-IP alone cannot stop a distributed attack that spreads
      // attempts against ONE account across many IPs, so the account itself is also throttled.
      const ipOk =
        (await rateLimit(`adminlogin:min:${ip}`, 5, 60)) &&
        (await rateLimit(`adminlogin:hr:${ip}`, 20, 3600));
      const emailOk = await rateLimit(`adminlogin:email:hr:${emailKey}`, 10, 3600);

      if (!ipOk || !emailOk) {
        if (!emailOk) {
          // Alert at most once per account per hour (a second rateLimit key gates the send),
          // so a sustained attack cannot flood the operator's inbox with one email per attempt.
          const shouldAlert = await rateLimit(`adminlogin:emailalert:${emailKey}`, 1, 3600);
          if (shouldAlert) {
            const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;
            sendLoginAttackAlert({ to: notify, attemptedEmail: emailKey, ip, at: new Date().toISOString() }).catch(
              (err) => console.error('[adminLogin] attack alert email failed', (err as Error).message),
            );
          }
        }
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

  // ---- Admin mutations (admin overhaul v1) ----------------------------------
  // Every action: requireAdmin (session re-verified server-side) → zod → load row → guard →
  // mutate → recordAdminEvent (awaited; identity from the session, never the client).
  // Money amounts are NEVER inputs. No action deletes anything.

  // Fix the lead guest's contact details (typos etc.). Money and dates untouched.
  adminUpdateContact: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      leadName: z.string().trim().min(2, 'Please enter the full name.').max(120),
      leadEmail: z.string().trim().email('Please enter a valid email address.').max(180),
      leadPhone: z.string().trim().min(7, 'Please enter a valid phone number.').max(40),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, status, lead_name, lead_email, lead_phone')
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!booking) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (booking.status === 'cancelled') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This booking is cancelled; contact details cannot be edited.' });
      }

      const leadName = input.leadName.trim().replace(/\s+/g, ' ');
      const leadEmail = input.leadEmail.trim().toLowerCase();
      const leadPhone = input.leadPhone.trim();

      const { error } = await supabase
        .from('bookings')
        .update({ lead_name: leadName, lead_email: leadEmail, lead_phone: leadPhone })
        .eq('id', booking.id);
      if (error) {
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not save the contact details.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'update_contact',
        bookingId: booking.id,
        before: { lead_name: booking.lead_name, lead_email: booking.lead_email, lead_phone: booking.lead_phone },
        after: { lead_name: leadName, lead_email: leadEmail, lead_phone: leadPhone },
      });
      return { ok: true };
    },
  }),

  // Append an internal staff note. Notes ARE audit rows: append-only, attributed, timestamped.
  adminAddNote: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      note: z.string().trim().min(5, 'Note must be at least 5 characters.').max(2000),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!booking) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'note',
        bookingId: booking.id,
        note: input.note.trim(),
      });
      return { ok: true };
    },
  }),

  // Cancel a booking (pending or confirmed). Status transition only — the row is never deleted,
  // refunds happen in the Paystack dashboard, and staff contact the guest directly.
  adminCancelBooking: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      reason: z.string().trim().min(10, 'Please give a reason (at least 10 characters).').max(500),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, status, start_date')
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!booking) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (booking.status === 'cancelled') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This booking is already cancelled.' });
      }

      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', hold_expires_at: null })
        .eq('id', booking.id)
        .in('status', ['pending', 'confirmed']);
      if (error) {
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not cancel the booking.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'cancel_booking',
        bookingId: booking.id,
        before: { status: booking.status },
        after: { status: 'cancelled' },
        note: input.reason.trim(),
      });
      return { ok: true };
    },
  }),

  // Re-send a guest email. Reuses the exact same senders as the automated flows.
  adminResendEmail: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      kind: z.enum(['confirmation', 'pretrip_reminder', 'balance_link', 'tax_invoice']),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: b } = await supabase
        .from('bookings')
        .select(
          'id, status, lead_email, lead_name, start_date, pretrip_token, payment_plan, deposit_paid_cents, balance_due_cents, balance_due_date, balance_paid_at, total_cents, amount_paid_cents, group_size, confirmed_at',
        )
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!b) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (b.status !== 'confirmed') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Emails can only be re-sent for confirmed bookings.' });
      }

      try {
        if (input.kind === 'confirmation') {
          await sendBookingConfirmation({
            to: b.lead_email,
            leadName: b.lead_name,
            startDate: b.start_date,
            pretripToken: b.pretrip_token,
            paymentPlan: b.payment_plan,
            depositCents: b.deposit_paid_cents ?? undefined,
            balanceCents: b.balance_due_cents ?? undefined,
            balanceDueDate: b.balance_due_date,
          });
        } else if (input.kind === 'pretrip_reminder') {
          await sendPretripReminder({
            to: b.lead_email,
            leadName: b.lead_name,
            startDate: b.start_date,
            pretripToken: b.pretrip_token,
            stage: 'day3',
          });
        } else if (input.kind === 'balance_link') {
          if (b.payment_plan !== 'deposit_balance' || !b.balance_due_cents) {
            throw new ActionError({ code: 'BAD_REQUEST', message: 'This booking has no outstanding balance plan.' });
          }
          if (b.balance_paid_at) {
            throw new ActionError({ code: 'BAD_REQUEST', message: 'The balance is already paid.' });
          }
          // A true re-send: release the one-time send guard so sendBalancePaymentLink can create a
          // fresh Paystack session. The previous link's reference is replaced; if the guest were to
          // pay the OLD link, the webhook flags it for manual review (existing safe behaviour).
          await supabase
            .from('bookings')
            .update({ balance_link_sent_at: null, balance_processor_reference: null })
            .eq('id', b.id)
            .is('balance_paid_at', null);
          const sent = await sendBalancePaymentLink({
            id: b.id,
            lead_email: b.lead_email,
            lead_name: b.lead_name,
            start_date: b.start_date,
            balance_due_cents: b.balance_due_cents,
            balance_due_date: b.balance_due_date,
          });
          if (!sent) {
            throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'The balance link could not be re-sent. Please try again.' });
          }
        } else {
          // tax_invoice — re-issue with the ORIGINAL issue timestamps so invoice numbers reproduce.
          const paidPlanIsDeposit = b.payment_plan === 'deposit_balance';
          await sendTaxInvoice({
            to: b.lead_email,
            leadName: b.lead_name,
            bookingId: b.id,
            startDate: b.start_date,
            issuedAt: b.confirmed_at ?? new Date().toISOString(),
            amountCents: paidPlanIsDeposit ? (b.deposit_paid_cents ?? 0) : (b.amount_paid_cents ?? b.total_cents),
            invoiceType: paidPlanIsDeposit ? 'deposit' : 'full',
            groupSize: b.group_size,
          });
          if (paidPlanIsDeposit && b.balance_paid_at) {
            await sendTaxInvoice({
              to: b.lead_email,
              leadName: b.lead_name,
              bookingId: b.id,
              startDate: b.start_date,
              issuedAt: b.balance_paid_at,
              amountCents: b.balance_due_cents,
              invoiceType: 'balance',
              groupSize: b.group_size,
            });
          }
        }
      } catch (err) {
        if (err instanceof ActionError) throw err;
        console.error('[admin] resend email failed', input.kind, (err as Error).message);
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'The email could not be sent. Please try again.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'resend_email',
        bookingId: b.id,
        note: input.kind,
      });
      return { ok: true };
    },
  }),

  // Move a booking to a new start date. The DB unique-start-date index is the final guard.
  adminMoveDates: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.'),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: b } = await supabase
        .from('bookings')
        .select('id, status, start_date, end_date, payment_plan, balance_paid_at, balance_link_sent_at')
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!b) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (b.status === 'cancelled') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'A cancelled booking cannot be moved.' });
      }
      if (input.startDate === b.start_date) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'That is already the booking start date.' });
      }

      // Admins may move inside the public 7-day lead window (deliberate override, logged), but
      // never into the past.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
      if (input.startDate < today) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The new start date cannot be in the past.' });
      }

      // Blocked windows (active only).
      const { data: blocked } = await supabase
        .from('blocked_dates')
        .select('id')
        .is('removed_at', null)
        .lte('start_date', input.startDate)
        .gte('end_date', input.startDate)
        .limit(1);
      if (blocked && blocked.length > 0) {
        throw new ActionError({ code: 'CONFLICT', message: 'That date falls in a blocked window. Unblock it first or pick another date.' });
      }

      const newEnd = addDays(input.startDate, 3);
      // Deposit plan with an unpaid balance: re-anchor the balance due date to the new trip.
      const patch: Record<string, unknown> = { start_date: input.startDate, end_date: newEnd };
      if (b.payment_plan === 'deposit_balance' && !b.balance_paid_at) {
        const scheduledMs = Date.parse(`${input.startDate}T00:00:00Z`) - BALANCE_LEAD_DAYS * 86_400_000;
        patch.balance_due_date = new Date(Math.max(scheduledMs, Date.now())).toISOString();
      }

      const { error } = await supabase.from('bookings').update(patch).eq('id', b.id);
      if (error) {
        // 23505 = unique violation on bookings_unique_start_date: another active booking starts then.
        if ((error as { code?: string }).code === '23505') {
          throw new ActionError({ code: 'CONFLICT', message: 'Another active booking already starts on that date.' });
        }
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not move the booking.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'move_dates',
        bookingId: b.id,
        before: { start_date: b.start_date, end_date: b.end_date },
        after: { start_date: input.startDate, end_date: newEnd },
      });
      return { ok: true, endDate: newEnd };
    },
  }),

  // Record that an outstanding balance was settled OUTSIDE Paystack (e.g. EFT). Records a fact
  // with the admin's identity; no amounts are input, no status changes.
  adminMarkBalancePaid: defineAction({
    accept: 'json',
    input: z.object({
      bookingId: z.string().uuid(),
      reason: z.string().trim().min(10, 'Please describe the payment (at least 10 characters).').max(500),
      sendEmails: z.boolean().default(true),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: b } = await supabase
        .from('bookings')
        .select('id, status, payment_plan, balance_paid_at, balance_due_cents, total_cents, lead_email, lead_name, start_date, group_size')
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!b) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (b.payment_plan !== 'deposit_balance' || !b.balance_due_cents) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This booking has no outstanding balance plan.' });
      }
      if (b.status !== 'confirmed') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Only confirmed bookings can have their balance marked paid.' });
      }
      if (b.balance_paid_at) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The balance is already marked paid.' });
      }

      const paidAt = new Date().toISOString();
      // Compare-and-set on balance_paid_at so a double-click can never double-record.
      const { data: updated, error } = await supabase
        .from('bookings')
        .update({
          balance_paid_at: paidAt,
          balance_processor_txn_id: `manual:${admin.email}`,
          amount_paid_cents: b.total_cents,
        })
        .eq('id', b.id)
        .is('balance_paid_at', null)
        .select('id');
      if (error || !updated || updated.length === 0) {
        throw new ActionError({ code: 'CONFLICT', message: 'The balance could not be marked paid (it may already be recorded).' });
      }

      // Keep the payment history complete alongside webhook events (best-effort, PII-free).
      await recordPaymentEvent({
        eventType: 'manual_balance_paid',
        bookingId: b.id,
        amountCents: b.balance_due_cents,
        detail: { recordedBy: admin.email },
      });

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'mark_balance_paid',
        bookingId: b.id,
        before: { balance_paid_at: null },
        after: { balance_paid_at: paidAt, amount_paid_cents: b.total_cents },
        note: input.reason.trim(),
      });

      if (input.sendEmails) {
        try {
          await sendBalancePaidConfirmation({ to: b.lead_email, leadName: b.lead_name, startDate: b.start_date });
          await sendTaxInvoice({
            to: b.lead_email,
            leadName: b.lead_name,
            bookingId: b.id,
            startDate: b.start_date,
            issuedAt: paidAt,
            amountCents: b.balance_due_cents,
            invoiceType: 'balance',
            groupSize: b.group_size,
          });
        } catch (err) {
          console.error('[admin] mark-paid emails failed', (err as Error).message);
          return { ok: true, emailWarning: 'Recorded, but the guest emails failed to send. Use re-send from the booking page.' };
        }
      }
      return { ok: true };
    },
  }),

  // Block a window of start dates (maintenance / private use). Does NOT affect existing bookings.
  adminBlockDates: defineAction({
    accept: 'json',
    input: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid end date.'),
      reason: z.string().trim().min(3, 'Please give a short reason.').max(200),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      if (input.endDate < input.startDate) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The end date must be on or after the start date.' });
      }
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
      if (input.endDate < today) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'That window is entirely in the past.' });
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('blocked_dates')
        .insert({
          start_date: input.startDate,
          end_date: input.endDate,
          reason: input.reason.trim(),
          created_by: admin.email,
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not block those dates.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'block_dates',
        note: `${input.startDate} to ${input.endDate}: ${input.reason.trim()}`,
      });
      return { ok: true, id: data.id };
    },
  }),

  // Soft-remove a blocked window (the row is kept; removed_at is set).
  adminUnblockDates: defineAction({
    accept: 'json',
    input: z.object({ blockId: z.string().uuid() }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('blocked_dates')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', input.blockId)
        .is('removed_at', null)
        .select('start_date, end_date');
      if (error || !data || data.length === 0) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Blocked window not found (it may already be removed).' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'unblock_dates',
        note: `${data[0].start_date} to ${data[0].end_date}`,
      });
      return { ok: true };
    },
  }),

  // Toggle an enquiry's handled state.
  adminMarkInquiryHandled: defineAction({
    accept: 'json',
    input: z.object({
      inquiryId: z.string().uuid(),
      handled: z.boolean(),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('inquiries')
        .update({
          handled_at: input.handled ? new Date().toISOString() : null,
          handled_by: input.handled ? admin.email : null,
        })
        .eq('id', input.inquiryId)
        .select('id');
      if (error || !data || data.length === 0) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Enquiry not found.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'inquiry_handled',
        note: `${input.inquiryId}: ${input.handled ? 'handled' : 'reopened'}`,
      });
      return { ok: true };
    },
  }),
};

// Shared per-admin rate limit (defence-in-depth on all admin mutations).
async function adminActionRate(email: string): Promise<void> {
  if (!(await rateLimit(`adminact:min:${email}`, 30, 60))) {
    throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Too many changes in a short time. Please wait a moment.' });
  }
}
