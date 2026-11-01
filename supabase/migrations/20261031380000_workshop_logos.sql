alter table public.workshops add column logo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workshop-logos','workshop-logos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create function private.workshop_logo_folder(target_path text)
returns uuid language sql immutable set search_path='' as $$
  select case when (storage.foldername(target_path))[1] ~ '^[0-9a-fA-F-]{36}$' then ((storage.foldername(target_path))[1])::uuid else null end
$$;
revoke all on function private.workshop_logo_folder(text) from public,anon;
grant execute on function private.workshop_logo_folder(text) to authenticated;

create policy workshop_logo_read on storage.objects for select to authenticated using(
  bucket_id='workshop-logos' and cardinality(storage.foldername(name))=1
  and private.is_active_workshop_member(private.workshop_logo_folder(name))
);
create policy workshop_logo_create on storage.objects for insert to authenticated with check(
  bucket_id='workshop-logos' and cardinality(storage.foldername(name))=1 and exists(
    select 1 where private.is_workshop_owner(private.workshop_logo_folder(name))
      and private.has_workshop_permission(private.workshop_logo_folder(name),'settings','update')
  )
);
create policy workshop_logo_delete on storage.objects for delete to authenticated using(
  bucket_id='workshop-logos' and cardinality(storage.foldername(name))=1 and exists(
    select 1 where private.is_workshop_owner(private.workshop_logo_folder(name))
      and private.has_workshop_permission(private.workshop_logo_folder(name),'settings','update')
  )
);

create function private.set_workshop_logo_path(target_workshop uuid,target_path text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_workshop_permission(target_workshop,'settings','update') or not exists(
    select 1 from public.workshop_memberships where workshop_id=target_workshop and user_id=auth.uid() and role='owner' and status='active'
  ) then raise exception 'active workshop owner access required' using errcode='42501'; end if;
  if target_path is not null and (target_path !~ ('^'||target_workshop::text||'/[A-Za-z0-9._-]{1,100}$') or not exists(
    select 1 from storage.objects where bucket_id='workshop-logos' and name=target_path
  )) then raise exception 'invalid workshop logo path' using errcode='22023'; end if;
  update public.workshops set logo_path=target_path where id=target_workshop;
  if not found then raise exception 'workshop not found' using errcode='P0002'; end if;
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
    values(target_workshop,auth.uid(),'workshop.logo_updated','workshops',target_workshop::text);
end $$;
create function public.set_workshop_logo_path(target_workshop uuid,target_path text)
returns void language sql security invoker set search_path='' as $$ select private.set_workshop_logo_path(target_workshop,target_path) $$;
revoke all on function private.set_workshop_logo_path(uuid,text) from public,anon,authenticated;
grant execute on function private.set_workshop_logo_path(uuid,text) to authenticated;
revoke all on function public.set_workshop_logo_path(uuid,text) from public,anon;
grant execute on function public.set_workshop_logo_path(uuid,text) to authenticated;
