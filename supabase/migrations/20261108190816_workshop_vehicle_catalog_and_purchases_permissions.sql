alter table public.vehicles
  add column vehicle_type text not null default 'cars',
  add constraint vehicles_vehicle_type_check check (vehicle_type in ('cars', 'motorcycles', 'trucks'));

alter table public.workshop_member_permissions
  drop constraint workshop_member_permissions_module_check;
alter table public.workshop_member_permissions
  add constraint workshop_member_permissions_module_check
  check (module in (
    'dashboard', 'clients', 'vehicles', 'service_orders', 'estimates',
    'inventory', 'purchases', 'finance', 'reports', 'employees', 'settings'
  ));

drop policy member_permissions_manage_by_owner on public.workshop_member_permissions;
create policy member_permissions_insert_by_owner
  on public.workshop_member_permissions for insert to authenticated
  with check ((select private.is_workshop_owner(workshop_id)));
create policy member_permissions_update_by_owner
  on public.workshop_member_permissions for update to authenticated
  using ((select private.is_workshop_owner(workshop_id)))
  with check ((select private.is_workshop_owner(workshop_id)));
create policy member_permissions_delete_by_owner
  on public.workshop_member_permissions for delete to authenticated
  using ((select private.is_workshop_owner(workshop_id)));

drop policy suppliers_read on public.suppliers;
drop policy suppliers_create on public.suppliers;
drop policy suppliers_update on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'purchases', 'view')));
create policy suppliers_create on public.suppliers for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'purchases', 'create')));
create policy suppliers_update on public.suppliers for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'purchases', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'purchases', 'update')));

drop policy purchases_read on public.purchases;
drop policy purchases_create on public.purchases;
create policy purchases_read on public.purchases for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'purchases', 'view')));
create policy purchases_create on public.purchases for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'purchases', 'create')));

drop policy purchase_items_read on public.purchase_items;
drop policy purchase_items_create on public.purchase_items;
create policy purchase_items_read on public.purchase_items for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'purchases', 'view')));
create policy purchase_items_create on public.purchase_items for insert to authenticated with check (
  (select private.has_workshop_permission(workshop_id, 'purchases', 'create'))
  and exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id
      and p.workshop_id = purchase_items.workshop_id
      and p.status = 'ordered'
  )
);

create policy inventory_products_read_for_purchases on public.inventory_products
  for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'purchases', 'view')));

create or replace function private.create_purchase(
  target_workshop_id uuid,
  target_supplier_id uuid,
  target_product_id uuid,
  target_quantity numeric,
  target_unit_cost numeric,
  target_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if not private.has_workshop_permission(target_workshop_id, 'purchases', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if target_quantity is null or target_quantity <= 0 or target_unit_cost is null or target_unit_cost < 0 then
    raise exception 'invalid purchase item' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers where id = target_supplier_id and workshop_id = target_workshop_id and archived_at is null) then
    raise exception 'supplier not found' using errcode = '23503';
  end if;
  if not exists (select 1 from public.inventory_products where id = target_product_id and workshop_id = target_workshop_id and archived_at is null) then
    raise exception 'product not found' using errcode = '23503';
  end if;

  insert into public.purchases (workshop_id, supplier_id, due_date)
  values (target_workshop_id, target_supplier_id, target_due_date)
  returning id into created_id;
  insert into public.purchase_items (workshop_id, purchase_id, product_id, quantity, unit_cost)
  values (target_workshop_id, created_id, target_product_id, target_quantity, target_unit_cost);
  return created_id;
end;
$$;

create or replace function private.create_purchase_multi(
  target_workshop_id uuid,
  target_supplier_id uuid,
  target_items jsonb,
  target_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  item jsonb;
  product_id uuid;
  item_quantity numeric;
  item_cost numeric;
begin
  if not private.has_workshop_permission(target_workshop_id, 'purchases', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = target_supplier_id and workshop_id = target_workshop_id and archived_at is null) then
    raise exception 'supplier not found' using errcode = '23503';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 or jsonb_array_length(target_items) > 100 then
    raise exception 'invalid purchase items' using errcode = '22023';
  end if;

  insert into public.purchases (workshop_id, supplier_id, due_date)
  values (target_workshop_id, target_supplier_id, target_due_date)
  returning id into created_id;
  for item in select value from jsonb_array_elements(target_items) loop
    begin
      product_id := (item->>'product_id')::uuid;
      item_quantity := (item->>'quantity')::numeric;
      item_cost := (item->>'unit_cost')::numeric;
    exception when others then
      raise exception 'invalid purchase item' using errcode = '22023';
    end;
    if item_quantity is null or item_quantity <= 0 or item_quantity > 1000000000
       or item_cost is null or item_cost < 0 or item_cost > 1000000000 then
      raise exception 'invalid purchase item' using errcode = '22023';
    end if;
    if not exists (select 1 from public.inventory_products where id = product_id and workshop_id = target_workshop_id and archived_at is null) then
      raise exception 'product not found' using errcode = '23503';
    end if;
    insert into public.purchase_items (workshop_id, purchase_id, product_id, quantity, unit_cost)
    values (target_workshop_id, created_id, product_id, item_quantity, item_cost);
  end loop;
  return created_id;
end;
$$;

create or replace function private.receive_purchase(target_workshop_id uuid, target_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.purchases%rowtype;
  i record;
  total numeric(14,2) := 0;
begin
  if not private.has_workshop_permission(target_workshop_id, 'purchases', 'create')
     or not private.has_workshop_permission(target_workshop_id, 'inventory', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into p from public.purchases where id = target_purchase_id and workshop_id = target_workshop_id for update;
  if not found or p.status <> 'ordered' then
    raise exception 'purchase cannot be received' using errcode = '55000';
  end if;
  if not exists (select 1 from public.purchase_items where purchase_id = p.id and workshop_id = p.workshop_id) then
    raise exception 'purchase has no items' using errcode = '23514';
  end if;

  for i in select * from public.purchase_items where purchase_id = p.id and workshop_id = p.workshop_id loop
    perform private.record_inventory_movement(target_workshop_id, i.product_id, 'entry', i.quantity, 'purchase', null, 'Recebimento da compra ' || left(p.id::text, 8));
    update public.inventory_products set cost_price = i.unit_cost where id = i.product_id and workshop_id = target_workshop_id;
    total := total + i.quantity * i.unit_cost;
  end loop;
  update public.purchases set status = 'received', received_at = now(), total_amount = total where id = p.id;
  if total > 0 then
    insert into public.payables (workshop_id, supplier_id, purchase_id, description, amount, due_date)
    values (target_workshop_id, p.supplier_id, p.id, 'Compra de produtos', total, p.due_date);
  end if;
  insert into public.audit_events (workshop_id, actor_id, action, entity, entity_id)
  values (target_workshop_id, auth.uid(), 'purchases.received', 'purchases', p.id::text);
end;
$$;

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text, can_view boolean, can_create boolean, can_update boolean, can_delete boolean)
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
  from (values ('dashboard'), ('clients'), ('vehicles'), ('service_orders'), ('estimates'), ('inventory'), ('purchases'), ('finance'), ('reports'), ('employees'), ('settings')) as requested(module)
  where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public, anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
