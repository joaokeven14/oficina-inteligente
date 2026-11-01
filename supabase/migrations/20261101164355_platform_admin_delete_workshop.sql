create function private.admin_delete_workshop(
  target_workshop_id uuid,
  confirmation_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_name text;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select w.name into target_name
  from public.workshops w
  where w.id = target_workshop_id
  for update;

  if not found then
    raise exception 'workshop not found' using errcode = 'P0002';
  end if;
  if confirmation_name is distinct from target_name then
    raise exception 'confirmation name does not match' using errcode = '22023';
  end if;

  insert into public.audit_events(workshop_id, actor_id, action, entity, entity_id)
  values (
    null,
    (select auth.uid()),
    'workshop.deleted',
    'workshops',
    target_workshop_id::text
  );

  delete from public.workshops where id = target_workshop_id;
end;
$$;

create function public.admin_delete_workshop(target_workshop_id uuid, confirmation_name text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_delete_workshop(target_workshop_id, confirmation_name);
$$;

revoke all on function private.admin_delete_workshop(uuid, text) from public, anon;
grant execute on function private.admin_delete_workshop(uuid, text) to authenticated;
revoke all on function public.admin_delete_workshop(uuid, text) from public, anon;
grant execute on function public.admin_delete_workshop(uuid, text) to authenticated;
