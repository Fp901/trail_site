// Database row types — ONE hand-written mirror of supabase/migrations/*.sql.
//
// WHY THIS FILE EXISTS. Before it, every admin page re-declared its own row interface and
// bookings/[id].astro used `Record<string, any>` while reading 23 columns. Nothing connected
// those hand-copies to the migrations, so a column renamed in SQL failed silently at runtime.
//
// WHAT MAKES IT HONEST. Each column list is a runtime `as const` TUPLE, not only a type. One
// literal feeds three consumers:
//   1. the `.select()` string, via sel()
//   2. the compile-time row type, via Pick<Row, (typeof COLS)[number]>
//   3. scripts/verify-admin.mjs, which parses the migration SQL and asserts set-equality
// So a typo is a compile error and a drifted migration is a failed verify run. Keep it that way:
// when you add a migration, add the column here and the verify script proves you did.
//
// Dates/timestamps are `string` because supabase-js returns them as ISO strings, not Date objects.

// ---- Enums (mirror the SQL CHECK constraints) -------------------------------------------------
// Each has a runtime tuple so verify-admin.mjs can compare it to `check (col in (...))`.

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TYPES = ['exclusive', 'shared'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const CATERINGS = ['catered', 'uncatered'] as const;
export type Catering = (typeof CATERINGS)[number];

export const PAYMENT_PLANS = ['full', 'deposit_balance'] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

// Legacy: 0013 dropped the NOT NULL, so new bookings leave this null. The CHECK survives.
export const RESIDENCIES = ['local', 'international'] as const;
export type Residency = (typeof RESIDENCIES)[number];

export const ADMIN_ACTIONS = [
  'note',
  'update_contact',
  'move_dates',
  'cancel_booking',
  'resend_email',
  'mark_balance_paid',
  'block_dates',
  'unblock_dates',
  'inquiry_handled',
  'create_comp_booking',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

// payment_events.event_type has NO CHECK constraint in SQL (deliberately: 0008/0011-era values
// were added without a migration). verify-admin.mjs instead asserts this tuple covers every
// `eventType:` literal passed to recordPaymentEvent() anywhere under src/.
export const PAYMENT_EVENT_TYPES = [
  'confirmed',
  'amount_mismatch',
  'paid_but_cancelled',
  'reference_not_found',
  'duplicate_ignored',
  'balance_confirmed',
  'balance_amount_mismatch',
  'balance_inconsistent',
  'manual_balance_paid',
  // The payment succeeded and the booking is confirmed, but the operator-notification email
  // failed to send — durable, queryable evidence of a real confirmed booking the operator was
  // never told about (nothing else retries or surfaces this failure; see webhook.ts).
  'operator_notification_failed',
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

// ---- bookings (34 columns) --------------------------------------------------------------------
// 0001 base (18) + 0003 pretrip_token + 0004 three reminder guards (renamed by 0007)
// + 0008 nine split-payment columns + 0010 lead_phone + 0013 booking_type & catering.

export const BOOKING_COLUMNS = [
  // 0001_init
  'id',
  'created_at',
  'start_date',
  'end_date',
  'group_size',
  'residency',
  'lead_name',
  'lead_email',
  'status',
  'total_cents',
  'amount_due_cents',
  'amount_paid_cents',
  'currency',
  'processor',
  'processor_reference',
  'processor_txn_id',
  'hold_expires_at',
  'confirmed_at',
  // 0003_pretrip_details
  'pretrip_token',
  // 0004_pretrip_timing, renamed by 0007_pretrip_7day_window
  'pretrip_reminder_day3_sent',
  'pretrip_reminder_day6_sent',
  'pretrip_overdue_alert_sent',
  // 0008_split_payment
  'payment_plan',
  'deposit_paid_cents',
  'balance_due_cents',
  'balance_due_date',
  'balance_link_sent_at',
  'balance_paid_at',
  'balance_overdue_alert_sent',
  'balance_processor_reference',
  'balance_processor_txn_id',
  // 0010_lead_phone
  'lead_phone',
  // 0013_booking_v2
  'booking_type',
  'catering',
] as const;

export interface BookingRow {
  id: string;
  created_at: string;
  start_date: string; // date, Day 1 (arrival)
  end_date: string; // date, Day 4 (departure)
  group_size: number;
  // 0013 dropped the NOT NULL: only legacy (pre-catering-model) bookings carry a value.
  residency: Residency | null;
  lead_name: string;
  lead_email: string;
  status: BookingStatus;
  total_cents: number;
  amount_due_cents: number;
  amount_paid_cents: number | null;
  currency: string;
  // 'paystack' by default; comp bookings write 'comp'. Not CHECK-constrained, so stays string.
  processor: string;
  processor_reference: string;
  processor_txn_id: string | null;
  hold_expires_at: string | null;
  confirmed_at: string | null;
  pretrip_token: string;
  pretrip_reminder_day3_sent: boolean;
  pretrip_reminder_day6_sent: boolean;
  pretrip_overdue_alert_sent: boolean;
  payment_plan: PaymentPlan;
  deposit_paid_cents: number | null;
  balance_due_cents: number;
  balance_due_date: string | null;
  balance_link_sent_at: string | null;
  balance_paid_at: string | null;
  balance_overdue_alert_sent: boolean;
  balance_processor_reference: string | null;
  balance_processor_txn_id: string | null;
  lead_phone: string | null;
  booking_type: BookingType;
  catering: Catering;
}

// ---- inquiries (9) ----------------------------------------------------------------------------
// NOTE group_size is TEXT here (free-form, from a public form), unlike bookings.group_size int.

export const INQUIRY_COLUMNS = [
  'id',
  'created_at',
  'name',
  'email',
  'group_size',
  'target_dates',
  'message',
  // 0011_admin_tools
  'handled_at',
  'handled_by',
] as const;

export interface InquiryRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  group_size: string | null;
  target_dates: string | null;
  message: string | null;
  handled_at: string | null;
  handled_by: string | null;
}

// ---- blocked_dates (7) ------------------------------------------------------------------------
// Removal is SOFT: removed_at is set, the row is never deleted.

export const BLOCKED_DATE_COLUMNS = [
  'id',
  'created_at',
  'start_date',
  'end_date',
  'reason',
  // 0011_admin_tools
  'removed_at',
  'created_by',
] as const;

export interface BlockedDateRow {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  removed_at: string | null;
  created_by: string | null;
}

// ---- pretrip_details (5) ----------------------------------------------------------------------
// `details` is jsonb with no DB-side shape validation; PretripDetails below is the agreed shape.

export const PRETRIP_DETAIL_COLUMNS = [
  'id',
  'booking_id',
  'created_at',
  'submitted_at',
  'details',
] as const;

export interface PretripGuest {
  name?: string;
  idNumber?: string;
  emergencyName?: string;
  emergencyPhone?: string;
}

export interface PretripDetails {
  leadPhone?: string;
  guests?: PretripGuest[];
  medicalNotes?: string;
  vehicleReg?: string;
  arrivalTime?: string;
  specialRequests?: string;
  selfCateringAck?: boolean;
}

export interface PretripDetailRow {
  id: string;
  booking_id: string;
  created_at: string;
  submitted_at: string | null;
  details: PretripDetails | null;
}

// ---- payment_events (7) -----------------------------------------------------------------------

export const PAYMENT_EVENT_COLUMNS = [
  'id',
  'created_at',
  'booking_id',
  'processor_reference',
  'event_type',
  'amount_cents',
  'detail',
] as const;

export interface PaymentEventRow {
  id: string;
  created_at: string;
  booking_id: string | null;
  processor_reference: string | null;
  event_type: PaymentEventType;
  amount_cents: number | null;
  detail: Record<string, unknown> | null;
}

// ---- admin_audit (8) --------------------------------------------------------------------------
// before/after are typed Record<string, unknown> rather than a strict recursive Json union:
// [id].astro does Object.keys(e.after ?? {}) and indexes the result, which a strict union rejects.

export const ADMIN_AUDIT_COLUMNS = [
  'id',
  'created_at',
  'admin_email',
  'action',
  'booking_id',
  'before',
  'after',
  'note',
] as const;

export interface AdminAuditRow {
  id: string;
  created_at: string;
  admin_email: string;
  action: AdminAction;
  booking_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
}

// ---- rate_limits (3) --------------------------------------------------------------------------

export const RATE_LIMIT_COLUMNS = ['key', 'window_start', 'count'] as const;

export interface RateLimitRow {
  key: string;
  window_start: string;
  count: number;
}

// ---- departure_inventory (view, 5) ------------------------------------------------------------
// The anon-readable booking calendar gateway (0015). SPARSE by contract: a start_date absent from
// it has no state at all (all 8 places free, no catering lock, not exclusive, not blocked).

export const DEPARTURE_INVENTORY_COLUMNS = [
  'start_date',
  'seats_left',
  'locked_catering',
  'is_exclusive',
  'is_blocked',
] as const;

export interface DepartureInventoryRow {
  start_date: string;
  seats_left: number;
  locked_catering: Catering | null;
  is_exclusive: boolean;
  is_blocked: boolean;
}

// ---- Select helper ----------------------------------------------------------------------------
// Builds the PostgREST select string from a typed column tuple, so the string and the row type
// can never disagree. Usage:
//   const COLS = ['id', 'start_date'] as const satisfies readonly (keyof BookingRow)[];
//   type Row = Pick<BookingRow, (typeof COLS)[number]>;
//   supabase.from('bookings').select(sel<BookingRow, typeof COLS>(COLS))

export function sel<T, K extends readonly (keyof T & string)[]>(keys: K): string {
  return keys.join(', ');
}
