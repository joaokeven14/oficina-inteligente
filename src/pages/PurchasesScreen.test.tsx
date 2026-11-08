import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PurchasesScreen from './PurchasesScreen';
import { getWorkshopPermissions, listInventoryProducts, listPayablePaymentReversals, listPayables, listPurchases, listSuppliers } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  createPurchase: jest.fn(), getWorkshopPermissions: jest.fn(), listInventoryProducts: jest.fn(),
  listPayablePaymentReversals: jest.fn(), listPayables: jest.fn(), listPurchases: jest.fn(), listSuppliers: jest.fn(), markPayablePaid: jest.fn(), reversePayablePayment: jest.fn(),
  receivePurchase: jest.fn(), saveSupplier: jest.fn(),
}));

const permissions = jest.mocked(getWorkshopPermissions);
const suppliers = jest.mocked(listSuppliers);
const products = jest.mocked(listInventoryProducts);
const purchases = jest.mocked(listPurchases);
const payables = jest.mocked(listPayables);

test('loads suppliers, pending purchases and payables for the selected workshop', async () => {
  permissions.mockResolvedValue({
    clients: { view: false, create: false, update: false, delete: false },
    vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false },
    inventory: { view: true, create: true, update: true, delete: false },
    purchases: { view: true, create: true, update: true, delete: false },
    finance: { view: true, create: true, update: true, delete: false },
    estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false },
    employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  suppliers.mockResolvedValue([{ id: 's1', workshop_id: 'w1', name: 'Auto Peças Central', cnpj: null, phone: null, email: null, address: null, contact_name: null, notes: null, archived_at: null, created_at: '' }]);
  products.mockResolvedValue([{ id: 'p1', workshop_id: 'w1', name: 'Filtro', code: null, category: null, brand: null, quantity: 0, minimum_quantity: 0, cost_price: 20, sale_price: 30, location: null, notes: null, created_at: '', updated_at: '' }]);
  purchases.mockResolvedValue([{ id: 'o1', workshop_id: 'w1', supplier_id: 's1', status: 'ordered', payment_method: null, due_date: null, notes: null, total_amount: 0, received_at: null, created_at: '', suppliers: { name: 'Auto Peças Central' } }]);
  payables.mockResolvedValue([{ id: 'a1', workshop_id: 'w1', supplier_id: 's1', purchase_id: 'o1', description: 'Compra', amount: 40, due_date: '2026-11-15', status: 'pending', paid_at: null, payment_method: null, created_at: '', suppliers: { name: 'Auto Peças Central' } }]);
  jest.mocked(listPayablePaymentReversals).mockResolvedValue([]);

  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<PurchasesScreen workshopId="w1" />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Auto Peças Central');
  expect(output).toContain('Recebimentos pendentes');
  expect(output).toContain('Contas a pagar');
  expect(listPayables).toHaveBeenCalledWith('w1');
});

test('offers an audited payment reversal for paid purchase payables', async () => {
  permissions.mockResolvedValue({
    clients: { view: false, create: false, update: false, delete: false }, vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false }, inventory: { view: true, create: false, update: false, delete: false },
    purchases: { view: true, create: false, update: false, delete: false },
    finance: { view: true, create: false, update: true, delete: false }, estimates: { view: false, create: false, update: false, delete: false },
    dashboard: { view: false, create: false, update: false, delete: false }, employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  suppliers.mockResolvedValue([]); products.mockResolvedValue([]); purchases.mockResolvedValue([]);
  payables.mockResolvedValue([{ id: 'a2', workshop_id: 'w1', supplier_id: 's1', purchase_id: 'o1', description: 'Compra paga', amount: 40, due_date: null, status: 'paid', paid_at: '2026-10-31T12:00:00Z', payment_method: 'pix', created_at: '' }]);
  jest.mocked(listPayablePaymentReversals).mockResolvedValue([]);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<PurchasesScreen workshopId="w1" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  await ReactTestRenderer.act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Estornar pagamento a2' }).props.onPress(); });
  expect(JSON.stringify(screen!.toJSON())).toContain('Estornar pagamento ao fornecedor');
  expect(JSON.stringify(screen!.toJSON())).toContain('Motivo do estorno');
});
