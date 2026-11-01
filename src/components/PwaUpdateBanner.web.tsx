import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function PwaUpdateBanner({
  visible,
  updating,
  error,
  onUpdate,
  onDismiss,
}: {
  visible: boolean;
  updating: boolean;
  error: string;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return <View accessibilityRole="alert" style={styles.banner}>
    <Text style={styles.message}>Há uma atualização disponível. A sessão salva no navegador e os registros da oficina serão preservados.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={updating} style={[styles.updateButton, updating && styles.disabled]} onPress={onUpdate}>
        <Text style={styles.updateText}>{updating ? 'Atualizando…' : 'Atualizar agora'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={updating} style={styles.laterButton} onPress={onDismiss}>
        <Text style={styles.laterText}>Depois</Text>
      </Pressable>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff5ed', borderBottomWidth: 1, borderBottomColor: '#f4d9c4' },
  message: { color: '#10243a', fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  updateButton: { minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8, backgroundColor: '#10243a' },
  updateText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  laterButton: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
  laterText: { color: '#315a80', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  error: { color: '#a23d33', fontSize: 12 },
});
