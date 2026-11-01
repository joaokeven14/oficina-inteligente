import type { KeyboardTypeOptions } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  required?: boolean;
  editable?: boolean;
};

export default function FormField({ label, value, onChangeText, placeholder, keyboardType, multiline, required, editable = true }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder ?? label}
        placeholderTextColor="#93a0af"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 13 },
  label: { marginBottom: 6, color: '#33465b', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 9, color: '#1b2c40', backgroundColor: '#fff', fontSize: 14 },
  multiline: { minHeight: 84, paddingTop: 10 },
});
