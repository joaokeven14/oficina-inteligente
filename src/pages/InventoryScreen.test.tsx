import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import InventoryScreen from './InventoryScreen';
import { getWorkshopPermissions, listInventoryProducts } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  archiveInventoryProduct: jest.fn(),
  getWorkshopPermissions: jest.fn(),
  listInventoryMovements: jest.fn(),
  listInventoryProducts: jest.fn(),
  recordInventoryMovement: jest.fn(),
  saveInventoryProduct: jest.fn(),
}));

const mockPermissions = jest.mocked(getWorkshopPermissions);
const mockProducts = jest.mocked(listInventoryProducts);
const denied = {
  clients: { view: false, create: false, update: false, delete: false },
  vehicles: { view: false, create: false, update: false, delete: false },
  service_orders: { view: false, create: false, update: false, delete: false },
  inventory: { view: true, create: false, update: false, delete: false },
  finance: { view: false, create: false, update: false, delete: false },
  estimates: { view: false, create: false, update: false, delete: false },
  dashboard: { view: false, create: false, update: false, delete: false },
  employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
};

async function renderScreen() {
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<InventoryScreen workshopId="workshop-1" />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  return screen!;
}

beforeEach(() => {
  mockPermissions.mockResolvedValue(denied);
  mockProducts.mockResolvedValue([{
    id: 'product-1', workshop_id: 'workshop-1', name: 'Filtro de óleo', code: 'FO-01',
    category: 'Filtros', brand: 'Marca', quantity: 1, minimum_quantity: 2, cost_price: 20,
    sale_price: 35, location: null, notes: null, created_at: '', updated_at: '',
  }]);
});

test('shows current inventory and a low-stock alert from returned records', async () => {
  const screen = await renderScreen();
  const output = JSON.stringify(screen.toJSON());
  expect(output).toContain('Filtro de óleo');
  expect(output).toContain('no mínimo ou abaixo dele');
  expect(output).not.toContain('+ Produto');
});

test('offers product creation only when the database grants create permission', async () => {
  mockPermissions.mockResolvedValue({
    ...denied,
    inventory: { view: true, create: true, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  mockProducts.mockResolvedValue([]);
  const screen = await renderScreen();
  expect(JSON.stringify(screen.toJSON())).toContain('+ Produto');
});
