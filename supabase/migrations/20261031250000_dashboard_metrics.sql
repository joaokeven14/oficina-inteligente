-- Counts are computed in PostgreSQL without client pagination and remain subject to RLS.
create function public.get_dashboard_metrics(target_workshop_id uuid)
returns table(metric text,value bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.has_workshop_permission(target_workshop_id,'dashboard','view') then raise exception 'not authorized' using errcode='42501'; end if;
 return query select 'customers'::text,count(*) from public.customers where workshop_id=target_workshop_id and archived_at is null
  and private.has_workshop_permission(target_workshop_id,'clients','view');
 return query select 'vehicles'::text,count(*) from public.vehicles where workshop_id=target_workshop_id and archived_at is null
  and private.has_workshop_permission(target_workshop_id,'vehicles','view');
 return query select 'orders_open'::text,count(*) from public.service_orders where workshop_id=target_workshop_id and status in ('open','diagnosis','awaiting_approval','awaiting_parts')
  and private.has_workshop_permission(target_workshop_id,'service_orders','view');
 return query select 'orders_in_progress'::text,count(*) from public.service_orders where workshop_id=target_workshop_id and status='in_progress'
  and private.has_workshop_permission(target_workshop_id,'service_orders','view');
 return query select 'orders_completed'::text,count(*) from public.service_orders where workshop_id=target_workshop_id and status in ('completed','delivered')
  and private.has_workshop_permission(target_workshop_id,'service_orders','view');
 return query select 'estimates_pending'::text,count(*) from public.estimates where workshop_id=target_workshop_id and status='pending' and (valid_until is null or valid_until>=current_date)
  and private.has_workshop_permission(target_workshop_id,'estimates','view');
 return query select 'inventory_low'::text,count(*) from public.inventory_products where workshop_id=target_workshop_id and archived_at is null and quantity<=minimum_quantity
  and private.has_workshop_permission(target_workshop_id,'inventory','view');
 return query select 'payables_pending'::text,count(*) from public.payables where workshop_id=target_workshop_id and status='pending'
  and private.has_workshop_permission(target_workshop_id,'finance','view');
end $$;
revoke all on function public.get_dashboard_metrics(uuid) from public,anon;
grant execute on function public.get_dashboard_metrics(uuid) to authenticated;

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text,can_view boolean,can_create boolean,can_update boolean,can_delete boolean)
language sql stable security invoker set search_path='' as $$
 select requested.module,private.has_workshop_permission(target_workshop_id,requested.module,'view'),private.has_workshop_permission(target_workshop_id,requested.module,'create'),private.has_workshop_permission(target_workshop_id,requested.module,'update'),private.has_workshop_permission(target_workshop_id,requested.module,'delete')
 from (values ('dashboard'),('clients'),('vehicles'),('service_orders'),('inventory'),('finance'),('estimates')) as requested(module)
 where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public,anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
