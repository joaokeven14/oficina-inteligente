-- Core identity, tenant isolation, and server-managed platform administration.
-- This migration is designed for Supabase PostgreSQL. It has not been applied
-- to any remote project.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'blocked')),
  blocked_at timestamptz,
  blocked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'blocked') = (blocked_at is not null))
);

create table public.workshop_memberships (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (workshop_id, user_id),
  unique (id, workshop_id)
);

create table public.workshop_member_permissions (
  membership_id uuid not null,
  workshop_id uuid not null,
  module text not null check (module in (
    'dashboard', 'clients', 'vehicles', 'service_orders', 'estimates',
    'inventory', 'finance', 'reports', 'employees', 'settings'
  )),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  primary key (membership_id, module),
  foreign key (membership_id, workshop_id)
    references public.workshop_memberships (id, workshop_id) on delete cascade
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workshop_id uuid references public.workshops (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  entity text not null check (length(entity) between 1 and 80),
  entity_id text,
  created_at timestamptz not null default now()
);

create schema private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index workshop_memberships_user_idx
  on public.workshop_memberships (user_id, status, workshop_id);
create index workshop_member_permissions_workshop_idx
  on public.workshop_member_permissions (workshop_id, membership_id);
create index audit_events_workshop_created_idx
  on public.audit_events (workshop_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger workshops_set_updated_at
  before update on public.workshops
  for each row execute function public.set_updated_at();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = (select auth.uid())
      and a.active
  );
$$;

create function private.is_active_workshop_member(target_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_memberships m
    join public.workshops w on w.id = m.workshop_id
    where m.workshop_id = target_workshop_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and w.status = 'active'
  );
$$;

create function private.has_workshop_permission(
  target_workshop_id uuid,
  target_module text,
  requested_action text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_memberships m
    join public.workshops w on w.id = m.workshop_id
    left join public.workshop_member_permissions p
      on p.membership_id = m.id and p.module = target_module
    where m.workshop_id = target_workshop_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and w.status = 'active'
      and requested_action in ('view', 'create', 'update', 'delete')
      and (
        m.role = 'owner'
        or case requested_action
          when 'view' then coalesce(p.can_view, false)
          when 'create' then coalesce(p.can_create, false)
          when 'update' then coalesce(p.can_update, false)
          when 'delete' then coalesce(p.can_delete, false)
          else false
        end
      )
  );
$$;

create function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_memberships actor
    join public.workshop_memberships subject on subject.workshop_id = actor.workshop_id
    join public.workshops w on w.id = actor.workshop_id
    where actor.user_id = (select auth.uid())
      and subject.user_id = target_user_id
      and actor.status = 'active'
      and subject.status = 'active'
      and w.status = 'active'
      and (
        actor.role = 'owner'
        or private.has_workshop_permission(w.id, 'employees', 'view')
      )
  );
$$;

create function private.admin_create_workshop(
  workshop_name text,
  owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_workshop_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if workshop_name is null or length(trim(workshop_name)) not between 2 and 160 then
    raise exception 'invalid workshop name' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = owner_user_id) then
    raise exception 'owner account does not exist' using errcode = '22023';
  end if;

  insert into public.workshops (name) values (trim(workshop_name))
  returning id into created_workshop_id;

  insert into public.workshop_memberships (workshop_id, user_id, role)
  values (created_workshop_id, owner_user_id, 'owner');

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (created_workshop_id, (select auth.uid()), 'workshop.created', 'workshops', created_workshop_id::text);

  return created_workshop_id;
end;
$$;

