// Astro Actions (Part 9.2) — zod-validated, server-side. The price is ALWAYS recomputed here
// (never trusted from the client). All secret access is lazy via the lib/* modules.
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';
import crypto from 'node:crypto';
import {
  computeQuote,
  BALANCE_LEAD_DAYS,
  earliestBookableDate,
  latestBookableDate,
  isAllowedStartDay,
  bookingTypeFor,
  windowMonthsFor,
} from '../lib/pricing';
import {
  MAX_GROUP_SIZE,
  MIN_PARTY_SIZE,
  ROOMS_PER_DEPARTURE,
  minPartySize,
  minToJoin,
  roomsFor,
  isValidRoomMix,
  defaultSingleRooms,
  START_DAYS_DISPLAY,
  TAPER_END_DISPLAY,
} from '../data/rates';
import { getSupabaseAdmin } from '../lib/supabase';
import { payments } from '../lib/payments';
import {
  sendInquiryNotification,
  sendBookingConfirmation,
  sendPretripReminder,
  sendBalancePaidConfirmation,
  sendPaymentReceipt,
  sendLoginAttackAlert,
  sendCompBookingAdminAlert,
  sendBlockedDatesAdminAlert,
  adminEmailList,
} from '../lib/email';
import { sendBalancePaymentLink } from '../lib/balance';
import { rateLimit, clientIp } from '../lib/ratelimit';
import { signInAdmin, signOutAdmin } from '../lib/auth';
import { requireAdmin, recordAdminEvent } from '../lib/admin';
import { recordPaymentEvent } from '../lib/audit';
import { site } from '../data/site';
import { MIN_GUEST_AGE } from '../data/policies';

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
      groupSize: z.number().int().min(MIN_PARTY_SIZE).max(MAX_GROUP_SIZE),
      catering: z.enum(['catered', 'uncatered']),
      // How many guests need their own room, and how many are SADC residents. Counts, never a
      // price or a rate band: the server prices every line itself.
      singleRooms: z.number().int().min(0).max(MAX_GROUP_SIZE),
      sadcCount: z.number().int().min(0).max(MAX_GROUP_SIZE),
      // Ticked when sadcCount > 0: those guests live in an SADC country and will show ID or a
      // passport at registration. Proof is checked in person; this records the term was accepted.
      residencyDeclaration: z.boolean().optional(),
      // Child policy: the lead guest confirms every guest will be at least MIN_GUEST_AGE on the
      // start date. Optional in the schema so the refusal below can say why in plain words.
      ageConfirmed: z.boolean().optional(),
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

      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      // 1. Room mix. Guests who share pair up within the booking, so the number sharing is even.
      if (
        input.sadcCount > input.groupSize ||
        !isValidRoomMix(input.groupSize, input.singleRooms)
      ) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message:
            'Guests who share pair up within your group, so please choose a number of own rooms that leaves an even number sharing.',
        });
      }
      // 2. Self-catered is a full group of 8 SADC residents sharing 4 rooms.
      if (input.catering === 'uncatered' && (input.sadcCount !== input.groupSize || input.singleRooms !== 0)) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This option is open to residents of the SADC region only.',
        });
      }
      // 3. Anyone counted as SADC needs the residency confirmation.
      if (input.sadcCount > 0 && input.residencyDeclaration !== true) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message:
            'Please confirm that the guests you counted as SADC residents live in an SADC country and can show ID or a passport at registration.',
        });
      }
      const rooms = roomsFor(input.groupSize, input.singleRooms);
      if (input.ageConfirmed !== true) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Please confirm that every guest will be at least ${MIN_GUEST_AGE} years old on the start date.`,
        });
      }

      // Tapered start (server-authoritative): departures run Sunday, Monday, Thursday and Friday
      // until TAPER_END_DATE; every weekday opens after that.
      if (!isAllowedStartDay(input.startDate)) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Departures run ${START_DAYS_DISPLAY} until ${TAPER_END_DISPLAY}. Please choose one of those days.`,
        });
      }

      // Booking window (server-authoritative): earliest is a flat 7-day lead time behind the
      // 1 April 2027 opening gate; latest is a rolling per-product ceiling (24 months for
      // international catered, 12 for every SADC product). ISO YYYY-MM-DD strings compare
      // lexicographically, so string comparison is safe.
      const earliest = earliestBookableDate();
      const latest = latestBookableDate(input.catering, input.sadcCount);
      if (input.startDate < earliest) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'That start date is too soon; choose a date at least 7 days out. For an earlier departure, please send an enquiry or contact us on WhatsApp.',
        });
      }
      if (input.startDate > latest) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Bookings open up to ${windowMonthsFor(input.catering, input.sadcCount)} months ahead. Please choose an earlier date.`,
        });
      }

      // 4. Rooms and walkers. A date has 4 double rooms and takes at most 8 walkers; the first
      // booking opens it (2 catered, 8 self-catered) and locks its catering, later bookings join
      // from 2. Check what is already held so we can give a specific message before the insert;
      // the DB slot guard is the final authority against a race between this check and the insert.
      const { data: activeRows } = await supabase
        .from('bookings')
        .select('group_size, rooms, catering')
        .eq('start_date', input.startDate)
        .or(`status.eq.confirmed,and(status.eq.pending,hold_expires_at.gt.${now})`);
      const seatsTaken = (activeRows ?? []).reduce((sum, r) => sum + r.group_size, 0);
      const roomsTaken = (activeRows ?? []).reduce((sum, r) => sum + r.rooms, 0);
      const lockedCatering = activeRows && activeRows.length > 0 ? activeRows[0].catering : null;

      if (seatsTaken === 0) {
        const openMin = minPartySize(input.catering);
        if (input.groupSize < openMin) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message:
              input.catering === 'catered'
                ? `Opening a new date takes at least ${openMin} people.`
                // Only reachable from the hidden page's self-catered mount.
                : `Opening a new date takes at least ${openMin} people. The self-catered option runs as a full group of ${openMin}.`,
          });
        }
      } else {
        if (lockedCatering && input.catering !== lockedCatering) {
          throw new ActionError({
            code: 'CONFLICT',
            // Never names the other product: each page sells one (the calendar says the same).
            message: 'That date is already taken by another group. Please choose another date.',
          });
        }
        const joinMin = minToJoin(input.catering);
        if (input.groupSize < joinMin) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Joining a departure that has already started takes at least ${joinMin} people.`,
          });
        }
      }
      if (roomsTaken + rooms > ROOMS_PER_DEPARTURE) {
        throw new ActionError({
          code: 'CONFLICT',
          message: `Only ${Math.max(0, ROOMS_PER_DEPARTURE - roomsTaken)} room(s) left on that date. Your group needs ${rooms}.`,
        });
      }
      if (seatsTaken + input.groupSize > MAX_GROUP_SIZE) {
        throw new ActionError({
          code: 'CONFLICT',
          message: `Only ${MAX_GROUP_SIZE - seatsTaken} place(s) left on that date.`,
        });
      }

      // SERVER is the price authority (Part 11.4). startDate drives the rate year, the season and
      // the split-payment rule: a trip 45+ days out pays a 50% deposit now + 50% balance later;
      // inside 45 days pays in full. Exclusivity (all 4 rooms) is derived here for the insert and
      // again, authoritatively, by the DB trigger.
      const quote = computeQuote({
        catering: input.catering,
        groupSize: input.groupSize,
        singleRooms: input.singleRooms,
        sadcCount: input.sadcCount,
        roomsTaken,
        startDate: input.startDate,
      });
      const bookingType = quote.bookingType;

      // One active booking per email. Blocks confirmed bookings (any date) and live pending holds
      // (hold_expires_at still in the future). Expired pending rows are not matched, so a genuine
      // retry after an abandoned checkout (hold expired) is allowed through. The two cases get
      // different messages: a confirmed trip has no self-service path, but a pending hold can be
      // resumed — the widget offers a "Resume payment" button keyed off this exact message
      // (kept in sync with the check in BookingWidget.astro's submit handler).
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('lead_email', input.leadEmail.trim().toLowerCase())
        .or(`status.eq.confirmed,and(status.eq.pending,hold_expires_at.gt.${now})`)
        .maybeSingle();

      if (existingBooking) {
        if (existingBooking.status === 'confirmed') {
          throw new ActionError({
            code: 'CONFLICT',
            message:
              'You already have a confirmed trip booked. Please contact us at hanlie@rooibergwander.co.za if you need to make changes.',
          });
        }
        throw new ActionError({
          code: 'CONFLICT',
          message:
            'You already have a booking waiting for payment. You can resume that payment instead of starting a new one.',
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

      // Insert pending booking. The DB slot-guard trigger serializes concurrent seat-grabs under
      // an advisory lock, caps each date at 8 seats, enforces the catering lock and DERIVES
      // booking_type; the window guard enforces the taper and the booking windows. The server is
      // the authority; a violation fails the insert here. amount_due_cents is the FIRST charge;
      // balance_due_date is computed at confirmation in the webhook, so it is left null here.
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          start_date: startDate,
          end_date: endDate,
          group_size: input.groupSize,
          booking_type: bookingType,
          catering: quote.catering,
          residency: quote.residency,
          single_rooms: quote.singleRooms,
          sadc_count: quote.sadcCount,
          residency_declared_at: quote.sadcCount > 0 ? now : null,
          age_confirmed_at: now,
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
        // Friendly messages for the inventory guards; generic conflict otherwise.
        const msg = (error?.message ?? '') as string;
        if (msg.includes('RW_ROOMS_FULL')) {
          const left = msg.match(/only (\d+)/)?.[1];
          throw new ActionError({
            code: 'CONFLICT',
            message: left
              ? `Only ${left} room(s) left on that date. Your group needs ${rooms}.`
              : 'Not enough rooms left on that date. Please choose another date.',
          });
        }
        if (msg.includes('RW_FULL') || msg.includes('RW_GROUP_TOO_LARGE')) {
          const left = msg.match(/only (\d+)/)?.[1];
          throw new ActionError({
            code: 'CONFLICT',
            message: left
              ? `Not enough places left on that date. ${left} place(s) remain.`
              : 'Not enough places left on that date. Please choose another date, or reduce your group.',
          });
        }
        if (msg.includes('RW_CATERING_LOCKED')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'That date was just taken by another group. Please choose another date.',
          });
        }
        if (msg.includes('RW_OPEN_MIN') || msg.includes('RW_TOPUP_MIN')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'That date no longer meets the minimum group size for this booking. Please choose another date.',
          });
        }
        if (msg.includes('RW_TAPER_DAY')) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Departures run ${START_DAYS_DISPLAY} until ${TAPER_END_DISPLAY}. Please choose one of those days.`,
          });
        }
        // Window guard (migration 0016). Reaching these means the date passed the check above and
        // then fell outside the window before the insert landed, i.e. the day rolled over
        // mid-checkout. Rare, but the trigger is the authority and the guest needs a reason.
        if (msg.includes('RW_WINDOW_TOO_SOON')) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'That start date is now too close to departure. Please choose a later date, or contact us on WhatsApp.',
          });
        }
        if (msg.includes('RW_WINDOW_TOO_FAR')) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'That date does not open for booking yet. Please choose an earlier date.',
          });
        }
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

  // Read-only status check for /booking/confirm's client-side poll (Part 9.2 / Phase 4). The
  // redirect back from Paystack usually beats the webhook, so the callback page can't yet know
  // whether OUR booking is actually confirmed — only that Paystack itself accepted the charge.
  // This lets the page poll until the webhook (the sole writer of `confirmed`) has caught up,
  // rather than the callback declaring the booking "secured" on the strength of the redirect
  // alone. Returns only status + the pretrip link token — no PII, no amounts — for a reference
  // the caller already holds (it's the same `?reference=` Paystack just appended to this URL,
  // an unguessable UUID, not enumerable). Rate-limited generously for ~1 minute of ~2.5s polling.
  checkBookingStatus: defineAction({
    accept: 'json',
    input: z.object({
      reference: z.string().max(100),
    }),
    handler: async (input, ctx) => {
      const ip = clientIp(ctx.request);
      if (!(await rateLimit(`checkstatus:min:${ip}`, 40, 60))) {
        throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests.' });
      }
      const supabase = getSupabaseAdmin();
      // Checked against BOTH reference columns: this reference may be the original deposit/full
      // payment (processor_reference) or a balance payment (balance_processor_reference) — the
      // guest-facing confirm page polls this action, and a balance-payment reference previously
      // never matched here, leaving that page stuck on "still confirming" forever even though the
      // webhook had already confirmed everything. Two sequential .eq() queries, mirroring
      // webhook.ts's own lookup — never a single .or() with input.reference interpolated into the
      // filter string, since PostgREST's .or() syntax is comma-delimited and this value is raw
      // user input.
      let data: { status: string; pretrip_token: string | null } | null = null;
      const byDeposit = await supabase
        .from('bookings')
        .select('status, pretrip_token')
        .eq('processor_reference', input.reference)
        .maybeSingle();
      data = byDeposit.data;
      if (!data) {
        const byBalance = await supabase
          .from('bookings')
          .select('status, pretrip_token')
          .eq('balance_processor_reference', input.reference)
          .maybeSingle();
        data = byBalance.data;
      }
      if (!data) return { status: 'not_found' as const, pretripToken: null };
      return { status: data.status as 'pending' | 'confirmed' | 'cancelled', pretripToken: data.pretrip_token as string | null };
    },
  }),

  // Resume payment for an existing live pending hold, without creating a new booking row.
  // Two callers: (1) the abandoned-checkout confirm prompt, which already knows the exact
  // `reference` it stashed client-side; (2) the createCheckout duplicate-booking conflict,
  // where the widget only has the email the guest just typed. At least one must be given;
  // `reference` is matched first when both are present. Paystack references are single-use,
  // so this issues a NEW reference for the same booking (same amount, same row) and returns a
  // fresh authorization_url — no new inventory is claimed, no price is recomputed.
  resumeCheckout: defineAction({
    accept: 'json',
    input: z
      .object({
        reference: z.string().max(100).optional(),
        leadEmail: z.string().trim().email('Please enter a valid email address.').max(180).optional(),
      })
      .refine((v) => !!v.reference || !!v.leadEmail, { message: 'Provide a reference or email.' }),
    handler: async (input, ctx) => {
      const ip = clientIp(ctx.request);
      if (!(await rateLimit(`resume:min:${ip}`, 5, 60))) {
        throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a moment and try again.' });
      }

      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();
      let query = supabase
        .from('bookings')
        .select('id, lead_email, amount_due_cents')
        .eq('status', 'pending')
        .gt('hold_expires_at', now);
      query = input.reference
        ? query.eq('processor_reference', input.reference)
        : query.eq('lead_email', input.leadEmail!.trim().toLowerCase());
      const { data: booking } = await query.maybeSingle();

      if (!booking) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'No booking waiting for payment was found. It may have expired; please start a new booking.',
        });
      }

      const newReference = `rw_${crypto.randomUUID()}`;
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ processor_reference: newReference })
        .eq('id', booking.id)
        .eq('status', 'pending'); // guard against a race with the hold-sweep/webhook
      if (updateError) {
        throw new ActionError({ code: 'CONFLICT', message: 'That booking is no longer waiting for payment. Please start a new booking.' });
      }

      const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? site.url;
      const init = await payments.initCheckout({
        email: booking.lead_email,
        amountCents: booking.amount_due_cents,
        reference: newReference,
        callbackUrl: `${siteUrl}/booking/confirm`,
        metadata: { booking_id: booking.id },
      });

      return { authorizationUrl: init.authorizationUrl, reference: newReference };
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
      kind: z.enum(['confirmation', 'pretrip_reminder', 'balance_link', 'receipt']),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const supabase = getSupabaseAdmin();
      const { data: b } = await supabase
        .from('bookings')
        .select(
          'id, status, lead_email, lead_name, start_date, pretrip_token, payment_plan, deposit_paid_cents, balance_due_cents, balance_due_date, balance_paid_at, total_cents, amount_paid_cents, group_size, confirmed_at, processor, booking_type, catering',
        )
        .eq('id', input.bookingId)
        .maybeSingle();
      if (!b) throw new ActionError({ code: 'NOT_FOUND', message: 'Booking not found.' });
      if (b.status !== 'confirmed') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Emails can only be re-sent for confirmed bookings.' });
      }
      const isComp = b.processor === 'comp';
      if (isComp && input.kind === 'receipt') {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Complimentary bookings have no payment receipt (no payment was made).' });
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
            complimentary: isComp,
            bookingType: b.booking_type,
            catering: b.catering,
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
          // receipt — re-issue with the ORIGINAL issue timestamps so receipt numbers reproduce.
          const paidPlanIsDeposit = b.payment_plan === 'deposit_balance';
          await sendPaymentReceipt({
            to: b.lead_email,
            leadName: b.lead_name,
            bookingId: b.id,
            startDate: b.start_date,
            issuedAt: b.confirmed_at ?? new Date().toISOString(),
            amountCents: paidPlanIsDeposit ? (b.deposit_paid_cents ?? 0) : (b.amount_paid_cents ?? b.total_cents),
            receiptType: paidPlanIsDeposit ? 'deposit' : 'full',
            groupSize: b.group_size,
            bookingType: b.booking_type,
            catering: b.catering,
          });
          if (paidPlanIsDeposit && b.balance_paid_at) {
            await sendPaymentReceipt({
              to: b.lead_email,
              leadName: b.lead_name,
              bookingId: b.id,
              startDate: b.start_date,
              issuedAt: b.balance_paid_at,
              amountCents: b.balance_due_cents,
              receiptType: 'balance',
              groupSize: b.group_size,
              bookingType: b.booking_type,
              catering: b.catering,
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
        // 23505 = any surviving unique violation (the v3 one-exclusive-per-date index is dropped
        // by 0016; capacity is enforced by the slot guard instead).
        if ((error as { code?: string }).code === '23505') {
          throw new ActionError({ code: 'CONFLICT', message: 'Another active booking already starts on that date.' });
        }
        // Slot-guard trigger (0017): a date holds 4 rooms and 8 walkers, the first booking locks
        // the date's catering, and booking_type is re-derived on the move. The window guard exempts
        // UPDATEs, so an admin may move a booking to a taper day or outside the public window.
        const msg = error.message ?? '';
        if (msg.includes('RW_OPEN_MIN')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: `That date has no other booking yet, so it needs at least ${minPartySize('catered')} people to move here if catered, or ${minPartySize('uncatered')} if self-catered.`,
          });
        }
        if (msg.includes('RW_TOPUP_MIN')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: `Joining that date needs at least ${minToJoin('catered')} people (the full ${minPartySize('uncatered')} if self-catered).`,
          });
        }
        if (msg.includes('RW_CATERING_LOCKED')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'That date is already booked with a different catering choice.',
          });
        }
        if (msg.includes('RW_FULL') || msg.includes('RW_ROOMS_FULL') || msg.includes('RW_GROUP_TOO_LARGE')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Not enough places or rooms left on that date for this group.',
          });
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
        .select('id, status, payment_plan, balance_paid_at, balance_due_cents, total_cents, lead_email, lead_name, start_date, group_size, booking_type, catering')
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
          await sendPaymentReceipt({
            to: b.lead_email,
            leadName: b.lead_name,
            bookingId: b.id,
            startDate: b.start_date,
            issuedAt: paidAt,
            amountCents: b.balance_due_cents,
            receiptType: 'balance',
            groupSize: b.group_size,
            bookingType: b.booking_type,
            catering: b.catering,
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

      // Governance: every admin is told about calendar changes (best-effort; audit is the record).
      await sendBlockedDatesAdminAlert({
        tos: adminEmailList(),
        actedBy: admin.email,
        action: 'blocked',
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason.trim(),
      });

      return { ok: true, id: data.id };
    },
  }),

  // Soft-remove a blocked window (the row is kept; removed_at is set). Reason required —
  // silently reopening dates is as notify-worthy as blocking them.
  adminUnblockDates: defineAction({
    accept: 'json',
    input: z.object({
      blockId: z.string().uuid(),
      reason: z.string().trim().min(10, 'Please give a reason (at least 10 characters).').max(500),
    }),
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
        note: `${data[0].start_date} to ${data[0].end_date}: ${input.reason.trim()}`,
      });

      await sendBlockedDatesAdminAlert({
        tos: adminEmailList(),
        actedBy: admin.email,
        action: 'unblocked',
        startDate: data[0].start_date,
        endDate: data[0].end_date,
        reason: input.reason.trim(),
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

  // Create a COMPLIMENTARY (gift) booking that bypasses payment — for marketing (influencers,
  // journalists). The one sanctioned non-webhook path to a confirmed booking: money fields are
  // all zero (nothing owed, nothing paid), processor='comp' makes it unmistakable everywhere,
  // the reason is required, the action is audit-logged, and EVERY admin is emailed.
  adminCreateCompBooking: defineAction({
    accept: 'json',
    input: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
      groupSize: z.number().int().min(MIN_PARTY_SIZE).max(MAX_GROUP_SIZE),
      catering: z.enum(['catered', 'uncatered']),
      residency: z.enum(['sadc', 'international']).default('sadc'),
      leadName: z.string().trim().min(2, 'Please enter the guest\'s full name.').max(120),
      leadEmail: z.string().trim().email('Please enter a valid email address.').max(180),
      leadPhone: z.string().trim().min(7, 'Please enter a valid phone number.').max(40).optional(),
      reason: z.string().trim().min(10, 'Please give a reason (at least 10 characters).').max(500),
      sendGuestEmail: z.boolean().default(true),
    }),
    handler: async (input, ctx) => {
      const admin = await requireAdmin(ctx);
      await adminActionRate(admin.email);

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
      if (input.startDate < today) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'The start date cannot be in the past.' });
      }

      const supabase = getSupabaseAdmin();

      // Blocked windows (active only) — same guard as adminMoveDates.
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

      // Comp bookings follow the same product minimums as a paid booking (2 catered, 8
      // self-catered) but are deliberately exempt from the taper and the booking windows: a
      // training or marketing walk is an operator decision, already audit-logged. The slot guard
      // still applies, so a comp cannot overbook a date a paying group is already on.
      const compMin = minPartySize(input.catering);
      if (input.groupSize < compMin) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `A ${input.catering === 'catered' ? 'catered' : 'self-catered'} booking takes at least ${compMin} guests.`,
        });
      }

      const leadName = input.leadName.trim().replace(/\s+/g, ' ');
      const leadEmail = input.leadEmail.trim().toLowerCase();
      const reason = input.reason.trim();
      const nowIso = new Date().toISOString();
      const endDate = addDays(input.startDate, 3);
      const compSingleRooms = input.catering === 'catered' ? defaultSingleRooms(input.groupSize) : 0;

      const { data: created, error } = await supabase
        .from('bookings')
        .insert({
          start_date: input.startDate,
          end_date: endDate,
          group_size: input.groupSize,
          // Comps take the default room mix (one own room for an odd party) and count the whole
          // party as SADC when the operator picks the SADC band. The admin form has no room or
          // SADC-count inputs yet.
          single_rooms: compSingleRooms,
          sadc_count: input.residency === 'sadc' || input.catering === 'uncatered' ? input.groupSize : 0,
          // Derived by the slot guard; this value is only a sensible default for the insert.
          booking_type: bookingTypeFor(roomsFor(input.groupSize, compSingleRooms)),
          catering: input.catering,
          residency: input.residency,
          residency_declared_at: input.residency === 'sadc' ? nowIso : null,
          lead_name: leadName,
          lead_email: leadEmail,
          lead_phone: input.leadPhone?.trim() || null,
          status: 'confirmed',
          confirmed_at: nowIso,
          total_cents: 0,
          amount_due_cents: 0,
          amount_paid_cents: 0,
          balance_due_cents: 0,
          payment_plan: 'full',
          currency: 'ZAR',
          processor: 'comp',
          processor_reference: `comp_${crypto.randomUUID()}`,
          hold_expires_at: null,
        })
        .select('id, pretrip_token')
        .single();
      if (error || !created) {
        if ((error as { code?: string } | null)?.code === '23505') {
          throw new ActionError({ code: 'CONFLICT', message: 'Another active booking already starts on that date.' });
        }
        const msg = error?.message ?? '';
        if (msg.includes('RW_CATERING_LOCKED')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'That date is already booked with a different catering choice.',
          });
        }
        if (msg.includes('RW_FULL') || msg.includes('RW_ROOMS_FULL') || msg.includes('RW_GROUP_TOO_LARGE')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Not enough places or rooms left on that date for this group.',
          });
        }
        if (msg.includes('RW_OPEN_MIN') || msg.includes('RW_TOPUP_MIN')) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'That date does not meet the minimum group size for this booking.',
          });
        }
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create the booking.' });
      }

      await recordAdminEvent({
        adminEmail: admin.email,
        action: 'create_comp_booking',
        bookingId: created.id,
        after: { start_date: input.startDate, lead_email: leadEmail, group_size: input.groupSize },
        note: reason,
      });

      // Governance: every admin hears about a payment bypass (best-effort; audit is the record).
      await sendCompBookingAdminAlert({
        tos: adminEmailList(),
        createdBy: admin.email,
        leadName,
        leadEmail,
        startDate: input.startDate,
        groupSize: input.groupSize,
        reason,
        bookingId: created.id,
      });

      if (input.sendGuestEmail) {
        try {
          await sendBookingConfirmation({
            to: leadEmail,
            leadName,
            startDate: input.startDate,
            pretripToken: created.pretrip_token,
            paymentPlan: 'full',
            complimentary: true,
          });
        } catch (err) {
          console.error('[admin] comp guest confirmation failed', (err as Error).message);
          return {
            ok: true,
            bookingId: created.id,
            emailWarning: 'Booking created, but the guest email failed to send. Use re-send from the booking page.',
          };
        }
      }

      return { ok: true, bookingId: created.id };
    },
  }),
};

// Shared per-admin rate limit (defence-in-depth on all admin mutations).
async function adminActionRate(email: string): Promise<void> {
  if (!(await rateLimit(`adminact:min:${email}`, 30, 60))) {
    throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Too many changes in a short time. Please wait a moment.' });
  }
}
