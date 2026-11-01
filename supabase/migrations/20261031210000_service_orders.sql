-- Service orders and line items. Monetary totals are recalculated in PostgreSQL.
create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  order_number bigint generated always as identity,
  customer_id uuid not null,
  vehicle_id uuid not null,
  assigned_membership_id uuid,
  status text not null default 'open' check (status in (
    'open', 'diagnosis', 'awaiting_approval', 'awaiting_parts',
    'in_progress', 'completed', 'delivered', 'canceled'
  )),
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  complaint text not null check (length(trim(complaint)) between 1 and 4000),
  diagnosis text not null default '',
  notes text not null default '',
  items_subtotal numeric(14,2) not null default 0 check (items_subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, order_number),
  unique (id, workshop_id),
  foreign key (customer_id, workshop_id)
    references public.customers (id, workshop_id) on delete restrict,
  foreign key (vehicle_id, workshop_id, customer_id)
    references public.vehicles (id, workshop_id, customer_id) on delete restrict,
  foreign key (assigned_membership_id, workshop_id)
    references public.workshop_memberships (id, workshop_id) on delete set null (assigned_membership_id)
);

create table public.service_order_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  service_order_id uuid not null,
  item_type text not null check (item_type in ('part', 'labor')),
  description text not null check (length(trim(description)) between 1 and 240),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  unique (id, workshop_id),
  foreign key (service_order_id, workshop_id)
    references public.service_orders (id, workshop_id) on delete cascade
);

create index service_orders_workshop_opened_idx
  on public.service_orders (workshop_id, opened_at desc);
create index service_orders_workshop_status_idx
  on public.service_orders (workshop_id, status, opened_at desc);
create index service_orders_workshop_customer_idx
  on public.service_orders (workshop_id, customer_id, opened_at desc);
create index service_orders_workshop_vehicle_idx
  on public.service_orders (workshop_id, vehicle_id, opened_at desc);
create index service_order_items_order_idx
  on public.service_order_items (workshop_id, service_order_id, created_at);

create function private.prepare_service_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.total_amount := greatest(new.items_subtotal - new.discount, 0);
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create trigger service_orders_prepare
  before insert or update on public.service_orders
  for each row execute function private.prepare_service_order();
create trigger service_orders_set_updated_at
  before update on public.service_orders
  for each row execute function public.set_updated_at();

create function private.recalculate_service_order_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  target_workshop_id uuid;
begin
  if tg_op = 'DELETE' then
    target_order_id := old.service_order_id;
    target_workshop_id := old.workshop_id;
  else
    target_order_id := new.service_order_id;
    target_workshop_id := new.workshop_id;
  end if;

  update public.service_orders o
  set items_subtotal = coalesce((
    select sum(i.line_total)
    from public.service_order_items i
    where i.service_order_id = target_order_id and i.workshop_id = target_workshop_id
  ), 0)
  where o.id = target_order_id and o.workshop_id = target_workshop_id;

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (
    target_workshop_id,
    (select auth.uid()),
    'service_order_items.' || lower(tg_op),
    'service_order_items',
    case when tg_op = 'DELETE' then old.id::text else new.id::text end
  );
  return null;
end;
$$;

create trigger service_order_items_recalculate
  after insert or update or delete on public.service_order_items
  for each row execute function private.recalculate_service_order_amounts();

create trigger service_orders_audit_change
  after insert or update on public.service_orders
  for each row execute function private.record_workshop_data_change();

alter table public.service_orders enable row level security;
alter table public.service_order_items enable row level security;

create policy service_orders_read_with_permission on public.service_orders
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'service_orders', 'view')));
create policy service_orders_create_with_permission on public.service_orders
  for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'service_orders', 'create')));
create policy service_orders_update_with_permission on public.service_orders
  for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'service_orders', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'service_orders', 'update')));

create policy service_order_items_read_with_permission on public.service_order_items
  for select to authenticated
  using (
    (select private.has_workshop_permission(workshop_id, 'service_orders', 'view'))
    and exists (
      select 1 from public.service_orders o
      where o.id = service_order_id and o.workshop_id = service_order_items.workshop_id
    )
  );
create policy service_order_items_create_with_permission on public.service_order_items
  for insert to authenticated
  with check (
    (select private.has_workshop_permission(workshop_id, 'service_orders', 'create'))
    and exists (
      select 1 from public.service_orders o
      where o.id = service_order_id and o.workshop_id = service_order_items.workshop_id
    )
  );
create policy service_order_items_update_with_permission on public.service_order_items
  for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'service_orders', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'service_orders', 'update')));
create policy service_order_items_delete_with_permission on public.service_order_items
  for delete to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'service_orders', 'delete')));

revoke all on public.service_orders, public.service_order_items from public, anon, authenticated;
grant select on public.service_orders, public.service_order_items to authenticated;
grant insert (workshop_id, customer_id, vehicle_id, assigned_membership_id, status, odometer_km, complaint, diagnosis, notes, discount)
  on public.service_orders to authenticated;
grant update (customer_id, vehicle_id, assigned_membership_id, status, odometer_km, complaint, diagnosis, notes, discount)
  on public.service_orders to authenticated;
grant insert (workshop_id, service_order_id, item_type, description, quantity, unit_price)
  on public.service_order_items to authenticated;
grant update (item_type, description, quantity, unit_price)
  on public.service_order_items to authenticated;
grant delete on public.service_order_items to authenticated;

revoke all on function private.prepare_service_order() from public, anon, authenticated;
revoke all on function private.recalculate_service_order_amounts() from public, anon, authenticated;

comment on table public.service_orders is
  'Workshop-owned service orders. Totals and order numbers are database-managed; operational access is enforced by RLS.';
comment on table public.service_order_items is
  'Workshop-owned labor and part lines with database-calculated line totals.';
