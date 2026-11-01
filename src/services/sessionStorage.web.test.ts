import { supabaseSessionStorage } from './sessionStorage.web';

const values = new Map<string, string>();
const localStorageMock = {
  getItem: jest.fn((key: string) => values.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
  removeItem: jest.fn((key: string) => { values.delete(key); }),
} as unknown as Storage;

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
});

test('keeps the Supabase session in browser storage so it can be restored after an app reload', async () => {
  const key = 'sb-edoobhumolgahzipevip-auth-token';
  const session = JSON.stringify({ access_token: 'access', refresh_token: 'refresh' });

  await supabaseSessionStorage.setItem(key, session);

  expect(await supabaseSessionStorage.getItem(key)).toBe(session);
  expect(localStorageMock.setItem).toHaveBeenCalledWith(key, session);
});

test('removes the saved session only when Supabase signs out', async () => {
  const key = 'sb-edoobhumolgahzipevip-auth-token';
  values.set(key, 'saved-session');

  await supabaseSessionStorage.removeItem(key);

  expect(await supabaseSessionStorage.getItem(key)).toBeNull();
});
