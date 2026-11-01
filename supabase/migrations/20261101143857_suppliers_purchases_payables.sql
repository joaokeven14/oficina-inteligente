-- Suppliers, purchase receiving and payables. Receiving is atomic: stock ledger,
-- product cost, payable and purchase status commit together or not at all.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 180),
  cnpj text,
  phone text,
  email text,
  address text,
  contact_name text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workshop_id)
);
create unique index suppliers_cnpj_per_workshop on public.suppliers(workshop_id, regexp_replace(cnpj, '\D', '', 'g')) where cnpj is not null and archived_at is null;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null,
  status text not null default 'ordered' check (status in ('ordered', 'received', 'canceled')),
  payment_method text,
  due_date date,
  notes text,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  received_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workshop_id),
  foreign key (supplier_id, workshop_id) references public.suppliers(id, workshop_id) on delete restrict,
  check ((status = 'received') = (received_at is not null))
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (purchase_id, workshop_id) references public.purchases(id, workshop_id) on delete cascade,
  foreign key (product_id, workshop_id) references public.inventory_products(id, workshop_id) on delete restrict
);
create table public.payables (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null,
  purchase_id uuid not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (purchase_id),
  foreign key (supplier_id, workshop_id) references public.suppliers(id, workshop_id),
  foreign key (purchase_id, workshop_id) references public.purchases(id, workshop_id),
  check ((status = 'paid') = (paid_at is not null))
);

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.payables enable row level security;
create policy suppliers_read on public.suppliers for select to authenticated
  using (private.has_workshop_permission(workshop_id, 'inventory', 'view'));
