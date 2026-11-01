import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import ServiceOrderAuthorizationPanel from './ServiceOrderAuthorizationPanel';
import { createServiceOrderAuthorization, listServiceOrderAuthorizations } from '../services/workshopData';

jest.mock('../services/workshopData', () => ({
  createServiceOrderAuthorization: jest.fn(),
  listServiceOrderAuthorizations: jest.fn(),
}));

const props = { workshopId: 'w1', orderId: 'o1', customerId: 'c1', customerName: 'Ana Silva', orderNumber: 12, amount: 120.5, canSign: true };

test('records an immutable authorization with a normalized drawn signature', async () => {
  jest.mocked(listServiceOrderAuthorizations).mockResolvedValue([]);
  jest.mocked(createServiceOrderAuthorization).mockResolvedValue(undefined);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<ServiceOrderAuthorizationPanel {...props} />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  const canvas = screen!.root.findByProps({ accessibilityLabel: 'Área para desenhar a assinatura do cliente' });
  await ReactTestRenderer.act(async () => { canvas.props.onLayout({ nativeEvent: { layout: { width: 300, height: 150 } } }); });
  await ReactTestRenderer.act(async () => {
    canvas.props.onResponderGrant({ nativeEvent: { locationX: 30, locationY: 75 } });
    canvas.props.onResponderMove({ nativeEvent: { locationX: 270, locationY: 60 } });
  });
  const label = screen!.root.findAllByType(Text).find((node) => node.props.children === 'Registrar autorização');
  expect(label).toBeDefined();
  const button = screen!.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((text) => text.props.children === 'Registrar autorização'));
  expect(button).toBeDefined();
  await ReactTestRenderer.act(async () => { button!.props.onPress(); await new Promise<void>((resolve) => setImmediate(resolve)); });
  expect(createServiceOrderAuthorization).toHaveBeenCalledWith('w1', 'o1', 'c1', 'service', 'Ana Silva', expect.stringContaining('OS #12'), 120.5, [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.4 }]]);
});

test('allows read-only users to inspect the authorization history but not sign', async () => {
  jest.mocked(listServiceOrderAuthorizations).mockResolvedValue([]);
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<ServiceOrderAuthorizationPanel {...props} canSign={false} />);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Nenhuma autorização registrada nesta OS');
  expect(output).not.toContain('Registrar autorização');
});
