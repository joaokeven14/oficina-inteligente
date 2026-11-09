drop policy member_permissions_insert_by_manager on public.workshop_member_permissions;
drop policy member_permissions_update_by_manager on public.workshop_member_permissions;
drop policy member_permissions_delete_by_manager on public.workshop_member_permissions;

create policy member_permissions_insert_by_manager
  on public.workshop_member_permissions for insert to authenticated
  with check (
    (select private.is_workshop_owner(workshop_id))
    or (
      module not in ('purchases', 'settings')
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );
create policy member_permissions_update_by_manager
  on public.workshop_member_permissions for update to authenticated
  using (
    (select private.is_workshop_owner(workshop_id))
    or (
      module not in ('purchases', 'settings')
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  )
  with check (
    (select private.is_workshop_owner(workshop_id))
    or (
      module not in ('purchases', 'settings')
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );
create policy member_permissions_delete_by_manager
  on public.workshop_member_permissions for delete to authenticated
  using (
    (select private.is_workshop_owner(workshop_id))
    or (
      module not in ('purchases', 'settings')
      and (select private.has_workshop_permission(workshop_id, 'employees', 'update'))
    )
  );

create or replace function public.get_employee_productivity(
  target_workshop uuid,
  target_from timestamptz,
  target_to timestamptz
)
returns table(
  membership_id uuid,
  full_name text,
  orders_delivered bigint,
  labor_value numeric,
  minutes_logged numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.has_workshop_permission(target_workshop, 'reports', 'view')
    or not private.has_workshop_permission(target_workshop, 'employees', 'view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_from is null or target_to is null or target_to < target_from then
    raise exception 'invalid productivity range' using errcode = '22023';
  end if;

  return query
  select
    m.id,
    p.full_name,
    coalesce((
      select count(*)
      from public.service_orders so
      where so.workshop_id = target_workshop
        and so.assigned_membership_id = m.id
        and so.status = 'delivered'
        and so.opened_at >= target_from
        and so.opened_at <= target_to
    ), 0),
    coalesce((
      select sum(i.line_total)
      from public.service_order_items i
      join public.service_orders so on so.id = i.service_order_id and so.workshop_id = i.workshop_id
      where i.workshop_id = target_workshop
        and so.assigned_membership_id = m.id
        and so.status = 'delivered'
        and so.opened_at >= target_from
        and so.opened_at <= target_to
        and i.item_type = 'labor'
    ), 0),
    coalesce((
      select round(sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)) / 60), 2)
      from public.service_order_time_entries t
      where t.workshop_id = target_workshop
        and t.membership_id = m.id
        and t.started_at >= target_from
        and t.started_at <= target_to
    ), 0)
  from public.workshop_memberships m
  join public.profiles p on p.user_id = m.user_id
  where m.workshop_id = target_workshop
    and m.role = 'staff'
    and m.status = 'active'
  order by p.full_name;
end;
$$;
revoke all on function public.get_employee_productivity(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_employee_productivity(uuid, timestamptz, timestamptz) to authenticated;
