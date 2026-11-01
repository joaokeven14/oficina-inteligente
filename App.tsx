import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthGate from './src/authentication/AuthGate';
import PrivacyPolicyScreen from './src/pages/PrivacyPolicyScreen';
import SetupScreen from './src/pages/SetupScreen';
import { isSupabaseConfigured } from './src/config/environment';

export default function App() {
  const pagePath = Platform.OS === 'web' ? window.location.pathname.replace(/\/+$/, '') : '';
  if (Platform.OS === 'web' && pagePath.endsWith('/politica-de-privacidade.html')) return <PrivacyPolicyScreen />;
  const initialTab = Platform.OS === 'web' && (pagePath === '/admin' || pagePath.endsWith('/admin')) ? 'Admin' : 'Início';
  return (
    <SafeAreaProvider>
      {isSupabaseConfigured() ? <AuthGate initialTab={initialTab} /> : <SetupScreen />}
    </SafeAreaProvider>
  );
}
