import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import type { Customer, CustomerInput, DashboardMetrics, EmployeeProductivity, Estimate, EstimateItem, EstimateItemInput, FinanceDashboardMetrics, FinancialEntry, FinancialEntryInput, FinancialEntryReversal, InventoryMovement, InventoryProduct, InventoryProductInput, MaintenanceReminder, ModulePermissions, Payable, PayablePaymentReversal, PlatformMetrics, PlatformWorkshop, Purchase, ServiceOrder, ServiceOrderAttachment, ServiceOrderAuthorization, ServiceOrderInput, ServiceOrderInspectionItem, ServiceOrderItem, ServiceOrderItemInput, ServiceOrderStatus, ServiceOrderTechnicalNote, ServiceOrderTimeEntry, ServiceWarranty, SignaturePoint, Supplier, Vehicle, VehicleInput, WorkshopContext, WorkshopEmployee, WorkshopPermissions, WorkshopSettings, WorkshopSettingsInput } from '../types/workshop';
import type { PaymentMethod } from '../utils/paymentMethods';

const messageByCode: Record<string, string> = {
  '23505': 'Já existe um cadastro com esse documento ou placa nesta oficina.',
  '23503': 'Este registro está vinculado a outros dados e não pode ser removido.',
  '42501': 'Seu usuário não tem permissão para essa operação.',
  'PGRST116': 'O registro não foi encontrado ou você não tem acesso a ele.',
};

function throwFriendly(error: { code?: string; message: string }): never {
  throw new Error(messageByCode[error.code ?? ''] ?? 'Não foi possível salvar os dados. Verifique sua conexão e tente novamente.');
}

function clientOrDefault(client?: SupabaseClient): SupabaseClient {
  return client ?? getSupabaseClient();
}

async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch { /* Use the Portuguese fallback when the response has no JSON message. */ }
  }
  return fallback;
}

