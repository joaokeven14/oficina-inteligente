import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar, StyleSheet, Text, View } from 'react-native';

export default function SetupScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#10243a" />
      <View style={styles.card}>
        <View style={styles.brandIcon}><Text style={styles.brandLetters}>OI</Text></View>
        <Text style={styles.eyebrow}>GESTÃO PARA OFICINAS</Text>
        <Text style={styles.title}>Oficina Inteligente</Text>
        <Text style={styles.description}>A base multiplataforma está pronta. Configure seu projeto Supabase para habilitar o login e carregar os dados reais da oficina.</Text>
        <View style={styles.status}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Supabase ainda não configurado</Text>
        </View>
        <Text style={styles.footer}>Nenhum indicador ou registro fictício é exibido.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#10243a' },
  card: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 28, borderRadius: 20, backgroundColor: '#fff' },
  brandIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e97824' },
  brandLetters: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: -1 },
  eyebrow: { marginTop: 27, color: '#c56019', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: 5, color: '#10243a', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  description: { marginTop: 13, color: '#617287', fontSize: 15, lineHeight: 23 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 23, paddingTop: 17, borderTopWidth: 1, borderTopColor: '#edf0f4' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e97824' },
  statusText: { color: '#68798d', fontSize: 13, fontWeight: '600' },
  footer: { marginTop: 19, color: '#8996a5', fontSize: 12 },
});
