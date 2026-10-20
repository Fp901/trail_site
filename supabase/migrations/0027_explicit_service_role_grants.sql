-- The Rooiberg Wander: explicit Data API grants on the public tables (October 2026)
--
-- WHY
--   From 30 October 2026 Supabase stops granting Data API access automatically to tables created
--   in the public schema. Existing tables keep their grants, so the live project is unaffected.
--   But any rebuild from these migrations after that date (a new project, a preview branch,
--   `supabase db reset`) would create the public tables with no grants at all, and every server
--   call would fail with "permission denied": service_role bypasses RLS, not table privileges.
--
--   0001 to 0020 only REVOKE from anon and authenticated (default-deny) and relied on the old
--   automatic grant for service_role. This migration makes that grant explicit, the same way the
--   marketing schema already does (0021).
--
-- WHAT
--   service_role (server only) gets select, insert, update, delete on six public tables, and only
--   select and insert on the two audit logs. admin_audit and payment_events are append-only by
--   design (0005, 0011) but nothing enforced it: the old automatic grant gave service_role update
--   and delete too. No code path updates or deletes either table, so a rebuilt database now
--   enforces append-only in the grants. (On the live project the old broader grant remains until
--   someone revokes it; this migration only adds.) Nothing is granted to anon or authenticated:
--   the tables stay default-deny for the browser. The one browser-readable object,
--   public.departure_inventory, already has its explicit grant to anon and authenticated (0019).
--
-- RULE FROM NOW ON
--   Every migration that creates a table in public grants it explicitly in the same file.
--
-- Additive and idempotent: on the live project these grants already exist, so this changes nothing.

grant select, insert, update, delete on public.bookings        to service_role;
grant select, insert, update, delete on public.inquiries       to service_role;
grant select, insert, update, delete on public.blocked_dates   to service_role;
grant select, insert, update, delete on public.pretrip_details to service_role;
grant select, insert, update, delete on public.rate_limits     to service_role;
grant select, insert                 on public.payment_events  to service_role;
grant select, insert                 on public.admin_audit     to service_role;
grant select, insert, update, delete on public.discount_codes  to service_role;
