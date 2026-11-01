-- Estimates with server-calculated totals, review history and one-time conversion.
create table public.estimates (
 id uuid primary key default gen_random_uuid(),
 workshop_id uuid not null references public.workshops(id) on delete cascade,
 estimate_number bigint generated always as identity,
 customer_id uuid not null,
 vehicle_id uuid not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','expired','converted')),
 valid_until date,
 complaint text not null check(length(trim(complaint)) between 1 and 4000),
 notes text not null default '',
 items_subtotal numeric(14,2) not null default 0 check(items_subtotal>=0),
 discount numeric(14,2) not null default 0 check(discount>=0),
 total_amount numeric(14,2) not null default 0 check(total_amount>=0),
 approved_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 converted_order_id uuid,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workshop_id,estimate_number), unique(id,workshop_id),
 foreign key(customer_id,workshop_id) references public.customers(id,workshop_id) on delete restrict,
 foreign key(vehicle_id,workshop_id,customer_id) references public.vehicles(id,workshop_id,customer_id) on delete restrict,
 foreign key(converted_order_id,workshop_id) references public.service_orders(id,workshop_id) on delete restrict,
 check ((status='converted')=(converted_order_id is not null))
);
create table public.estimate_items (
 id uuid primary key default gen_random_uuid(), workshop_id uuid not null, estimate_id uuid not null,
 item_type text not null check(item_type in ('part','labor')),
 description text not null check(length(trim(description)) between 1 and 240),
 quantity numeric(12,3) not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0),
 line_total numeric(16,2) generated always as(round(quantity*unit_price,2)) stored,
 created_at timestamptz not null default now(),
 foreign key(estimate_id,workshop_id) references public.estimates(id,workshop_id) on delete cascade
);
create table public.estimate_events (
 id bigint generated always as identity primary key, workshop_id uuid not null, estimate_id uuid not null,
 action text not null check(action in ('created','approved','rejected','converted')),
 actor_id uuid references auth.users(id) on delete set null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(estimate_id,workshop_id) references public.estimates(id,workshop_id) on delete cascade
);

create function private.prepare_estimate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
 new.total_amount:=greatest(new.items_subtotal-new.discount,0);
 if new.status in ('approved','rejected') and (tg_op='INSERT' or old.status is distinct from new.status) then new.reviewed_by:=auth.uid(); end if;
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then new.approved_at:=now(); end if;
 return new;
end $$;
create trigger estimates_prepare before insert or update on public.estimates for each row execute function private.prepare_estimate();
create trigger estimates_updated_at before update on public.estimates for each row execute function public.set_updated_at();

create function private.recalculate_estimate() returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid; target_workshop uuid;
begin
 target_id:=case when tg_op='DELETE' then old.estimate_id else new.estimate_id end;
 target_workshop:=case when tg_op='DELETE' then old.workshop_id else new.workshop_id end;
 update public.estimates e set items_subtotal=coalesce((select sum(i.line_total) from public.estimate_items i where i.estimate_id=target_id and i.workshop_id=target_workshop),0)
 where e.id=target_id and e.workshop_id=target_workshop;
 return null;
end $$;
create trigger estimate_items_recalculate after insert or update or delete on public.estimate_items for each row execute function private.recalculate_estimate();

alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;
alter table public.estimate_events enable row level security;
create policy estimates_read on public.estimates for select to authenticated using(private.has_workshop_permission(workshop_id,'estimates','view'));
create policy estimate_items_read on public.estimate_items for select to authenticated using(private.has_workshop_permission(workshop_id,'estimates','view'));
create policy estimate_events_read on public.estimate_events for select to authenticated using(private.has_workshop_permission(workshop_id,'estimates','view'));
revoke all on public.estimates,public.estimate_items,public.estimate_events from public,anon,authenticated;
grant select on public.estimates,public.estimate_items,public.estimate_events to authenticated;
revoke all on function private.prepare_estimate() from public,anon,authenticated;
revoke all on function private.recalculate_estimate() from public,anon,authenticated;

create function private.create_estimate(target_workshop uuid,target_customer uuid,target_vehicle uuid,target_valid_until date,target_complaint text,target_notes text,target_discount numeric,target_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; item jsonb;
begin
 if not private.has_workshop_permission(target_workshop,'estimates','create') then raise exception 'not authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.vehicles v where v.id=target_vehicle and v.workshop_id=target_workshop and v.customer_id=target_customer and v.archived_at is null) then raise exception 'vehicle/customer mismatch' using errcode='23503'; end if;
 if target_discount is null or target_discount<0 or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)=0 then raise exception 'invalid estimate' using errcode='22023'; end if;
 insert into public.estimates(workshop_id,customer_id,vehicle_id,valid_until,complaint,notes,discount)
 values(target_workshop,target_customer,target_vehicle,target_valid_until,trim(target_complaint),coalesce(target_notes,''),target_discount) returning id into new_id;
 for item in select value from jsonb_array_elements(target_items) loop
  insert into public.estimate_items(workshop_id,estimate_id,item_type,description,quantity,unit_price)
  values(target_workshop,new_id,item->>'item_type',trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unit_price')::numeric);
 end loop;
 insert into public.estimate_events(workshop_id,estimate_id,action,actor_id) values(target_workshop,new_id,'created',auth.uid());
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop,auth.uid(),'estimates.created','estimates',new_id::text);
 return new_id;
