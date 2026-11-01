-- The server-side manage-workshop function reads a workshop name before
-- deleting it. Keep this read privilege limited to the server-only role.
grant select on table public.workshops to service_role;
