import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PwaUpdateBanner from './PwaUpdateBanner.web';

test('explains that an available update preserves the session and waits for the user', async () => {
  const onUpdate = jest.fn();
  const onDismiss = jest.fn();
  let screen!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    screen = ReactTestRenderer.create(<PwaUpdateBanner visible updating={false} error="" onUpdate={onUpdate} onDismiss={onDismiss} />);
  });

  expect(JSON.stringify(screen!.toJSON())).toContain('A sessão salva no navegador');
  const buttons = screen!.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
  expect(buttons).toHaveLength(2);
  await ReactTestRenderer.act(async () => { buttons[0].props.onPress(); });
  expect(onUpdate).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => { buttons[1].props.onPress(); });
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('does not show an update notice when there is no waiting release', () => {
  let screen!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    screen = ReactTestRenderer.create(<PwaUpdateBanner visible={false} updating={false} error="" onUpdate={jest.fn()} onDismiss={jest.fn()} />);
  });
  expect(screen.toJSON()).toBeNull();
});
