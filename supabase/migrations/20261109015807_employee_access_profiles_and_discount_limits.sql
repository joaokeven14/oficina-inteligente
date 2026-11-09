alter table public.workshop_member_permissions
  add column discount_limit_percent numeric(5,2) not null default 0
    check (discount_limit_percent between 0 and 100);

comment on column public.workshop_member_permissions.discount_limit_percent is
  'Limite percentual de desconto em ordens de serviço para o módulo de desconto limitado.';

alter table public.workshop_member_permissions
  drop constraint workshop_member_permissions_module_check;
alter table public.workshop_member_permissions
  add constraint workshop_member_permissions_module_check
  check (module in (
    'dashboard', 'clients', 'vehicles', 'service_orders', 'after_sales', 'estimates',
    'inventory', 'purchases', 'finance', 'reports', 'employees', 'settings',
    'service_order_discount', 'service_order_discount_limited'
  ));

drop policy member_permissions_insert_by_owner on public.workshop_member_permissions;
drop policy member_permissions_update_by_owner on public.workshop_member_permissions;
drop policy member_permissions_delete_by_owner on public.workshop_member_permissions;

create policy member_permissions_insert_by_manager
  on public.workshop_member_permissions for insert to authenticated
  with check (
    (select private.is_workshop_owner(workshop_id))
    or (
      module <> 'purchases'
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );
create policy member_permissions_update_by_manager
  on public.workshop_member_permissions for update to authenticated
  using (
    (select private.is_workshop_owner(workshop_id))
    or (
      module <> 'purchases'
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  )
  with check (
    (select private.is_workshop_owner(workshop_id))
    or (
      module <> 'purchases'
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );
create policy member_permissions_delete_by_manager
  on public.workshop_member_permissions for delete to authenticated
  using (
    (select private.is_workshop_owner(workshop_id))
    or (
      module <> 'purchases'
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );

drop function public.get_workshop_permissions(uuid);
create function public.get_workshop_permissions(target_workshop_id uuid)
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
  from (values
    ('dashboard'), ('clients'), ('vehicles'), ('service_orders'), ('after_sales'),
    ('estimates'), ('inventory'), ('purchases'), ('finance'), ('reports'), ('employees'), ('settings'),
    ('service_order_discount'), ('service_order_discount_limited')
  ) as requested(module)
  where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public, anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;

create function private.can_apply_service_order_discount(
  target_workshop_id uuid,
  requested_discount numeric,
  target_subtotal numeric
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
    left join public.workshop_member_permissions unlimited
      on unlimited.membership_id = m.id and unlimited.module = 'service_order_discount'
    left join public.workshop_member_permissions limited
      on limited.membership_id = m.id and limited.module = 'service_order_discount_limited'
    where m.workshop_id = target_workshop_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and w.status = 'active'
      and (
        m.role = 'owner'
        or coalesce(unlimited.can_update, false)
        or (
          coalesce(limited.can_update, false)
          and limited.discount_limit_percent > 0
          and requested_discount <= round(coalesce(target_subtotal, 0) * limited.discount_limit_percent / 100, 2)
        )
      )
  );
$$;
revoke all on function private.can_apply_service_order_discount(uuid, numeric, numeric) from public, anon, authenticated;

create function private.guard_service_order_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and coalesce(new.discount, 0) > 0)
    or (tg_op = 'UPDATE' and new.discount is distinct from old.discount) then
    if new.discount is null or new.discount < 0 or new.discount > new.items_subtotal
      or not private.can_apply_service_order_discount(new.workshop_id, new.discount, new.items_subtotal) then
      raise exception 'O desconto ultrapassa o limite autorizado para este acesso.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_service_order_discount() from public, anon, authenticated;
create trigger service_orders_guard_discount
  before insert or update on public.service_orders
  for each row execute function private.guard_service_order_discount();

drop policy service_order_items_create_with_permission on public.service_order_items;
create policy service_order_items_create_with_permission on public.service_order_items
  for insert to authenticated
  with check (
    (
      (select private.has_workshop_permission(workshop_id, 'service_orders', 'create'))
      or (select private.has_workshop_permission(workshop_id, 'service_orders', 'update'))
    )
    and exists (
      select 1 from public.service_orders o
      where o.id = service_order_id and o.workshop_id = service_order_items.workshop_id
    )
  );

drop policy service_order_items_delete_with_permission on public.service_order_items;
create policy service_order_items_delete_with_permission on public.service_order_items
  for delete to authenticated
  using (
    (select private.has_workshop_permission(workshop_id, 'service_orders', 'delete'))
    or (select private.has_workshop_permission(workshop_id, 'service_orders', 'update'))
  );

drop policy service_order_stock_products_read on public.service_order_stock_products;
create policy service_order_stock_products_read
  on public.service_order_stock_products for select to authenticated
  using (
    (select private.has_workshop_permission(workshop_id, 'service_orders', 'create'))
    or (select private.has_workshop_permission(workshop_id, 'service_orders', 'update'))
  );

create or replace function private.record_service_order_stock_movement(
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
    or not (
      private.has_workshop_permission(target_workshop_id, 'service_orders', required_service_order_permission)
      or (
        required_service_order_permission in ('create', 'delete')
        and private.has_workshop_permission(target_workshop_id, 'service_orders', 'update')
      )
    ) then
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
