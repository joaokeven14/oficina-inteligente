import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const root = process.cwd();
const migrations = [
  'supabase/migrations/20261031190000_core_tenant_security.sql',
  'supabase/migrations/20261031200000_customers_and_vehicles.sql',
  'supabase/migrations/20261031210000_service_orders.sql',
  'supabase/migrations/20261031220000_inventory.sql',
  'supabase/migrations/20261031230000_suppliers_purchases_payables.sql',
  'supabase/migrations/20261031240000_estimates.sql',
  'supabase/migrations/20261031250000_dashboard_metrics.sql',
  'supabase/migrations/20261031260000_warranties_reminders.sql',
  'supabase/migrations/20261031270000_order_stock_deduction.sql',
  'supabase/migrations/20261031280000_employee_management.sql',
  'supabase/migrations/20261031290000_financial_entries.sql',
  'supabase/migrations/20261031300000_service_order_inspection.sql',
  'supabase/migrations/20261031310000_workshop_settings.sql',
  'supabase/migrations/20261031320000_platform_metrics.sql',
  'supabase/migrations/20261031330000_multi_item_purchases.sql',
  'supabase/migrations/20261031340000_customer_authorizations.sql',
  'supabase/migrations/20261031350000_service_order_attachments.sql',
  'supabase/migrations/20261031360000_financial_reversals.sql',
  'supabase/migrations/20261031370000_employee_time_commissions.sql',
  'supabase/migrations/20261031380000_workshop_logos.sql',
  'supabase/migrations/20261031390000_service_timer_lifecycle.sql',
  'supabase/migrations/20261031400000_payable_reversals.sql',
  'supabase/migrations/20261031410000_platform_owner_lookup.sql',
  'supabase/migrations/20261031420000_payment_methods.sql',
];

