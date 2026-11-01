create or replace function private.get_platform_metrics()
returns table(workshops_total bigint, workshops_active bigint, workshops_blocked bigint, members_total bigint, members_active bigint, workshops_created_today bigint, audit_events_today bigint)
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

create or replace function private.list_platform_workshops()
returns table(id uuid, name text, status text, created_at timestamptz, members_total bigint, owners jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_admin() then raise exception 'platform administrator access required' using errcode='42501'; end if;
  return query
  select
    w.id, w.name, w.status, w.created_at, count(m.id)::bigint,
    coalesce(
      jsonb_agg(jsonb_build_object('full_name', coalesce(nullif(p.full_name, ''), 'Sem nome'), 'email', u.email, 'status', m.status) order by p.full_name, u.email)
        filter (where m.role = 'owner'),
      '[]'::jsonb
    )
  from public.workshops w
  left join public.workshop_memberships m on m.workshop_id = w.id
  left join public.profiles p on p.user_id = m.user_id
  left join auth.users u on u.id = m.user_id
  group by w.id, w.name, w.status, w.created_at
  order by w.created_at desc, w.id;
end $$;

revoke all on function private.get_platform_metrics() from public, anon, authenticated;
revoke all on function private.list_platform_workshops() from public, anon, authenticated;
grant execute on function private.get_platform_metrics() to authenticated;
grant execute on function private.list_platform_workshops() to authenticated;

create or replace function public.get_platform_metrics()
returns table(workshops_total bigint, workshops_active bigint, workshops_blocked bigint, members_total bigint, members_active bigint, workshops_created_today bigint, audit_events_today bigint)
language sql stable security invoker set search_path='' as $$
  select * from private.get_platform_metrics()
$$;

create or replace function public.list_platform_workshops()
returns table(id uuid, name text, status text, created_at timestamptz, members_total bigint, owners jsonb)
language sql stable security invoker set search_path='' as $$
  select * from private.list_platform_workshops()
$$;

revoke all on function public.get_platform_metrics() from public, anon, authenticated;
revoke all on function public.list_platform_workshops() from public, anon, authenticated;
grant execute on function public.get_platform_metrics() to authenticated;
grant execute on function public.list_platform_workshops() to authenticated;
