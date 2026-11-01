-- Run against a disposable local Supabase database after applying migrations.
-- Fixtures and the probe table are rolled back when the test completes.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(45);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'tenant-owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'tenant-owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner B"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'tenant-staff-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Staff A"}', now(), now());

insert into public.workshops (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Tenant A'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B');

insert into public.workshop_memberships (workshop_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'staff');

insert into public.customers (id, workshop_id, full_name, document) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Cliente A', '12345678901'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Cliente B', '12345678901234');

insert into public.vehicles (id, workshop_id, customer_id, make, model, plate) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Ford', 'Ka', 'AAA0001'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'VW', 'Gol', 'BBB0002');

insert into public.service_orders (id, workshop_id, customer_id, vehicle_id, complaint) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Ruído ao frear'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Revisão');

update public.service_orders set status='completed' where id='60000000-0000-4000-8000-000000000001';
insert into public.inventory_products (id,workshop_id,name,quantity,minimum_quantity,cost_price,sale_price) values
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Filtro A',2,2,20,35),
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Filtro B',1,2,22,38);
insert into public.suppliers(id,workshop_id,name) values
 ('71000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fornecedor A'),
 ('71000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Fornecedor B');
insert into public.purchases(id,workshop_id,supplier_id,status,total_amount,received_at) values
 ('72000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','received',40,now()),
 ('72000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','received',44,now());
insert into public.purchase_items(workshop_id,purchase_id,product_id,quantity,unit_cost) values
 ('20000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',2,20),
 ('20000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002',2,22);
insert into public.payables(workshop_id,supplier_id,purchase_id,description,amount) values
 ('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','Compra A',40),
 ('20000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','Compra B',44);
insert into public.estimates(id,workshop_id,customer_id,vehicle_id,valid_until,complaint) values
 ('73000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',current_date+30,'Orçamento A'),
 ('73000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',current_date+30,'Orçamento B');
insert into public.estimate_items(workshop_id,estimate_id,item_type,description,quantity,unit_price) values
 ('20000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','labor','Revisão A',1,40),
 ('20000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002','labor','Revisão B',1,44);
insert into public.estimate_events(workshop_id,estimate_id,action) values
 ('20000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','created'),
 ('20000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002','created');
insert into public.maintenance_reminders(workshop_id,vehicle_id,customer_id,title,due_date) values
 ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Óleo A',current_date+60),
 ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','Óleo B',current_date+60);
insert into public.service_warranties(workshop_id,service_order_id,description,duration_days) values
 ('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Serviço A',90);
insert into public.financial_entries(workshop_id,entry_type,description,category,amount,due_date,customer_id,service_order_id) values
 ('20000000-0000-4000-8000-000000000001','receivable','OS A','Serviços',100,current_date,'40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000001','expense','Conta A','Utilidades',50,current_date,null,null),
 ('20000000-0000-4000-8000-000000000002','expense','Conta B','Utilidades',60,current_date,null,null);
insert into public.service_order_technical_notes(workshop_id,service_order_id,category,body,is_recommendation) values
 ('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Freios','Verificar após assentamento',true);
insert into public.service_order_attachments(workshop_id,service_order_id,storage_path,file_name,mime_type,size_bytes,caption,uploaded_by) values
 ('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/entrada.jpg','entrada.jpg','image/jpeg',1024,'Foto de entrada','10000000-0000-4000-8000-000000000001');

create table public.tenant_isolation_probe (
  id uuid primary key,
  workshop_id uuid not null references public.workshops (id),
  label text not null
);
alter table public.tenant_isolation_probe enable row level security;
revoke all on public.tenant_isolation_probe from public, anon, authenticated;
grant select on public.tenant_isolation_probe to authenticated;
create policy probe_read_with_permission
  on public.tenant_isolation_probe for select to authenticated
  using ((select private.has_workshop_permission(workshop_id, 'clients', 'view')));

insert into public.tenant_isolation_probe (id, workshop_id, label) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B');

