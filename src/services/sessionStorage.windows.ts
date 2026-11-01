import { TurboModuleRegistry } from 'react-native';

interface WindowsCredentialStorage {
  getConstants?(): {};
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function getCredentialStorage(): WindowsCredentialStorage {
  const storage = TurboModuleRegistry.get<WindowsCredentialStorage>('SecureCredentialStorage');
  if (!storage) {
    throw new Error('O armazenamento seguro do Windows não está disponível. Atualize o aplicativo.');
  }
  return storage;
}

export const supabaseSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return getCredentialStorage().getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    await getCredentialStorage().setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    await getCredentialStorage().removeItem(key);
  },
};
