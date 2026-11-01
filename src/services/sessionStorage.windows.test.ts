const mockVault = new Map<string, string>();
const mockNativeStorage = {
  getItem: jest.fn(async (key: string) => mockVault.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockVault.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockVault.delete(key); }),
};

jest.mock('react-native', () => ({
  TurboModuleRegistry: {
    get: jest.fn(() => mockNativeStorage),
  },
}));

import { supabaseSessionStorage } from './sessionStorage.windows';

beforeEach(() => {
  mockVault.clear();
  jest.clearAllMocks();
});

test('persists the Supabase session in the Windows credential vault adapter', async () => {
  const key = 'sb-edoobhumolgahzipevip-auth-token';
  const session = JSON.stringify({ access_token: 'access', refresh_token: 'refresh' });

  await supabaseSessionStorage.setItem(key, session);

  expect(await supabaseSessionStorage.getItem(key)).toBe(session);
  expect(mockNativeStorage.setItem).toHaveBeenCalledWith(key, session);
});

test('deletes the persisted session when Supabase signs out', async () => {
  const key = 'sb-edoobhumolgahzipevip-auth-token';
  mockVault.set(key, 'saved-session');

  await supabaseSessionStorage.removeItem(key);

  expect(await supabaseSessionStorage.getItem(key)).toBeNull();
  expect(mockNativeStorage.removeItem).toHaveBeenCalledWith(key);
});
