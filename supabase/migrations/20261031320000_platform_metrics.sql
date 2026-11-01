create function public.get_platform_metrics()
returns table(workshops_total bigint,workshops_active bigint,workshops_blocked bigint,members_total bigint,members_active bigint,workshops_created_today bigint,audit_events_today bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_platform_admin() then raise exception 'platform administrator access required' using errcode='42501'; end if;
 return query select
  (select count(*) from public.workshops),
  (select count(*) from public.workshops where status='active'),
  (select count(*) from public.workshops where status='blocked'),
  (select count(*) from public.workshop_memberships),
  (select count(*) from public.workshop_memberships m join public.workshops w on w.id=m.workshop_id where m.status='active' and w.status='active'),
  (select count(*) from public.workshops where created_at::date=current_date),
  (select count(*) from public.audit_events where created_at::date=current_date);
end $$;
revoke all on function public.get_platform_metrics() from public,anon;
grant execute on function public.get_platform_metrics() to authenticated;
