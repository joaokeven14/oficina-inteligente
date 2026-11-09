-- Checklist signatures keep an immutable copy of the inspected items and the customer's decision.
create table public.service_order_checklist_signatures (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  service_order_id uuid not null,
  customer_id uuid not null,
  customer_decision text not null check (customer_decision in ('authorized', 'not_authorized')),
  signer_name text not null check (length(trim(signer_name)) between 2 and 180),
  statement text not null check (length(trim(statement)) between 5 and 2000),
  checklist_snapshot jsonb not null check (
    jsonb_typeof(checklist_snapshot) = 'array'
    and jsonb_array_length(checklist_snapshot) between 1 and 80
    and pg_column_size(checklist_snapshot) <= 500000
  ),
  signature_strokes jsonb not null check (
    private.valid_signature_strokes(signature_strokes)
    and pg_column_size(signature_strokes) <= 100000
  ),
  signed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  signed_at timestamptz not null default clock_timestamp(),
  unique (id, workshop_id),
  foreign key (service_order_id, workshop_id)
    references public.service_orders(id, workshop_id) on delete restrict,
  foreign key (customer_id, workshop_id)
    references public.customers(id, workshop_id) on delete restrict
);

create index service_order_checklist_signatures_order_signed_idx
  on public.service_order_checklist_signatures (service_order_id, workshop_id, signed_at desc);
create index service_order_checklist_signatures_customer_idx
  on public.service_order_checklist_signatures (customer_id, workshop_id);
create index service_order_checklist_signatures_signed_by_idx
  on public.service_order_checklist_signatures (signed_by);

alter table public.service_order_checklist_signatures enable row level security;
revoke all on public.service_order_checklist_signatures from public, anon, authenticated;
grant select, insert on public.service_order_checklist_signatures to authenticated;

create policy service_order_checklist_signatures_read
  on public.service_order_checklist_signatures for select to authenticated
  using (private.has_workshop_permission(workshop_id, 'service_orders', 'view'));
create policy service_order_checklist_signatures_create
  on public.service_order_checklist_signatures for insert to authenticated
  with check (
    private.has_workshop_permission(workshop_id, 'service_orders', 'update')
    and signed_by = (select auth.uid())
    and exists (
      select 1 from public.service_orders o
      where o.id = service_order_checklist_signatures.service_order_id
        and o.workshop_id = service_order_checklist_signatures.workshop_id
        and o.customer_id = service_order_checklist_signatures.customer_id
        and o.status <> 'canceled'
    )
  );

create function private.stamp_service_order_checklist_signature()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  new.signed_by := (select auth.uid());
  new.signed_at := clock_timestamp();
  return new;
end $$;
create trigger service_order_checklist_signature_stamp
before insert on public.service_order_checklist_signatures
for each row execute function private.stamp_service_order_checklist_signature();
revoke all on function private.stamp_service_order_checklist_signature() from public, anon, authenticated;

create trigger service_order_checklist_signature_audit
after insert on public.service_order_checklist_signatures
for each row execute function private.record_workshop_data_change();

