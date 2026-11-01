-- Tenant-isolated customer and vehicle records for the workshop workspace.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  document text,
  document_normalized text generated always as
    (nullif(regexp_replace(coalesce(document, ''), '[^0-9]', '', 'g'), '')) stored,
  phone text,
  whatsapp text,
  email text,
  address text,
  city text,
  state char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workshop_id),
  check (document_normalized is null or length(document_normalized) in (11, 14))
);

create unique index customers_workshop_document_unique
  on public.customers (workshop_id, document_normalized)
  where document_normalized is not null;
create index customers_workshop_name_idx
  on public.customers (workshop_id, full_name)
  where archived_at is null;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  customer_id uuid not null,
  make text not null check (length(trim(make)) between 1 and 80),
  model text not null check (length(trim(model)) between 1 and 120),
  year_manufacture integer check (year_manufacture is null or year_manufacture between 1886 and 2100),
  model_year integer check (model_year is null or model_year between 1886 and 2100),
  plate text not null,
  plate_normalized text generated always as
    (upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))) stored,
  color text,
  mileage_km integer check (mileage_km is null or mileage_km >= 0),
  fuel text check (fuel is null or fuel in ('gasoline', 'ethanol', 'flex', 'diesel', 'natural_gas', 'electric', 'hybrid', 'other')),
  chassis text,
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, workshop_id)
    references public.customers (id, workshop_id) on delete restrict,
  unique (id, workshop_id, customer_id),
  check (length(plate_normalized) = 7)
);

create unique index vehicles_workshop_plate_unique
  on public.vehicles (workshop_id, plate_normalized)
  where archived_at is null;
create index vehicles_workshop_customer_idx
  on public.vehicles (workshop_id, customer_id)
  where archived_at is null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create function private.record_workshop_data_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_id uuid;
  record_workshop_id uuid;
begin
  if tg_op = 'DELETE' then
    record_id := old.id;
    record_workshop_id := old.workshop_id;
  else
    record_id := new.id;
    record_workshop_id := new.workshop_id;
  end if;

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (
    record_workshop_id,
    (select auth.uid()),
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    record_id::text
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger customers_audit_change
  after insert or update or delete on public.customers
  for each row execute function private.record_workshop_data_change();
create trigger vehicles_audit_change
  after insert or update or delete on public.vehicles
  for each row execute function private.record_workshop_data_change();

alter table public.customers enable row level security;
alter table public.vehicles enable row level security;

create policy customers_read_with_permission on public.customers
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'clients', 'view')));
create policy customers_create_with_permission on public.customers
  for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'clients', 'create')));
create policy customers_update_with_permission on public.customers
  for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'clients', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'clients', 'update')));

create policy vehicles_read_with_permission on public.vehicles
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'vehicles', 'view')));
create policy vehicles_create_with_permission on public.vehicles
  for insert to authenticated
  with check (
    (select private.has_workshop_permission(workshop_id, 'vehicles', 'create'))
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.workshop_id = vehicles.workshop_id
    )
  );
create policy vehicles_update_with_permission on public.vehicles
  for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'vehicles', 'update')))
  with check (
    (select private.has_workshop_permission(workshop_id, 'vehicles', 'update'))
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.workshop_id = vehicles.workshop_id
    )
  );

create function public.get_workshop_permissions(target_workshop_id uuid)
returns table (
  module text,
  can_view boolean,
  can_create boolean,
  can_update boolean,
  can_delete boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select requested.module,
    private.has_workshop_permission(target_workshop_id, requested.module, 'view'),
    private.has_workshop_permission(target_workshop_id, requested.module, 'create'),
    private.has_workshop_permission(target_workshop_id, requested.module, 'update'),
    private.has_workshop_permission(target_workshop_id, requested.module, 'delete')
  from (values ('clients'), ('vehicles'), ('service_orders')) as requested(module)
  where private.is_active_workshop_member(target_workshop_id);
$$;

revoke all on public.customers, public.vehicles from public, anon, authenticated;
grant select, insert, update on public.customers, public.vehicles to authenticated;
revoke all on function private.record_workshop_data_change() from public, anon, authenticated;
revoke all on function public.get_workshop_permissions(uuid) from public, anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;

comment on table public.customers is
  'Workshop-owned customer records. Tenant access is enforced by RLS; records are archived rather than hard-deleted.';
comment on table public.vehicles is
  'Workshop-owned vehicles linked to a customer in the same tenant by a composite foreign key.';
