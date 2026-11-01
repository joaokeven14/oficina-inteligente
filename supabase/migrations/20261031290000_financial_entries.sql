create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  entry_type text not null check (entry_type in ('receivable','expense')),
  description text not null check (length(trim(description)) between 2 and 180),
  category text not null check (length(trim(category)) between 2 and 80),
  amount numeric(14,2) not null check (amount > 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending','paid')),
  settled_at timestamptz,
  customer_id uuid,
  service_order_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(id,workshop_id),
  foreign key(customer_id,workshop_id) references public.customers(id,workshop_id) on delete restrict,
  foreign key(service_order_id,workshop_id) references public.service_orders(id,workshop_id) on delete restrict,
  check ((status='paid')=(settled_at is not null)),
  check (entry_type='receivable' or (customer_id is null and service_order_id is null))
);
create unique index financial_order_receivable_once on public.financial_entries(service_order_id) where service_order_id is not null;
create index financial_entries_workshop_due on public.financial_entries(workshop_id,status,due_date);
alter table public.financial_entries enable row level security;
create policy financial_entries_read on public.financial_entries for select to authenticated
  using(private.has_workshop_permission(workshop_id,'finance','view'));
create policy financial_entries_create on public.financial_entries for insert to authenticated
  with check(private.has_workshop_permission(workshop_id,'finance','create'));
revoke all on public.financial_entries from public,anon,authenticated;
grant select,insert on public.financial_entries to authenticated;

create function private.create_financial_entry(target_workshop uuid,target_type text,target_description text,target_category text,target_amount numeric,target_due_date date,target_customer uuid default null,target_order uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
 if not private.has_workshop_permission(target_workshop,'finance','create') then raise exception 'not authorized' using errcode='42501'; end if;
 if target_type not in ('receivable','expense') or target_description is null or length(trim(target_description))<2 or target_category is null or length(trim(target_category))<2 or target_amount is null or target_amount<=0 then raise exception 'invalid financial entry' using errcode='22023'; end if;
 if target_type='expense' and (target_customer is not null or target_order is not null) then raise exception 'expense cannot reference customer or service order' using errcode='22023'; end if;
 if target_order is not null and not exists(select 1 from public.service_orders where id=target_order and workshop_id=target_workshop) then raise exception 'service order not found' using errcode='23503'; end if;
 insert into public.financial_entries(workshop_id,entry_type,description,category,amount,due_date,customer_id,service_order_id)
 values(target_workshop,target_type,trim(target_description),trim(target_category),target_amount,target_due_date,target_customer,target_order) returning id into new_id;
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop,auth.uid(),'finance.entry_created','financial_entries',new_id::text);
 return new_id;
