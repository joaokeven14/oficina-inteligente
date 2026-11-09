import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import WorkshopSettingsScreen from './WorkshopSettingsScreen';
import { getWorkshopSettings } from '../services/workshopData';

jest.mock('../hooks/useWorkshopLiveRefresh', () => ({ useWorkshopLiveRefresh: jest.fn() }));
jest.mock('../services/workshopData', () => ({ getWorkshopSettings: jest.fn(), saveWorkshopSettings: jest.fn(), subscribeWorkshopLiveUpdates: jest.fn(() => () => undefined) }));

test('shows saved workshop identity and contact settings', async () => {
  jest.mocked(getWorkshopSettings).mockResolvedValue({ id: 'w1', name: 'Oficina Central', logo_path: null, logo_url: null, cnpj: '12345678000199', phone: '(65) 3333-0000', whatsapp: '65999990000', email: 'contato@oficina.test', address: 'Rua Central, 10', city: 'Cuiabá', state: 'MT', responsible_name: 'Ana', opening_hours: 'Segunda a sexta' });
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<WorkshopSettingsScreen workshopId="w1" isOwner />); await new Promise<void>((resolve) => setImmediate(resolve)); });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Oficina Central');
  expect(output).toContain('CNPJ');
  expect(output).toContain('Contato');
  expect(output).toContain('Salvar configurações');
});
