export type WorkshopRole = 'owner' | 'staff';

export type WorkshopContext = {
  workshopId: string;
  workshopName: string;
  role: WorkshopRole;
};
export type WorkshopSettings = { id: string; name: string; logo_path: string | null; logo_url: string | null; cnpj: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; city: string | null; state: string | null; responsible_name: string | null; opening_hours: string | null };
export type WorkshopSettingsInput = Omit<WorkshopSettings, 'id' | 'logo_path' | 'logo_url'>;

export type ModulePermissions = { view: boolean; create: boolean; update: boolean; delete: boolean };
export type WorkshopPermissions = Record<'dashboard' | 'clients' | 'vehicles' | 'service_orders' | 'inventory' | 'finance' | 'estimates' | 'employees' | 'reports' | 'settings', ModulePermissions> & { purchases?: ModulePermissions; after_sales?: ModulePermissions };

export type Customer = {
  id: string;
  workshop_id: string;
  full_name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = Omit<Customer, 'id' | 'workshop_id' | 'created_at' | 'updated_at'>;

export type Vehicle = {
  id: string;
  workshop_id: string;
  customer_id: string;
  vehicle_type: 'cars' | 'motorcycles' | 'trucks';
  make: string;
  model: string;
  year_manufacture: number | null;
  model_year: number | null;
  plate: string;
  color: string | null;
  mileage_km: number | null;
  fuel: 'gasoline' | 'ethanol' | 'flex' | 'diesel' | 'natural_gas' | 'electric' | 'hybrid' | 'other' | null;
  chassis: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: { full_name: string } | null;
};

export type VehicleInput = Omit<Vehicle, 'id' | 'workshop_id' | 'created_at' | 'updated_at' | 'customers'>;

export type ServiceOrderStatus = 'open' | 'diagnosis' | 'awaiting_approval' | 'awaiting_parts' | 'in_progress' | 'completed' | 'delivered' | 'canceled';
export type ServiceOrder = {
  id: string;
  workshop_id: string;
  order_number: number;
  customer_id: string;
  vehicle_id: string;
  assigned_membership_id: string | null;
  status: ServiceOrderStatus;
  opened_at: string;
  completed_at: string | null;
  odometer_km: number | null;
  complaint: string;
  diagnosis: string;
  notes: string;
  items_subtotal: number | string;
  discount: number | string;
  total_amount: number | string;
  customers?: { full_name: string; document?: string | null } | null;
  vehicles?: { make: string; model: string; plate: string } | null;
};
export type ServiceOrderInput = Pick<ServiceOrder, 'customer_id' | 'vehicle_id' | 'assigned_membership_id' | 'odometer_km' | 'complaint' | 'diagnosis' | 'notes'>;
export type ServiceOrderItem = {
  id: string;
  workshop_id: string;
  service_order_id: string;
  inventory_product_id: string | null;
  item_type: 'part' | 'labor';
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};
export type ServiceOrderItemInput = Pick<ServiceOrderItem, 'item_type' | 'description' | 'quantity' | 'unit_price'> & { inventory_product_id?: string | null };
export type ServiceOrderInspectionItem = { id: string; workshop_id: string; service_order_id: string; item_kind: 'checklist' | 'inspection'; item_key: string; item_label: string; condition: 'good' | 'attention' | 'critical' | 'not_inspected'; observations: string; recommendation: string; updated_at: string };
export type ServiceOrderTechnicalNote = { id: string; workshop_id: string; service_order_id: string; category: string; body: string; is_recommendation: boolean; created_at: string };
export type SignaturePoint = { x: number; y: number };
export type ServiceOrderAuthorization = { id: string; workshop_id: string; service_order_id: string; customer_id: string; authorization_type: 'estimate' | 'service' | 'delivery'; signer_name: string; statement: string; amount: number | string; signature_strokes: SignaturePoint[][]; signed_by: string; signed_at: string };
export type ServiceOrderAttachment = { id: string; workshop_id: string; service_order_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; caption: string; uploaded_by: string; created_at: string; signed_url: string };

export type InventoryProduct = {
  id: string;
  workshop_id: string;
  name: string;
  code: string | null;
  category: string | null;
  brand: string | null;
  quantity: number | string;
  minimum_quantity: number | string;
  cost_price: number | string;
  sale_price: number | string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryProductInput = Pick<InventoryProduct, 'name' | 'code' | 'category' | 'brand' | 'minimum_quantity' | 'cost_price' | 'sale_price' | 'location' | 'notes'>;
export type InventoryMovement = {
  id: string;
  workshop_id: string;
  product_id: string;
  direction: 'entry' | 'exit';
  quantity: number | string;
  reason: 'manual' | 'purchase' | 'service_order' | 'adjustment';
  service_order_id: string | null;
  note: string | null;
  created_at: string;
};

export type Supplier = { id: string; workshop_id: string; name: string; cnpj: string | null; phone: string | null; email: string | null; address: string | null; contact_name: string | null; notes: string | null; archived_at: string | null; created_at: string };
export type Purchase = { id: string; workshop_id: string; supplier_id: string; status: 'ordered' | 'received' | 'canceled'; payment_method: string | null; due_date: string | null; notes: string | null; total_amount: number | string; received_at: string | null; created_at: string; suppliers?: { name: string } };
export type Payable = { id: string; workshop_id: string; supplier_id: string; purchase_id: string; description: string; amount: number | string; due_date: string | null; status: 'pending' | 'paid'; paid_at: string | null; payment_method: string | null; created_at: string; suppliers?: { name: string } };
export type PayablePaymentReversal = { id: string; workshop_id: string; payable_id: string; reason: string; previous_paid_at: string; previous_payment_method: string | null; reversed_by: string | null; reversed_at: string };
export type FinancialEntry = { id: string; workshop_id: string; entry_type: 'receivable' | 'expense'; description: string; category: string; amount: number | string; due_date: string | null; status: 'pending' | 'paid'; settled_at: string | null; payment_method: string | null; customer_id: string | null; service_order_id: string | null; created_at: string; customers?: { full_name: string } | null; service_orders?: { order_number: number } | null };
export type FinancialEntryReversal = { id: string; workshop_id: string; financial_entry_id: string; reason: string; previous_settled_at: string; previous_payment_method: string | null; reversed_by: string | null; reversed_at: string };
export type FinancialEntryInput = Pick<FinancialEntry, 'entry_type' | 'description' | 'category' | 'amount' | 'due_date' | 'customer_id'>;
export type EstimateStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'converted';
export type Estimate = { id: string; workshop_id: string; estimate_number: number; customer_id: string; vehicle_id: string; status: EstimateStatus; valid_until: string | null; complaint: string; notes: string; items_subtotal: number | string; discount: number | string; total_amount: number | string; approved_at: string | null; converted_order_id: string | null; created_at: string; customers?: { full_name: string }; vehicles?: { make: string; model: string; plate: string } };
export type EstimateItem = { id: string; workshop_id: string; estimate_id: string; item_type: 'part' | 'labor'; description: string; quantity: number | string; unit_price: number | string; line_total: number | string };
export type EstimateItemInput = Pick<EstimateItem, 'item_type' | 'description' | 'quantity' | 'unit_price'>;
export type DashboardMetrics = { customers: number; vehicles: number; orders_open: number; orders_in_progress: number; orders_completed: number; estimates_pending: number; inventory_low: number; payables_pending: number };
export type FinanceDashboardMetrics = { receivables_pending: number; receivables_overdue: number; received_this_month: number; expenses_this_month: number; profit_this_month: number; estimates_approved: number };
export type MaintenanceReminder = { id: string; workshop_id: string; vehicle_id: string; customer_id: string; title: string; due_date: string | null; due_odometer_km: number | null; notes: string; completed_at: string | null; created_at: string; vehicles?: { make: string; model: string; plate: string } };
export type ServiceWarranty = { id: string; workshop_id: string; service_order_id: string; description: string; starts_on: string; duration_days: number; ends_on: string; conditions: string; voided_at: string | null; created_at: string; service_orders?: { order_number: number; customers: { full_name: string; document?: string | null }; vehicles: { make: string; model: string; plate: string } } };
export type WorkshopEmployeePermission = { module: string; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean };
export type WorkshopEmployee = { id: string; workshop_id: string; user_id: string; role: 'staff'; status: 'active' | 'disabled'; profiles: { full_name: string }; workshop_member_permissions: WorkshopEmployeePermission[] };
export type ServiceOrderTimeEntry = { id: string; workshop_id: string; service_order_id: string; membership_id: string; started_at: string; ended_at: string | null };
export type EmployeeProductivity = { membership_id: string; full_name: string; orders_delivered: number | string; labor_value: number | string; minutes_logged: number | string };
export type PlatformWorkshopOwner = { full_name: string; email: string | null; status: 'active' | 'disabled' };
export type PlatformWorkshop = { id: string; name: string; status: 'active' | 'blocked'; created_at: string; members_total: number; owners: PlatformWorkshopOwner[] };
export type PlatformMetrics = { workshops_total: number; workshops_active: number; workshops_blocked: number; members_total: number; members_active: number; workshops_created_today: number; audit_events_today: number };
