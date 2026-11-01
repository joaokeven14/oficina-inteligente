import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import CustomersScreen from './CustomersScreen';
import { getWorkshopPermissions, listCustomers } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  archiveCustomer: jest.fn(),
  getWorkshopPermissions: jest.fn(),
  listCustomers: jest.fn(),
  saveCustomer: jest.fn(),
}));

const mockPermissions = jest.mocked(getWorkshopPermissions);
const mockListCustomers = jest.mocked(listCustomers);

const customer = {
  id: 'customer-1', workshop_id: 'workshop-1', full_name: 'Cliente Exemplo',
  document: null, phone: null, whatsapp: null, email: null, address: null,
  city: null, state: null, notes: null, created_at: '', updated_at: '',
};

async function renderScreen() {
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<CustomersScreen workshopId="workshop-1" />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  return screen!;
}

beforeEach(() => {
  mockPermissions.mockResolvedValue({
    clients: { view: true, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false },
    inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  mockListCustomers.mockResolvedValue([customer]);
});

test('shows real customer records and hides write actions from a read-only employee', async () => {
  const screen = await renderScreen();
  const output = JSON.stringify(screen.toJSON());
  expect(output).toContain('Cliente Exemplo');
  expect(output).not.toContain('+ Novo');
  expect(output).not.toContain('Arquivar');
});

test('opens the customer form when create permission is granted', async () => {
  mockPermissions.mockResolvedValue({
    clients: { view: true, create: true, update: true, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false },
    inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  mockListCustomers.mockResolvedValue([]);
  const screen = await renderScreen();
  const addButton = screen.root.findAllByProps({ accessibilityRole: 'button' })[0];
  expect(addButton).toBeDefined();
  await ReactTestRenderer.act(async () => { addButton.props.onPress(); });
  expect(JSON.stringify(screen.toJSON())).toContain('Novo cliente');
});
