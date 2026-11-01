create table public.maintenance_reminders (
 id uuid primary key default gen_random_uuid(), workshop_id uuid not null, vehicle_id uuid not null, customer_id uuid not null,
 title text not null check(length(trim(title)) between 2 and 180), due_date date, due_odometer_km integer check(due_odometer_km is null or due_odometer_km>=0),
 notes text not null default '', completed_at timestamptz, created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(vehicle_id,workshop_id,customer_id) references public.vehicles(id,workshop_id,customer_id) on delete restrict,
 check(due_date is not null or due_odometer_km is not null)
);
create table public.service_warranties (
 id uuid primary key default gen_random_uuid(), workshop_id uuid not null, service_order_id uuid not null,
 description text not null check(length(trim(description)) between 2 and 240),
 starts_on date not null default current_date, duration_days integer not null check(duration_days between 1 and 3650),
 ends_on date generated always as(starts_on+duration_days) stored,
 conditions text not null default '', voided_at timestamptz, created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), unique(service_order_id),
 foreign key(service_order_id,workshop_id) references public.service_orders(id,workshop_id) on delete restrict
);
alter table public.maintenance_reminders enable row level security;
alter table public.service_warranties enable row level security;
create policy reminders_read on public.maintenance_reminders for select to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','view'));
create policy reminders_create on public.maintenance_reminders for insert to authenticated with check(private.has_workshop_permission(workshop_id,'service_orders','create'));
create policy reminders_update on public.maintenance_reminders for update to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','update')) with check(private.has_workshop_permission(workshop_id,'service_orders','update'));
create policy warranties_read on public.service_warranties for select to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','view'));
revoke all on public.maintenance_reminders,public.service_warranties from public,anon,authenticated;
grant select on public.maintenance_reminders to authenticated;
grant insert(workshop_id,vehicle_id,customer_id,title,due_date,due_odometer_km,notes) on public.maintenance_reminders to authenticated;
grant update(completed_at,notes,title,due_date,due_odometer_km) on public.maintenance_reminders to authenticated;
grant select on public.service_warranties to authenticated;
create trigger reminders_updated_at before update on public.maintenance_reminders for each row execute function public.set_updated_at();
create trigger reminders_audit after insert or update on public.maintenance_reminders for each row execute function private.record_workshop_data_change();

create function private.create_service_warranty(target_workshop uuid,target_order uuid,target_description text,target_start date,target_days integer,target_conditions text)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; order_status text;
begin
 if not private.has_workshop_permission(target_workshop,'service_orders','update') then raise exception 'not authorized' using errcode='42501'; end if;
 if target_days not between 1 and 3650 or length(trim(target_description))<2 then raise exception 'invalid warranty' using errcode='22023'; end if;
 select status into order_status from public.service_orders where id=target_order and workshop_id=target_workshop for update;
 if not found or order_status not in ('completed','delivered') then raise exception 'warranty requires a completed service order' using errcode='55000'; end if;
 insert into public.service_warranties(workshop_id,service_order_id,description,starts_on,duration_days,conditions,created_by)
 values(target_workshop,target_order,trim(target_description),coalesce(target_start,current_date),target_days,coalesce(target_conditions,''),auth.uid()) returning id into new_id;
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop,auth.uid(),'warranties.created','service_warranties',new_id::text);
 return new_id;
end $$;
create function public.create_service_warranty(target_workshop uuid,target_order uuid,target_description text,target_start date,target_days integer,target_conditions text)
returns uuid language sql security invoker set search_path='' as $$ select private.create_service_warranty($1,$2,$3,$4,$5,$6) $$;
revoke all on function private.create_service_warranty(uuid,uuid,text,date,integer,text) from public,anon,authenticated;
grant execute on function private.create_service_warranty(uuid,uuid,text,date,integer,text) to authenticated;
revoke all on function public.create_service_warranty(uuid,uuid,text,date,integer,text) from public,anon;
grant execute on function public.create_service_warranty(uuid,uuid,text,date,integer,text) to authenticated;
