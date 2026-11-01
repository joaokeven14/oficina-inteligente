import * as Keychain from 'react-native-keychain';

const SERVICE_PREFIX = 'com.oficinainteligente.supabase';

function serviceFor(key: string): string {
  return `${SERVICE_PREFIX}.${key}`;
}

export const supabaseSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const credential = await Keychain.getGenericPassword({ service: serviceFor(key) });
    return credential ? credential.password : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const saved = await Keychain.setGenericPassword('session', value, {
      service: serviceFor(key),
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (!saved) throw new Error('Não foi possível guardar a sessão no armazenamento seguro.');
  },

  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: serviceFor(key) });
  },
};
