// Non-native fallback used by type tooling and test environments.
const sessionValues = new Map<string, string>();

export const supabaseSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return sessionValues.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    sessionValues.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    sessionValues.delete(key);
  },
};
