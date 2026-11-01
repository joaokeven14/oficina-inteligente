import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import EstimatesScreen from './EstimatesScreen';
import { getWorkshopPermissions, listCustomers, listEstimates, listVehicles, reviewEstimate } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  convertEstimate: jest.fn(), createEstimate: jest.fn(), getWorkshopPermissions: jest.fn(), listCustomers: jest.fn(),
  listEstimates: jest.fn(), listVehicles: jest.fn(), reviewEstimate: jest.fn(),
}));
const mockEstimates = jest.mocked(listEstimates);
const mockCustomers = jest.mocked(listCustomers);
const mockVehicles = jest.mocked(listVehicles);
const mockPermissions = jest.mocked(getWorkshopPermissions);
const mockReview = jest.mocked(reviewEstimate);

test('shows an estimate and records an approval through the review service', async () => {
  mockEstimates.mockResolvedValue([{ id: 'e1', workshop_id: 'w1', estimate_number: 17, customer_id: 'c1', vehicle_id: 'v1', status: 'pending', valid_until: '2027-01-31', complaint: 'Revisão preventiva', notes: '', items_subtotal: 200, discount: 10, total_amount: 190, approved_at: null, converted_order_id: null, created_at: '', customers: { full_name: 'Ana Souza' }, vehicles: { make: 'Ford', model: 'Ka', plate: 'ABC1D23' } }]);
  mockCustomers.mockResolvedValue([]); mockVehicles.mockResolvedValue([]);
  mockPermissions.mockResolvedValue({
    clients: { view: false, create: false, update: false, delete: false }, vehicles: { view: false, create: false, update: false, delete: false },
    service_orders: { view: false, create: false, update: false, delete: false }, inventory: { view: false, create: false, update: false, delete: false },
    finance: { view: false, create: false, update: false, delete: false }, estimates: { view: true, create: false, update: true, delete: false }, dashboard: { view: false, create: false, update: false, delete: false }, employees: { view: false, create: false, update: false, delete: false }, reports: { view: false, create: false, update: false, delete: false }, settings: { view: false, create: false, update: false, delete: false },
  });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<EstimatesScreen workshopId="w1" />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(JSON.stringify(screen!.toJSON())).toContain('Revisão preventiva');
  expect(JSON.stringify(screen!.toJSON())).toContain('Aprovar');
  const approve = screen!.root.findAll((node) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((text) => String(text.props.children).includes('Aprovar')))[0];
  expect(approve).toBeDefined();
  await ReactTestRenderer.act(async () => { approve!.props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(mockReview).toHaveBeenCalledWith('w1', 'e1', 'approved');
});