end $$;
create function public.create_financial_entry(target_workshop uuid,target_type text,target_description text,target_category text,target_amount numeric,target_due_date date default null,target_customer uuid default null,target_order uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select private.create_financial_entry(target_workshop,target_type,target_description,target_category,target_amount,target_due_date,target_customer,target_order) $$;
revoke all on function private.create_financial_entry(uuid,text,text,text,numeric,date,uuid,uuid) from public,anon,authenticated;
grant execute on function private.create_financial_entry(uuid,text,text,text,numeric,date,uuid,uuid) to authenticated;
revoke all on function public.create_financial_entry(uuid,text,text,text,numeric,date,uuid,uuid) from public,anon;
grant execute on function public.create_financial_entry(uuid,text,text,text,numeric,date,uuid,uuid) to authenticated;

create function private.settle_financial_entry(target_workshop uuid,target_entry uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_workshop_permission(target_workshop,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
 update public.financial_entries set status='paid',settled_at=now() where id=target_entry and workshop_id=target_workshop and status='pending';
 if not found then raise exception 'entry not found or already settled' using errcode='P0002'; end if;
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop,auth.uid(),'finance.entry_settled','financial_entries',target_entry::text);
end $$;
create function public.settle_financial_entry(target_workshop uuid,target_entry uuid)
returns void language sql security invoker set search_path='' as $$ select private.settle_financial_entry(target_workshop,target_entry) $$;
revoke all on function private.settle_financial_entry(uuid,uuid) from public,anon,authenticated;
grant execute on function private.settle_financial_entry(uuid,uuid) to authenticated;
revoke all on function public.settle_financial_entry(uuid,uuid) from public,anon;
grant execute on function public.settle_financial_entry(uuid,uuid) to authenticated;

create function private.create_service_order_receivable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='delivered' and old.status is distinct from 'delivered' and new.total_amount>0 then
   insert into public.financial_entries(workshop_id,entry_type,description,category,amount,due_date,customer_id,service_order_id,created_by)
   values(new.workshop_id,'receivable','Ordem de serviço '||new.order_number,'Serviços',new.total_amount,current_date,new.customer_id,new.id,auth.uid())
   on conflict(service_order_id) where service_order_id is not null do nothing;
 end if;
 return new;
end $$;
create trigger service_order_receivable_after_delivery after update of status on public.service_orders
for each row execute function private.create_service_order_receivable();

create or replace function public.get_workshop_permissions(target_workshop_id uuid)
returns table(module text,can_view boolean,can_create boolean,can_update boolean,can_delete boolean)
language sql stable security invoker set search_path='' as $$
 select requested.module,private.has_workshop_permission(target_workshop_id,requested.module,'view'),private.has_workshop_permission(target_workshop_id,requested.module,'create'),private.has_workshop_permission(target_workshop_id,requested.module,'update'),private.has_workshop_permission(target_workshop_id,requested.module,'delete')
 from (values ('dashboard'),('clients'),('vehicles'),('service_orders'),('estimates'),('inventory'),('finance'),('reports'),('employees'),('settings')) as requested(module)
 where private.is_active_workshop_member(target_workshop_id)
$$;
revoke all on function public.get_workshop_permissions(uuid) from public,anon;
grant execute on function public.get_workshop_permissions(uuid) to authenticated;

create function public.get_finance_dashboard_metrics(target_workshop uuid)
returns table(receivables_pending numeric,receivables_overdue numeric,received_this_month numeric,expenses_this_month numeric,profit_this_month numeric,estimates_approved bigint)
language plpgsql stable security invoker set search_path='' as $$
declare month_start date := date_trunc('month',current_date)::date;
begin
 if not private.has_workshop_permission(target_workshop,'dashboard','view') or not private.has_workshop_permission(target_workshop,'finance','view') then raise exception 'not authorized' using errcode='42501'; end if;
 return query
 select
  coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='receivable' and e.status='pending'),0),
  coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='receivable' and e.status='pending' and e.due_date<current_date),0),
  coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='receivable' and e.status='paid' and e.settled_at>=month_start and e.settled_at<month_start+interval '1 month'),0),
  coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='expense' and e.status='paid' and e.settled_at>=month_start and e.settled_at<month_start+interval '1 month'),0)
   + coalesce((select sum(p.amount) from public.payables p where p.workshop_id=target_workshop and p.status='paid' and p.paid_at>=month_start and p.paid_at<month_start+interval '1 month'),0),
  coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='receivable' and e.status='paid' and e.settled_at>=month_start and e.settled_at<month_start+interval '1 month'),0)
   - coalesce((select sum(e.amount) from public.financial_entries e where e.workshop_id=target_workshop and e.entry_type='expense' and e.status='paid' and e.settled_at>=month_start and e.settled_at<month_start+interval '1 month'),0)
   - coalesce((select sum(p.amount) from public.payables p where p.workshop_id=target_workshop and p.status='paid' and p.paid_at>=month_start and p.paid_at<month_start+interval '1 month'),0),
  (select count(*) from public.estimates e where e.workshop_id=target_workshop and e.status='approved' and private.has_workshop_permission(target_workshop,'estimates','view'));
end $$;
revoke all on function public.get_finance_dashboard_metrics(uuid) from public,anon;
grant execute on function public.get_finance_dashboard_metrics(uuid) to authenticated;
