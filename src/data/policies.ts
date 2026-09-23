// Refund & cancellation policy — DRAFT (industry-standard, researched).
// ----------------------------------------------------------------------------------------
// ⚠ This is a sound, industry-standard draft synthesised from common South African guided /
// multi-day safari operators (tiered days-before-arrival schedule, full payment up front,
// travel-insurance + force-majeure + operator-cancellation clauses, applied subject to the
// Consumer Protection Act). The PERCENTAGES, WINDOWS and the refund TIMEFRAME are commercial
// decisions — the operator must confirm them and have the policy reviewed by legal counsel
// before launch. Renders on the Rates page (step 10) and is referenced at checkout.
// ----------------------------------------------------------------------------------------
import { site } from './site';
import {
  ROOMS_PER_DEPARTURE,
  SINGLE_SUPPLEMENT_PCT,
  SADC_DISCOUNT_PERCENT,
  SADC_PREMIUM_PCT,
} from './rates';

// Child policy: every guest must be at least this old on the start date (Day 1), for safety on a
// walking trail through Big 5 terrain. Operator decision, 23 September 2026. The booking form asks
// the lead guest to confirm it, and createCheckout refuses a booking without that confirmation.
export const MIN_GUEST_AGE = 16;

export interface RefundTier {
  window: string;
  refund: string;
}

export interface PolicyClause {
  heading: string;
  body: string;
  /** Set when a clause only applies to one product. The hidden self-catered page (and its booking
   *  widget) leaves out the catered-only clauses: there is no single supplement on that option,
   *  and its rate is already a resident rate. */
  cateringOnly?: 'catered';
}

// The clauses that apply to one product's page and booking widget.
export function clausesFor(catering: 'catered' | 'uncatered'): PolicyClause[] {
  return refundPolicy.clauses.filter((c) => !c.cateringOnly || c.cateringOnly === catering);
}

export const refundPolicy = {
  // Operator should set/confirm the effective date before launch.
  effectiveDate: '2026-07-04',
  contactEmail: site.notifyEmail,

  intro:
    'Rooiberg Wander is booked as places on a departure of four double rooms: the first booking on a date opens it and every later booking joins it, up to eight guests in total. Guests only share a room within their own booking. A group that books all four rooms has the trail and each lodge to itself. Full payment is due 45 days before arrival: bookings made 45 or more days before arrival are secured with a 50% deposit, with the balance due 45 days before arrival; bookings made inside 45 days are paid in full at booking. Payment is non-refundable from 45 days before arrival. Because every booking commits guides, lodge staff and places on a departure we can rarely resell at short notice, cancellations are subject to the schedule below, though we always try to find a fair outcome first. All cancellations must be made in writing and take effect on the date we receive them. “Arrival” means Day 1, the arrival day of your booked window.',

  // Refund of the total amount paid to date, by notice given before arrival (Day 1). The
  // schedule mirrors the payment model: full payment (and non-refundability) starts at 45 days.
  tiers: [
    { window: '45 or more days before arrival', refund: 'Full refund, less a 5% administration fee' },
    { window: 'Fewer than 45 days before arrival, or no-show', refund: 'No refund' },
  ] as RefundTier[],

  clauses: [
    {
      heading: 'How refunds are paid',
      body: 'Approved refunds are returned to the original payment method via our payment provider, normally within 10 business days of confirmation. Payment-processing or bank charges, and any difference arising from foreign-exchange or international card fees, are not recoverable.',
    },
    {
      heading: 'Changing your dates',
      body: 'If you need to move your dates, contact us as early as possible. We may, at our discretion and subject to availability, offer a transfer to another start date instead of a cancellation. Where a transfer is not possible, the cancellation schedule above applies. Names within your group may be substituted at no charge at any time before arrival.',
    },
    {
      heading: 'If we cancel or reschedule',
      body: 'If we have to cancel or move your trail, for reasons such as guest or wildlife safety, fire, flood, access, or other circumstances beyond our reasonable control, you will be offered a free transfer to another date or a full refund of monies paid to us. We are not liable for other costs you may incur, such as flights, accommodation, visas or travel insurance.',
    },
    {
      heading: 'Force majeure',
      body: 'Neither party is liable for failure to perform caused by events beyond its reasonable control. In such cases we will offer a transfer or a refund as set out above; we are not responsible for consequential travel costs.',
    },
    {
      heading: 'Travel insurance',
      body: 'We strongly recommend comprehensive travel insurance for every guest, covering at least trip cancellation and curtailment, medical treatment and emergency evacuation, and personal belongings.',
    },
    {
      heading: 'Safety and conduct',
      body: 'Because the trail operates in a Big 5 environment, guests must follow all instructions from the experienced trail guides at all times, including the Two-Man Rule. Guests who place themselves or others at risk, or who materially breach safety instructions, may be removed from the trail without refund.',
    },
    {
      heading: 'Rooms and single supplement',
      cateringOnly: 'catered',
      body: `Every departure has ${ROOMS_PER_DEPARTURE} double rooms. Guests only share a room with others in their own booking. Each guest who has a room to themselves pays a single supplement of ${SINGLE_SUPPLEMENT_PCT}% of the all-inclusive rate for their start date.`,
    },
    {
      heading: 'SADC resident rate',
      cateringOnly: 'catered',
      body: `Guests counted as SADC residents at booking receive ${SADC_DISCOUNT_PERCENT}% off their rate. Each must show a valid ID or passport proving residency in an SADC country at registration on Day 1. A guest who cannot pays a ${SADC_PREMIUM_PCT}% premium at registration.`,
    },
    {
      heading: 'Minimum age',
      body: `For safety, every guest must be at least ${MIN_GUEST_AGE} years old on the start date of the trail. A guest under ${MIN_GUEST_AGE} will be refused entry on arrival, and no refund is given for that guest's place.`,
    },
    {
      heading: 'No-show and unused services',
      body: 'No refund is given for a no-show, late arrival, early departure, or any portion of the trail not used.',
    },
    {
      heading: 'Prices',
      body: 'All prices and refunds are in South African Rand. Prices include VAT at 15% and all reserve conservation levies. A payment receipt is issued on confirmation of payment.',
    },
    {
      heading: 'Your statutory rights',
      body: 'This policy is applied subject to the Consumer Protection Act 68 of 2008. Nothing in it limits any right you may have under that Act.',
    },
  ] as PolicyClause[],
};