create temporary table rls_test_results (
  test_name text primary key,
  passed boolean not null
);
grant insert on table pg_temp.rls_test_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.settle_financial_entry_with_method('20000000-0000-4000-8000-000000000001',(select id from public.financial_entries where description='OS A'),'pix');
select public.reverse_financial_entry('20000000-0000-4000-8000-000000000001',(select id from public.financial_entries where description='OS A'),'Pagamento de teste lançado por engano');
insert into pg_temp.rls_test_results values
  ('Owner belongs to own active workshop', private.is_active_workshop_member('20000000-0000-4000-8000-000000000001')),
  ('Owner cannot join another workshop', not private.is_active_workshop_member('20000000-0000-4000-8000-000000000002')),
  ('Owner only lists own workshop', (select count(*) = 1 from public.workshops)),
  ('Owner only reads own tenant row', (select count(*) = 1 from public.tenant_isolation_probe)),
  ('Owner sees only own workshop customers', (select count(*) = 1 from public.customers)),
  ('Owner cannot read another workshop customer', (select count(*) = 0 from public.customers where workshop_id = '20000000-0000-4000-8000-000000000002')),
  ('Owner sees only own workshop orders', (select count(*) = 1 from public.service_orders)),
  ('Owner sees seeded checklist and own technical notes', (select count(*)=25 from public.service_order_inspection_items where service_order_id='60000000-0000-4000-8000-000000000001') and (select count(*)=1 from public.service_order_technical_notes)),
  ('Owner can read photo metadata from their own workshop', (select count(*)=1 from public.service_order_attachments)),
  ('Owner only sees own estimates and their lines', (select count(*)=1 from public.estimates) and (select count(*)=1 from public.estimate_items)),
  ('Owner only sees own estimate history', (select count(*)=1 from public.estimate_events)),
  ('Owner only sees own supplier and purchase rows', (select count(*)=1 from public.suppliers) and (select count(*)=1 from public.purchases)),
  ('Owner only sees own products and purchase items', (select count(*)=1 from public.inventory_products) and (select count(*)=1 from public.purchase_items)),
  ('Owner only sees own payables', (select count(*)=1 from public.payables)),
  ('Owner sees own receivables and expenses', (select count(*)=2 from public.financial_entries)),
  ('Owner can reverse a paid entry with reason and immutable history', (select status='pending' from public.financial_entries where description='OS A') and (select count(*)=1 from public.financial_entry_reversals where reason='Pagamento de teste lançado por engano')),
  ('Owner only sees own maintenance and warranty rows', (select count(*)=1 from public.maintenance_reminders) and (select count(*)=1 from public.service_warranties)),
  ('Dashboard reports tenant real counts', (select value=1 from public.get_dashboard_metrics('20000000-0000-4000-8000-000000000001') where metric='customers') and (select value=1 from public.get_dashboard_metrics('20000000-0000-4000-8000-000000000001') where metric='estimates_pending')),
  ('Owner creates a multi-line purchase before receiving stock', (with created as (select public.create_purchase_multi('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','70000000-0000-4000-8000-000000000001','quantity',1,'unit_cost',20),jsonb_build_object('product_id','70000000-0000-4000-8000-000000000001','quantity',2,'unit_cost',20)),current_date+14) as id) select count(*)=2 from created c join public.purchase_items i on i.purchase_id=c.id)),
  ('Owner records a drawn customer authorization stamped to their account', (with inserted as (insert into public.service_order_authorizations(workshop_id,service_order_id,customer_id,authorization_type,signer_name,statement,amount,signature_strokes) values('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','service','Cliente A','Autorizo os serviços da OS',100,jsonb_build_array(jsonb_build_array(jsonb_build_object('x',0.1,'y',0.5),jsonb_build_object('x',0.9,'y',0.5)))) returning signed_by,signed_at) select count(*)=1 and bool_and(signed_by='10000000-0000-4000-8000-000000000001' and signed_at is not null) from inserted)),
  ('Customer authorization records cannot be updated or deleted', not has_table_privilege('authenticated','public.service_order_authorizations','update') and not has_table_privilege('authenticated','public.service_order_authorizations','delete'));

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
insert into pg_temp.rls_test_results values
  ('Staff without explicit permission reads no protected rows', (select count(*) = 0 from public.tenant_isolation_probe)),
  ('Staff without client permission reads no customers', (select count(*) = 0 from public.customers)),
  ('Staff without order permission reads no orders', (select count(*) = 0 from public.service_orders)),
  ('Staff without estimate permission reads no estimates', (select count(*)=0 from public.estimates)),
  ('Staff without estimate permission reads no estimate history', (select count(*)=0 from public.estimate_events)),
  ('Staff without inventory permission reads no supplier or product rows', (select count(*)=0 from public.suppliers) and (select count(*)=0 from public.inventory_products)),
  ('Staff without finance permission reads no payables', (select count(*)=0 from public.payables)),
  ('Staff without finance permission reads no financial entries', (select count(*)=0 from public.financial_entries)),
  ('Staff without finance permission reads no reversal history', (select count(*)=0 from public.financial_entry_reversals)),
  ('Staff without order permission reads no after-sales rows', (select count(*)=0 from public.maintenance_reminders) and (select count(*)=0 from public.service_warranties)),
  ('Staff without order permission reads no inspection data', (select count(*)=0 from public.service_order_inspection_items) and (select count(*)=0 from public.service_order_technical_notes)),
  ('Staff without order permission reads no photo metadata', (select count(*)=0 from public.service_order_attachments));

reset role;
update public.workshops
set status = 'blocked', blocked_at = now()
where id = '20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into pg_temp.rls_test_results values
  ('Blocked workshop membership becomes inactive', not private.is_active_workshop_member('20000000-0000-4000-8000-000000000001')),
  ('Blocked workshop exposes no operational rows',
    (select count(*) = 0 from public.workshops)
    and (select count(*) = 0 from public.tenant_isolation_probe)),
  ('Blocked workshop exposes no customers', (select count(*) = 0 from public.customers)),
  ('Blocked workshop exposes no orders', (select count(*) = 0 from public.service_orders)),
  ('Blocked workshop exposes no estimates or payables', (select count(*)=0 from public.estimates) and (select count(*)=0 from public.payables)),
  ('Blocked workshop exposes no financial entries', (select count(*)=0 from public.financial_entries)),
  ('Blocked workshop exposes no financial reversal history', (select count(*)=0 from public.financial_entry_reversals)),
  ('Blocked workshop exposes no estimate history or purchase items', (select count(*)=0 from public.estimate_events) and (select count(*)=0 from public.purchase_items)),
  ('Blocked workshop exposes no after-sales rows', (select count(*)=0 from public.maintenance_reminders) and (select count(*)=0 from public.service_warranties)),
  ('Blocked workshop exposes no inspection or technical note rows', (select count(*)=0 from public.service_order_inspection_items) and (select count(*)=0 from public.service_order_technical_notes)),
  ('Blocked workshop exposes no inventory or purchase rows', (select count(*)=0 from public.inventory_products) and (select count(*)=0 from public.purchases));

reset role;
select extensions.ok(passed, test_name)
from pg_temp.rls_test_results
order by test_name;
select * from extensions.finish();
rollback;
