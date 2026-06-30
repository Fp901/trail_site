-- The Rooiberg Wander — document the intentional SECURITY DEFINER on unavailable_windows
--
-- Supabase's database linter flags `public.unavailable_windows` as a "Security Definer View".
-- That is INTENTIONAL and is the most locked-down option for our needs, not a vulnerability:
--   * The view exposes ONLY start_date / end_date — no PII (no names, emails, amounts).
--   * The anon role has NO direct access to `bookings` (RLS default-deny + REVOKE). This view is the
--     single, sanitised read path the availability calendar uses; definer behaviour is what lets
--     anon read those two date columns WITHOUT granting any direct access to the table.
--   * Switching to security_invoker would instead require granting anon a direct (row/column-limited)
--     read on `bookings`, i.e. a LARGER surface — so we deliberately keep the definer view.
-- The advisor finding is acknowledged and dismissed by design.

comment on view public.unavailable_windows is
  'Intentional SECURITY DEFINER gateway: exposes ONLY start_date/end_date (no PII) so the anon '
  'availability calendar can read date ranges without any direct access to bookings. Do not add '
  'PII columns here. Advisor "Security Definer View" is acknowledged by design.';
