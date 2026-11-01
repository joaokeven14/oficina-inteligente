-- Allow one supplier order to contain several products while retaining atomic receiving.
create function private.create_purchase_multi(target_workshop_id uuid, target_supplier_id uuid, target_items jsonb, target_due_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid; item jsonb; product_id uuid; item_quantity numeric; item_cost numeric; item_count integer;
begin
  if not private.has_workshop_permission(target_workshop_id, 'inventory', 'create') then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.suppliers where id=target_supplier_id and workshop_id=target_workshop_id and archived_at is null) then raise exception 'supplier not found' using errcode='23503'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 or jsonb_array_length(target_items) > 100 then raise exception 'invalid purchase items' using errcode='22023'; end if;
  item_count := jsonb_array_length(target_items);
  insert into public.purchases(workshop_id,supplier_id,due_date) values(target_workshop_id,target_supplier_id,target_due_date) returning id into created_id;
  for item in select value from jsonb_array_elements(target_items) loop
    begin
      product_id := (item->>'product_id')::uuid;
      item_quantity := (item->>'quantity')::numeric;
      item_cost := (item->>'unit_cost')::numeric;
    exception when others then raise exception 'invalid purchase item' using errcode='22023'; end;
    if item_quantity is null or item_quantity <= 0 or item_quantity > 1000000000 or item_cost is null or item_cost < 0 or item_cost > 1000000000 then raise exception 'invalid purchase item' using errcode='22023'; end if;
    if not exists(select 1 from public.inventory_products where id=product_id and workshop_id=target_workshop_id and archived_at is null) then raise exception 'product not found' using errcode='23503'; end if;
    insert into public.purchase_items(workshop_id,purchase_id,product_id,quantity,unit_cost) values(target_workshop_id,created_id,product_id,item_quantity,item_cost);
  end loop;
  return created_id;
end $$;
create function public.create_purchase_multi(target_workshop_id uuid,target_supplier_id uuid,target_items jsonb,target_due_date date default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.create_purchase_multi(target_workshop_id,target_supplier_id,target_items,target_due_date) $$;
revoke all on function private.create_purchase_multi(uuid,uuid,jsonb,date) from public,anon,authenticated;
grant execute on function private.create_purchase_multi(uuid,uuid,jsonb,date) to authenticated;
revoke all on function public.create_purchase_multi(uuid,uuid,jsonb,date) from public,anon;
grant execute on function public.create_purchase_multi(uuid,uuid,jsonb,date) to authenticated;
