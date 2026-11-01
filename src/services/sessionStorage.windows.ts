// Windows does not yet have a validated secure credential-vault adapter here.
// Keep the session in memory so refresh tokens are never written to disk.
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
