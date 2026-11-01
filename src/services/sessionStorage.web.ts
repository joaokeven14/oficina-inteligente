export const supabaseSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try { return globalThis.localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    try { globalThis.localStorage.setItem(key, value); } catch { /* Browser privacy settings may disable storage. */ }
  },
  async removeItem(key: string): Promise<void> {
    try { globalThis.localStorage.removeItem(key); } catch { /* The auth client will still clear the in-memory session. */ }
  },
};