create function private.admin_set_workshop_status(
  target_workshop_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if next_status not in ('active', 'blocked') then
    raise exception 'invalid workshop status' using errcode = '22023';
  end if;

  update public.workshops
  set status = next_status,
      blocked_at = case when next_status = 'blocked' then now() else null end,
      blocked_by = case when next_status = 'blocked' then (select auth.uid()) else null end
  where id = target_workshop_id;

  if not found then
    raise exception 'workshop not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (target_workshop_id, (select auth.uid()), 'workshop.status_changed', 'workshops', target_workshop_id::text);
end;
$$;

-- RPC entry points contain no elevated database logic themselves. They delegate
-- to private, permission-checking SECURITY DEFINER functions.
create function public.admin_create_workshop(workshop_name text, owner_user_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.admin_create_workshop(workshop_name, owner_user_id);
$$;

create function public.admin_set_workshop_status(target_workshop_id uuid, next_status text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_set_workshop_status(target_workshop_id, next_status);
$$;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.workshops enable row level security;
alter table public.workshop_memberships enable row level security;
alter table public.workshop_member_permissions enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_self_or_platform_admin
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
    or (select private.can_view_profile(user_id))
  );
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy platform_admins_read_self
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy workshops_read_member_or_admin
  on public.workshops for select to authenticated
  using (
    (select private.is_active_workshop_member(id))
    or (select private.is_platform_admin())
  );
create policy memberships_read_active_member_or_admin
  on public.workshop_memberships for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (select private.is_active_workshop_member(workshop_id))
    )
    or (select private.has_workshop_permission(workshop_id, 'employees', 'view'))
    or (select private.is_platform_admin())
  );
create policy memberships_create_by_owner
  on public.workshop_memberships for insert to authenticated
  with check (
    (select private.has_workshop_permission(workshop_id, 'employees', 'create'))
    and role = 'staff'
  );
create policy memberships_update_by_owner
  on public.workshop_memberships for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'employees', 'update')))
  with check (
    (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    and role = 'staff'
  );
create policy memberships_delete_by_owner
  on public.workshop_memberships for delete to authenticated
  using (
    role = 'staff'
    and (select private.has_workshop_permission(workshop_id, 'employees', 'delete'))
  );

create policy member_permissions_read_member_or_admin
  on public.workshop_member_permissions for select to authenticated
  using (
    exists (
      select 1
      from public.workshop_memberships m
      where m.id = membership_id
        and m.user_id = (select auth.uid())
        and (select private.is_active_workshop_member(workshop_id))
    )
    or (select private.has_workshop_permission(workshop_id, 'employees', 'view'))
    or (select private.is_platform_admin())
  );
create policy member_permissions_manage_by_owner
  on public.workshop_member_permissions for all to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'employees', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'employees', 'update')));

create policy audit_events_read_by_owner_or_admin
  on public.audit_events for select to authenticated
  using (
    (workshop_id is not null and (select private.has_workshop_permission(workshop_id, 'settings', 'view')))
    or (select private.is_platform_admin())
  );

revoke all on public.profiles, public.platform_admins, public.workshops,
  public.workshop_memberships, public.workshop_member_permissions,
  public.audit_events from public, anon, authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.workshops to authenticated;
grant select, insert, update, delete on public.workshop_memberships to authenticated;
grant select, insert, update, delete on public.workshop_member_permissions to authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.is_active_workshop_member(uuid) from public, anon;
revoke all on function private.has_workshop_permission(uuid, text, text) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
revoke all on function private.admin_create_workshop(text, uuid) from public, anon;
revoke all on function private.admin_set_workshop_status(uuid, text) from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_active_workshop_member(uuid) to authenticated;
grant execute on function private.has_workshop_permission(uuid, text, text) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.admin_create_workshop(text, uuid) to authenticated;
grant execute on function private.admin_set_workshop_status(uuid, text) to authenticated;
revoke all on function public.admin_create_workshop(text, uuid) from public, anon;
revoke all on function public.admin_set_workshop_status(uuid, text) from public, anon;
grant execute on function public.admin_create_workshop(text, uuid) to authenticated;
grant execute on function public.admin_set_workshop_status(uuid, text) to authenticated;

comment on table public.platform_admins is
  'Platform administrators are provisioned out of band by a trusted operator. There is no public self-registration path.';
comment on table public.audit_events is
  'Metadata-only audit trail. Do not store passwords, tokens, signatures, or complete personal records here.';
