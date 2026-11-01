create table public.financial_entry_reversals (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  financial_entry_id uuid not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  previous_settled_at timestamptz not null,
  reversed_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz not null default now(),
  foreign key (financial_entry_id, workshop_id)
    references public.financial_entries(id, workshop_id) on delete restrict
);

create index financial_entry_reversals_workshop_time
  on public.financial_entry_reversals(workshop_id, reversed_at desc);
alter table public.financial_entry_reversals enable row level security;
create policy financial_reversals_read on public.financial_entry_reversals for select to authenticated
  using (private.has_workshop_permission(workshop_id, 'finance', 'view'));
revoke all on public.financial_entry_reversals from public, anon, authenticated;
grant select on public.financial_entry_reversals to authenticated;

create function private.reverse_financial_entry(target_workshop uuid, target_entry uuid, reversal_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare original_settlement timestamptz;
begin
  if not private.has_workshop_permission(target_workshop, 'finance', 'update') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if reversal_reason is null or length(trim(reversal_reason)) not between 3 and 500 then
    raise exception 'a reversal reason between 3 and 500 characters is required' using errcode='22023';
  end if;
  select settled_at into original_settlement from public.financial_entries
    where id=target_entry and workshop_id=target_workshop and status='paid' for update;
  if not found then raise exception 'paid entry not found' using errcode='P0002'; end if;
  insert into public.financial_entry_reversals(workshop_id, financial_entry_id, reason, previous_settled_at, reversed_by)
    values(target_workshop, target_entry, trim(reversal_reason), original_settlement, auth.uid());
  update public.financial_entries set status='pending', settled_at=null where id=target_entry and workshop_id=target_workshop;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'finance.entry_reversed','financial_entries',target_entry::text);
end $$;

create function public.reverse_financial_entry(target_workshop uuid, target_entry uuid, reversal_reason text)
returns void language sql security invoker set search_path='' as $$
  select private.reverse_financial_entry(target_workshop,target_entry,reversal_reason)
$$;
revoke all on function private.reverse_financial_entry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reverse_financial_entry(uuid,uuid,text) to authenticated;
revoke all on function public.reverse_financial_entry(uuid,uuid,text) from public,anon;
grant execute on function public.reverse_financial_entry(uuid,uuid,text) to authenticated;
