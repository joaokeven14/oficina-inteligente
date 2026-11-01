import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthGate from './src/authentication/AuthGate';
import SetupScreen from './src/pages/SetupScreen';
import { isSupabaseConfigured } from './src/config/environment';

export default function App() {
  const initialTab = Platform.OS === 'web' && window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'Admin' : 'Início';
  return (
    <SafeAreaProvider>
      {isSupabaseConfigured() ? <AuthGate initialTab={initialTab} /> : <SetupScreen />}
    </SafeAreaProvider>
  );
}
