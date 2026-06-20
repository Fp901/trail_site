/// <reference types="astro/client" />

// Self-hosted font packages (Fontsource) are imported for their CSS side effects
// only and ship no type declarations for the bare/CSS entry points. Declare them so
// `astro check` (strict) accepts the imports in Layout/pages.
declare module '@fontsource/*';
declare module '@fontsource-variable/*';

// Typed environment variables (Part 11.6). All optional so the build never depends on them;
// they are read lazily at runtime. PUBLIC_* are exposed to the client; the rest are server-only.
interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_PAYSTACK_PUBLIC_KEY?: string;
  // server-only
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly PAYSTACK_SECRET_KEY?: string;
  readonly EMAIL_API_KEY?: string;
  readonly EMAIL_FROM?: string;
  readonly BOOKINGS_NOTIFY_TO?: string;
  readonly BOOKING_DEPOSIT_PERCENT?: string;
  readonly HOLD_MINUTES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
