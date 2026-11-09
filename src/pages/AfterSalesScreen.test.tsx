import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AfterSalesScreen from './AfterSalesScreen';
import { getWorkshopPermissions, getWorkshopSettings, listMaintenanceReminders, listServiceOrderItems, listServiceOrders, listServiceWarranties, listVehicles } from '../services/workshopData';
import { openPrintableDocument } from '../utils/printDocument';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({
  completeMaintenanceReminder: jest.fn(), createMaintenanceReminder: jest.fn(), createServiceWarranty: jest.fn(), getWorkshopPermissions: jest.fn(), getWorkshopSettings: jest.fn(),
  subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined),
  listMaintenanceReminders: jest.fn(), listServiceOrderItems: jest.fn(), listServiceOrders: jest.fn(), listServiceWarranties: jest.fn(), listVehicles: jest.fn(),
}));
jest.mock('../utils/printDocument', () => ({ openPrintableDocument: jest.fn().mockResolvedValue(undefined) }));

test('shows workshop maintenance reminders and warranty records', async () => {
  jest.mocked(listMaintenanceReminders).mockResolvedValue([{ id: 'r1', workshop_id: 'w1', vehicle_id: 'v1', customer_id: 'c1', title: 'Troca de óleo', due_date: '2027-01-31', due_odometer_km: 130000, notes: '', completed_at: null, created_at: '', vehicles: { make: 'Ford', model: 'Ka', plate: 'ABC1D23' } }]);
  jest.mocked(listServiceWarranties).mockResolvedValue([{ id: 'g1', workshop_id: 'w1', service_order_id: 'o1', description: 'Pastilhas', starts_on: '2026-10-31', duration_days: 90, ends_on: '2027-01-29', conditions: '', voided_at: null, created_at: '', service_orders: { order_number: 5, customers: { full_name: 'Ana' }, vehicles: { make: 'Ford', model: 'Ka', plate: 'ABC1D23' } } }]);
  jest.mocked(listVehicles).mockResolvedValue([]); jest.mocked(listServiceOrders).mockResolvedValue([]);
  jest.mocked(getWorkshopPermissions).mockResolvedValue({
    dashboard: { view: true, create: false, update: false, delete: false }, clients: { view: false, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false }, service_orders: { view: true, create: true, update: true, delete: false },
    after_sales: { view: true, create: true, update: true, delete: false },
    inventory: { view: false, create: false, update: false, delete: false }, finance: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<AfterSalesScreen workshopId="w1" workshopName="Oficina Sul" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Troca de óleo');
  expect(output).toContain('Garantias');
  expect(output).toContain('Pastilhas');
});

test('builds a maintenance history document from the vehicle service orders', async () => {
  const order = { id: 'o1', workshop_id: 'w1', order_number: 5, customer_id: 'c1', vehicle_id: 'v1', assigned_membership_id: null, status: 'delivered' as const, opened_at: '2026-10-20T12:00:00Z', completed_at: '2026-10-21T12:00:00Z', odometer_km: 120000, complaint: 'Ruído no freio', diagnosis: 'Pastilhas gastas', notes: '', items_subtotal: 180, discount: 0, total_amount: 180, customers: { full_name: 'Ana Silva' }, vehicles: { make: 'Ford', model: 'Ka', plate: 'ABC1D23' } };
  jest.mocked(listMaintenanceReminders).mockResolvedValue([]); jest.mocked(listServiceWarranties).mockResolvedValue([]);
  jest.mocked(listVehicles).mockResolvedValue([{ id: 'v1', workshop_id: 'w1', customer_id: 'c1', vehicle_type: 'cars', make: 'Ford', model: 'Ka', year_manufacture: 2020, model_year: 2021, plate: 'ABC1D23', color: 'Prata', mileage_km: 120000, fuel: 'flex', chassis: null, notes: null, created_at: '', updated_at: '', customers: { full_name: 'Ana Silva' } }]);
  jest.mocked(listServiceOrders).mockResolvedValue([order]);
  jest.mocked(listServiceOrderItems).mockResolvedValue([{ id: 'i1', workshop_id: 'w1', service_order_id: 'o1', inventory_product_id: null, item_type: 'labor', description: 'Troca das pastilhas', quantity: 1, unit_price: 180, line_total: 180 }]);
  jest.mocked(getWorkshopSettings).mockResolvedValue({ id: 'w1', name: 'Oficina Sul', logo_path: null, logo_url: null, cnpj: null, phone: null, whatsapp: null, email: null, address: null, city: null, state: null, responsible_name: null, opening_hours: null });
  jest.mocked(getWorkshopPermissions).mockResolvedValue({ dashboard: { view: true, create: false, update: false, delete: false }, clients: { view: false, create: false, update: false, delete: false }, vehicles: { view: false, create: false, update: false, delete: false }, service_orders: { view: true, create: false, update: false, delete: false }, after_sales: { view: true, create: true, update: true, delete: false }, estimates: { view: false, create: false, update: false, delete: false }, inventory: { view: false, create: false, update: false, delete: false }, finance: { view: false, create: false, update: false, delete: false }, employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false } });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<AfterSalesScreen workshopId="w1" workshopName="Oficina Sul" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  await ReactTestRenderer.act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Gerar histórico ABC1D23' }).props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(openPrintableDocument).toHaveBeenCalledWith('Histórico de manutenção do veículo', 'Oficina Sul', expect.arrayContaining([expect.objectContaining({ label: 'Diagnóstico da OS #5', value: 'Pastilhas gastas' }), expect.objectContaining({ label: 'Serviço da OS #5: Troca das pastilhas' })]), undefined, null);
});

test('blocks after-sales data when the owner has not granted access', async () => {
  jest.mocked(getWorkshopPermissions).mockResolvedValue({
    dashboard: { view: false, create: false, update: false, delete: false }, clients: { view: false, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false }, service_orders: { view: true, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false }, inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false }, employees: { view: false, create: false, update: false, delete: false },
    reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  jest.mocked(listMaintenanceReminders).mockClear(); jest.mocked(listServiceWarranties).mockClear(); jest.mocked(listVehicles).mockClear(); jest.mocked(listServiceOrders).mockClear();
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<AfterSalesScreen workshopId="w1" workshopName="Oficina Sul" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(JSON.stringify(screen!.toJSON())).toContain('O proprietário ainda não autorizou seu acesso a esta área.');
  expect(listMaintenanceReminders).not.toHaveBeenCalled();
  expect(listServiceWarranties).not.toHaveBeenCalled();
  expect(listVehicles).not.toHaveBeenCalled();
  expect(listServiceOrders).not.toHaveBeenCalled();
});
