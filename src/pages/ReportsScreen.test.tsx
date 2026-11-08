import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ReportsScreen from './ReportsScreen';
import { openPrintableDocument } from '../utils/printDocument';
import { getEmployeeProductivity, getWorkshopPermissions, getWorkshopSettings, listCustomers, listEstimates, listFinancialEntries, listInventoryProducts, listMaintenanceReminders, listPayables, listPurchases, listServiceOrders, listServiceWarranties, listVehicles, listWorkshopEmployees } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  getEmployeeProductivity: jest.fn(), getWorkshopPermissions: jest.fn(), getWorkshopSettings: jest.fn(), listCustomers: jest.fn(), listEstimates: jest.fn(), listFinancialEntries: jest.fn(), listInventoryProducts: jest.fn(), listMaintenanceReminders: jest.fn(), listPayables: jest.fn(), listPurchases: jest.fn(), listServiceOrders: jest.fn(), listServiceWarranties: jest.fn(), listVehicles: jest.fn(), listWorkshopEmployees: jest.fn(),
}));
jest.mock('../utils/printDocument', () => ({ openPrintableDocument: jest.fn().mockResolvedValue(undefined) }));

beforeEach(() => { jest.clearAllMocks(); });

test('builds reports from current persisted workshop data', async () => {
  const allow = { view: true, create: true, update: true, delete: true };
  jest.mocked(getWorkshopPermissions).mockResolvedValue({ dashboard: allow, clients: allow, vehicles: allow, service_orders: allow, after_sales: allow, estimates: allow, inventory: allow, finance: allow, employees: allow, reports: allow, settings: allow });
  jest.mocked(listCustomers).mockResolvedValue([{ id: 'c1', workshop_id: 'w1', full_name: 'Ana Silva', document: null, phone: null, whatsapp: null, email: null, address: null, city: null, state: null, notes: null, created_at: '', updated_at: '' }]);
  jest.mocked(listVehicles).mockResolvedValue([]); jest.mocked(listServiceOrders).mockResolvedValue([]); jest.mocked(listEstimates).mockResolvedValue([]); jest.mocked(listInventoryProducts).mockResolvedValue([]); jest.mocked(listPurchases).mockResolvedValue([]);
  jest.mocked(listFinancialEntries).mockResolvedValue([
    { id: 'f1', workshop_id: 'w1', entry_type: 'receivable', description: 'Recebimento', category: 'Serviços', amount: 250, due_date: null, status: 'paid', settled_at: new Date().toISOString(), payment_method: null, customer_id: null, service_order_id: null, created_at: '' },
    { id: 'f2', workshop_id: 'w1', entry_type: 'expense', description: 'Aluguel', category: 'Aluguel', amount: 100, due_date: null, status: 'paid', settled_at: new Date().toISOString(), payment_method: null, customer_id: null, service_order_id: null, created_at: '' },
  ]);
  jest.mocked(listPayables).mockResolvedValue([]); jest.mocked(listMaintenanceReminders).mockResolvedValue([]); jest.mocked(listServiceWarranties).mockResolvedValue([]); jest.mocked(listWorkshopEmployees).mockResolvedValue([]);
  jest.mocked(getWorkshopSettings).mockResolvedValue({ id: 'w1', name: 'Oficina Sul', logo_path: null, logo_url: null, cnpj: null, phone: null, whatsapp: null, email: null, address: null, city: null, state: null, responsible_name: null, opening_hours: null });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<ReportsScreen workshopId="w1" workshopName="Oficina Sul" isOwner={false} />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Clientes ativos');
  expect(output).toContain('Exportar resumo CSV');
  expect(output).toContain('Resultado realizado no período');
  expect(output).toContain('Recebimentos e despesas por mês');
  expect(output).toContain('Financeiro por categoria');
  expect(output).toContain('Serviços');
  expect(output).toContain('1');
  expect(getEmployeeProductivity).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Gerar documento do relatório' }).props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(openPrintableDocument).toHaveBeenCalledWith('Relatório operacional', 'Oficina Sul', expect.arrayContaining([expect.objectContaining({ label: 'Clientes ativos', value: '1' })]), expect.stringContaining('Período:'), null);
});

test('loads time tracking and labor value only on the owner request', async () => {
  const allow = { view: true, create: true, update: true, delete: true };
  jest.mocked(getWorkshopPermissions).mockResolvedValue({ dashboard: allow, clients: allow, vehicles: allow, service_orders: allow, after_sales: allow, estimates: allow, inventory: allow, finance: allow, employees: allow, reports: allow, settings: allow });
  jest.mocked(listCustomers).mockResolvedValue([]); jest.mocked(listVehicles).mockResolvedValue([]); jest.mocked(listServiceOrders).mockResolvedValue([]); jest.mocked(listEstimates).mockResolvedValue([]); jest.mocked(listInventoryProducts).mockResolvedValue([]); jest.mocked(listPurchases).mockResolvedValue([]); jest.mocked(listFinancialEntries).mockResolvedValue([]); jest.mocked(listPayables).mockResolvedValue([]); jest.mocked(listMaintenanceReminders).mockResolvedValue([]); jest.mocked(listServiceWarranties).mockResolvedValue([]); jest.mocked(listWorkshopEmployees).mockResolvedValue([]);
  jest.mocked(getEmployeeProductivity).mockResolvedValue([{ membership_id: 'm1', full_name: 'João Mecânico', orders_delivered: 2, labor_value: 1000, minutes_logged: 245 }]);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<ReportsScreen workshopId="w1" workshopName="Oficina Sul" isOwner />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(getEmployeeProductivity).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Atualizar produtividade' }).props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(getEmployeeProductivity).toHaveBeenCalledTimes(1);
  expect(output).toContain('Tempo registrado de João Mecânico');
  expect(output).toContain('245 min');
  expect(output).toContain('R$ 1.000,00');
  expect(output).not.toContain('Comissão');
});
