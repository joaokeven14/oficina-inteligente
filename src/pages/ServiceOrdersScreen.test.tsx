import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ServiceOrdersScreen from './ServiceOrdersScreen';
import { getMyActiveServiceOrderTimer, getWorkshopPermissions, listCustomers, listServiceOrderInspection, listServiceOrderItems, listServiceOrderTechnicalNotes, listServiceOrders, listVehicles, listWorkshopEmployees } from '../services/workshopData';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({
  archiveServiceOrderItem: jest.fn(),
  createServiceOrder: jest.fn(),
  createServiceOrderItem: jest.fn(),
  getWorkshopPermissions: jest.fn(),
  getMyActiveServiceOrderTimer: jest.fn(),
  startServiceOrderTimer: jest.fn(),
  stopServiceOrderTimer: jest.fn(),
  listServiceOrderInspection: jest.fn(),
  listCustomers: jest.fn(),
  listServiceOrderStockProducts: jest.fn().mockResolvedValue([]),
  listServiceOrderTechnicalNotes: jest.fn(),
  listServiceOrderItems: jest.fn(),
  listServiceOrders: jest.fn(),
  listVehicles: jest.fn(),
  listWorkshopEmployees: jest.fn(),
  subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined),
  serviceOrderStatuses: [
    { value: 'open', label: 'Aberta' }, { value: 'diagnosis', label: 'Em diagnóstico' },
    { value: 'awaiting_approval', label: 'Aguardando aprovação' }, { value: 'awaiting_parts', label: 'Aguardando peças' },
    { value: 'in_progress', label: 'Em execução' }, { value: 'completed', label: 'Concluída' },
    { value: 'delivered', label: 'Entregue' }, { value: 'canceled', label: 'Cancelada' },
  ],
  updateServiceOrder: jest.fn(),
  saveServiceOrderInspectionItem: jest.fn(), addServiceOrderTechnicalNote: jest.fn(),
}));

const mockPermissions = jest.mocked(getWorkshopPermissions);
const mockOrders = jest.mocked(listServiceOrders);
let activeScreen: ReactTestRenderer.ReactTestRenderer | undefined;

async function renderScreen() {
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<ServiceOrdersScreen workshopId="workshop-1" />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  activeScreen = screen!;
  return activeScreen;
}

const allDenied = {
  clients: { view: false, create: false, update: false, delete: false },
  vehicles: { view: false, create: false, update: false, delete: false },
  service_orders: { view: false, create: false, update: false, delete: false },
  inventory: { view: false, create: false, update: false, delete: false },
  finance: { view: false, create: false, update: false, delete: false },
  estimates: { view: false, create: false, update: false, delete: false },
  dashboard: { view: false, create: false, update: false, delete: false },
  employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
};

beforeEach(() => {
  mockPermissions.mockResolvedValue(allDenied);
  mockOrders.mockResolvedValue([]);
  jest.mocked(listCustomers).mockResolvedValue([]);
  jest.mocked(listVehicles).mockResolvedValue([]);
  jest.mocked(listServiceOrderInspection).mockResolvedValue([]);
  jest.mocked(listServiceOrderTechnicalNotes).mockResolvedValue([]);
  jest.mocked(listWorkshopEmployees).mockResolvedValue([]);
  jest.mocked(getMyActiveServiceOrderTimer).mockResolvedValue(null);
  jest.mocked(listServiceOrderItems).mockResolvedValue([]);
});

afterEach(async () => {
  if (activeScreen) await ReactTestRenderer.act(async () => { activeScreen?.unmount(); });
  activeScreen = undefined;
});

test('does not offer order creation without create permission', async () => {
  const screen = await renderScreen();
  const output = JSON.stringify(screen.toJSON());
  expect(output).toContain('Ainda não há ordens');
  expect(output).not.toContain('+ Nova OS');
});

test('offers order creation when the database grants create permission', async () => {
  mockPermissions.mockResolvedValue({
    ...allDenied,
    service_orders: { view: true, create: true, update: false, delete: false },
  });
  const screen = await renderScreen();
  expect(JSON.stringify(screen.toJSON())).toContain('+ Nova OS');
});