async function asAuthenticatedUser(userId, operation, commit = false) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await operation();
    await db.exec(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

async function main() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(object_name text) returns text[]
      language sql immutable as $$
        select coalesce(array_agg(part order by ord) filter (where ord < cardinality(parts)), '{}'::text[])
        from unnest(string_to_array(object_name,'/')) with ordinality as folders(part,ord),
             lateral (select string_to_array(object_name,'/') as parts) all_parts
      $$;
    create table auth.users (
      id uuid primary key,
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to public;
  `);

  for (const migration of migrations) {
    try { await db.exec(await readFile(resolve(root, migration), 'utf8')); }
    catch (error) { throw new Error(`Migration failed (${migration}): ${error.message}`, { cause: error }); }
    process.stdout.write(`Applied locally: ${migration}\n`);
  }

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('10000000-0000-4000-8000-000000000001', 'owner-a@example.test', '{"full_name":"Owner A"}'),
      ('10000000-0000-4000-8000-000000000002', 'owner-b@example.test', '{"full_name":"Owner B"}'),
      ('10000000-0000-4000-8000-000000000003', 'staff-a@example.test', '{"full_name":"Staff A"}'),
      ('10000000-0000-4000-8000-000000000004', 'admin@example.test', '{"full_name":"Platform Admin"}');
    insert into public.platform_admins(user_id) values ('10000000-0000-4000-8000-000000000004');
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
  `);

  const ownerRows = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () =>
    db.query('select workshop_id from public.customers order by workshop_id'));
  assert.deepEqual(ownerRows.rows.map((row) => row.workshop_id), ['20000000-0000-4000-8000-000000000001']);
  process.stdout.write('PASS: an owner only sees customers from their workshop\n');

  const created = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const customer = await db.query(
      `insert into public.customers (workshop_id, full_name, document)
       values ('20000000-0000-4000-8000-000000000001', 'Cliente criado com RLS', '98765432100')
       returning id`,
    );
    const audit = await db.query("select count(*)::int as total from public.audit_events where action = 'customers.insert' and actor_id = auth.uid()");
    return { id: customer.rows[0].id, auditCount: audit.rows[0].total };
  });
  assert.ok(created.id);
  assert.equal(created.auditCount, 1);
  process.stdout.write('PASS: an owner can create a customer and the trigger records metadata-only audit\n');

  const workshopSettings = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query("select public.save_workshop_settings($1,'Tenant A','12345678000199','(65) 3333-0000','65999990000','contato@oficina.test','Rua Central, 10','Cuiabá','mt','Responsável A','Segunda a sexta, 8h às 18h')", ['20000000-0000-4000-8000-000000000001']);
    return db.query("select name,cnpj,email,state from public.workshops where id='20000000-0000-4000-8000-000000000001'");
  }, true);
  assert.deepEqual(workshopSettings.rows[0], { name: 'Tenant A', cnpj: '12345678000199', email: 'contato@oficina.test', state: 'MT' });
  const logoPath = '20000000-0000-4000-8000-000000000001/logo.png';
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query('insert into storage.objects(bucket_id,name) values(\'workshop-logos\',$1)',[logoPath]);
    await db.query('select public.set_workshop_logo_path($1,$2)',['20000000-0000-4000-8000-000000000001',logoPath]);
  }, true);
  const visibleLogo = await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select name from storage.objects where bucket_id='workshop-logos'"));
  assert.deepEqual(visibleLogo.rows.map((row) => row.name),[logoPath]);
  const foreignLogo = await asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query("select name from storage.objects where bucket_id='workshop-logos'"));
  assert.equal(foreignLogo.rows.length,0);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query("insert into storage.objects(bucket_id,name) values('workshop-logos',$1)",[logoPath])),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: workshop logos are private, membership-readable, and protected against cross-tenant uploads\n');
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.save_workshop_settings($1,'Tenant A',null,null,null,null,null,null,null,null,null)", ['20000000-0000-4000-8000-000000000001'])),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: workshop owner settings persist and non-owner updates are denied\n');
  const platformMetrics = await asAuthenticatedUser('10000000-0000-4000-8000-000000000004', () => db.query('select * from public.get_platform_metrics()'));
  assert.equal(Number(platformMetrics.rows[0].workshops_total),2);
  assert.equal(Number(platformMetrics.rows[0].workshops_active),2);
  assert.equal(Number(platformMetrics.rows[0].members_total),3);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('select * from public.get_platform_metrics()')),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: platform statistics are visible to administrators only\n');
  const platformWorkshops = await asAuthenticatedUser('10000000-0000-4000-8000-000000000004', () => db.query('select * from public.list_platform_workshops() order by name'));
  assert.equal(platformWorkshops.rows[0].owners[0].full_name, 'Owner A');
  assert.equal(platformWorkshops.rows[0].owners[0].email, 'owner-a@example.test');
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('select * from public.list_platform_workshops()')),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: only platform administrators can search owner names and login emails; passwords are not returned\n');

  const archiveResult = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query("update public.customers set archived_at = now() where id = '40000000-0000-4000-8000-000000000001'");
    const active = await db.query("select count(*)::int as total from public.customers where id = '40000000-0000-4000-8000-000000000001' and archived_at is null");
    const preserved = await db.query("select count(*)::int as total from public.customers where id = '40000000-0000-4000-8000-000000000001'");
    return { active: active.rows[0].total, preserved: preserved.rows[0].total };
  });
  assert.deepEqual(archiveResult, { active: 0, preserved: 1 });
  process.stdout.write('PASS: archiving hides a customer from active lists but preserves the record\n');

  const staffRows = await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () =>
    db.query('select id from public.customers'));
  assert.equal(staffRows.rows.length, 0);
  process.stdout.write('PASS: staff without client permission sees no customers\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `insert into public.customers (workshop_id, full_name)
       values ('20000000-0000-4000-8000-000000000002', 'Cross tenant attempt')`,
    )),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: RLS denies writing into another workshop\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `insert into public.customers (workshop_id, full_name, document)
       values ('20000000-0000-4000-8000-000000000001', 'Duplicate document', '123.456.789-01')`,
    )),
    (error) => error.code === '23505',
  );
  process.stdout.write('PASS: normalized duplicate document is rejected\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `insert into public.vehicles (workshop_id, customer_id, make, model, plate)
       values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Ford', 'Ka', 'ABC1D23')`,
    )),
    (error) => error.code === '42501' || error.code === '23503',
  );
  process.stdout.write('PASS: vehicle cannot link to a customer in another workshop\n');

  const createdVehicle = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
    `insert into public.vehicles (workshop_id, customer_id, make, model, plate)
     values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Ford', 'Ka', 'ABC1D23')
     returning id, plate`,
  ));
  assert.equal(createdVehicle.rows[0].plate, 'ABC1D23');
  process.stdout.write('PASS: an owner can create a vehicle linked to their own workshop customer\n');

  const order = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const header = await db.query(
      `insert into public.service_orders (workshop_id, customer_id, vehicle_id, odometer_km, complaint)
       values (
         '20000000-0000-4000-8000-000000000001',
         '40000000-0000-4000-8000-000000000001',
         '50000000-0000-4000-8000-000000000001',
         120000,
         'Ruído ao frear'
       ) returning id, order_number, total_amount`,
    );
    await db.query(
      `insert into public.service_order_items (workshop_id, service_order_id, item_type, description, quantity, unit_price)
       values ('20000000-0000-4000-8000-000000000001', $1, 'labor', 'Troca de pastilhas', 2, 50.22)`,
      [header.rows[0].id],
    );
    const total = await db.query('select items_subtotal, total_amount from public.service_orders where id = $1', [header.rows[0].id]);
    await db.query('update public.service_orders set discount = 20 where id = $1', [header.rows[0].id]);
    const discounted = await db.query('select items_subtotal, total_amount from public.service_orders where id = $1', [header.rows[0].id]);
    return { header: header.rows[0], total: total.rows[0], discounted: discounted.rows[0] };
  });
  assert.ok(order.header.order_number > 0);
  assert.equal(Number(order.total.items_subtotal), 100.44);
  assert.equal(Number(order.total.total_amount), 100.44);
  assert.equal(Number(order.discounted.total_amount), 80.44);
  process.stdout.write('PASS: service orders receive a database number and line/discount totals are database-calculated\n');
  const inspectionOrder = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const newOrder = await db.query(`insert into public.service_orders(workshop_id,customer_id,vehicle_id,complaint,status)
      values('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Inspeção de entrada','completed') returning id`);
    const orderId = newOrder.rows[0].id;
    return orderId;
  }, true);
  const inspection = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const orderId = inspectionOrder;
    const linkedOrder = await db.query('select id,workshop_id from public.service_orders where id=$1',[orderId]);
    assert.deepEqual(linkedOrder.rows[0], { id: orderId, workshop_id: '20000000-0000-4000-8000-000000000001' });
    const seeded = await db.query("select count(*)::int as count from public.service_order_inspection_items where service_order_id=$1 and condition='not_inspected'", [orderId]);
    const item = await db.query("select id from public.service_order_inspection_items where service_order_id=$1 and item_kind='inspection' and item_key='brakes'", [orderId]);
    if (!item.rows[0]) throw new Error(`Inspection test row missing; seeded=${seeded.rows[0].count}; order=${orderId}`);
    await db.query("update public.service_order_inspection_items set condition='attention',observations='Ruído no teste',recommendation='Revisar após troca' where id=$1", [item.rows[0].id]);
    await db.query("insert into public.service_order_technical_notes(workshop_id,service_order_id,category,body,is_recommendation) values('20000000-0000-4000-8000-000000000001',$1,'Freios','Verificar após assentamento',true)", [orderId]);
    const saved = await db.query("select condition,observations,recommendation from public.service_order_inspection_items where id=$1", [item.rows[0].id]);
    const authorization = await db.query(`insert into public.service_order_authorizations(workshop_id,service_order_id,customer_id,authorization_type,signer_name,statement,amount,signature_strokes)
      values('20000000-0000-4000-8000-000000000001',$1,'40000000-0000-4000-8000-000000000001','service','Cliente A','Autorizo os serviços da ordem',80.44,$2::jsonb) returning id,signed_by,signed_at`,
      [orderId, JSON.stringify([[{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.4 }, { x: 0.9, y: 0.6 }]])]);
    const photoPath = `20000000-0000-4000-8000-000000000001/${orderId}/entrada.jpg`;
    await db.query(`insert into storage.objects(bucket_id,name) values('service-order-photos',$1)`, [photoPath]);
    const attachment = await db.query(`insert into public.service_order_attachments(workshop_id,service_order_id,storage_path,file_name,mime_type,size_bytes,caption)
      values('20000000-0000-4000-8000-000000000001',$1,$2,'entrada.jpg','image/jpeg',1024,'Foto de entrada') returning id`, [orderId, photoPath]);
    return { count: seeded.rows[0].count, item: saved.rows[0], orderId, authorization: authorization.rows[0], attachmentId: attachment.rows[0].id, photoPath };
  }, true);
  assert.equal(inspection.count,25);
  assert.equal(inspection.item.condition,'attention');
  assert.equal(inspection.authorization.signed_by, '10000000-0000-4000-8000-000000000001');
  assert.ok(inspection.authorization.signed_at);
  await assert.rejects(asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('update public.service_order_authorizations set statement=\'alterada\' where id=$1', [inspection.authorization.id])), (error) => error.code === '42501');
  await assert.rejects(asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query(`insert into storage.objects(bucket_id,name) values('service-order-photos',$1)`, [inspection.photoPath])), (error) => error.code === '42501');
  const hiddenInspection = await asAuthenticatedUser('10000000-0000-4000-8000-000000000002', async () => ({
    items: await db.query('select id from public.service_order_inspection_items where service_order_id=$1',[inspection.orderId]),
    notes: await db.query('select id from public.service_order_technical_notes where service_order_id=$1',[inspection.orderId]),
    authorizations: await db.query('select id from public.service_order_authorizations where service_order_id=$1',[inspection.orderId]),
    attachments: await db.query('select id from public.service_order_attachments where service_order_id=$1',[inspection.orderId]),
    photos: await db.query(`select name from storage.objects where bucket_id='service-order-photos' and name=$1`,[inspection.photoPath]),
  }));
  assert.equal(hiddenInspection.items.rows.length,0);
  assert.equal(hiddenInspection.notes.rows.length,0);
  assert.equal(hiddenInspection.authorizations.rows.length,0);
  assert.equal(hiddenInspection.attachments.rows.length,0);
  assert.equal(hiddenInspection.photos.rows.length,0);
  process.stdout.write('PASS: inspection data, immutable authorizations and private photo attachments are tenant-isolated\n');

  const visibleOrders = await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query('select id from public.service_orders'));
  assert.equal(visibleOrders.rows.length, 0);
  process.stdout.write('PASS: staff without service-order permission sees no orders\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `update public.service_orders set total_amount = 1 where id = $1`, [order.header.id],
    )),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: clients cannot write calculated service-order totals directly\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `insert into public.service_orders (workshop_id, customer_id, vehicle_id, complaint)
       values ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Tentativa entre oficinas')`,
    )),
    (error) => error.code === '23503',
  );
  process.stdout.write('PASS: a service order cannot combine a customer and vehicle across workshops\n');

  const productId = '70000000-0000-4000-8000-000000000001';
  await db.query(
    `insert into public.inventory_products (id, workshop_id, name, code, minimum_quantity, cost_price, sale_price)
     values ($1, '20000000-0000-4000-8000-000000000001', 'Pastilha de freio', 'PF-01', 2, 50, 85)`, [productId],
  );
  const product = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query(
      `select public.record_inventory_movement(
        '20000000-0000-4000-8000-000000000001', $1, 'entry', 5, 'manual', null, 'Compra inicial'
      )`, [productId],
    );
    await db.exec('savepoint stock_exit_attempt');
    let exitError;
    try {
      await db.query(
        'select public.record_inventory_movement($1, $2, $3, $4, $5, null, $6)',
        ['20000000-0000-4000-8000-000000000001', productId, 'exit', 6, 'manual', 'Should fail'],
      );
    } catch (error) { exitError = error; }
    assert.equal(exitError?.code, '23514');
    await db.exec('rollback to savepoint stock_exit_attempt');
    await db.exec('release savepoint stock_exit_attempt');
    const balance = await db.query('select quantity from public.inventory_products where id = $1', [productId]);
    const movementCount = await db.query('select count(*)::int as total from public.inventory_movements where product_id = $1', [productId]);
    return { balance: balance.rows[0].quantity, movementCount: movementCount.rows[0].total };
  });
  assert.equal(Number(product.balance), 5);
  assert.equal(product.movementCount, 1);
  process.stdout.write('PASS: stock can only be initialized by an atomic ledger entry\n');
  const balanceAfterRejected = await db.query('select quantity from public.inventory_products where id = $1', [productId]);
  const movementsAfterRejected = await db.query('select count(*)::int as total from public.inventory_movements where product_id = $1', [productId]);
  assert.equal(Number(balanceAfterRejected.rows[0].quantity), 0);
  assert.equal(movementsAfterRejected.rows[0].total, 0);
  process.stdout.write('PASS: an atomic stock exit cannot create a negative balance\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      `insert into public.inventory_products (workshop_id, name, quantity)
       values ('20000000-0000-4000-8000-000000000001', 'Direct balance attempt', 99)`,
    )),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: authenticated users cannot set product quantity directly\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
      'select public.record_inventory_movement($1, $2, $3, $4, $5, null, $6)',
      ['20000000-0000-4000-8000-000000000002', productId, 'entry', 1, 'manual', 'Cross-tenant'],
    )),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: inventory movement RPC rejects cross-tenant access\n');

  const procurement = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const supplier = await db.query(
      `insert into public.suppliers(workshop_id,name,cnpj) values ('20000000-0000-4000-8000-000000000001','Auto Peças Teste','11222333000181') returning id`,
    );
    const purchase = await db.query(
      `select public.create_purchase_multi_with_method('20000000-0000-4000-8000-000000000001',$1,$2::jsonb,'2026-11-15','on_account') as id`, [supplier.rows[0].id, JSON.stringify([{ product_id: productId, quantity: 1, unit_cost: 55 }, { product_id: productId, quantity: 2, unit_cost: 55 }])],
    );
    await db.query('select public.receive_purchase($1,$2)', ['20000000-0000-4000-8000-000000000001', purchase.rows[0].id]);
    const result = await db.query(`
      select p.quantity, p.cost_price, o.status, o.payment_method as purchase_payment_method, o.total_amount, a.amount as payable_amount, a.status as payable_status
      from public.inventory_products p cross join public.purchases o
      join public.payables a on a.purchase_id=o.id
      where p.id=$1 and o.id=$2`, [productId, purchase.rows[0].id]);
    const itemCount = await db.query('select count(*)::int as count from public.purchase_items where purchase_id=$1', [purchase.rows[0].id]);
    return { purchaseId: purchase.rows[0].id, payableId: (await db.query('select id from public.payables where purchase_id=$1',[purchase.rows[0].id])).rows[0].id, itemCount: itemCount.rows[0].count, ...result.rows[0] };
  }, true);
  assert.equal(Number(procurement.quantity), 3);
  assert.equal(Number(procurement.cost_price), 55);
  assert.equal(procurement.status, 'received');
  assert.equal(procurement.purchase_payment_method, 'on_account');
  assert.equal(Number(procurement.total_amount), 165);
  assert.equal(Number(procurement.payable_amount), 165);
  assert.equal(procurement.payable_status, 'pending');
  assert.equal(procurement.itemCount, 2);
  process.stdout.write('PASS: receiving a purchase atomically updates stock, cost and payable\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('select public.receive_purchase($1,$2)', ['20000000-0000-4000-8000-000000000001', procurement.purchaseId])),
    (error) => error.code === '55000',
  );
  const afterDuplicateReceive = await db.query('select quantity from public.inventory_products where id=$1',[productId]);
  assert.equal(Number(afterDuplicateReceive.rows[0].quantity), 3);
  process.stdout.write('PASS: a received purchase cannot duplicate stock entries\n');

  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select public.mark_payable_paid_with_method($1,$2,'pix')", ['20000000-0000-4000-8000-000000000001', procurement.payableId]), true);
  const paid = await db.query('select status, paid_at, payment_method from public.payables where id=$1',[procurement.payableId]);
  assert.equal(paid.rows[0].status, 'paid');
  assert.equal(paid.rows[0].payment_method, 'pix');
  assert.ok(paid.rows[0].paid_at);
  const firstPaidAt = paid.rows[0].paid_at;
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select public.reverse_payable_payment($1,$2,'Pagamento duplicado')",['20000000-0000-4000-8000-000000000001',procurement.payableId]), true);
  const reversedPayable = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => ({
    state: await db.query('select status,paid_at,payment_method from public.payables where id=$1',[procurement.payableId]),
    history: await db.query('select reason,previous_paid_at,previous_payment_method from public.payable_payment_reversals where payable_id=$1',[procurement.payableId]),
  }));
  assert.equal(reversedPayable.state.rows[0].status,'pending');
  assert.equal(reversedPayable.state.rows[0].paid_at,null);
  assert.equal(reversedPayable.state.rows[0].payment_method,null);
  assert.equal(reversedPayable.history.rows[0].reason,'Pagamento duplicado');
  assert.equal(reversedPayable.history.rows[0].previous_payment_method,'pix');
  assert.equal(new Date(reversedPayable.history.rows[0].previous_paid_at).getTime(),new Date(firstPaidAt).getTime());
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select public.mark_payable_paid_with_method($1,$2,'bank_transfer')", ['20000000-0000-4000-8000-000000000001', procurement.payableId]), true);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.reverse_payable_payment($1,$2,'Sem permissão')",['20000000-0000-4000-8000-000000000001',procurement.payableId])),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: payable settlement and reversal preserve immutable payment history and enforce finance permissions\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('select public.mark_payable_paid($1,$2)', ['20000000-0000-4000-8000-000000000001', procurement.payableId])),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.mark_payable_paid_with_method($1,$2,'pix')", ['20000000-0000-4000-8000-000000000001', procurement.payableId])),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: methodless payable settlement is disabled and method-aware settlement still enforces finance permissions\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query('select public.receive_purchase($1,$2)', ['20000000-0000-4000-8000-000000000002', procurement.purchaseId])),
    (error) => error.code === '42501' || error.code === '55000',
  );
  process.stdout.write('PASS: another workshop cannot receive or inspect a foreign purchase\n');

  const stockOrder = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const orderRow = await db.query(`insert into public.service_orders(workshop_id,customer_id,vehicle_id,complaint)
      values('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Troca de filtro') returning id`);
    const orderId = orderRow.rows[0].id;
    const item = await db.query(`insert into public.service_order_items(workshop_id,service_order_id,item_type,description,quantity,unit_price,inventory_product_id)
      values('20000000-0000-4000-8000-000000000001',$1,'part','Filtro',2,55,$2) returning id`,[orderId,productId]);
    const afterUse = await db.query('select quantity from public.inventory_products where id=$1',[productId]);
    await db.query('delete from public.service_order_items where id=$1',[item.rows[0].id]);
    const afterRemove = await db.query('select quantity from public.inventory_products where id=$1',[productId]);
    await db.query(`insert into public.service_order_items(workshop_id,service_order_id,item_type,description,quantity,unit_price,inventory_product_id)
      values('20000000-0000-4000-8000-000000000001',$1,'part','Filtro',1,55,$2)`,[orderId,productId]);
    await db.query("update public.service_orders set status='canceled' where id=$1",[orderId]);
    const afterCancel = await db.query('select quantity from public.inventory_products where id=$1',[productId]);
    await db.query("update public.service_orders set status='open' where id=$1",[orderId]);
    const afterReopen = await db.query('select quantity from public.inventory_products where id=$1',[productId]);
    return { orderId, afterUse: afterUse.rows[0].quantity, afterRemove: afterRemove.rows[0].quantity, afterCancel: afterCancel.rows[0].quantity, afterReopen: afterReopen.rows[0].quantity };
  },true);
  assert.equal(Number(stockOrder.afterUse),1);
  assert.equal(Number(stockOrder.afterRemove),3);
  assert.equal(Number(stockOrder.afterCancel),3);
  assert.equal(Number(stockOrder.afterReopen),2);
  process.stdout.write('PASS: OS parts deduct stock once and removal/cancellation/reopening reconcile the ledger\n');
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("update public.service_orders set status='canceled' where id=$1",[stockOrder.orderId]),true);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
      const orderRow = await db.query(`insert into public.service_orders(workshop_id,customer_id,vehicle_id,complaint)
        values('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Peça sem saldo') returning id`);
      await db.query(`insert into public.service_order_items(workshop_id,service_order_id,item_type,description,quantity,unit_price,inventory_product_id)
        values('20000000-0000-4000-8000-000000000001',$1,'part','Filtro',99,55,$2)`,[orderRow.rows[0].id,productId]);
    }),
    (error) => error.code === '23514',
  );
  process.stdout.write('PASS: an OS cannot consume more stock than is available\n');

  const estimate = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const createdEstimate = await db.query(`select public.create_estimate(
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
      '2027-01-31','Revisão preventiva','',20,
      '[{"item_type":"labor","description":"Revisão","quantity":2,"unit_price":100},{"item_type":"part","description":"Filtro","quantity":1,"unit_price":50}]'::jsonb
    ) as id`);
    const estimateId = createdEstimate.rows[0].id;
    const pending = await db.query('select status,items_subtotal,total_amount from public.estimates where id=$1',[estimateId]);
    await db.query('select public.review_estimate($1,$2,$3)',['20000000-0000-4000-8000-000000000001',estimateId,'approved']);
    const order = await db.query('select public.convert_estimate($1,$2) as id',['20000000-0000-4000-8000-000000000001',estimateId]);
    const converted = await db.query('select status,converted_order_id from public.estimates where id=$1',[estimateId]);
    const orderTotals = await db.query('select items_subtotal,discount,total_amount from public.service_orders where id=$1',[order.rows[0].id]);
    return { estimateId, pending: pending.rows[0], converted: converted.rows[0], orderId: order.rows[0].id, orderTotals: orderTotals.rows[0] };
  }, true);
  assert.equal(estimate.pending.status,'pending');
  assert.equal(Number(estimate.pending.items_subtotal),250);
  assert.equal(Number(estimate.pending.total_amount),230);
  assert.equal(estimate.converted.status,'converted');
  assert.equal(estimate.converted.converted_order_id,estimate.orderId);
  assert.equal(Number(estimate.orderTotals.items_subtotal),250);
  assert.equal(Number(estimate.orderTotals.discount),20);
  assert.equal(Number(estimate.orderTotals.total_amount),230);
  process.stdout.write('PASS: estimate totals are database-calculated and conversion preserves all values\n');

  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query('select public.convert_estimate($1,$2)',['20000000-0000-4000-8000-000000000001',estimate.estimateId])),
    (error) => error.code === '55000',
  );
  const duplicateEstimateOrders = await db.query('select count(*)::int as total from public.service_orders where complaint like $1',['Orçamento nº %Revisão preventiva']);
  assert.equal(duplicateEstimateOrders.rows[0].total,1);
  process.stdout.write('PASS: estimate conversion cannot create a duplicate service order\n');

  const staffMembership = await db.query("select id from public.workshop_memberships where user_id='10000000-0000-4000-8000-000000000003'");
  await db.query(`insert into public.workshop_member_permissions(membership_id,workshop_id,module,can_view,can_create,can_update,can_delete)
    select id,workshop_id,module,true,true,true,false from public.workshop_memberships
    cross join (values ('service_orders'),('reports'),('employees')) modules(module)
    where user_id='10000000-0000-4000-8000-000000000003'`);
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query('update public.service_orders set assigned_membership_id=$1 where id=$2',[staffMembership.rows[0].id,estimate.orderId]);
    await db.query("select public.set_employee_labor_commission($1,$2,10)",['20000000-0000-4000-8000-000000000001',staffMembership.rows[0].id]);
  }, true);
  const timerId = await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', async () => {
    const started = await db.query("select public.start_service_order_timer($1,$2) as id",['20000000-0000-4000-8000-000000000001',estimate.orderId]);
    return started.rows[0].id;
  }, true);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.start_service_order_timer($1,$2)",['20000000-0000-4000-8000-000000000001',estimate.orderId])),
    (error) => error.code === '23505',
  );
  await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.stop_service_order_timer($1,$2)",['20000000-0000-4000-8000-000000000001',estimate.orderId]), true);
  await db.query("update public.service_order_time_entries set started_at=ended_at-interval '35 minutes' where id=$1",[timerId]);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.set_employee_labor_commission($1,$2,15)",['20000000-0000-4000-8000-000000000001',staffMembership.rows[0].id])),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query("select public.start_service_order_timer($1,$2)",['20000000-0000-4000-8000-000000000001',estimate.orderId])),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: employee timer enforces one active timer, membership permissions, and owner-only commission configuration\n');

  const hiddenEstimate = await asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query('select id from public.estimates where id=$1',[estimate.estimateId]));
  assert.equal(hiddenEstimate.rows.length,0);
  process.stdout.write('PASS: estimates are isolated between workshops\n');

  const metrics = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select metric,value from public.get_dashboard_metrics('20000000-0000-4000-8000-000000000001')"));
  const metricMap = Object.fromEntries(metrics.rows.map((row) => [row.metric, Number(row.value)]));
  assert.equal(metricMap.customers,1);
  assert.equal(metricMap.vehicles,1);
  assert.equal(metricMap.orders_open,1);
  assert.equal(metricMap.estimates_pending,0);
  assert.equal(metricMap.payables_pending,0);
  process.stdout.write('PASS: dashboard metrics are counted on the server from real tenant data\n');
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select * from public.get_dashboard_metrics('20000000-0000-4000-8000-000000000001')")),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: dashboard RPC enforces its own permission\n');

  const lifecycleTimerId = await asAuthenticatedUser('10000000-0000-4000-8000-000000000003', async () => {
    const result = await db.query("select public.start_service_order_timer($1,$2) as id",['20000000-0000-4000-8000-000000000001',estimate.orderId]);
    return result.rows[0].id;
  }, true);

  const finance = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    await db.query("update public.service_orders set status='delivered' where id=$1", [estimate.orderId]);
    await db.query("update public.service_orders set status='delivered' where id=$1", [estimate.orderId]);
    const timer = await db.query('select ended_at from public.service_order_time_entries where id=$1',[lifecycleTimerId]);
    assert.ok(timer.rows[0].ended_at);
    const orderIncome = await db.query("select id,amount,status from public.financial_entries where service_order_id=$1", [estimate.orderId]);
    assert.equal(orderIncome.rows.length, 1);
    assert.equal(Number(orderIncome.rows[0].amount), 230);
    const expense = await db.query("select public.create_financial_entry($1,'expense','Conta de energia','Utilidades',120,'2026-11-20',null,null) as id", ['20000000-0000-4000-8000-000000000001']);
    const manualIncome = await db.query("select public.create_financial_entry($1,'receivable','Serviço adicional','Serviços',80,'2026-11-22','40000000-0000-4000-8000-000000000001',null) as id", ['20000000-0000-4000-8000-000000000001']);
    await db.query("select public.settle_financial_entry_with_method($1,$2,'cash')", ['20000000-0000-4000-8000-000000000001', manualIncome.rows[0].id]);
    const recordedMethod = await db.query('select payment_method from public.financial_entries where id=$1', [manualIncome.rows[0].id]);
    assert.equal(recordedMethod.rows[0].payment_method, 'cash');
    await db.query("select public.reverse_financial_entry($1,$2,'Lançamento recebido por engano')", ['20000000-0000-4000-8000-000000000001', manualIncome.rows[0].id]);
    const reversal = await db.query("select reason,previous_settled_at,previous_payment_method from public.financial_entry_reversals where financial_entry_id=$1", [manualIncome.rows[0].id]);
    assert.equal(reversal.rows.length, 1);
    assert.equal(reversal.rows[0].reason, 'Lançamento recebido por engano');
    assert.ok(reversal.rows[0].previous_settled_at);
    assert.equal(reversal.rows[0].previous_payment_method, 'cash');
    const reversedState = await db.query("select status,settled_at,payment_method from public.financial_entries where id=$1", [manualIncome.rows[0].id]);
    assert.equal(reversedState.rows[0].status, 'pending');
    assert.equal(reversedState.rows[0].settled_at, null);
    assert.equal(reversedState.rows[0].payment_method, null);
    await db.query("select public.settle_financial_entry_with_method($1,$2,'credit_card')", ['20000000-0000-4000-8000-000000000001', manualIncome.rows[0].id]);
    const resettledMethod = await db.query('select payment_method from public.financial_entries where id=$1', [manualIncome.rows[0].id]);
    assert.equal(resettledMethod.rows[0].payment_method, 'credit_card');
    const states = await db.query("select entry_type,status from public.financial_entries where id=any($1::uuid[])", [[expense.rows[0].id,manualIncome.rows[0].id]]);
    return { orderId: orderIncome.rows[0].id, expenseId: expense.rows[0].id, manualIncomeId: manualIncome.rows[0].id, states: states.rows };
  }, true);
  assert.ok(finance.orderId);
  assert.deepEqual(finance.states.map((row) => row.status).sort(), ['paid','pending']);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.settle_financial_entry_with_method($1,$2,'pix')", ['20000000-0000-4000-8000-000000000001', finance.expenseId])),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select public.settle_financial_entry_with_method($1,$2,'invalid')", ['20000000-0000-4000-8000-000000000001', finance.expenseId])),
    (error) => error.code === '22023',
  );
  process.stdout.write('PASS: delivered service orders create one receivable and manual income/expenses settle with audit-safe RPCs\n');
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.start_service_order_timer($1,$2)",['20000000-0000-4000-8000-000000000001',estimate.orderId])),
    (error) => error.code === 'P0002',
  );
  process.stdout.write('PASS: closing an order ends its active timer and prevents a new timer on that order\n');
  const productivity = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query(
    "select * from public.get_employee_productivity($1,now()-interval '1 day',now()+interval '1 day')",
    ['20000000-0000-4000-8000-000000000001'],
  ));
  assert.equal(productivity.rows.length,1);
  assert.equal(productivity.rows[0].full_name,'Staff A');
  assert.equal(Number(productivity.rows[0].orders_delivered),1);
  assert.equal(Number(productivity.rows[0].labor_value),200);
  assert.equal(Number(productivity.rows[0].minutes_logged),35);
  assert.equal(Number(productivity.rows[0].commission_rate),10);
  assert.equal(Number(productivity.rows[0].estimated_commission),20);
  process.stdout.write('PASS: owner productivity RPC reports delivered labor, logged minutes, and estimated commission accurately\n');
  process.stdout.write('PASS: received financial entries can be reversed with reason, immutable history and re-settlement\n');
  const foreignFinance = await asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query('select id from public.financial_entries'));
  assert.equal(foreignFinance.rows.length, 0);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000002', () => db.query("select public.reverse_financial_entry('20000000-0000-4000-8000-000000000001',$1,'Cross tenant attempt')", [finance.orderId])),
    (error) => error.code === '42501',
  );
  const financeSummary = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () => db.query("select * from public.get_finance_dashboard_metrics('20000000-0000-4000-8000-000000000001')"));
  assert.equal(Number(financeSummary.rows[0].receivables_pending), 230);
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select * from public.get_finance_dashboard_metrics('20000000-0000-4000-8000-000000000001')")),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: financial dashboard aggregates real values and enforces finance permissions\n');
  await assert.rejects(
    asAuthenticatedUser('10000000-0000-4000-8000-000000000003', () => db.query("select public.create_financial_entry('20000000-0000-4000-8000-000000000001','expense','Despesa inválida','Outros',10,null,null,null)")),
    (error) => error.code === '42501',
  );
  process.stdout.write('PASS: financial entries are tenant-isolated and staff without finance permissions cannot create them\n');

  const followUp = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', async () => {
    const reminder = await db.query(`insert into public.maintenance_reminders(workshop_id,vehicle_id,customer_id,title,due_date,due_odometer_km)
      values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Troca de óleo','2027-01-31',130000) returning id`);
    await db.query('update public.maintenance_reminders set completed_at=now() where id=$1',[reminder.rows[0].id]);
    await db.query("update public.service_orders set status='completed' where id=$1",[estimate.orderId]);
    const warranty = await db.query(`select public.create_service_warranty($1,$2,'Revisão e peças','2026-10-31',90,'Apresentar esta OS') as id`,['20000000-0000-4000-8000-000000000001',estimate.orderId]);
    const warrantyRow = await db.query('select starts_on,ends_on,duration_days from public.service_warranties where id=$1',[warranty.rows[0].id]);
    return { reminderId: reminder.rows[0].id, warrantyId: warranty.rows[0].id, warranty: warrantyRow.rows[0] };
  }, true);
  assert.ok(followUp.reminderId);
  assert.equal(Number(followUp.warranty.duration_days),90);
  assert.ok(followUp.warranty.ends_on > followUp.warranty.starts_on);
  process.stdout.write('PASS: vehicle maintenance reminders and completed-order warranties are persisted\n');
  const hiddenFollowUp = await asAuthenticatedUser('10000000-0000-4000-8000-000000000002', async () => ({
    reminders: await db.query('select id from public.maintenance_reminders where id=$1',[followUp.reminderId]),
    warranties: await db.query('select id from public.service_warranties where id=$1',[followUp.warrantyId]),
  }));
  assert.equal(hiddenFollowUp.reminders.rows.length,0);
  assert.equal(hiddenFollowUp.warranties.rows.length,0);
  process.stdout.write('PASS: warranty and reminder records are tenant-isolated\n');

  await db.query("update public.workshops set status = 'blocked', blocked_at = now() where id = '20000000-0000-4000-8000-000000000001'");
  const blockedRows = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () =>
    db.query('select id from public.customers'));
  assert.equal(blockedRows.rows.length, 0);
  process.stdout.write('PASS: blocking a workshop removes customer visibility\n');
  const blockedOrders = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () =>
    db.query('select id from public.service_orders'));
  assert.equal(blockedOrders.rows.length, 0);
  process.stdout.write('PASS: blocking a workshop removes service-order visibility\n');
  const blockedProducts = await asAuthenticatedUser('10000000-0000-4000-8000-000000000001', () =>
    db.query('select id from public.inventory_products'));
  assert.equal(blockedProducts.rows.length, 0);
  process.stdout.write('PASS: blocking a workshop removes inventory visibility\n');
}

try {
  await main();
} finally {
  await db.close();
}
