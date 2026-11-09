import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ServiceOrderInspectionPanel from './ServiceOrderInspectionPanel';
import { listServiceOrderInspection, listServiceOrderTechnicalNotes } from '../services/workshopData';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({
  addServiceOrderTechnicalNote: jest.fn(), listServiceOrderInspection: jest.fn(), listServiceOrderTechnicalNotes: jest.fn(), saveServiceOrderInspectionItem: jest.fn(), subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined),
}));

test('keeps the entry checklist separate and distinguishes a recommendation from a confirmed diagnosis', async () => {
  jest.mocked(listServiceOrderInspection).mockResolvedValue([{ id: 'i1', workshop_id: 'w1', service_order_id: 'o1', item_kind: 'checklist', item_key: 'brakes', item_label: 'Freios', condition: 'not_inspected', observations: '', recommendation: '', updated_at: '' }]);
  jest.mocked(listServiceOrderTechnicalNotes).mockResolvedValue([{ id: 'n1', workshop_id: 'w1', service_order_id: 'o1', category: 'Bateria', body: 'Longo período parado pode descarregar a bateria.', is_recommendation: true, created_at: '2026-10-31T12:00:00Z' }]);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<ServiceOrderInspectionPanel workshopId="w1" orderId="o1" canUpdate />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('checklist de entrada fica em uma tela própria');
  expect(output).toContain('Freios');
  expect(output).toContain('Diagnóstico confirmado');
  expect(output).toContain('Recomendação preventiva');
  expect(output).toContain('Longo período parado pode descarregar a bateria.');
});
