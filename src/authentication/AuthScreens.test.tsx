import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PasswordRecoveryScreen, SignInScreen } from './AuthScreens';

function makeClient() {
  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    },
  } as unknown as SupabaseClient;
}

async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function buttonAt(screen: ReactTestRenderer.ReactTestRenderer, index: number) {
  return screen.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[index];
}

test('sign in validates input and normalizes the email before calling Supabase Auth', async () => {
  const client = makeClient();
  let screen!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<SignInScreen client={client} />); });
  const emailInput = screen.root.findByProps({ placeholder: 'voce@oficina.com.br' });
  const passwordInput = screen.root.findByProps({ placeholder: 'Sua senha' });
  const press = () => buttonAt(screen, 0);

  await ReactTestRenderer.act(async () => { press().props.onPress(); });
  expect(JSON.stringify(screen.toJSON())).toContain('Informe seu e-mail e sua senha.');
  expect(client.auth.signInWithPassword).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { emailInput.props.onChangeText('  pessoa@oficina.com.br '); });
  await ReactTestRenderer.act(async () => { passwordInput.props.onChangeText('senha-segura'); });
  await ReactTestRenderer.act(async () => { press().props.onPress(); await settle(); });
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'pessoa@oficina.com.br', password: 'senha-segura' });
});

test('password recovery sends a generic recovery response for a normalized email', async () => {
  const client = makeClient();
  let screen!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<SignInScreen client={client} />); });
  const emailInput = screen.root.findByProps({ placeholder: 'voce@oficina.com.br' });
  const recovery = buttonAt(screen, 1);

  await ReactTestRenderer.act(async () => { recovery.props.onPress(); });
  expect(JSON.stringify(screen.toJSON())).toContain('Informe seu e-mail para receber');
  await ReactTestRenderer.act(async () => { emailInput.props.onChangeText(' pessoa@oficina.com.br '); });
  await ReactTestRenderer.act(async () => { buttonAt(screen, 1).props.onPress(); await settle(); });
  expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('pessoa@oficina.com.br', { redirectTo: 'oficina-inteligente://reset-password' });
  expect(JSON.stringify(screen.toJSON())).toContain('Se o e-mail estiver cadastrado');
});

test('password recovery requires a matching password of at least eight characters', async () => {
  const client = makeClient();
  const onComplete = jest.fn();
  let screen!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { screen = ReactTestRenderer.create(<PasswordRecoveryScreen client={client} onComplete={onComplete} />); });
  const password = screen.root.findByProps({ placeholder: 'Pelo menos 8 caracteres' });
  const confirm = screen.root.findByProps({ placeholder: 'Digite novamente' });

  await ReactTestRenderer.act(async () => { password.props.onChangeText('curta'); });
  await ReactTestRenderer.act(async () => { confirm.props.onChangeText('curta'); });
  await ReactTestRenderer.act(async () => { buttonAt(screen, 0).props.onPress(); });
  expect(JSON.stringify(screen.toJSON())).toContain('pelo menos 8 caracteres');
  expect(client.auth.updateUser).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { password.props.onChangeText('senha-segura'); });
  await ReactTestRenderer.act(async () => { confirm.props.onChangeText('outra-senha'); });
  await ReactTestRenderer.act(async () => { buttonAt(screen, 0).props.onPress(); });
  expect(JSON.stringify(screen.toJSON())).toContain('As senhas não correspondem.');
  expect(client.auth.updateUser).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { confirm.props.onChangeText('senha-segura'); });
  await ReactTestRenderer.act(async () => { buttonAt(screen, 0).props.onPress(); await settle(); });
  expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'senha-segura' });
  expect(onComplete).toHaveBeenCalledTimes(1);
});
