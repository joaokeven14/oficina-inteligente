-- Platform administrators can search workshops by the owner's name and login.
-- The function returns no credentials and checks the platform role on the server.
create function public.list_platform_workshops()
returns table(
  id uuid,
  name text,
  status text,
  created_at timestamptz,
  members_total bigint,
  owners jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  return query
  select
    w.id,
    w.name,
    w.status,
    w.created_at,
    count(m.id)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'full_name', coalesce(nullif(p.full_name, ''), 'Sem nome'),
          'email', u.email,
          'status', m.status
        ) order by p.full_name, u.email
      ) filter (where m.role = 'owner'),
      '[]'::jsonb
    )
  from public.workshops w
  left join public.workshop_memberships m on m.workshop_id = w.id
  left join public.profiles p on p.user_id = m.user_id
  left join auth.users u on u.id = m.user_id
  group by w.id, w.name, w.status, w.created_at
  order by w.created_at desc, w.id;
end;
$$;

revoke all on function public.list_platform_workshops() from public, anon;
grant execute on function public.list_platform_workshops() to authenticated;
