import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import FinanceScreen from './FinanceScreen';
import { getWorkshopPermissions, listCustomers, listFinancialEntries, listFinancialEntryReversals, listPayables } from '../services/workshopData';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({
  createFinancialEntry: jest.fn(), getWorkshopPermissions: jest.fn(), listCustomers: jest.fn(), listFinancialEntries: jest.fn(), listFinancialEntryReversals: jest.fn(), listPayables: jest.fn(), markPayablePaid: jest.fn(), reverseFinancialEntry: jest.fn(), settleFinancialEntry: jest.fn(), subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined),
}));

test('shows received and pending financial entries using persisted data', async () => {
  jest.mocked(listFinancialEntries).mockResolvedValue([
    { id: 'f1', workshop_id: 'w1', entry_type: 'receivable', description: 'OS entregue', category: 'Serviços', amount: 250, due_date: '2026-11-01', status: 'paid', settled_at: '2026-10-31T12:00:00Z', payment_method: null, customer_id: null, service_order_id: 'o1', created_at: '', service_orders: { order_number: 3 } },
    { id: 'f2', workshop_id: 'w1', entry_type: 'expense', description: 'Conta de luz', category: 'Utilidades', amount: 80, due_date: '2026-11-10', status: 'pending', settled_at: null, payment_method: null, customer_id: null, service_order_id: null, created_at: '' },
  ]);
  jest.mocked(listCustomers).mockResolvedValue([]);
  jest.mocked(listPayables).mockResolvedValue([]);
  jest.mocked(listFinancialEntryReversals).mockResolvedValue([]);
  jest.mocked(getWorkshopPermissions).mockResolvedValue({
    dashboard: { view: true, create: false, update: false, delete: false }, clients: { view: true, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false }, service_orders: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false }, inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: true, create: false, update: false, delete: false }, employees: { view: false, create: false, update: false, delete: false },
    reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<FinanceScreen workshopId="w1" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('OS entregue');
  expect(output).toContain('Conta de luz');
  expect(output).toContain('Resultado recebido');
  expect(output).toContain('Gerado pela OS #');
});
