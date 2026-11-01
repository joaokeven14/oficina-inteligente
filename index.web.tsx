/// <reference types="vite-plugin-pwa/client" />

import { useEffect, useState } from 'react';
import { AppRegistry, View } from 'react-native';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import InstallApp from './src/components/InstallApp.web';
import PwaUpdateBanner from './src/components/PwaUpdateBanner.web';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

function WebApp() {
  const [updateWorker, setUpdateWorker] = useState<UpdateServiceWorker | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    const applyUpdate = registerSW({ immediate: true, onNeedRefresh: () => setUpdateAvailable(true) });
    setUpdateWorker(() => applyUpdate);
  }, []);

  const updateNow = async () => {
    if (!updateWorker) return;
    setUpdating(true);
    setUpdateError('');
    try { await updateWorker(); }
    catch {
      setUpdating(false);
      setUpdateError('Não foi possível concluir a atualização. Verifique sua internet e tente novamente.');
    }
  };

  return <View style={{ flex: 1 }}>
    <InstallApp />
    <PwaUpdateBanner
      visible={updateAvailable}
      updating={updating}
      error={updateError}
      onUpdate={updateNow}
      onDismiss={() => { setUpdateAvailable(false); setUpdateError(''); }}
    />
    <View style={{ flex: 1 }}><App /></View>
  </View>;
}

AppRegistry.registerComponent('OficinaInteligente', () => WebApp);
AppRegistry.runApplication('OficinaInteligente', { rootTag: document.getElementById('root') });
