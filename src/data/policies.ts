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

export interface RefundTier {
  window: string;
  refund: string;
}

export interface PolicyClause {
  heading: string;
  body: string;
}

export const refundPolicy = {
  // Operator should set/confirm the effective date before launch.
  effectiveDate: '2026-06-18',
  contactEmail: site.notifyEmail,

  intro:
    'The Rooiberg Wander is booked as exclusive use of the whole trail for a single private group, with payment made in full at the time of booking. Because each booking reserves the entire trail, its guides and camp staff for your group alone, cancellations are subject to the schedule below. All cancellations must be made in writing and take effect on the date we receive them. “Arrival” means Day 1, the arrival day of your booked window.',

  // Tiered refund of the total amount paid, by notice given before arrival (Day 1).
  tiers: [
    { window: '60 or more days before arrival', refund: '90% refund (10% administration fee retained)' },
    { window: '45 to 59 days before arrival', refund: '50% refund' },
    { window: '30 to 44 days before arrival', refund: '25% refund' },
    { window: 'Fewer than 30 days before arrival, or no-show', refund: 'No refund' },
  ] as RefundTier[],

  clauses: [
    {
      heading: 'How refunds are paid',
      body: 'Approved refunds are returned to the original payment method via our payment provider, normally within 10 business days of confirmation. Payment-processing or bank charges, and any difference arising from foreign-exchange or international card fees, are not recoverable.',
    },
    {
      heading: 'Changing your dates',
      body: 'You may transfer your booking to another available start date at no administration fee if you request the change 60 or more days before arrival, subject to availability. Requests made later are treated as a cancellation under the schedule above. Names within your group may be substituted at no charge up to 14 days before arrival.',
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
      body: 'Because the trail operates in a Big 5 environment, guests must follow all instructions from the armed wilderness guides at all times, including the Two-Man Rule. Guests who place themselves or others at risk, or who materially breach safety instructions, may be removed from the trail without refund.',
    },
    {
      heading: 'No-show and unused services',
      body: 'No refund is given for a no-show, late arrival, early departure, or any portion of the trail not used.',
    },
    {
      heading: 'Prices and VAT',
      body: 'All prices and refunds are in South African Rand and are inclusive of VAT at 15%. A valid tax invoice is issued on confirmation of payment.',
    },
    {
      heading: 'Your statutory rights',
      body: 'This policy is applied subject to the Consumer Protection Act 68 of 2008. Nothing in it limits any right you may have under that Act.',
    },
  ] as PolicyClause[],
};
