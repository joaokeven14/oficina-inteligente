create table public.service_order_time_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  service_order_id uuid not null,
  membership_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (service_order_id, workshop_id) references public.service_orders(id, workshop_id) on delete restrict,
  foreign key (membership_id, workshop_id) references public.workshop_memberships(id, workshop_id) on delete restrict,
  check (ended_at is null or ended_at >= started_at)
);
create unique index one_active_timer_per_membership on public.service_order_time_entries(membership_id) where ended_at is null;
create index service_order_time_entries_report on public.service_order_time_entries(workshop_id, started_at desc);

create table public.workshop_employee_commissions (
  workshop_id uuid not null,
  membership_id uuid not null,
  labor_commission_rate numeric(5,2) not null default 0 check (labor_commission_rate between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workshop_id, membership_id),
  foreign key (membership_id, workshop_id) references public.workshop_memberships(id, workshop_id) on delete cascade
);

alter table public.service_order_time_entries enable row level security;
alter table public.workshop_employee_commissions enable row level security;
create policy time_entries_read on public.service_order_time_entries for select to authenticated
  using (private.has_workshop_permission(workshop_id, 'service_orders', 'view'));
create policy employee_commissions_read on public.workshop_employee_commissions for select to authenticated
  using (exists(select 1 from public.workshop_memberships m join public.workshops w on w.id=m.workshop_id
    where m.workshop_id=workshop_employee_commissions.workshop_id and m.user_id=auth.uid() and m.role='owner' and m.status='active' and w.status='active'));
revoke all on public.service_order_time_entries, public.workshop_employee_commissions from public, anon, authenticated;
grant select on public.service_order_time_entries, public.workshop_employee_commissions to authenticated;

create function private.is_workshop_owner(target_workshop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workshop_memberships m join public.workshops w on w.id=m.workshop_id
    where m.workshop_id=target_workshop and m.user_id=auth.uid() and m.role='owner' and m.status='active' and w.status='active')
$$;
revoke all on function private.is_workshop_owner(uuid) from public,anon;
grant execute on function private.is_workshop_owner(uuid) to authenticated;

create function private.start_service_order_timer(target_workshop uuid,target_order uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_membership uuid; timer_id uuid;
begin
  if not private.has_workshop_permission(target_workshop,'service_orders','update') then raise exception 'not authorized' using errcode='42501'; end if;
  select id into actor_membership from public.workshop_memberships where workshop_id=target_workshop and user_id=auth.uid() and status='active';
  if actor_membership is null then raise exception 'active workshop membership required' using errcode='42501'; end if;
  if not exists(select 1 from public.service_orders where id=target_order and workshop_id=target_workshop and status not in ('completed','delivered','canceled')) then
    raise exception 'service order not found or closed' using errcode='P0002';
  end if;
  insert into public.service_order_time_entries(workshop_id,service_order_id,membership_id)
    values(target_workshop,target_order,actor_membership) returning id into timer_id;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'service_order.timer_started','service_order_time_entries',timer_id::text);
  return timer_id;
exception when unique_violation then
  raise exception 'an active timer already exists for this employee' using errcode='23505';
