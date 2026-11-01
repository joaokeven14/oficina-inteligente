-- Inventory products and atomic stock ledger. A movement and stock balance
-- update happen in one transaction through a permission-checked RPC.
create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 180),
  code text,
  code_normalized text generated always as (nullif(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), '')) stored,
  category text,
  brand text,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  location text,
  notes text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workshop_id)
);

create unique index inventory_products_workshop_code_unique
  on public.inventory_products (workshop_id, code_normalized)
  where code_normalized is not null;
create index inventory_products_workshop_name_idx
  on public.inventory_products (workshop_id, name)
  where archived_at is null;
create index inventory_products_low_stock_idx
  on public.inventory_products (workshop_id, quantity, minimum_quantity)
  where archived_at is null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  product_id uuid not null,
  direction text not null check (direction in ('entry', 'exit')),
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null check (reason in ('manual', 'purchase', 'service_order', 'adjustment')),
  service_order_id uuid,
  note text,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, workshop_id)
    references public.inventory_products (id, workshop_id) on delete restrict,
  foreign key (service_order_id, workshop_id)
    references public.service_orders (id, workshop_id) on delete restrict,
  check ((reason = 'service_order') = (service_order_id is not null))
);

create index inventory_movements_product_created_idx
  on public.inventory_movements (workshop_id, product_id, created_at desc);

create trigger inventory_products_set_updated_at
  before update on public.inventory_products
  for each row execute function public.set_updated_at();
create trigger inventory_products_audit_change
  after insert or update on public.inventory_products
  for each row execute function private.record_workshop_data_change();

create function private.record_inventory_movement(
  target_workshop_id uuid,
  target_product_id uuid,
  requested_direction text,
  requested_quantity numeric,
  requested_reason text,
  requested_service_order_id uuid,
  requested_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_quantity numeric(14,3);
  created_movement_id uuid;
begin
  if not private.has_workshop_permission(target_workshop_id, 'inventory', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if requested_direction not in ('entry', 'exit')
    or requested_reason not in ('manual', 'purchase', 'service_order', 'adjustment')
    or requested_quantity is null or requested_quantity <= 0 then
    raise exception 'invalid inventory movement' using errcode = '22023';
  end if;
  if (requested_reason = 'service_order') <> (requested_service_order_id is not null) then
    raise exception 'invalid service order reference' using errcode = '22023';
  end if;

  select p.quantity into current_quantity
  from public.inventory_products p
  where p.id = target_product_id
    and p.workshop_id = target_workshop_id
    and p.archived_at is null
  for update;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if requested_direction = 'exit' and current_quantity < requested_quantity then
    raise exception 'insufficient stock' using errcode = '23514';
  end if;
  if requested_service_order_id is not null and not exists (
    select 1 from public.service_orders o
    where o.id = requested_service_order_id
      and o.workshop_id = target_workshop_id
      and o.status <> 'canceled'
  ) then
    raise exception 'service order not found' using errcode = '23503';
  end if;

  insert into public.inventory_movements (
    workshop_id, product_id, direction, quantity, reason,
    service_order_id, note, actor_id
  ) values (
    target_workshop_id, target_product_id, requested_direction, requested_quantity, requested_reason,
    requested_service_order_id, nullif(trim(requested_note), ''), (select auth.uid())
  ) returning id into created_movement_id;

  update public.inventory_products
  set quantity = case requested_direction
    when 'entry' then quantity + requested_quantity
    else quantity - requested_quantity
  end
  where id = target_product_id and workshop_id = target_workshop_id;

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (target_workshop_id, (select auth.uid()), 'inventory.movement.' || requested_direction, 'inventory_movements', created_movement_id::text);

  return created_movement_id;
end;
$$;

create function public.record_inventory_movement(
  target_workshop_id uuid,
  target_product_id uuid,
  requested_direction text,
  requested_quantity numeric,
  requested_reason text default 'manual',
  requested_service_order_id uuid default null,
  requested_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_inventory_movement(
    target_workshop_id, target_product_id, requested_direction,
    requested_quantity, requested_reason, requested_service_order_id, requested_note
  );
$$;

alter table public.inventory_products enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_products_read_with_permission on public.inventory_products
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'inventory', 'view')));
create policy inventory_products_create_with_permission on public.inventory_products
  for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'inventory', 'create')));
create policy inventory_products_update_with_permission on public.inventory_products
  for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'inventory', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'inventory', 'update')));
create policy inventory_movements_read_with_permission on public.inventory_movements
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'inventory', 'view')));

revoke all on public.inventory_products, public.inventory_movements from public, anon, authenticated;
grant select on public.inventory_products, public.inventory_movements to authenticated;
grant insert (workshop_id, name, code, category, brand, minimum_quantity, cost_price, sale_price, location, notes)
  on public.inventory_products to authenticated;
grant update (name, code, category, brand, minimum_quantity, cost_price, sale_price, location, notes, archived_at)
  on public.inventory_products to authenticated;
revoke all on function private.record_inventory_movement(uuid, uuid, text, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function private.record_inventory_movement(uuid, uuid, text, numeric, text, uuid, text) to authenticated;
revoke all on function public.record_inventory_movement(uuid, uuid, text, numeric, text, uuid, text) from public, anon;
grant execute on function public.record_inventory_movement(uuid, uuid, text, numeric, text, uuid, text) to authenticated;

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
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
  from (values ('clients'), ('vehicles'), ('service_orders'), ('inventory')) as requested(module)
  where private.is_active_workshop_member(target_workshop_id);
$$;

comment on table public.inventory_products is
  'Workshop-owned product catalog. Quantity is updated only through an atomic stock movement RPC.';
comment on table public.inventory_movements is
  'Append-only stock ledger; clients can read but cannot directly insert, update, or delete movements.';
