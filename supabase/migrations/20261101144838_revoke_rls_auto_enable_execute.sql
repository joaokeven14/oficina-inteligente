-- The dashboard-created event trigger is used by PostgreSQL internally, not by
-- application clients. Remove its unnecessary RPC execute grants.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
