import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../services/supabase';
import HomeScreen from '../pages/HomeScreen';
import { PasswordRecoveryScreen, SignInScreen } from './AuthScreens';
import { parseAuthCallback, withoutAuthTokens } from './authLinks';
import type { PasswordSetupMode } from './authLinks';

export default function AuthGate({ initialTab = 'Início' }: { initialTab?: 'Início' | 'Admin' }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordMode, setPasswordMode] = useState<PasswordSetupMode | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let mounted = true;
    const applyAuthUrl = async (value: string) => {
      const authUrl = parseAuthCallback(value);
      if (!authUrl) return false;
      setLoading(true);
      const { data, error } = await client.auth.setSession({
        access_token: authUrl.accessToken,
        refresh_token: authUrl.refreshToken,
      });
      if (!mounted) return true;
      if (Platform.OS === 'web') window.history.replaceState(window.history.state, '', withoutAuthTokens(value));
      setSession(error ? null : data.session);
      setPasswordMode(error ? null : authUrl.passwordMode);
      setAuthError(error ? 'Este link não é mais válido. Solicite um novo convite ou a recuperação de senha.' : '');
      setLoading(false);
      return true;
    };

    const initialize = async () => {
      const initialUrl = await Linking.getInitialURL().catch(() => null);
      if (initialUrl && await applyAuthUrl(initialUrl)) return;
      const { data, error } = await client.auth.getSession();
      if (mounted) { setSession(error ? null : data.session); setLoading(false); }
    };
    initialize().catch(() => {
      if (mounted) {
        setSession(null);
        setPasswordMode(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordMode('recovery');
      if (event === 'SIGNED_OUT') setPasswordMode(null);
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      applyAuthUrl(url).catch(() => {
        if (mounted) { setPasswordMode(null); setLoading(false); setAuthError('Não foi possível confirmar o link. Solicite um novo e tente novamente.'); }
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [client]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#10243a" />
        <View style={styles.loading}><ActivityIndicator color="#e97824" size="large" /><Text style={styles.loadingText}>Verificando sessão…</Text></View>
      </SafeAreaView>
    );
  }

  if (passwordMode) {
    return <PasswordRecoveryScreen client={client} mode={passwordMode} onComplete={() => setPasswordMode(null)} />;
  }
  if (!session) return <SignInScreen client={client} notice={authError} />;
  return <HomeScreen initialTab={initialTab} onSignOut={() => { client.auth.signOut().catch(() => undefined); }} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#10243a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: '#d8e1eb', fontSize: 14 },
});

export type AuthClient = SupabaseClient;