create policy suppliers_create on public.suppliers for insert to authenticated
  with check (private.has_workshop_permission(workshop_id, 'inventory', 'create'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.has_workshop_permission(workshop_id, 'inventory', 'update'))
  with check (private.has_workshop_permission(workshop_id, 'inventory', 'update'));
create policy purchases_read on public.purchases for select to authenticated using (private.has_workshop_permission(workshop_id, 'inventory', 'view'));
create policy purchases_create on public.purchases for insert to authenticated with check (private.has_workshop_permission(workshop_id, 'inventory', 'create'));
create policy purchase_items_read on public.purchase_items for select to authenticated using (private.has_workshop_permission(workshop_id, 'inventory', 'view'));
create policy purchase_items_create on public.purchase_items for insert to authenticated with check (
  private.has_workshop_permission(workshop_id, 'inventory', 'create') and exists (
    select 1 from public.purchases p where p.id = purchase_items.purchase_id and p.workshop_id = purchase_items.workshop_id and p.status = 'ordered'
  ));
create policy payables_read on public.payables for select to authenticated using (private.has_workshop_permission(workshop_id, 'finance', 'view'));
revoke all on public.suppliers, public.purchases, public.purchase_items, public.payables from public, anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select on public.purchases, public.purchase_items to authenticated;
grant select on public.payables to authenticated;

create function private.create_purchase(target_workshop_id uuid,target_supplier_id uuid,target_product_id uuid,target_quantity numeric,target_unit_cost numeric,target_due_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
 if not private.has_workshop_permission(target_workshop_id,'inventory','create') then raise exception 'not authorized' using errcode='42501'; end if;
 if target_quantity is null or target_quantity<=0 or target_unit_cost is null or target_unit_cost<0 then raise exception 'invalid purchase item' using errcode='22023'; end if;
 if not exists(select 1 from public.suppliers where id=target_supplier_id and workshop_id=target_workshop_id and archived_at is null) then raise exception 'supplier not found' using errcode='23503'; end if;
 if not exists(select 1 from public.inventory_products where id=target_product_id and workshop_id=target_workshop_id and archived_at is null) then raise exception 'product not found' using errcode='23503'; end if;
 insert into public.purchases(workshop_id,supplier_id,due_date) values(target_workshop_id,target_supplier_id,target_due_date) returning id into created_id;
 insert into public.purchase_items(workshop_id,purchase_id,product_id,quantity,unit_cost) values(target_workshop_id,created_id,target_product_id,target_quantity,target_unit_cost);
 return created_id;
end $$;
create function public.create_purchase(target_workshop_id uuid,target_supplier_id uuid,target_product_id uuid,target_quantity numeric,target_unit_cost numeric,target_due_date date default null)
returns uuid language sql security invoker set search_path = '' as $$
 select private.create_purchase(target_workshop_id,target_supplier_id,target_product_id,target_quantity,target_unit_cost,target_due_date)
$$;
revoke all on function private.create_purchase(uuid,uuid,uuid,numeric,numeric,date) from public,anon,authenticated;
grant execute on function private.create_purchase(uuid,uuid,uuid,numeric,numeric,date) to authenticated;
revoke all on function public.create_purchase(uuid,uuid,uuid,numeric,numeric,date) from public,anon;
grant execute on function public.create_purchase(uuid,uuid,uuid,numeric,numeric,date) to authenticated;

create function private.receive_purchase(target_workshop_id uuid, target_purchase_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.purchases%rowtype; i record; total numeric(14,2) := 0;
begin
  if not private.has_workshop_permission(target_workshop_id, 'inventory', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into p from public.purchases where id=target_purchase_id and workshop_id=target_workshop_id for update;
  if not found or p.status <> 'ordered' then raise exception 'purchase cannot be received' using errcode = '55000'; end if;
  if not exists(select 1 from public.purchase_items where purchase_id=p.id and workshop_id=p.workshop_id) then
    raise exception 'purchase has no items' using errcode = '23514';
  end if;
  for i in select * from public.purchase_items where purchase_id=p.id and workshop_id=p.workshop_id loop
    perform private.record_inventory_movement(target_workshop_id, i.product_id, 'entry', i.quantity, 'purchase', null, 'Recebimento da compra ' || left(p.id::text, 8));
    update public.inventory_products set cost_price=i.unit_cost where id=i.product_id and workshop_id=target_workshop_id;
    total := total + i.quantity * i.unit_cost;
  end loop;
  update public.purchases set status='received', received_at=now(), total_amount=total where id=p.id;
  if total > 0 then
    insert into public.payables(workshop_id,supplier_id,purchase_id,description,amount,due_date)
    values(target_workshop_id,p.supplier_id,p.id,'Compra de produtos',total,p.due_date);
  end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
  values(target_workshop_id,auth.uid(),'purchases.received','purchases',p.id::text);
end $$;
create function public.receive_purchase(target_workshop_id uuid, target_purchase_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.receive_purchase(target_workshop_id,target_purchase_id)
$$;
revoke all on function private.receive_purchase(uuid,uuid) from public, anon, authenticated;
grant execute on function private.receive_purchase(uuid,uuid) to authenticated;
revoke all on function public.receive_purchase(uuid,uuid) from public, anon;
grant execute on function public.receive_purchase(uuid,uuid) to authenticated;

create function private.mark_payable_paid(target_workshop_id uuid,target_payable_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.has_workshop_permission(target_workshop_id,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
 update public.payables set status='paid',paid_at=now() where id=target_payable_id and workshop_id=target_workshop_id and status='pending';
 if not found then raise exception 'payable not found or already paid' using errcode='P0002'; end if;
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop_id,auth.uid(),'payables.paid','payables',target_payable_id::text);
end $$;
create function public.mark_payable_paid(target_workshop_id uuid,target_payable_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.mark_payable_paid(target_workshop_id,target_payable_id) $$;
revoke all on function private.mark_payable_paid(uuid,uuid) from public,anon,authenticated;
grant execute on function private.mark_payable_paid(uuid,uuid) to authenticated;
revoke all on function public.mark_payable_paid(uuid,uuid) from public,anon;
grant execute on function public.mark_payable_paid(uuid,uuid) to authenticated;

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text,can_view boolean,can_create boolean,can_update boolean,can_delete boolean)
language sql stable security invoker set search_path = '' as $$
 select requested.module,
 private.has_workshop_permission(target_workshop_id,requested.module,'view'),
 private.has_workshop_permission(target_workshop_id,requested.module,'create'),
 private.has_workshop_permission(target_workshop_id,requested.module,'update'),
 private.has_workshop_permission(target_workshop_id,requested.module,'delete')
 from (values ('clients'),('vehicles'),('service_orders'),('inventory'),('finance')) as requested(module)
 where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public,anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
