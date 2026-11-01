alter table public.payables add constraint payables_id_workshop_unique unique(id,workshop_id);

create table public.payable_payment_reversals(
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  payable_id uuid not null,
  reason text not null check(length(trim(reason)) between 3 and 1000),
  previous_paid_at timestamptz not null,
  reversed_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz not null default now(),
  foreign key(payable_id,workshop_id) references public.payables(id,workshop_id) on delete restrict
);
alter table public.payable_payment_reversals enable row level security;
revoke all on public.payable_payment_reversals from public,anon,authenticated;
grant select on public.payable_payment_reversals to authenticated;
create policy payable_payment_reversals_read on public.payable_payment_reversals for select to authenticated
  using(private.has_workshop_permission(workshop_id,'finance','view'));

create function private.reverse_payable_payment(target_workshop uuid,target_payable uuid,reversal_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare paid_time timestamptz;
begin
  if not private.has_workshop_permission(target_workshop,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
  if reversal_reason is null or length(trim(reversal_reason))<3 or length(reversal_reason)>1000 then raise exception 'a reason of 3 to 1000 characters is required' using errcode='22023'; end if;
  select paid_at into paid_time from public.payables where id=target_payable and workshop_id=target_workshop and status='paid' for update;
  if not found or paid_time is null then raise exception 'paid payable not found' using errcode='P0002'; end if;
  insert into public.payable_payment_reversals(workshop_id,payable_id,reason,previous_paid_at,reversed_by)
    values(target_workshop,target_payable,trim(reversal_reason),paid_time,auth.uid());
  update public.payables set status='pending',paid_at=null where id=target_payable and workshop_id=target_workshop;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'payables.payment_reversed','payables',target_payable::text);
end $$;
create function public.reverse_payable_payment(target_workshop uuid,target_payable uuid,reversal_reason text)
returns void language sql security invoker set search_path='' as $$
  select private.reverse_payable_payment(target_workshop,target_payable,reversal_reason)
$$;
revoke all on function private.reverse_payable_payment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reverse_payable_payment(uuid,uuid,text) to authenticated;
revoke all on function public.reverse_payable_payment(uuid,uuid,text) from public,anon;
grant execute on function public.reverse_payable_payment(uuid,uuid,text) to authenticated;
