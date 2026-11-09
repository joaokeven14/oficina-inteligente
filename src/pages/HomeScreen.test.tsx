import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import HomeScreen from './HomeScreen';
import { listCurrentWorkshops, getDashboardMetrics, getFinanceDashboardMetrics, getWorkshopPermissions, isPlatformAdministrator } from '../services/workshopData';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({ listCurrentWorkshops: jest.fn(), getDashboardMetrics: jest.fn(), getFinanceDashboardMetrics: jest.fn(), getWorkshopPermissions: jest.fn(), isPlatformAdministrator: jest.fn(), subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined) }));
const current = jest.mocked(listCurrentWorkshops);
const metrics = jest.mocked(getDashboardMetrics);
const financeMetrics = jest.mocked(getFinanceDashboardMetrics);
const permissions = jest.mocked(getWorkshopPermissions);
const isAdmin = jest.mocked(isPlatformAdministrator);
const noAccess = {
  dashboard: { view: false, create: false, update: false, delete: false }, clients: { view: false, create: false, update: false, delete: false },
  employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  vehicles: { view: false, create: false, update: false, delete: false }, service_orders: { view: false, create: false, update: false, delete: false },
  inventory: { view: false, create: false, update: false, delete: false }, finance: { view: false, create: false, update: false, delete: false }, estimates: { view: false, create: false, update: false, delete: false },
};

test('renders database counts only when dashboard permission is granted', async () => {
  current.mockResolvedValue([{ workshopId: 'w1', workshopName: 'Oficina Sul', role: 'owner' }]);
  isAdmin.mockResolvedValue(false);
  permissions.mockResolvedValue({ ...noAccess, dashboard: { view: true, create: false, update: false, delete: false }, finance: { view: true, create: false, update: false, delete: false } });
  metrics.mockResolvedValue({ customers: 8, vehicles: 11, orders_open: 2, orders_in_progress: 1, orders_completed: 7, estimates_pending: 3, inventory_low: 4, payables_pending: 5 });
  financeMetrics.mockResolvedValue({ receivables_pending: 600, receivables_overdue: 120, received_this_month: 2500, expenses_this_month: 900, profit_this_month: 1600, estimates_approved: 4 });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<HomeScreen onSignOut={() => undefined} />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(JSON.stringify(screen!.toJSON())).toContain('Orçamentos pendentes');
  expect(JSON.stringify(screen!.toJSON())).toContain('Recebido no mês');
  expect(JSON.stringify(screen!.toJSON())).toContain('Oficina Sul');
  expect(metrics).toHaveBeenCalledWith('w1');
});

test('does not request or display dashboard metrics without permission', async () => {
  current.mockResolvedValue([{ workshopId: 'w1', workshopName: 'Oficina Sul', role: 'staff' }]);
  isAdmin.mockResolvedValue(false);
  permissions.mockResolvedValue(noAccess);
  metrics.mockClear();
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<HomeScreen onSignOut={() => undefined} />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(JSON.stringify(screen!.toJSON())).not.toContain('Orçamentos pendentes');
  expect(metrics).not.toHaveBeenCalled();
});

test('does not show after-sales when only service orders are authorized', async () => {
  current.mockResolvedValue([{ workshopId: 'w1', workshopName: 'Oficina Sul', role: 'staff' }]);
  isAdmin.mockResolvedValue(false);
  permissions.mockResolvedValue({ ...noAccess, service_orders: { view: true, create: false, update: false, delete: false } });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<HomeScreen onSignOut={() => undefined} />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Ordens');
  expect(output).not.toContain('Pós-venda');
});

test('lets a user switch between the workshops linked to the account', async () => {
  current.mockResolvedValue([
    { workshopId: 'w1', workshopName: 'Oficina Sul', role: 'owner' },
    { workshopId: 'w2', workshopName: 'Oficina Norte', role: 'staff' },
  ]);
  isAdmin.mockResolvedValue(false);
  permissions.mockResolvedValue(noAccess);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<HomeScreen onSignOut={() => undefined} />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  await ReactTestRenderer.act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Selecionar oficina' }).props.onPress(); });
  let candidate = screen!.root.find((node) => String(node.type) === 'Text' && node.children.includes('Oficina Norte'));
  while (typeof candidate.props.onPress !== 'function' && candidate.parent) candidate = candidate.parent;
  await ReactTestRenderer.act(async () => { candidate.props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(permissions).toHaveBeenCalledWith('w2');
  expect(JSON.stringify(screen!.toJSON())).toContain('Oficina Norte');
});