end $$;
create function public.create_estimate(target_workshop uuid,target_customer uuid,target_vehicle uuid,target_valid_until date,target_complaint text,target_notes text,target_discount numeric,target_items jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.create_estimate($1,$2,$3,$4,$5,$6,$7,$8) $$;
revoke all on function private.create_estimate(uuid,uuid,uuid,date,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function private.create_estimate(uuid,uuid,uuid,date,text,text,numeric,jsonb) to authenticated;
revoke all on function public.create_estimate(uuid,uuid,uuid,date,text,text,numeric,jsonb) from public,anon;
grant execute on function public.create_estimate(uuid,uuid,uuid,date,text,text,numeric,jsonb) to authenticated;

create function private.review_estimate(target_workshop uuid,target_estimate uuid,decision text)
returns void language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
 if not private.has_workshop_permission(target_workshop,'estimates','update') then raise exception 'not authorized' using errcode='42501'; end if;
 if decision not in ('approved','rejected') then raise exception 'invalid decision' using errcode='22023'; end if;
 select status into current_status from public.estimates where id=target_estimate and workshop_id=target_workshop for update;
 if not found or current_status<>'pending' then raise exception 'estimate cannot be reviewed' using errcode='55000'; end if;
 update public.estimates set status=decision where id=target_estimate and workshop_id=target_workshop;
 insert into public.estimate_events(workshop_id,estimate_id,action,actor_id) values(target_workshop,target_estimate,decision,auth.uid());
end $$;
create function public.review_estimate(target_workshop uuid,target_estimate uuid,decision text)
returns void language sql security invoker set search_path='' as $$ select private.review_estimate($1,$2,$3) $$;
revoke all on function private.review_estimate(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.review_estimate(uuid,uuid,text) to authenticated;
revoke all on function public.review_estimate(uuid,uuid,text) from public,anon;
grant execute on function public.review_estimate(uuid,uuid,text) to authenticated;

create function private.convert_estimate(target_workshop uuid,target_estimate uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.estimates%rowtype; new_order uuid;
begin
 if not private.has_workshop_permission(target_workshop,'estimates','update') or not private.has_workshop_permission(target_workshop,'service_orders','create') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into e from public.estimates where id=target_estimate and workshop_id=target_workshop for update;
 if not found or e.status<>'approved' then raise exception 'only an approved estimate can be converted' using errcode='55000'; end if;
 if e.valid_until is not null and e.valid_until<current_date then raise exception 'estimate expired' using errcode='55000'; end if;
 insert into public.service_orders(workshop_id,customer_id,vehicle_id,status,complaint,diagnosis,notes,discount)
 values(target_workshop,e.customer_id,e.vehicle_id,'open','Orçamento nº '||e.estimate_number||': '||e.complaint,'',e.notes,e.discount) returning id into new_order;
 insert into public.service_order_items(workshop_id,service_order_id,item_type,description,quantity,unit_price)
 select target_workshop,new_order,item_type,description,quantity,unit_price from public.estimate_items where estimate_id=e.id and workshop_id=target_workshop;
 update public.estimates set status='converted',converted_order_id=new_order where id=e.id and workshop_id=target_workshop;
 insert into public.estimate_events(workshop_id,estimate_id,action,actor_id,detail) values(target_workshop,e.id,'converted',auth.uid(),jsonb_build_object('service_order_id',new_order));
 return new_order;
end $$;
create function public.convert_estimate(target_workshop uuid,target_estimate uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.convert_estimate($1,$2) $$;
revoke all on function private.convert_estimate(uuid,uuid) from public,anon,authenticated;
grant execute on function private.convert_estimate(uuid,uuid) to authenticated;
revoke all on function public.convert_estimate(uuid,uuid) from public,anon;
grant execute on function public.convert_estimate(uuid,uuid) to authenticated;

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text,can_view boolean,can_create boolean,can_update boolean,can_delete boolean)
language sql stable security invoker set search_path='' as $$
 select requested.module,private.has_workshop_permission(target_workshop_id,requested.module,'view'),private.has_workshop_permission(target_workshop_id,requested.module,'create'),private.has_workshop_permission(target_workshop_id,requested.module,'update'),private.has_workshop_permission(target_workshop_id,requested.module,'delete')
 from (values ('clients'),('vehicles'),('service_orders'),('inventory'),('finance'),('estimates')) as requested(module)
 where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public,anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;
