alter table public.service_order_items add column inventory_product_id uuid;
alter table public.service_order_items add constraint service_order_items_product_tenant_fk
  foreign key(inventory_product_id,workshop_id) references public.inventory_products(id,workshop_id) on delete restrict;
grant update(inventory_product_id) on public.service_order_items to authenticated;
grant insert(inventory_product_id) on public.service_order_items to authenticated;

create function private.sync_service_order_item_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_order uuid; target_workshop uuid; order_status text;
begin
 target_order:=case when tg_op='DELETE' then old.service_order_id else new.service_order_id end;
 target_workshop:=case when tg_op='DELETE' then old.workshop_id else new.workshop_id end;
 select status into order_status from public.service_orders where id=target_order and workshop_id=target_workshop;
 if order_status is null then raise exception 'service order not found' using errcode='23503'; end if;
 if tg_op<>'DELETE' and order_status='canceled' then raise exception 'cannot add items to a canceled service order' using errcode='55000'; end if;
 if tg_op in ('DELETE','UPDATE') and old.inventory_product_id is not null and order_status<>'canceled' then
  perform private.record_inventory_movement(target_workshop,old.inventory_product_id,'entry',old.quantity,'service_order',target_order,'Estorno de item removido/alterado da OS');
 end if;
 if tg_op in ('INSERT','UPDATE') and new.inventory_product_id is not null then
  perform private.record_inventory_movement(target_workshop,new.inventory_product_id,'exit',new.quantity,'service_order',target_order,'Baixa automática da OS');
 end if;
 return null;
end $$;
create trigger service_order_items_sync_stock after insert or update or delete on public.service_order_items
for each row execute function private.sync_service_order_item_stock();

create function private.reverse_or_restore_order_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare i record; direction text;
begin
 if old.status is not distinct from new.status then return null; end if;
 if new.status='canceled' then direction:='entry';
 elsif old.status='canceled' then direction:='exit';
 else return null; end if;
 for i in select inventory_product_id,quantity from public.service_order_items
   where service_order_id=new.id and workshop_id=new.workshop_id and inventory_product_id is not null loop
  if direction='entry' then
   perform private.record_inventory_movement(new.workshop_id,i.inventory_product_id,'entry',i.quantity,'adjustment',null,'Estorno automático por cancelamento da OS');
  else
   perform private.record_inventory_movement(new.workshop_id,i.inventory_product_id,'exit',i.quantity,'service_order',new.id,'Restauração da OS após reabertura');
  end if;
 end loop;
 return null;
end $$;
create trigger service_orders_stock_status after update of status on public.service_orders
for each row execute function private.reverse_or_restore_order_stock();

revoke all on function private.sync_service_order_item_stock() from public,anon,authenticated;
revoke all on function private.reverse_or_restore_order_stock() from public,anon,authenticated;
