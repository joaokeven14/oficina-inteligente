create table public.service_order_inspection_items (
 id uuid primary key default gen_random_uuid(), workshop_id uuid not null, service_order_id uuid not null,
 item_kind text not null check(item_kind in ('checklist','inspection')),
 item_key text not null check(length(trim(item_key)) between 2 and 80),
 item_label text not null check(length(trim(item_label)) between 2 and 120),
 condition text not null default 'not_inspected' check(condition in ('good','attention','critical','not_inspected')),
 observations text not null default '', recommendation text not null default '', updated_at timestamptz not null default now(),
 unique(service_order_id,item_kind,item_key), unique(id,workshop_id),
 foreign key(service_order_id,workshop_id) references public.service_orders(id,workshop_id) on delete cascade
);
create table public.service_order_technical_notes (
 id uuid primary key default gen_random_uuid(), workshop_id uuid not null, service_order_id uuid not null,
 category text not null check(category in ('Combustível','Motor','Bateria','Sistema elétrico','Arrefecimento','Freios','Suspensão','Transmissão','Pneus','Manutenção preventiva')),
 body text not null check(length(trim(body)) between 5 and 300), is_recommendation boolean not null default true,
 created_by uuid default auth.uid() references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 foreign key(service_order_id,workshop_id) references public.service_orders(id,workshop_id) on delete cascade
);
alter table public.service_order_inspection_items enable row level security;
alter table public.service_order_technical_notes enable row level security;
create policy inspection_items_read on public.service_order_inspection_items for select to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','view'));
create policy inspection_items_insert on public.service_order_inspection_items for insert to authenticated with check(private.has_workshop_permission(workshop_id,'service_orders','update'));
create policy inspection_items_update on public.service_order_inspection_items for update to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','update')) with check(private.has_workshop_permission(workshop_id,'service_orders','update'));
create policy inspection_items_delete on public.service_order_inspection_items for delete to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','delete'));
create policy technical_notes_read on public.service_order_technical_notes for select to authenticated using(private.has_workshop_permission(workshop_id,'service_orders','view'));
create policy technical_notes_write on public.service_order_technical_notes for insert to authenticated with check(private.has_workshop_permission(workshop_id,'service_orders','update'));
revoke all on public.service_order_inspection_items,public.service_order_technical_notes from public,anon,authenticated;
grant select,insert,update,delete on public.service_order_inspection_items to authenticated;
grant select,insert on public.service_order_technical_notes to authenticated;
create trigger inspection_items_audit after insert or update or delete on public.service_order_inspection_items for each row execute function private.record_workshop_data_change();
create trigger technical_notes_audit after insert on public.service_order_technical_notes for each row execute function private.record_workshop_data_change();

create function private.seed_service_order_inspection_items()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.service_order_inspection_items(workshop_id,service_order_id,item_kind,item_key,item_label)
 select new.workshop_id,new.id,'checklist',v.key,v.label from (values
  ('paint','Pintura'),('bumpers','Para-choques'),('mirrors','Retrovisores'),('windows','Vidros'),('headlights','Faróis'),('taillights','Lanternas'),('tires','Pneus'),('spare_tire','Estepe'),('tools','Ferramentas'),('fuel','Combustível'),('odometer','Quilometragem'),('accessories','Acessórios'),('damage','Avarias')
 ) v(key,label);
 insert into public.service_order_inspection_items(workshop_id,service_order_id,item_kind,item_key,item_label)
 select new.workshop_id,new.id,'inspection',v.key,v.label from (values
  ('engine','Motor'),('oil','Óleo'),('cooling','Arrefecimento'),('battery','Bateria'),('electrical','Sistema elétrico'),('brakes','Freios'),('suspension','Suspensão'),('steering','Direção'),('transmission','Transmissão'),('tires','Pneus'),('lighting','Iluminação'),('safety','Segurança')
 ) v(key,label);
 return null;
end $$;
create trigger service_order_seed_inspection after insert on public.service_orders for each row execute function private.seed_service_order_inspection_items();
revoke all on function private.seed_service_order_inspection_items() from public,anon,authenticated;

insert into public.service_order_inspection_items(workshop_id,service_order_id,item_kind,item_key,item_label)
select o.workshop_id,o.id,'checklist',v.key,v.label from public.service_orders o cross join (values
 ('paint','Pintura'),('bumpers','Para-choques'),('mirrors','Retrovisores'),('windows','Vidros'),('headlights','Faróis'),('taillights','Lanternas'),('tires','Pneus'),('spare_tire','Estepe'),('tools','Ferramentas'),('fuel','Combustível'),('odometer','Quilometragem'),('accessories','Acessórios'),('damage','Avarias')
) v(key,label) on conflict(service_order_id,item_kind,item_key) do nothing;
insert into public.service_order_inspection_items(workshop_id,service_order_id,item_kind,item_key,item_label)
select o.workshop_id,o.id,'inspection',v.key,v.label from public.service_orders o cross join (values
 ('engine','Motor'),('oil','Óleo'),('cooling','Arrefecimento'),('battery','Bateria'),('electrical','Sistema elétrico'),('brakes','Freios'),('suspension','Suspensão'),('steering','Direção'),('transmission','Transmissão'),('tires','Pneus'),('lighting','Iluminação'),('safety','Segurança')
) v(key,label) on conflict(service_order_id,item_kind,item_key) do nothing;
