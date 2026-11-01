create function private.stop_service_order_timers_on_close()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from new.status and new.status in ('completed','delivered','canceled') then
    update public.service_order_time_entries set ended_at=greatest(now(),started_at)
      where workshop_id=new.workshop_id and service_order_id=new.id and ended_at is null;
  end if;
  return new;
end $$;
create trigger service_order_stop_timers_on_close
after update of status on public.service_orders
for each row execute function private.stop_service_order_timers_on_close();
revoke all on function private.stop_service_order_timers_on_close() from public,anon,authenticated;
