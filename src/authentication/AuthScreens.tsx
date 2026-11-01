import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { passwordResetRedirect } from './authLinks';
import type { PasswordSetupMode } from './authLinks';

type ScreenProps = { client: SupabaseClient };

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#10243a" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.brandIcon}><Text style={styles.brandLetters}>OI</Text></View>
            <Text style={styles.eyebrow}>GESTÃO PARA OFICINAS</Text>
            <Text style={styles.brandName}>Oficina Inteligente</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function SignInScreen({ client, notice = '' }: ScreenProps & { notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (notice) setMessage(notice); }, [notice]);

  const signIn = async () => {
    setMessage('');
    if (!email.trim() || !password) {
      setMessage('Informe seu e-mail e sua senha.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage('Não foi possível entrar. Confira os dados e tente novamente.');
    } catch {
      setMessage('Não foi possível conectar. Verifique sua internet e tente novamente.');
    } finally { setBusy(false); }
  };

  const recoverPassword = async () => {
    setMessage('');
    if (!email.trim()) {
      setMessage('Informe seu e-mail para receber as instruções de recuperação.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirect(Platform.OS, Platform.OS === 'web' ? window.location.origin : undefined),
      });
      setMessage(error
        ? 'Não foi possível enviar as instruções. Tente novamente mais tarde.'
        : 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.');
    } catch {
      setMessage('Não foi possível conectar. Tente novamente mais tarde.');
    } finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <Text style={styles.title}>Acesse sua conta</Text>
      <Text style={styles.description}>Entre com o usuário cadastrado pela administração da oficina.</Text>
      <Text style={styles.label}>E-mail</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="voce@oficina.com.br" placeholderTextColor="#93a0af" editable={!busy} />
      <Text style={styles.label}>Senha</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" secureTextEntry textContentType="password" placeholder="Sua senha" placeholderTextColor="#93a0af" editable={!busy} onSubmitEditing={() => { signIn(); }} />
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, busy && styles.buttonDisabled]} onPress={() => { signIn(); }}>
        <Text style={styles.primaryButtonText}>{busy ? 'Aguarde…' : 'Entrar'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.linkButton} onPress={() => { recoverPassword(); }}>
        <Text style={styles.linkText}>Esqueci minha senha</Text>
      </Pressable>
      <Text style={styles.noSignup}>O cadastro é feito pelo responsável da plataforma.</Text>
    </AuthFrame>
  );
}

export function PasswordRecoveryScreen({ client, onComplete, mode = 'recovery' }: ScreenProps & { onComplete: () => void; mode?: PasswordSetupMode }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const updatePassword = async () => {
    setMessage('');
    if (password.length < 8) {
      setMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('As senhas não correspondem.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setMessage('Não foi possível atualizar a senha. Solicite um novo link de recuperação.');
        return;
      }
      onComplete();
    } catch {
      setMessage('Não foi possível conectar. Solicite um novo link de recuperação.');
    } finally { setBusy(false); }
  };

  return (
    <AuthFrame>
      <Text style={styles.title}>{mode === 'invite' ? 'Crie sua senha de acesso' : 'Redefina sua senha'}</Text>
      <Text style={styles.description}>{mode === 'invite' ? 'Seu convite foi confirmado. Defina uma senha para acessar a oficina.' : 'Escolha uma nova senha para sua conta.'}</Text>
      <Text style={styles.label}>Nova senha</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="Pelo menos 8 caracteres" placeholderTextColor="#93a0af" editable={!busy} />
      <Text style={styles.label}>Confirme a senha</Text>
      <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry textContentType="newPassword" placeholder="Digite novamente" placeholderTextColor="#93a0af" editable={!busy} onSubmitEditing={() => { updatePassword(); }} />
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, busy && styles.buttonDisabled]} onPress={() => { updatePassword(); }}>
        <Text style={styles.primaryButtonText}>{busy ? 'Aguarde…' : mode === 'invite' ? 'Salvar senha e entrar' : 'Salvar nova senha'}</Text>
      </Pressable>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#10243a' },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 470, alignSelf: 'center', padding: 27, borderRadius: 20, backgroundColor: '#fff' },
  brandIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#e97824', alignItems: 'center', justifyContent: 'center' },
  brandLetters: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: -1 },
  eyebrow: { marginTop: 21, color: '#c56019', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  brandName: { marginTop: 5, marginBottom: 27, color: '#10243a', fontSize: 22, fontWeight: '800' },
  title: { color: '#10243a', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  description: { marginTop: 7, marginBottom: 22, color: '#64758a', fontSize: 14, lineHeight: 21 },
  label: { marginBottom: 7, color: '#27394e', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 48, marginBottom: 16, paddingHorizontal: 13, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 10, color: '#1b2c40', backgroundColor: '#fff', fontSize: 14 },
  message: { marginBottom: 14, color: '#a23d33', fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#10243a' },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  linkButton: { alignSelf: 'center', padding: 13 },
  linkText: { color: '#315a80', fontSize: 13, fontWeight: '700' },
  noSignup: { marginTop: 8, color: '#7a899a', textAlign: 'center', fontSize: 11, lineHeight: 17 },
});