-- A narrowly scoped lookup exposes only sale details for in-stock items inside an OS.
create function public.list_service_order_stock_products(target_workshop_id uuid)
returns table (
  id uuid,
  workshop_id uuid,
  name text,
  code text,
  category text,
  brand text,
  quantity numeric,
  sale_price numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not private.has_workshop_permission(target_workshop_id, 'service_orders', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select p.id, p.workshop_id, p.name, p.code, p.category, p.brand, p.quantity, p.sale_price
  from public.inventory_products p
  where p.workshop_id = target_workshop_id
    and p.archived_at is null
    and p.quantity > 0
  order by p.name, p.id
  limit 1000;
end $$;
revoke all on function public.list_service_order_stock_products(uuid) from public, anon, authenticated;
grant execute on function public.list_service_order_stock_products(uuid) to authenticated;

-- OS-linked movements use the OS permission that authorizes the item change.
-- The public manual inventory RPC continues to require inventory.create.
create function private.record_service_order_stock_movement(
  target_workshop_id uuid,
  target_product_id uuid,
  requested_direction text,
  requested_quantity numeric,
  target_service_order_id uuid,
  required_service_order_permission text,
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
  if (select auth.uid()) is null
    or required_service_order_permission not in ('create', 'update', 'delete')
    or not private.has_workshop_permission(target_workshop_id, 'service_orders', required_service_order_permission) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if requested_direction not in ('entry', 'exit') or requested_quantity is null or requested_quantity <= 0 then
    raise exception 'invalid inventory movement' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.service_orders o
    where o.id = target_service_order_id and o.workshop_id = target_workshop_id
  ) then
    raise exception 'service order not found' using errcode = '23503';
  end if;
  if requested_direction = 'exit' and exists (
    select 1 from public.service_orders o
    where o.id = target_service_order_id and o.workshop_id = target_workshop_id and o.status = 'canceled'
  ) then
    raise exception 'cannot deduct stock for a canceled service order' using errcode = '55000';
  end if;

  select p.quantity into current_quantity
  from public.inventory_products p
  where p.id = target_product_id and p.workshop_id = target_workshop_id and p.archived_at is null
  for update;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if requested_direction = 'exit' and current_quantity < requested_quantity then
    raise exception 'insufficient stock' using errcode = '23514';
  end if;

  insert into public.inventory_movements (
    workshop_id, product_id, direction, quantity, reason,
    service_order_id, note, actor_id
  ) values (
    target_workshop_id, target_product_id, requested_direction, requested_quantity, 'service_order',
    target_service_order_id, nullif(trim(requested_note), ''), (select auth.uid())
  ) returning id into created_movement_id;

  update public.inventory_products
  set quantity = case requested_direction when 'entry' then quantity + requested_quantity else quantity - requested_quantity end
  where id = target_product_id and workshop_id = target_workshop_id;

  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (target_workshop_id, (select auth.uid()), 'inventory.movement.' || requested_direction, 'inventory_movements', created_movement_id::text);
  return created_movement_id;
end $$;
revoke all on function private.record_service_order_stock_movement(uuid, uuid, text, numeric, uuid, text, text) from public, anon, authenticated;

create or replace function private.sync_service_order_item_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_order uuid;
  target_workshop uuid;
  order_status text;
  permission_action text;
begin
  target_order := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;
  target_workshop := case when tg_op = 'DELETE' then old.workshop_id else new.workshop_id end;
  permission_action := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
  select o.status into order_status from public.service_orders o where o.id = target_order and o.workshop_id = target_workshop;
  if order_status is null then raise exception 'service order not found' using errcode = '23503'; end if;
  if tg_op <> 'DELETE' and order_status = 'canceled' then
    raise exception 'cannot add items to a canceled service order' using errcode = '55000';
  end if;

  if tg_op in ('DELETE', 'UPDATE') and old.inventory_product_id is not null and order_status <> 'canceled' then
    perform private.record_service_order_stock_movement(
      old.workshop_id, old.inventory_product_id, 'entry', old.quantity, old.service_order_id,
      permission_action, 'Estorno de item removido ou alterado da OS'
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.inventory_product_id is not null then
    perform private.record_service_order_stock_movement(
      new.workshop_id, new.inventory_product_id, 'exit', new.quantity, new.service_order_id,
      permission_action, 'Baixa automática da OS'
    );
  end if;
  return null;
end $$;
revoke all on function private.sync_service_order_item_stock() from public, anon, authenticated;

create or replace function private.reverse_or_restore_order_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  i record;
  direction text;
begin
  if old.status is not distinct from new.status then return null; end if;
  if new.status = 'canceled' then direction := 'entry';
  elsif old.status = 'canceled' then direction := 'exit';
  else return null;
  end if;

  for i in
    select inventory_product_id, quantity from public.service_order_items
    where service_order_id = new.id and workshop_id = new.workshop_id and inventory_product_id is not null
  loop
    perform private.record_service_order_stock_movement(
      new.workshop_id, i.inventory_product_id, direction, i.quantity, new.id,
      'update', case when direction = 'entry' then 'Estorno automático por cancelamento da OS' else 'Restauração da OS após reabertura' end
    );
  end loop;
  return null;
end $$;
revoke all on function private.reverse_or_restore_order_stock() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_order_checklist_signatures'
  ) then
    execute 'alter publication supabase_realtime add table public.service_order_checklist_signatures';
  end if;
end $$;