end $$;
create function public.start_service_order_timer(target_workshop uuid,target_order uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.start_service_order_timer(target_workshop,target_order) $$;
revoke all on function private.start_service_order_timer(uuid,uuid) from public,anon,authenticated;
grant execute on function private.start_service_order_timer(uuid,uuid) to authenticated;
revoke all on function public.start_service_order_timer(uuid,uuid) from public,anon;
grant execute on function public.start_service_order_timer(uuid,uuid) to authenticated;

create function private.stop_service_order_timer(target_workshop uuid,target_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor_membership uuid; timer_id uuid;
begin
  if not private.has_workshop_permission(target_workshop,'service_orders','update') then raise exception 'not authorized' using errcode='42501'; end if;
  select id into actor_membership from public.workshop_memberships where workshop_id=target_workshop and user_id=auth.uid() and status='active';
  update public.service_order_time_entries set ended_at=greatest(now(),started_at)
    where workshop_id=target_workshop and service_order_id=target_order and membership_id=actor_membership and ended_at is null
    returning id into timer_id;
  if timer_id is null then raise exception 'active timer not found' using errcode='P0002'; end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'service_order.timer_stopped','service_order_time_entries',timer_id::text);
end $$;
create function public.stop_service_order_timer(target_workshop uuid,target_order uuid)
returns void language sql security invoker set search_path='' as $$ select private.stop_service_order_timer(target_workshop,target_order) $$;
revoke all on function private.stop_service_order_timer(uuid,uuid) from public,anon,authenticated;
grant execute on function private.stop_service_order_timer(uuid,uuid) to authenticated;
revoke all on function public.stop_service_order_timer(uuid,uuid) from public,anon;
grant execute on function public.stop_service_order_timer(uuid,uuid) to authenticated;

create function private.set_employee_labor_commission(target_workshop uuid,target_membership uuid,target_rate numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_workshop_owner(target_workshop) then raise exception 'workshop owner required' using errcode='42501'; end if;
  if target_rate is null or target_rate not between 0 and 100 then raise exception 'commission must be between zero and one hundred percent' using errcode='22023'; end if;
  if not exists(select 1 from public.workshop_memberships where id=target_membership and workshop_id=target_workshop and role='staff' and status='active') then
    raise exception 'active staff membership not found' using errcode='P0002';
  end if;
  insert into public.workshop_employee_commissions(workshop_id,membership_id,labor_commission_rate,updated_by,updated_at)
    values(target_workshop,target_membership,target_rate,auth.uid(),now())
    on conflict(workshop_id,membership_id) do update set labor_commission_rate=excluded.labor_commission_rate,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'employee.commission_updated','workshop_employee_commissions',target_membership::text);
end $$;
create function public.set_employee_labor_commission(target_workshop uuid,target_membership uuid,target_rate numeric)
returns void language sql security invoker set search_path='' as $$ select private.set_employee_labor_commission(target_workshop,target_membership,target_rate) $$;
revoke all on function private.set_employee_labor_commission(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function private.set_employee_labor_commission(uuid,uuid,numeric) to authenticated;
revoke all on function public.set_employee_labor_commission(uuid,uuid,numeric) from public,anon;
grant execute on function public.set_employee_labor_commission(uuid,uuid,numeric) to authenticated;

create function public.get_employee_productivity(target_workshop uuid,target_from timestamptz,target_to timestamptz)
returns table(membership_id uuid,full_name text,orders_delivered bigint,labor_value numeric,minutes_logged numeric,commission_rate numeric,estimated_commission numeric)
language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_workshop_owner(target_workshop) or not private.has_workshop_permission(target_workshop,'reports','view') or not private.has_workshop_permission(target_workshop,'employees','view') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if target_from is null or target_to is null or target_to<target_from then raise exception 'invalid productivity range' using errcode='22023'; end if;
  return query
  select m.id,p.full_name,
    coalesce((select count(*) from public.service_orders so where so.workshop_id=target_workshop and so.assigned_membership_id=m.id and so.status='delivered' and so.opened_at>=target_from and so.opened_at<=target_to),0),
    coalesce((select sum(i.line_total) from public.service_order_items i join public.service_orders so on so.id=i.service_order_id and so.workshop_id=i.workshop_id where i.workshop_id=target_workshop and so.assigned_membership_id=m.id and so.status='delivered' and so.opened_at>=target_from and so.opened_at<=target_to and i.item_type='labor'),0),
    coalesce((select round(sum(extract(epoch from (coalesce(t.ended_at,now())-t.started_at))/60),2) from public.service_order_time_entries t where t.workshop_id=target_workshop and t.membership_id=m.id and t.started_at>=target_from and t.started_at<=target_to),0),
    coalesce(c.labor_commission_rate,0),
    coalesce((select sum(i.line_total) from public.service_order_items i join public.service_orders so on so.id=i.service_order_id and so.workshop_id=i.workshop_id where i.workshop_id=target_workshop and so.assigned_membership_id=m.id and so.status='delivered' and so.opened_at>=target_from and so.opened_at<=target_to and i.item_type='labor'),0)*coalesce(c.labor_commission_rate,0)/100
  from public.workshop_memberships m join public.profiles p on p.user_id=m.user_id
    left join public.workshop_employee_commissions c on c.workshop_id=m.workshop_id and c.membership_id=m.id
  where m.workshop_id=target_workshop and m.role='staff' and m.status='active'
  order by p.full_name;
end $$;
revoke all on function public.get_employee_productivity(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_employee_productivity(uuid,timestamptz,timestamptz) to authenticated;
