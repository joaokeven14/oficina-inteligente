-- The private object bucket is managed by the authenticated Edge Function because
-- Supabase owns the Storage tables. The public metadata table remains tenant-scoped.

create table public.service_order_attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  service_order_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  caption text not null default '' check (length(caption) <= 300),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, workshop_id),
  foreign key (service_order_id, workshop_id) references public.service_orders(id, workshop_id) on delete restrict,
  check (storage_path like workshop_id::text || '/' || service_order_id::text || '/%')
);

alter table public.service_order_attachments enable row level security;
revoke all on public.service_order_attachments from public,anon,authenticated;
grant select,insert,delete on public.service_order_attachments to authenticated;
create policy service_order_attachments_read on public.service_order_attachments for select to authenticated
  using (private.has_workshop_permission(workshop_id,'service_orders','view'));
create policy service_order_attachments_create on public.service_order_attachments for insert to authenticated
  with check (private.has_workshop_permission(workshop_id,'service_orders','update') and uploaded_by=auth.uid() and exists (
    select 1 from public.service_orders o where o.id=service_order_attachments.service_order_id and o.workshop_id=service_order_attachments.workshop_id and o.status<>'canceled'
  ));
create policy service_order_attachments_delete on public.service_order_attachments for delete to authenticated
  using (private.has_workshop_permission(workshop_id,'service_orders','update'));

create function private.audit_service_order_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(workshop_id,actor_id,action,entity,entity_id)
  values(new.workshop_id,auth.uid(),'service_order.photo_added','service_order_attachments',new.id::text);
  return new;
end $$;
create trigger service_order_attachment_audit after insert on public.service_order_attachments
for each row execute function private.audit_service_order_attachment();
revoke all on function private.audit_service_order_attachment() from public,anon,authenticated;
