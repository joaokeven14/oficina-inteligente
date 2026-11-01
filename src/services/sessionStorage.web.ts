export const supabaseSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage.removeItem(key);
  },
};
