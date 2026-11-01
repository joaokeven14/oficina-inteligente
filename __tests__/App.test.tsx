/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

test('renders correctly', async () => {
  let screen: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    screen = ReactTestRenderer.create(<App />);
  });

  const output = JSON.stringify(screen!.toJSON());
  expect(output).toContain('Oficina Inteligente');
  expect(output).toContain('Supabase ainda não configurado');
});
