alter table public.workshops
  add column cnpj text,
  add column phone text,
  add column whatsapp text,
  add column email text,
  add column address text,
  add column city text,
  add column state text,
  add column responsible_name text,
  add column opening_hours text;

create function private.save_workshop_settings(
 target_workshop uuid,target_name text,target_cnpj text,target_phone text,target_whatsapp text,
 target_email text,target_address text,target_city text,target_state text,target_responsible text,target_hours text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_workshop_permission(target_workshop,'settings','update') or not exists(
   select 1 from public.workshop_memberships m where m.workshop_id=target_workshop and m.user_id=auth.uid() and m.role='owner' and m.status='active'
 ) then raise exception 'active workshop owner access required' using errcode='42501'; end if;
 if target_name is null or length(trim(target_name))<2 or length(target_name)>160 then raise exception 'invalid workshop name' using errcode='22023'; end if;
 if target_email is not null and target_email<>'' and target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email' using errcode='22023'; end if;
 update public.workshops set name=trim(target_name),cnpj=nullif(regexp_replace(coalesce(target_cnpj,''),'\D','','g'),''),
 phone=nullif(trim(coalesce(target_phone,'')),''),whatsapp=nullif(trim(coalesce(target_whatsapp,'')),''),email=nullif(lower(trim(coalesce(target_email,''))),''),
 address=nullif(trim(coalesce(target_address,'')),''),city=nullif(trim(coalesce(target_city,'')),''),state=nullif(upper(trim(coalesce(target_state,''))),''),
 responsible_name=nullif(trim(coalesce(target_responsible,'')),''),opening_hours=nullif(trim(coalesce(target_hours,'')),'') where id=target_workshop;
 if not found then raise exception 'workshop not found' using errcode='P0002'; end if;
 insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id) values(target_workshop,auth.uid(),'workshop.settings_updated','workshops',target_workshop::text);
end $$;
create function public.save_workshop_settings(target_workshop uuid,target_name text,target_cnpj text,target_phone text,target_whatsapp text,target_email text,target_address text,target_city text,target_state text,target_responsible text,target_hours text)
returns void language sql security invoker set search_path='' as $$
 select private.save_workshop_settings(target_workshop,target_name,target_cnpj,target_phone,target_whatsapp,target_email,target_address,target_city,target_state,target_responsible,target_hours)
$$;
revoke all on function private.save_workshop_settings(uuid,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.save_workshop_settings(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.save_workshop_settings(uuid,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.save_workshop_settings(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
