-- Store the planned purchase method and the method actually used to settle
-- supplier bills and other financial entries.
alter table public.purchases
  add constraint purchases_payment_method_check
  check (payment_method is null or payment_method in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other'));

alter table public.payables add column payment_method text;
alter table public.payables
  add constraint payables_payment_method_check
  check (payment_method is null or payment_method in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other'));

alter table public.financial_entries add column payment_method text;
alter table public.financial_entries
  add constraint financial_entries_payment_method_check
  check (payment_method is null or payment_method in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other'));

alter table public.financial_entry_reversals add column previous_payment_method text;
alter table public.payable_payment_reversals add column previous_payment_method text;

create function private.create_purchase_multi_with_method(
  target_workshop_id uuid,
  target_supplier_id uuid,
  target_items jsonb,
  target_due_date date,
  target_payment_method text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if target_payment_method is null or target_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other') then
    raise exception 'invalid payment method' using errcode='22023';
  end if;
  created_id := private.create_purchase_multi(target_workshop_id,target_supplier_id,target_items,target_due_date);
  update public.purchases set payment_method=target_payment_method where id=created_id and workshop_id=target_workshop_id;
  return created_id;
end $$;

create function public.create_purchase_multi_with_method(
  target_workshop_id uuid,
  target_supplier_id uuid,
  target_items jsonb,
  target_due_date date,
  target_payment_method text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_purchase_multi_with_method(target_workshop_id,target_supplier_id,target_items,target_due_date,target_payment_method)
$$;
revoke all on function private.create_purchase_multi_with_method(uuid,uuid,jsonb,date,text) from public,anon,authenticated;
grant execute on function private.create_purchase_multi_with_method(uuid,uuid,jsonb,date,text) to authenticated;
revoke all on function public.create_purchase_multi_with_method(uuid,uuid,jsonb,date,text) from public,anon;
grant execute on function public.create_purchase_multi_with_method(uuid,uuid,jsonb,date,text) to authenticated;

create function private.mark_payable_paid_with_method(target_workshop_id uuid,target_payable_id uuid,target_payment_method text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_workshop_permission(target_workshop_id,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
  if target_payment_method is null or target_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other') then raise exception 'invalid payment method' using errcode='22023'; end if;
  update public.payables set status='paid',paid_at=now(),payment_method=target_payment_method
    where id=target_payable_id and workshop_id=target_workshop_id and status='pending';
  if not found then raise exception 'payable not found or already paid' using errcode='P0002'; end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop_id,auth.uid(),'payables.paid','payables',target_payable_id::text);
end $$;
create function public.mark_payable_paid_with_method(target_workshop_id uuid,target_payable_id uuid,target_payment_method text)
returns void language sql security invoker set search_path = '' as $$
  select private.mark_payable_paid_with_method(target_workshop_id,target_payable_id,target_payment_method)
$$;
revoke all on function private.mark_payable_paid_with_method(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.mark_payable_paid_with_method(uuid,uuid,text) to authenticated;
revoke all on function public.mark_payable_paid_with_method(uuid,uuid,text) from public,anon;
grant execute on function public.mark_payable_paid_with_method(uuid,uuid,text) to authenticated;
-- Prevent clients from using the old method-less settlement route.
revoke all on function private.mark_payable_paid(uuid,uuid) from public,anon,authenticated;
revoke all on function public.mark_payable_paid(uuid,uuid) from public,anon,authenticated;

create function private.settle_financial_entry_with_method(target_workshop uuid,target_entry uuid,target_payment_method text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_workshop_permission(target_workshop,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
  if target_payment_method is null or target_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','on_account','other') then raise exception 'invalid payment method' using errcode='22023'; end if;
  update public.financial_entries set status='paid',settled_at=now(),payment_method=target_payment_method
    where id=target_entry and workshop_id=target_workshop and status='pending';
  if not found then raise exception 'entry not found or already settled' using errcode='P0002'; end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'finance.entry_settled','financial_entries',target_entry::text);
end $$;
create function public.settle_financial_entry_with_method(target_workshop uuid,target_entry uuid,target_payment_method text)
returns void language sql security invoker set search_path = '' as $$
  select private.settle_financial_entry_with_method(target_workshop,target_entry,target_payment_method)
$$;
revoke all on function private.settle_financial_entry_with_method(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.settle_financial_entry_with_method(uuid,uuid,text) to authenticated;
revoke all on function public.settle_financial_entry_with_method(uuid,uuid,text) from public,anon;
grant execute on function public.settle_financial_entry_with_method(uuid,uuid,text) to authenticated;
revoke all on function private.settle_financial_entry(uuid,uuid) from public,anon,authenticated;
revoke all on function public.settle_financial_entry(uuid,uuid) from public,anon,authenticated;

create or replace function private.reverse_financial_entry(target_workshop uuid,target_entry uuid,reversal_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare original_settlement timestamptz; original_method text;
begin
  if not private.has_workshop_permission(target_workshop,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
  if reversal_reason is null or length(trim(reversal_reason)) not between 3 and 500 then raise exception 'a reversal reason between 3 and 500 characters is required' using errcode='22023'; end if;
  select settled_at,payment_method into original_settlement,original_method from public.financial_entries
    where id=target_entry and workshop_id=target_workshop and status='paid' for update;
  if not found then raise exception 'paid entry not found' using errcode='P0002'; end if;
  insert into public.financial_entry_reversals(workshop_id,financial_entry_id,reason,previous_settled_at,previous_payment_method,reversed_by)
    values(target_workshop,target_entry,trim(reversal_reason),original_settlement,original_method,auth.uid());
  update public.financial_entries set status='pending',settled_at=null,payment_method=null where id=target_entry and workshop_id=target_workshop;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'finance.entry_reversed','financial_entries',target_entry::text);
end $$;

create or replace function private.reverse_payable_payment(target_workshop uuid,target_payable uuid,reversal_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare paid_time timestamptz; paid_method text;
begin
  if not private.has_workshop_permission(target_workshop,'finance','update') then raise exception 'not authorized' using errcode='42501'; end if;
  if reversal_reason is null or length(trim(reversal_reason))<3 or length(trim(reversal_reason))>1000 then raise exception 'a reason of 3 to 1000 characters is required' using errcode='22023'; end if;
  select paid_at,payment_method into paid_time,paid_method from public.payables where id=target_payable and workshop_id=target_workshop and status='paid' for update;
  if not found or paid_time is null then raise exception 'paid payable not found' using errcode='P0002'; end if;
  insert into public.payable_payment_reversals(workshop_id,payable_id,reason,previous_paid_at,previous_payment_method,reversed_by)
    values(target_workshop,target_payable,trim(reversal_reason),paid_time,paid_method,auth.uid());
  update public.payables set status='pending',paid_at=null,payment_method=null where id=target_payable and workshop_id=target_workshop;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'payables.payment_reversed','payables',target_payable::text);
end $$;
