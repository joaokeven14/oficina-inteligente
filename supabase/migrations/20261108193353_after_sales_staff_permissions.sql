alter table public.workshop_member_permissions
  drop constraint workshop_member_permissions_module_check;
alter table public.workshop_member_permissions
  add constraint workshop_member_permissions_module_check
  check (module in (
    'dashboard', 'clients', 'vehicles', 'service_orders', 'after_sales',
    'estimates', 'inventory', 'purchases', 'finance', 'reports', 'employees', 'settings'
  ));

drop policy reminders_read on public.maintenance_reminders;
drop policy reminders_create on public.maintenance_reminders;
drop policy reminders_update on public.maintenance_reminders;
create policy reminders_read on public.maintenance_reminders for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'after_sales', 'view')));
create policy reminders_create on public.maintenance_reminders for insert to authenticated
  with check ((select private.has_workshop_permission(workshop_id, 'after_sales', 'create')));
create policy reminders_update on public.maintenance_reminders for update to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'after_sales', 'update')))
  with check ((select private.has_workshop_permission(workshop_id, 'after_sales', 'update')));

drop policy warranties_read on public.service_warranties;
create policy warranties_read on public.service_warranties for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'after_sales', 'view')));

create or replace function private.create_service_warranty(
  target_workshop uuid,
  target_order uuid,
  target_description text,
  target_start date,
  target_days integer,
  target_conditions text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  order_status text;
begin
  if not private.has_workshop_permission(target_workshop, 'after_sales', 'create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if target_days not between 1 and 3650 or length(trim(target_description)) < 2 then
    raise exception 'invalid warranty' using errcode = '22023';
  end if;
  select status into order_status
  from public.service_orders
  where id = target_order and workshop_id = target_workshop
  for update;
  if not found or order_status not in ('completed', 'delivered') then
    raise exception 'warranty requires a completed service order' using errcode = '55000';
  end if;
  insert into public.service_warranties(workshop_id, service_order_id, description, starts_on, duration_days, conditions, created_by)
  values (target_workshop, target_order, trim(target_description), coalesce(target_start, current_date), target_days, coalesce(target_conditions, ''), auth.uid())
  returning id into new_id;
  insert into public.audit_events(workshop_id, actor_id, action, entity, entity_id)
  values (target_workshop, auth.uid(), 'warranties.created', 'service_warranties', new_id::text);
  return new_id;
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
  from (values
    ('dashboard'), ('clients'), ('vehicles'), ('service_orders'), ('after_sales'),
    ('estimates'), ('inventory'), ('purchases'), ('finance'), ('reports'), ('employees'), ('settings')
  ) as requested(module)
  where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public, anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