async function invokePrivateFiles<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke('manage-private-files', { body });
  if (data && typeof data.error === 'string') throw new Error(data.error);
  if (error) throw new Error('Não foi possível concluir a operação com o arquivo privado. Tente novamente.');
  return data as T;
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throwFriendly(error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function listCurrentWorkshops(client?: SupabaseClient): Promise<WorkshopContext[]> {
  const supabase = clientOrDefault(client);
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throwFriendly(userError);
  if (!userResult.user) return [];

  const data = await fetchAllPages((from, to) => supabase
    .from('workshop_memberships').select('workshop_id, role, created_at, workshops!inner(name)')
    .eq('user_id', userResult.user.id).eq('status', 'active').order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data.map((row) => {
    const membership = row as unknown as { workshop_id: string; role: 'owner' | 'staff'; workshops: { name: string } };
    return { workshopId: membership.workshop_id, workshopName: membership.workshops.name, role: membership.role };
  });
}

export async function getCurrentWorkshop(client?: SupabaseClient): Promise<WorkshopContext | null> {
  return (await listCurrentWorkshops(client))[0] ?? null;
}

export async function getWorkshopSettings(workshopId: string, client?: SupabaseClient): Promise<WorkshopSettings> {
  const supabase = clientOrDefault(client);
  const { data, error } = await supabase.from('workshops')
    .select('id,name,logo_path,cnpj,phone,whatsapp,email,address,city,state,responsible_name,opening_hours')
    .eq('id', workshopId).single();
  if (error) throwFriendly(error);
  let logoUrl: string | null = null;
  if (data.logo_path) {
    const signed = await invokePrivateFiles<{ signed_url: string | null }>(supabase, { action: 'sign_logo', kind: 'logo', workshop_id: workshopId });
    if (!signed.signed_url) throw new Error('Não foi possível abrir o logotipo privado da oficina.');
    logoUrl = signed.signed_url;
  }
  return { ...data, logo_url: logoUrl } as WorkshopSettings;
}

export async function uploadWorkshopLogo(workshopId: string, file: Blob, fileName: string, mimeType: string, client?: SupabaseClient): Promise<void> {
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[mimeType];
  if (!extension) throw new Error('Use um logotipo JPEG, PNG ou WebP.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('O logotipo precisa ter até 5 MB.');
  const supabase = clientOrDefault(client);
  const { data: current, error: readError } = await supabase.from('workshops').select('logo_path').eq('id', workshopId).single();
  if (readError) throwFriendly(readError);
  const prepared = await invokePrivateFiles<{ path: string; token: string }>(supabase, {
    action: 'prepare_upload', kind: 'logo', workshop_id: workshopId, mime_type: mimeType, size_bytes: file.size,
  });
  const storagePath = prepared.path;
  const { error: uploadError } = await supabase.storage.from('workshop-logos').uploadToSignedUrl(storagePath, prepared.token, file, { contentType: mimeType, upsert: false });
  if (uploadError) throwFriendly(uploadError);
  const { error: saveError } = await supabase.rpc('set_workshop_logo_path', { target_workshop: workshopId, target_path: storagePath });
  if (saveError) {
    await invokePrivateFiles(supabase, { action: 'remove_logo', kind: 'logo', workshop_id: workshopId, storage_path: storagePath }).catch(() => undefined);
    throwFriendly(saveError);
  }
  if (current.logo_path && current.logo_path !== storagePath) {
    await invokePrivateFiles(supabase, { action: 'remove_logo', kind: 'logo', workshop_id: workshopId, storage_path: current.logo_path }).catch(() => undefined);
  }
}

export async function removeWorkshopLogo(workshopId: string, client?: SupabaseClient): Promise<void> {
  const supabase = clientOrDefault(client);
  const { data: current, error: readError } = await supabase.from('workshops').select('logo_path').eq('id', workshopId).single();
  if (readError) throwFriendly(readError);
  const { error } = await supabase.rpc('set_workshop_logo_path', { target_workshop: workshopId, target_path: null });
  if (error) throwFriendly(error);
  if (current.logo_path) {
    await invokePrivateFiles(supabase, { action: 'remove_logo', kind: 'logo', workshop_id: workshopId, storage_path: current.logo_path });
  }
}

export async function saveWorkshopSettings(workshopId: string, settings: WorkshopSettingsInput, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('save_workshop_settings', {
    target_workshop: workshopId, target_name: settings.name, target_cnpj: settings.cnpj,
    target_phone: settings.phone, target_whatsapp: settings.whatsapp, target_email: settings.email,
    target_address: settings.address, target_city: settings.city, target_state: settings.state,
    target_responsible: settings.responsible_name, target_hours: settings.opening_hours,
  });
  if (error) throwFriendly(error);
}

export async function getWorkshopPermissions(workshopId: string, client?: SupabaseClient): Promise<WorkshopPermissions> {
  const { data, error } = await clientOrDefault(client).rpc('get_workshop_permissions', { target_workshop_id: workshopId });
  if (error) throwFriendly(error);
  const permissions: WorkshopPermissions = {
    clients: { view: false, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false },
    inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false },
    reports: { view: false, create: false, update: false, delete: false },
    settings: { view: false, create: false, update: false, delete: false },
  };
  for (const row of (data ?? []) as Array<{ module: keyof WorkshopPermissions; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }>) {
    if (row.module in permissions) {
      permissions[row.module] = { view: row.can_view, create: row.can_create, update: row.can_update, delete: row.can_delete };
    }
  }
  return permissions;
}

export async function listCustomers(workshopId: string, client?: SupabaseClient): Promise<Customer[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase
    .from('customers')
    .select('id, workshop_id, full_name, document, phone, whatsapp, email, address, city, state, notes, created_at, updated_at')
    .eq('workshop_id', workshopId)
    .is('archived_at', null)
    .order('full_name', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data as Customer[];
}

export async function saveCustomer(workshopId: string, input: CustomerInput, customerId?: string, client?: SupabaseClient): Promise<void> {
  if (input.full_name.trim().length < 2) throw new Error('Informe o nome completo do cliente.');
  const document = input.document?.trim() || null;
  const digits = document?.replace(/\D/g, '') ?? '';
  if (digits && digits.length !== 11 && digits.length !== 14) throw new Error('CPF deve ter 11 dígitos e CNPJ deve ter 14.');
  const supabase = clientOrDefault(client);
  const payload = { ...input, full_name: input.full_name.trim(), document };
  if (customerId) {
    const { data, error } = await supabase.from('customers').update(payload).eq('id', customerId).eq('workshop_id', workshopId).select('id').maybeSingle();
    if (error) throwFriendly(error);
    if (!data) throw new Error('Cliente não encontrado ou sem permissão para edição.');
  } else {
    const { error } = await supabase.from('customers').insert({ ...payload, workshop_id: workshopId });
    if (error) throwFriendly(error);
  }
}

export async function archiveCustomer(workshopId: string, customerId: string, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client)
    .from('customers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('workshop_id', workshopId)
    .select('id')
    .maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Cliente não encontrado ou sem permissão para arquivamento.');
}

export async function listVehicles(workshopId: string, client?: SupabaseClient): Promise<Vehicle[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase
    .from('vehicles')
    .select('id, workshop_id, customer_id, make, model, year_manufacture, model_year, plate, color, mileage_km, fuel, chassis, notes, created_at, updated_at, customers!inner(full_name)')
    .eq('workshop_id', workshopId)
    .is('archived_at', null)
    .order('plate', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data as unknown as Vehicle[];
}

export async function saveVehicle(workshopId: string, input: VehicleInput, vehicleId?: string, client?: SupabaseClient): Promise<void> {
  if (!input.make.trim() || !input.model.trim()) throw new Error('Informe a marca e o modelo do veículo.');
  if (!input.customer_id) throw new Error('Selecione o cliente responsável pelo veículo.');
  const plate = input.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate.length !== 7) throw new Error('Informe uma placa válida com 7 caracteres.');
  const supabase = clientOrDefault(client);
  const payload = { ...input, make: input.make.trim(), model: input.model.trim(), plate };
  if (vehicleId) {
    const { data, error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId).eq('workshop_id', workshopId).select('id').maybeSingle();
    if (error) throwFriendly(error);
    if (!data) throw new Error('Veículo não encontrado ou sem permissão para edição.');
  } else {
    const { error } = await supabase.from('vehicles').insert({ ...payload, workshop_id: workshopId });
    if (error) throwFriendly(error);
  }
}

export async function archiveVehicle(workshopId: string, vehicleId: string, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client)
    .from('vehicles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .eq('workshop_id', workshopId)
    .select('id')
    .maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Veículo não encontrado ou sem permissão para arquivamento.');
}

export async function listServiceOrders(workshopId: string, client?: SupabaseClient): Promise<ServiceOrder[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase
    .from('service_orders')
    .select('id, workshop_id, order_number, customer_id, vehicle_id, assigned_membership_id, status, opened_at, completed_at, odometer_km, complaint, diagnosis, notes, items_subtotal, discount, total_amount, customers!inner(full_name), vehicles!inner(make, model, plate)')
    .eq('workshop_id', workshopId)
    .order('opened_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
  return data as unknown as ServiceOrder[];
}

export async function createServiceOrder(workshopId: string, input: ServiceOrderInput, client?: SupabaseClient): Promise<ServiceOrder> {
  if (!input.customer_id || !input.vehicle_id) throw new Error('Selecione o cliente e o veículo.');
  if (input.complaint.trim().length < 2) throw new Error('Descreva a reclamação do cliente.');
  const { data, error } = await clientOrDefault(client)
    .from('service_orders')
    .insert({ ...input, workshop_id: workshopId, complaint: input.complaint.trim() })
    .select('id, workshop_id, order_number, customer_id, vehicle_id, assigned_membership_id, status, opened_at, completed_at, odometer_km, complaint, diagnosis, notes, items_subtotal, discount, total_amount')
    .single();
  if (error) throwFriendly(error);
  return data as ServiceOrder;
}

export async function updateServiceOrder(workshopId: string, orderId: string, changes: Partial<Pick<ServiceOrder, 'assigned_membership_id' | 'status' | 'diagnosis' | 'notes' | 'odometer_km' | 'complaint' | 'discount'>>, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client)
    .from('service_orders')
    .update(changes)
    .eq('id', orderId)
    .eq('workshop_id', workshopId)
    .select('id')
    .maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Ordem não encontrada ou sem permissão para edição.');
}

export async function listServiceOrderItems(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderItem[]> {
  const { data, error } = await clientOrDefault(client)
    .from('service_order_items')
    .select('id, workshop_id, service_order_id, inventory_product_id, item_type, description, quantity, unit_price, line_total')
    .eq('workshop_id', workshopId)
    .eq('service_order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throwFriendly(error);
  return (data ?? []) as ServiceOrderItem[];
}

async function getMyWorkshopMembershipId(workshopId: string, client: SupabaseClient): Promise<string> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throwFriendly(userError);
  if (!userResult.user) throw new Error('Sua sessão expirou. Entre novamente.');
  const { data, error } = await client.from('workshop_memberships').select('id').eq('workshop_id', workshopId).eq('user_id', userResult.user.id).eq('status', 'active').maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Você não tem um vínculo ativo com esta oficina.');
  return data.id as string;
}

export async function getMyActiveServiceOrderTimer(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderTimeEntry | null> {
  const supabase = clientOrDefault(client);
  const membershipId = await getMyWorkshopMembershipId(workshopId, supabase);
  const { data, error } = await supabase.from('service_order_time_entries')
    .select('id,workshop_id,service_order_id,membership_id,started_at,ended_at')
    .eq('workshop_id', workshopId).eq('service_order_id', orderId).eq('membership_id', membershipId).is('ended_at', null).maybeSingle();
  if (error) throwFriendly(error);
  return data as ServiceOrderTimeEntry | null;
}

export async function startServiceOrderTimer(workshopId: string, orderId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('start_service_order_timer', { target_workshop: workshopId, target_order: orderId });
  if (error?.code === '23505') throw new Error('Você já tem um cronômetro ativo. Encerre-o antes de iniciar outro.');
  if (error) throwFriendly(error);
}

export async function stopServiceOrderTimer(workshopId: string, orderId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('stop_service_order_timer', { target_workshop: workshopId, target_order: orderId });
  if (error) throwFriendly(error);
}

export async function createServiceOrderItem(workshopId: string, orderId: string, input: ServiceOrderItemInput, client?: SupabaseClient): Promise<void> {
  if (!input.description.trim()) throw new Error('Descreva o serviço ou a peça.');
  if (input.item_type === 'labor' && input.inventory_product_id) throw new Error('Mão de obra não pode movimentar o estoque.');
  if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0) throw new Error('A quantidade precisa ser maior que zero.');
  if (!Number.isFinite(Number(input.unit_price)) || Number(input.unit_price) < 0) throw new Error('Informe um valor válido.');
  const { error } = await clientOrDefault(client).from('service_order_items').insert({
    ...input,
    description: input.description.trim(),
    quantity: Number(input.quantity),
    unit_price: Number(input.unit_price),
    workshop_id: workshopId,
    service_order_id: orderId,
    inventory_product_id: input.inventory_product_id ?? null,
  });
  if (error) throwFriendly(error);
}

export async function archiveServiceOrderItem(workshopId: string, itemId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client)
    .from('service_order_items')
    .delete()
    .eq('id', itemId)
    .eq('workshop_id', workshopId);
  if (error) throwFriendly(error);
}

export async function listServiceOrderInspection(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderInspectionItem[]> {
  const { data, error } = await clientOrDefault(client).from('service_order_inspection_items').select('*')
    .eq('workshop_id', workshopId).eq('service_order_id', orderId).order('item_kind').order('item_label');
  if (error) throwFriendly(error);
  return (data ?? []) as ServiceOrderInspectionItem[];
}

export async function saveServiceOrderInspectionItem(workshopId: string, item: ServiceOrderInspectionItem, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).from('service_order_inspection_items').update({
    condition: item.condition, observations: item.observations.trim(), recommendation: item.recommendation.trim(), updated_at: new Date().toISOString(),
  }).eq('id', item.id).eq('workshop_id', workshopId).eq('service_order_id', item.service_order_id);
  if (error) throwFriendly(error);
}

export async function listServiceOrderTechnicalNotes(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderTechnicalNote[]> {
  const { data, error } = await clientOrDefault(client).from('service_order_technical_notes').select('*')
    .eq('workshop_id', workshopId).eq('service_order_id', orderId).order('created_at', { ascending: false });
  if (error) throwFriendly(error);
  return (data ?? []) as ServiceOrderTechnicalNote[];
}

export async function addServiceOrderTechnicalNote(workshopId: string, orderId: string, category: ServiceOrderTechnicalNote['category'], body: string, isRecommendation: boolean, client?: SupabaseClient): Promise<void> {
  if (body.trim().length < 5 || body.trim().length > 300) throw new Error('A nota técnica deve ter de 5 a 300 caracteres.');
  const { error } = await clientOrDefault(client).from('service_order_technical_notes').insert({
    workshop_id: workshopId, service_order_id: orderId, category, body: body.trim(), is_recommendation: isRecommendation,
  });
  if (error) throwFriendly(error);
}

export async function listServiceOrderAuthorizations(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderAuthorization[]> {
  const { data, error } = await clientOrDefault(client).from('service_order_authorizations').select('*')
    .eq('workshop_id', workshopId).eq('service_order_id', orderId).order('signed_at', { ascending: false });
  if (error) throwFriendly(error);
  return (data ?? []) as ServiceOrderAuthorization[];
}

export async function createServiceOrderAuthorization(
  workshopId: string,
  orderId: string,
  customerId: string,
  authorizationType: ServiceOrderAuthorization['authorization_type'],
  signerName: string,
  statement: string,
  amount: number,
  signatureStrokes: SignaturePoint[][],
  client?: SupabaseClient,
): Promise<void> {
  const normalizedStrokes = signatureStrokes.map((stroke) => stroke.map((point) => ({ x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) })));
  const pointCount = normalizedStrokes.reduce((count, stroke) => count + stroke.length, 0);
  if (signerName.trim().length < 2 || signerName.trim().length > 180) throw new Error('Informe o nome de quem autorizou.');
  if (statement.trim().length < 5 || statement.trim().length > 2000) throw new Error('Descreva o conteúdo autorizado.');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe um valor válido.');
  if (normalizedStrokes.length < 1 || normalizedStrokes.length > 80 || pointCount < 2 || pointCount > 5000
    || normalizedStrokes.some((stroke) => stroke.length < 1 || stroke.length > 1000 || stroke.some((point) => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1))) {
    throw new Error('Desenhe a assinatura antes de registrar a autorização.');
  }
  if (JSON.stringify(normalizedStrokes).length > 90_000) throw new Error('A assinatura excede o tamanho permitido. Limpe e assine novamente.');
  const { error } = await clientOrDefault(client).from('service_order_authorizations').insert({
    workshop_id: workshopId, service_order_id: orderId, customer_id: customerId,
    authorization_type: authorizationType, signer_name: signerName.trim(), statement: statement.trim(),
    amount, signature_strokes: normalizedStrokes,
  });
  if (error) throwFriendly(error);
}

export async function listServiceOrderAttachments(workshopId: string, orderId: string, client?: SupabaseClient): Promise<ServiceOrderAttachment[]> {
  const supabase = clientOrDefault(client);
  const { data, error } = await supabase.from('service_order_attachments').select('*')
    .eq('workshop_id', workshopId).eq('service_order_id', orderId).order('created_at', { ascending: false });
  if (error) throwFriendly(error);
  const rows = data ?? [];
  if (!rows.length) return [];
  const signed = await invokePrivateFiles<{ attachments: Array<{ id: string; signed_url: string }> }>(supabase, {
    action: 'sign_photos', kind: 'photo', workshop_id: workshopId, service_order_id: orderId,
    attachment_ids: rows.map((row) => row.id),
  });
  const urls = new Map(signed.attachments.map((item) => [item.id, item.signed_url]));
  return rows.map((row) => {
    const signedUrl = urls.get(row.id);
    if (!signedUrl) throw new Error('Não foi possível abrir uma foto protegida desta OS.');
    return { ...row, signed_url: signedUrl } as ServiceOrderAttachment;
  });
}

export async function uploadServiceOrderPhoto(
  workshopId: string,
  orderId: string,
  file: Blob,
  fileName: string,
  mimeType: string,
  caption: string,
  client?: SupabaseClient,
): Promise<void> {
  const allowedTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
  if (!allowedTypes.has(mimeType)) throw new Error('Use uma foto JPEG, PNG, WebP ou HEIC.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('A foto precisa ter até 10 MB.');
  if (caption.trim().length > 300) throw new Error('A legenda pode ter até 300 caracteres.');
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string,string>)[mimeType];
  const supabase = clientOrDefault(client);
  const prepared = await invokePrivateFiles<{ path: string; token: string }>(supabase, {
    action: 'prepare_upload', kind: 'photo', workshop_id: workshopId, service_order_id: orderId,
    mime_type: mimeType, size_bytes: file.size,
  });
  const storagePath = prepared.path;
  const { error: uploadError } = await supabase.storage.from('service-order-photos').uploadToSignedUrl(storagePath, prepared.token, file, { contentType: mimeType, upsert: false });
  if (uploadError) throwFriendly(uploadError);
  const { error } = await supabase.from('service_order_attachments').insert({
    workshop_id: workshopId, service_order_id: orderId, storage_path: storagePath,
    file_name: fileName.trim().slice(0,180) || `foto.${extension}`, mime_type: mimeType,
    size_bytes: file.size, caption: caption.trim(),
  });
  if (error) {
    await invokePrivateFiles(supabase, { action: 'remove_photo', kind: 'photo', workshop_id: workshopId, service_order_id: orderId, storage_path: storagePath }).catch(() => undefined);
    throwFriendly(error);
  }
}

export async function removeServiceOrderPhoto(workshopId: string, attachment: ServiceOrderAttachment, client?: SupabaseClient): Promise<void> {
  const supabase = clientOrDefault(client);
  await invokePrivateFiles(supabase, {
    action: 'remove_photo', kind: 'photo', workshop_id: workshopId,
    service_order_id: attachment.service_order_id, storage_path: attachment.storage_path,
  });
}

export const serviceOrderStatuses: { value: ServiceOrderStatus; label: string }[] = [
  { value: 'open', label: 'Aberta' },
  { value: 'diagnosis', label: 'Em diagnóstico' },
  { value: 'awaiting_approval', label: 'Aguardando aprovação' },
  { value: 'awaiting_parts', label: 'Aguardando peças' },
  { value: 'in_progress', label: 'Em execução' },
  { value: 'completed', label: 'Concluída' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'canceled', label: 'Cancelada' },
];

export async function listInventoryProducts(workshopId: string, client?: SupabaseClient): Promise<InventoryProduct[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase
    .from('inventory_products')
    .select('id, workshop_id, name, code, category, brand, quantity, minimum_quantity, cost_price, sale_price, location, notes, created_at, updated_at')
    .eq('workshop_id', workshopId)
    .is('archived_at', null)
    .order('name', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data as InventoryProduct[];
}

export async function saveInventoryProduct(workshopId: string, input: InventoryProductInput, productId?: string, client?: SupabaseClient): Promise<void> {
  if (input.name.trim().length < 2) throw new Error('Informe o nome do produto.');
  const minimum = Number(input.minimum_quantity);
  const cost = Number(input.cost_price);
  const sale = Number(input.sale_price);
  if (![minimum, cost, sale].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Quantidade mínima e valores precisam ser iguais ou maiores que zero.');
  const payload = { ...input, name: input.name.trim(), minimum_quantity: minimum, cost_price: cost, sale_price: sale };
  const supabase = clientOrDefault(client);
  if (productId) {
    const { data, error } = await supabase.from('inventory_products').update(payload).eq('id', productId).eq('workshop_id', workshopId).select('id').maybeSingle();
    if (error) throwFriendly(error);
    if (!data) throw new Error('Produto não encontrado ou sem permissão para edição.');
  } else {
    const { error } = await supabase.from('inventory_products').insert({ ...payload, workshop_id: workshopId });
    if (error) throwFriendly(error);
  }
}

export async function archiveInventoryProduct(workshopId: string, productId: string, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client)
    .from('inventory_products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('workshop_id', workshopId)
    .select('id')
    .maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Produto não encontrado ou sem permissão para arquivamento.');
}

export async function listInventoryMovements(workshopId: string, productId: string, client?: SupabaseClient): Promise<InventoryMovement[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase
    .from('inventory_movements')
    .select('id, workshop_id, product_id, direction, quantity, reason, service_order_id, note, created_at')
    .eq('workshop_id', workshopId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
  return data as InventoryMovement[];
}

export async function recordInventoryMovement(
  workshopId: string,
  productId: string,
  direction: 'entry' | 'exit',
  quantity: number,
  note: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('A quantidade precisa ser maior que zero.');
  const { error } = await clientOrDefault(client).rpc('record_inventory_movement', {
    target_workshop_id: workshopId,
    target_product_id: productId,
    requested_direction: direction,
    requested_quantity: quantity,
    requested_reason: 'manual',
    requested_service_order_id: null,
    requested_note: note.trim() || null,
  });
  if (error) {
    if (error.code === '23514') throw new Error('O estoque não tem quantidade suficiente para essa saída.');
    throwFriendly(error);
  }
}

export async function listSuppliers(workshopId: string, client?: SupabaseClient): Promise<Supplier[]> {
  const supabase = clientOrDefault(client);
  return await fetchAllPages((from, to) => supabase.from('suppliers').select('*').eq('workshop_id', workshopId).is('archived_at', null).order('name').range(from, to)) as Supplier[];
}

export async function saveSupplier(workshopId: string, input: Pick<Supplier, 'name' | 'cnpj' | 'phone' | 'email' | 'address' | 'contact_name' | 'notes'>, supplierId?: string, client?: SupabaseClient): Promise<void> {
  if (input.name.trim().length < 2) throw new Error('Informe o nome do fornecedor.');
  const supabase = clientOrDefault(client);
  const { data, error } = supplierId
    ? await supabase.from('suppliers').update({ ...input, name: input.name.trim() }).eq('id', supplierId).eq('workshop_id', workshopId).select('id').maybeSingle()
    : await supabase.from('suppliers').insert({ ...input, name: input.name.trim(), workshop_id: workshopId }).select('id').maybeSingle();
  if (error) throwFriendly(error);
  if (supplierId && !data) throw new Error('Fornecedor não encontrado ou sem permissão para edição.');
}

export async function archiveSupplier(workshopId: string, supplierId: string, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client).from('suppliers').update({ archived_at: new Date().toISOString() })
    .eq('id', supplierId).eq('workshop_id', workshopId).is('archived_at', null).select('id').maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Fornecedor não encontrado ou sem permissão para arquivamento.');
}

export async function createPurchase(workshopId: string, supplierId: string, items: Array<{ product_id: string; quantity: number; unit_cost: number }>, dueDate: string, paymentMethod: PaymentMethod, client?: SupabaseClient): Promise<void> {
  if (!supplierId || items.length === 0) throw new Error('Selecione o fornecedor e adicione pelo menos um produto.');
  if (items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) throw new Error('Informe quantidades e custos válidos para todos os produtos.');
  const { error } = await clientOrDefault(client).rpc('create_purchase_multi_with_method', {
    target_workshop_id: workshopId, target_supplier_id: supplierId, target_items: items,
    target_due_date: dueDate || null, target_payment_method: paymentMethod,
  });
  if (error) throwFriendly(error);
}

export async function listPurchases(workshopId: string, client?: SupabaseClient): Promise<Purchase[]> {
  const supabase = clientOrDefault(client);
  return await fetchAllPages((from, to) => supabase.from('purchases').select('*, suppliers(name)').eq('workshop_id', workshopId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)) as unknown as Purchase[];
}

export async function receivePurchase(workshopId: string, purchaseId: string, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('receive_purchase', { target_workshop_id: workshopId, target_purchase_id: purchaseId });
  if (error) throwFriendly(error);
}

export async function listPayables(workshopId: string, client?: SupabaseClient): Promise<Payable[]> {
  const supabase = clientOrDefault(client);
  return await fetchAllPages((from, to) => supabase.from('payables').select('*, suppliers(name)').eq('workshop_id', workshopId).order('due_date', { ascending: true }).order('id', { ascending: true }).range(from, to)) as unknown as Payable[];
}

export async function markPayablePaid(workshopId: string, payableId: string, paymentMethod: PaymentMethod, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('mark_payable_paid_with_method', { target_workshop_id: workshopId, target_payable_id: payableId, target_payment_method: paymentMethod });
  if (error) throwFriendly(error);
}

export async function reversePayablePayment(workshopId: string, payableId: string, reason: string, client?: SupabaseClient): Promise<void> {
  if (reason.trim().length < 3) throw new Error('Informe o motivo do estorno (mínimo de 3 caracteres).');
  const { error } = await clientOrDefault(client).rpc('reverse_payable_payment', { target_workshop: workshopId, target_payable: payableId, reversal_reason: reason.trim() });
  if (error) throwFriendly(error);
}

export async function listPayablePaymentReversals(workshopId: string, client?: SupabaseClient): Promise<PayablePaymentReversal[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('payable_payment_reversals')
    .select('id,workshop_id,payable_id,reason,previous_paid_at,previous_payment_method,reversed_by,reversed_at')
    .eq('workshop_id', workshopId).order('reversed_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
  return data as PayablePaymentReversal[];
}

export async function listFinancialEntries(workshopId: string, client?: SupabaseClient): Promise<FinancialEntry[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('financial_entries')
    .select('*, customers(full_name), service_orders(order_number)').eq('workshop_id', workshopId)
    .order('due_date', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data as FinancialEntry[];
}

export async function createFinancialEntry(workshopId: string, input: FinancialEntryInput, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('create_financial_entry', {
    target_workshop: workshopId, target_type: input.entry_type, target_description: input.description.trim(),
    target_category: input.category.trim(), target_amount: input.amount, target_due_date: input.due_date || null,
    target_customer: input.customer_id || null, target_order: null,
  });
  if (error) throwFriendly(error);
}

export async function settleFinancialEntry(workshopId: string, entryId: string, paymentMethod: PaymentMethod, client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('settle_financial_entry_with_method', { target_workshop: workshopId, target_entry: entryId, target_payment_method: paymentMethod });
  if (error) throwFriendly(error);
}

export async function reverseFinancialEntry(workshopId: string, entryId: string, reason: string, client?: SupabaseClient): Promise<void> {
  if (reason.trim().length < 3) throw new Error('Informe o motivo do estorno (mínimo de 3 caracteres).');
  const { error } = await clientOrDefault(client).rpc('reverse_financial_entry', { target_workshop: workshopId, target_entry: entryId, reversal_reason: reason.trim() });
  if (error) throwFriendly(error);
}

export async function listFinancialEntryReversals(workshopId: string, client?: SupabaseClient): Promise<FinancialEntryReversal[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('financial_entry_reversals')
    .select('id,workshop_id,financial_entry_id,reason,previous_settled_at,previous_payment_method,reversed_by,reversed_at')
    .eq('workshop_id', workshopId).order('reversed_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
  return data as FinancialEntryReversal[];
}

export async function listEstimates(workshopId: string, client?: SupabaseClient): Promise<Estimate[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('estimates')
    .select('*, customers(full_name), vehicles(make, model, plate)')
    .eq('workshop_id', workshopId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to));
  return data as unknown as Estimate[];
}

export async function listEstimateItems(workshopId: string, estimateId: string, client?: SupabaseClient): Promise<EstimateItem[]> {
  const { data, error } = await clientOrDefault(client).from('estimate_items').select('*')
    .eq('workshop_id', workshopId).eq('estimate_id', estimateId).order('created_at');
  if (error) throwFriendly(error);
  return (data ?? []) as EstimateItem[];
}

export async function createEstimate(workshopId: string, customerId: string, vehicleId: string, validUntil: string, complaint: string, notes: string, discount: number, items: EstimateItemInput[], client?: SupabaseClient): Promise<void> {
  if (!customerId || !vehicleId) throw new Error('Selecione o cliente e o veículo.');
  if (complaint.trim().length < 2 || !items.length) throw new Error('Informe o motivo e ao menos um item.');
  if (!Number.isFinite(discount) || discount < 0) throw new Error('Informe um desconto válido.');
  for (const item of items) {
    if (!item.description.trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0) throw new Error('Revise os itens e seus valores.');
  }
  const { error } = await clientOrDefault(client).rpc('create_estimate', {
    target_workshop: workshopId, target_customer: customerId, target_vehicle: vehicleId,
    target_valid_until: validUntil || null, target_complaint: complaint.trim(), target_notes: notes,
    target_discount: discount, target_items: items,
  });
  if (error) throwFriendly(error);
}

export async function reviewEstimate(workshopId: string, estimateId: string, decision: 'approved' | 'rejected', client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('review_estimate', { target_workshop: workshopId, target_estimate: estimateId, decision });
  if (error) throwFriendly(error);
}

export async function convertEstimate(workshopId: string, estimateId: string, client?: SupabaseClient): Promise<string> {
  const { data, error } = await clientOrDefault(client).rpc('convert_estimate', { target_workshop: workshopId, target_estimate: estimateId });
  if (error) throwFriendly(error);
  return data as string;
}

export async function getDashboardMetrics(workshopId: string, client?: SupabaseClient): Promise<DashboardMetrics> {
  const { data, error } = await clientOrDefault(client).rpc('get_dashboard_metrics', { target_workshop_id: workshopId });
  if (error) throwFriendly(error);
  const values = Object.fromEntries(((data ?? []) as Array<{ metric: keyof DashboardMetrics; value: number | string }>).map((row) => [row.metric, Number(row.value)]));
  return {
    customers: values.customers ?? 0, vehicles: values.vehicles ?? 0, orders_open: values.orders_open ?? 0,
    orders_in_progress: values.orders_in_progress ?? 0, orders_completed: values.orders_completed ?? 0,
    estimates_pending: values.estimates_pending ?? 0, inventory_low: values.inventory_low ?? 0, payables_pending: values.payables_pending ?? 0,
  };
}

export async function getFinanceDashboardMetrics(workshopId: string, client?: SupabaseClient): Promise<FinanceDashboardMetrics> {
  const { data, error } = await clientOrDefault(client).rpc('get_finance_dashboard_metrics', { target_workshop: workshopId });
  if (error) throwFriendly(error);
  const row = (data?.[0] ?? {}) as Partial<Record<keyof FinanceDashboardMetrics, number | string>>;
  return {
    receivables_pending: Number(row.receivables_pending ?? 0), receivables_overdue: Number(row.receivables_overdue ?? 0),
    received_this_month: Number(row.received_this_month ?? 0), expenses_this_month: Number(row.expenses_this_month ?? 0),
    profit_this_month: Number(row.profit_this_month ?? 0), estimates_approved: Number(row.estimates_approved ?? 0),
  };
}

export async function listMaintenanceReminders(workshopId: string, client?: SupabaseClient): Promise<MaintenanceReminder[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('maintenance_reminders')
    .select('*, vehicles(make, model, plate)').eq('workshop_id', workshopId).order('due_date').order('id', { ascending: true }).range(from, to));
  return data as unknown as MaintenanceReminder[];
}

export async function createMaintenanceReminder(workshopId: string, vehicleId: string, customerId: string, title: string, dueDate: string, dueKm: number | null, notes: string, client?: SupabaseClient): Promise<void> {
  if (!vehicleId || title.trim().length < 2) throw new Error('Selecione o veículo e descreva a manutenção.');
  if (!dueDate && dueKm === null) throw new Error('Informe uma data ou quilometragem prevista.');
  if (dueKm !== null && (!Number.isInteger(dueKm) || dueKm < 0)) throw new Error('Informe uma quilometragem válida.');
  const { error } = await clientOrDefault(client).from('maintenance_reminders').insert({
    workshop_id: workshopId, vehicle_id: vehicleId, customer_id: customerId, title: title.trim(), due_date: dueDate || null,
    due_odometer_km: dueKm, notes: notes.trim(),
  });
  if (error) throwFriendly(error);
}

export async function completeMaintenanceReminder(workshopId: string, reminderId: string, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client).from('maintenance_reminders').update({ completed_at: new Date().toISOString() })
    .eq('id', reminderId).eq('workshop_id', workshopId).is('completed_at', null).select('id').maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Lembrete não encontrado ou já concluído.');
}

export async function listServiceWarranties(workshopId: string, client?: SupabaseClient): Promise<ServiceWarranty[]> {
  const supabase = clientOrDefault(client);
  const data = await fetchAllPages((from, to) => supabase.from('service_warranties')
    .select('*, service_orders!inner(order_number, customers!inner(full_name), vehicles!inner(make, model, plate))')
    .eq('workshop_id', workshopId).order('ends_on', { ascending: true }).order('id', { ascending: true }).range(from, to));
  return data as unknown as ServiceWarranty[];
}

export async function createServiceWarranty(workshopId: string, orderId: string, description: string, startDate: string, durationDays: number, conditions: string, client?: SupabaseClient): Promise<void> {
  if (!orderId || description.trim().length < 2 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) throw new Error('Informe a OS, o serviço e um prazo entre 1 e 3.650 dias.');
  const { error } = await clientOrDefault(client).rpc('create_service_warranty', {
    target_workshop: workshopId, target_order: orderId, target_description: description.trim(),
    target_start: startDate || null, target_days: durationDays, target_conditions: conditions,
  });
  if (error) throwFriendly(error);
}

export async function isPlatformAdministrator(client?: SupabaseClient): Promise<boolean> {
  const supabase = clientOrDefault(client);
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError) throwFriendly(userError);
  if (!userResult.user) return false;
  const { data, error } = await supabase.from('platform_admins').select('active').eq('user_id', userResult.user.id).maybeSingle();
  if (error) throwFriendly(error);
  return data?.active === true;
}

export async function listPlatformWorkshops(client?: SupabaseClient): Promise<PlatformWorkshop[]> {
  const { data, error } = await clientOrDefault(client).rpc('list_platform_workshops');
  if (error) throwFriendly(error);
  return (data ?? []) as PlatformWorkshop[];
}

export async function getPlatformMetrics(client?: SupabaseClient): Promise<PlatformMetrics> {
  const { data, error } = await clientOrDefault(client).rpc('get_platform_metrics');
  if (error) throwFriendly(error);
  const row = (data?.[0] ?? {}) as Record<keyof PlatformMetrics, number | string>;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as PlatformMetrics;
}

export async function setPlatformWorkshopStatus(workshopId: string, status: 'active' | 'blocked', client?: SupabaseClient): Promise<void> {
  const { error } = await clientOrDefault(client).rpc('admin_set_workshop_status', { target_workshop_id: workshopId, next_status: status });
  if (error) throwFriendly(error);
}

export async function deletePlatformWorkshop(workshopId: string, confirmationName: string, client?: SupabaseClient): Promise<{
  warning: string | null;
  releasedAccounts: number | null;
  preservedLinkedAccounts: number | null;
  preservedStorageAccounts: number | null;
}> {
  const { data, error } = await clientOrDefault(client).functions.invoke('manage-workshop', {
    body: { action: 'delete_workshop', workshop_id: workshopId, confirmation_name: confirmationName },
  });
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Não foi possível excluir a oficina. Tente novamente.'));
  if (data?.error) throw new Error(data.error);
  return {
    warning: typeof data?.warning === 'string' ? data.warning : null,
    releasedAccounts: typeof data?.releasedAccounts === 'number' ? data.releasedAccounts : null,
    preservedLinkedAccounts: typeof data?.preservedLinkedAccounts === 'number' ? data.preservedLinkedAccounts : null,
    preservedStorageAccounts: typeof data?.preservedStorageAccounts === 'number' ? data.preservedStorageAccounts : null,
  };
}

export async function createPlatformWorkshop(workshopName: string, ownerName: string, ownerEmail: string, client?: SupabaseClient): Promise<{
  workshopId: string;
  reusedExistingAccount: boolean;
}> {
  const { data, error } = await clientOrDefault(client).functions.invoke('manage-workshop', {
    body: { action: 'create_workshop', workshop_name: workshopName, owner_name: ownerName, owner_email: ownerEmail },
  });
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Não foi possível criar a oficina. Tente novamente.'));
  if (data?.error) throw new Error(data.error);
  return {
    workshopId: data.workshop_id as string,
    reusedExistingAccount: data.reused_existing_account === true,
  };
}

export async function listWorkshopEmployees(workshopId: string, client?: SupabaseClient): Promise<WorkshopEmployee[]> {
  const supabase = clientOrDefault(client);
  const { data: memberships, error: membershipError } = await supabase.from('workshop_memberships')
    .select('id,workshop_id,user_id,role,status').eq('workshop_id', workshopId).eq('role', 'staff').order('status');
  if (membershipError) throwFriendly(membershipError);
  const rows = memberships ?? [];
  if (!rows.length) return [];
  const ids = rows.map((row) => row.user_id);
  const memberIds = rows.map((row) => row.id);
  const [profiles, permissions] = await Promise.all([
    supabase.from('profiles').select('user_id,full_name').in('user_id', ids),
    supabase.from('workshop_member_permissions').select('membership_id,module,can_view,can_create,can_update,can_delete').in('membership_id', memberIds),
  ]);
  if (profiles.error) throwFriendly(profiles.error);
  if (permissions.error) throwFriendly(permissions.error);
  const commissions = await supabase.from('workshop_employee_commissions').select('membership_id,labor_commission_rate').eq('workshop_id', workshopId).in('membership_id', memberIds);
  if (commissions.error) throwFriendly(commissions.error);
  return rows.map((row) => ({
    ...row,
    profiles: { full_name: profiles.data?.find((profile) => profile.user_id === row.user_id)?.full_name ?? 'Funcionário' },
    labor_commission_rate: commissions.data?.find((commission) => commission.membership_id === row.id)?.labor_commission_rate ?? 0,
    workshop_member_permissions: (permissions.data ?? []).filter((permission) => permission.membership_id === row.id).map((permission) => ({
      module: permission.module, can_view: permission.can_view, can_create: permission.can_create, can_update: permission.can_update, can_delete: permission.can_delete,
    })),
  })) as WorkshopEmployee[];
}

export async function setEmployeeLaborCommission(workshopId: string, membershipId: string, rate: number, client?: SupabaseClient): Promise<void> {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Informe uma comissão entre 0% e 100%.');
  const { error } = await clientOrDefault(client).rpc('set_employee_labor_commission', { target_workshop: workshopId, target_membership: membershipId, target_rate: rate });
  if (error) throwFriendly(error);
}

export async function getEmployeeProductivity(workshopId: string, from: string, to: string, client?: SupabaseClient): Promise<EmployeeProductivity[]> {
  const { data, error } = await clientOrDefault(client).rpc('get_employee_productivity', {
    target_workshop: workshopId, target_from: new Date(`${from}T00:00:00`).toISOString(), target_to: new Date(`${to}T23:59:59.999`).toISOString(),
  });
  if (error) throwFriendly(error);
  return (data ?? []) as EmployeeProductivity[];
}

export async function inviteWorkshopEmployee(workshopId: string, fullName: string, email: string, permissions: Record<string, ModulePermissions>, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client).functions.invoke('manage-workshop', {
    body: { action: 'invite_employee', workshop_id: workshopId, full_name: fullName, email, permissions },
  });
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Não foi possível enviar o convite ao funcionário. Tente novamente.'));
  if (data?.error) throw new Error(data.error);
}

export async function saveWorkshopEmployeePermissions(workshopId: string, employee: WorkshopEmployee, permissions: Record<string, ModulePermissions>, client?: SupabaseClient): Promise<void> {
  const rows = Object.entries(permissions).map(([module, permission]) => ({
    workshop_id: workshopId, membership_id: employee.id, module,
    can_view: permission.view, can_create: permission.create, can_update: permission.update, can_delete: permission.delete,
  }));
  const { error } = await clientOrDefault(client).from('workshop_member_permissions').upsert(rows, { onConflict: 'membership_id,module' });
  if (error) throwFriendly(error);
}

export async function setWorkshopEmployeeStatus(workshopId: string, employee: WorkshopEmployee, status: 'active' | 'disabled', client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client).from('workshop_memberships').update({ status })
    .eq('id', employee.id).eq('workshop_id', workshopId).eq('role', 'staff').select('id').maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Funcionário não encontrado ou sem permissão.');
}

export async function deleteWorkshopEmployee(workshopId: string, employee: WorkshopEmployee, client?: SupabaseClient): Promise<void> {
  const { data, error } = await clientOrDefault(client).from('workshop_memberships').delete()
    .eq('id', employee.id).eq('workshop_id', workshopId).eq('role', 'staff').select('id').maybeSingle();
  if (error) throwFriendly(error);
  if (!data) throw new Error('Funcionário não encontrado ou sem permissão para remoção.');
}

