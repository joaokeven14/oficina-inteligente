-- A mirrored stock lookup gives OS users only the fields needed to select a part.
drop function public.list_service_order_stock_products(uuid);

create table public.service_order_stock_products (
  id uuid primary key,
  workshop_id uuid not null,
  name text not null,
  code text,
  category text,
  brand text,
  quantity numeric(14,3) not null check (quantity >= 0),
  sale_price numeric(14,2) not null check (sale_price >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (id, workshop_id),
  foreign key (id, workshop_id) references public.inventory_products(id, workshop_id) on delete cascade
);

create index service_order_stock_products_search_idx
  on public.service_order_stock_products (workshop_id, name, id)
  where active and quantity > 0;

alter table public.service_order_stock_products enable row level security;
revoke all on public.service_order_stock_products from public, anon, authenticated;
grant select on public.service_order_stock_products to authenticated;
create policy service_order_stock_products_read
  on public.service_order_stock_products for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'service_orders', 'create')));

create function private.sync_service_order_stock_product_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is null then
    insert into public.service_order_stock_products (
      id, workshop_id, name, code, category, brand, quantity, sale_price, active, updated_at
    ) values (
      new.id, new.workshop_id, new.name, new.code, new.category, new.brand, new.quantity, new.sale_price, true, now()
    )
    on conflict (id) do update set
      workshop_id = excluded.workshop_id,
      name = excluded.name,
      code = excluded.code,
      category = excluded.category,
      brand = excluded.brand,
      quantity = excluded.quantity,
      sale_price = excluded.sale_price,
      active = true,
      updated_at = now();
  else
    delete from public.service_order_stock_products where id = new.id;
  end if;
  return new;
end $$;
revoke all on function private.sync_service_order_stock_product_catalog() from public, anon, authenticated;
create trigger inventory_products_sync_service_order_catalog
after insert or update on public.inventory_products
for each row execute function private.sync_service_order_stock_product_catalog();

insert into public.service_order_stock_products (
  id, workshop_id, name, code, category, brand, quantity, sale_price, active, updated_at
)
select id, workshop_id, name, code, category, brand, quantity, sale_price, true, updated_at
from public.inventory_products
where archived_at is null
on conflict (id) do update set
  workshop_id = excluded.workshop_id,
  name = excluded.name,
  code = excluded.code,
  category = excluded.category,
  brand = excluded.brand,
  quantity = excluded.quantity,
  sale_price = excluded.sale_price,
  active = true,
  updated_at = excluded.updated_at;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_order_stock_products'
  ) then
    execute 'alter publication supabase_realtime add table public.service_order_stock_products';
  end if;
end $$;
