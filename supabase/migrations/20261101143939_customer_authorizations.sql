-- Immutable customer authorization records tied to a service order and workshop.
create function private.valid_signature_strokes(target jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare stroke jsonb; point jsonb; point_count integer; total_points integer := 0; x_value numeric; y_value numeric;
begin
  if target is null or jsonb_typeof(target) <> 'array' then return false; end if;
  if jsonb_array_length(target) < 1 or jsonb_array_length(target) > 80 then return false; end if;
  for stroke in select value from jsonb_array_elements(target) loop
    if jsonb_typeof(stroke) <> 'array' then return false; end if;
    point_count := jsonb_array_length(stroke);
    if point_count < 1 or point_count > 1000 then return false; end if;
    for point in select value from jsonb_array_elements(stroke) loop
      if jsonb_typeof(point) <> 'object' or jsonb_typeof(point->'x') <> 'number' or jsonb_typeof(point->'y') <> 'number' then return false; end if;
      x_value := (point->>'x')::numeric; y_value := (point->>'y')::numeric;
      if x_value < 0 or x_value > 1 or y_value < 0 or y_value > 1 then return false; end if;
      total_points := total_points + 1;
      if total_points > 80000 then return false; end if;
    end loop;
  end loop;
  return total_points >= 2;
end $$;
revoke all on function private.valid_signature_strokes(jsonb) from public, anon, authenticated;
grant execute on function private.valid_signature_strokes(jsonb) to authenticated;

create table public.service_order_authorizations (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  service_order_id uuid not null,
  customer_id uuid not null,
  authorization_type text not null check (authorization_type in ('estimate','service','delivery')),
  signer_name text not null check (length(trim(signer_name)) between 2 and 180),
  statement text not null check (length(trim(statement)) between 5 and 2000),
  amount numeric(14,2) not null check (amount >= 0),
  signature_strokes jsonb not null check (private.valid_signature_strokes(signature_strokes) and pg_column_size(signature_strokes) <= 100000),
  signed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  signed_at timestamptz not null default clock_timestamp(),
  unique (id, workshop_id),
  foreign key (service_order_id, workshop_id) references public.service_orders(id, workshop_id) on delete restrict,
  foreign key (customer_id, workshop_id) references public.customers(id, workshop_id) on delete restrict
);

grant usage on schema private to authenticated;
revoke all on public.service_order_authorizations from public, anon, authenticated;
grant select, insert on public.service_order_authorizations to authenticated;
alter table public.service_order_authorizations enable row level security;
create policy service_order_authorizations_read on public.service_order_authorizations for select to authenticated
  using (private.has_workshop_permission(workshop_id, 'service_orders', 'view'));
create policy service_order_authorizations_create on public.service_order_authorizations for insert to authenticated
  with check (
    private.has_workshop_permission(workshop_id, 'service_orders', 'update')
    and signed_by = auth.uid()
    and exists (
      select 1 from public.service_orders o
      where o.id = service_order_authorizations.service_order_id
        and o.workshop_id = service_order_authorizations.workshop_id
        and o.customer_id = service_order_authorizations.customer_id
        and o.status <> 'canceled'
    )
  );

create function private.stamp_service_order_authorization()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.signed_by := auth.uid();
  new.signed_at := clock_timestamp();
  return new;
end $$;
create trigger service_order_authorization_stamp
before insert on public.service_order_authorizations
for each row execute function private.stamp_service_order_authorization();
revoke all on function private.stamp_service_order_authorization() from public, anon, authenticated;

create function private.audit_service_order_authorization()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(workshop_id, actor_id, action, entity, entity_id)
  values (new.workshop_id, auth.uid(), 'service_order.authorization_recorded', 'service_order_authorizations', new.id::text);
  return new;
end $$;
create trigger service_order_authorization_audit
after insert on public.service_order_authorizations
for each row execute function private.audit_service_order_authorization();
revoke all on function private.audit_service_order_authorization() from public, anon, authenticated;
