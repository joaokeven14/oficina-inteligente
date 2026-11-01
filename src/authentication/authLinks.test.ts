import { parseAuthCallback, passwordResetRedirect, withoutAuthTokens } from './authLinks';

test('web recovery returns to the published app and native recovery keeps its deep link', () => {
  expect(passwordResetRedirect('web', 'https://oficina.example')).toBe('https://oficina.example/');
  expect(passwordResetRedirect('android')).toBe('oficina-inteligente://reset-password');
});

test('recovery and invitation callbacks require both tokens and request password setup', () => {
  expect(parseAuthCallback('https://oficina.example/#access_token=access&refresh_token=refresh&type=recovery')).toEqual({ accessToken: 'access', refreshToken: 'refresh', passwordMode: 'recovery' });
  expect(parseAuthCallback('https://oficina.example/?access_token=access&refresh_token=refresh&type=invite')).toEqual({ accessToken: 'access', refreshToken: 'refresh', passwordMode: 'invite' });
  expect(parseAuthCallback('https://oficina.example/#access_token=access&type=invite')).toBeNull();
  expect(parseAuthCallback('invalid')).toBeNull();
});

test('auth tokens are removed without dropping unrelated application query values', () => {
  expect(withoutAuthTokens('https://oficina.example/?workshop=one#access_token=access&refresh_token=refresh&type=recovery')).toBe('/?workshop=one');
  expect(withoutAuthTokens('https://oficina.example/?access_token=access&refresh_token=refresh&type=invite&workshop=one')).toBe('/?workshop=one');
  expect(withoutAuthTokens('https://oficina.example/?workshop=one#help')).toBe('/?workshop=one#help');
});
