create table private.workshop_deletion_cleanup_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table private.workshop_deletion_cleanup_members (
  batch_id uuid not null references private.workshop_deletion_cleanup_batches(id) on delete cascade,
  user_id uuid not null,
  primary key (batch_id, user_id)
);

revoke all on table private.workshop_deletion_cleanup_batches from public, anon, authenticated;
revoke all on table private.workshop_deletion_cleanup_members from public, anon, authenticated;

drop function public.admin_delete_workshop(uuid, text);
drop function private.admin_delete_workshop(uuid, text);

create function private.admin_delete_workshop(
  target_workshop_id uuid,
  confirmation_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_name text;
  cleanup_batch_id uuid;
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

  insert into private.workshop_deletion_cleanup_batches(requested_by)
  values ((select auth.uid()))
  returning id into cleanup_batch_id;

  insert into private.workshop_deletion_cleanup_members(batch_id, user_id)
  select cleanup_batch_id, wm.user_id
  from public.workshop_memberships wm
  where wm.workshop_id = target_workshop_id
  on conflict do nothing;

  delete from public.workshops where id = target_workshop_id;
  return cleanup_batch_id;
end;
$$;

create function public.admin_delete_workshop(target_workshop_id uuid, confirmation_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.admin_delete_workshop(target_workshop_id, confirmation_name);
$$;

create function private.admin_finalize_workshop_account_cleanup(target_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  released_accounts integer := 0;
  preserved_linked_accounts integer := 0;
  preserved_storage_accounts integer := 0;
  deleted_rows integer;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.workshop_deletion_cleanup_batches b where b.id = target_batch_id
  ) then
    raise exception 'cleanup batch not found' using errcode = 'P0002';
  end if;

  for candidate in
    select u.id
    from auth.users u
    join private.workshop_deletion_cleanup_members m on m.user_id = u.id
    where m.batch_id = target_batch_id
    order by u.id
    for update of u
  loop
    if exists (
      select 1 from public.workshop_memberships wm where wm.user_id = candidate.id
    ) or exists (
      select 1 from public.platform_admins pa where pa.user_id = candidate.id
    ) then
      preserved_linked_accounts := preserved_linked_accounts + 1;
    elsif exists (
      select 1
      from storage.objects o
      where o.owner = candidate.id or o.owner_id = candidate.id::text
    ) then
      preserved_storage_accounts := preserved_storage_accounts + 1;
    else
      delete from auth.users u where u.id = candidate.id;
      get diagnostics deleted_rows = row_count;
      released_accounts := released_accounts + deleted_rows;
    end if;
  end loop;

  delete from private.workshop_deletion_cleanup_batches where id = target_batch_id;

  return jsonb_build_object(
    'released_accounts', released_accounts,
    'preserved_linked_accounts', preserved_linked_accounts,
    'preserved_storage_accounts', preserved_storage_accounts
  );
end;
$$;

create function public.admin_finalize_workshop_account_cleanup(target_batch_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_finalize_workshop_account_cleanup(target_batch_id);
$$;

revoke all on function private.admin_delete_workshop(uuid, text) from public, anon;
grant execute on function private.admin_delete_workshop(uuid, text) to authenticated;
revoke all on function public.admin_delete_workshop(uuid, text) from public, anon;
grant execute on function public.admin_delete_workshop(uuid, text) to authenticated;

revoke all on function private.admin_finalize_workshop_account_cleanup(uuid) from public, anon;
grant execute on function private.admin_finalize_workshop_account_cleanup(uuid) to authenticated;
revoke all on function public.admin_finalize_workshop_account_cleanup(uuid) from public, anon;
grant execute on function public.admin_finalize_workshop_account_cleanup(uuid) to authenticated;
