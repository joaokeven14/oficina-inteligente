create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text,can_view boolean,can_create boolean,can_update boolean,can_delete boolean)
language sql stable security invoker set search_path='' as $$
 select requested.module,private.has_workshop_permission(target_workshop_id,requested.module,'view'),private.has_workshop_permission(target_workshop_id,requested.module,'create'),private.has_workshop_permission(target_workshop_id,requested.module,'update'),private.has_workshop_permission(target_workshop_id,requested.module,'delete')
 from (values ('dashboard'),('clients'),('vehicles'),('service_orders'),('estimates'),('inventory'),('finance'),('reports'),('employees'),('settings')) as requested(module)
 where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public,anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
