alter table public.workshops add column logo_path text;

-- Private object buckets and signed upload/download URLs are managed by the
-- authenticated Edge Function; Storage's internal tables remain platform-owned.

create function private.set_workshop_logo_path(target_workshop uuid,target_path text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_workshop_permission(target_workshop,'settings','update') or not exists(
    select 1 from public.workshop_memberships where workshop_id=target_workshop and user_id=auth.uid() and role='owner' and status='active'
  ) then raise exception 'active workshop owner access required' using errcode='42501'; end if;
  if target_path is not null and target_path !~ ('^'||target_workshop::text||'/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'invalid workshop logo path' using errcode='22023';
  end if;
  update public.workshops set logo_path=target_path where id=target_workshop;
  if not found then raise exception 'workshop not found' using errcode='P0002'; end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'workshop.logo_updated','workshops',target_workshop::text);
end $$;
create function public.set_workshop_logo_path(target_workshop uuid,target_path text)
returns void language sql security invoker set search_path='' as $$ select private.set_workshop_logo_path(target_workshop,target_path) $$;
revoke all on function private.set_workshop_logo_path(uuid,text) from public,anon,authenticated;
grant execute on function private.set_workshop_logo_path(uuid,text) to authenticated;
revoke all on function public.set_workshop_logo_path(uuid,text) from public,anon;
grant execute on function public.set_workshop_logo_path(uuid,text) to authenticated;
