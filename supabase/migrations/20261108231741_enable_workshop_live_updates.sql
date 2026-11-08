do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    raise exception 'Supabase Realtime publication is not available';
  end if;

  foreach table_name in array array[
    'customers', 'vehicles', 'service_orders', 'service_order_items', 'service_order_time_entries',
    'service_order_inspection_items', 'service_order_technical_notes', 'service_order_authorizations', 'service_order_attachments',
    'inventory_products', 'inventory_movements', 'suppliers', 'purchases', 'purchase_items', 'payables',
    'payable_payment_reversals', 'estimates', 'estimate_items', 'estimate_events', 'maintenance_reminders',
    'service_warranties', 'financial_entries', 'financial_entry_reversals', 'workshop_member_permissions',
    'workshop_memberships', 'workshops'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
