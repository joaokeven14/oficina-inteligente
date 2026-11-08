import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { addServiceOrderTechnicalNote, listServiceOrderInspection, listServiceOrderTechnicalNotes, saveServiceOrderInspectionItem } from '../services/workshopData';
import type { ServiceOrderInspectionItem, ServiceOrderTechnicalNote } from '../types/workshop';

const categories: Array<ServiceOrderTechnicalNote['category']> = ['Combustível','Motor','Bateria','Sistema elétrico','Arrefecimento','Freios','Suspensão','Transmissão','Pneus','Manutenção preventiva'];
const noteTemplates: Partial<Record<ServiceOrderTechnicalNote['category'], string>> = {
  Combustível: 'Longo período parado pode causar obstrução de bicos, filtro e bomba de combustível.',
  Bateria: 'Longo período parado pode descarregar a bateria e comprometer sua capacidade de recarga.',
  Motor: 'Verificar nível e condições do óleo antes de utilizar o veículo.',
  Arrefecimento: 'Verificar nível do líquido e possíveis vazamentos.',
  Freios: 'Verificar possíveis travamentos após longo período parado.',
  Pneus: 'Verificar calibragem, deformações e ressecamento.',
};
const conditions: Array<{ value: ServiceOrderInspectionItem['condition']; label: string }> = [
  { value: 'good', label: 'Bom' }, { value: 'attention', label: 'Atenção' }, { value: 'critical', label: 'Crítico' }, { value: 'not_inspected', label: 'Não inspecionado' },
];

export default function ServiceOrderInspectionPanel({ workshopId, orderId, canUpdate }: { workshopId: string; orderId: string; canUpdate: boolean }) {
  const [items, setItems] = useState<ServiceOrderInspectionItem[]>([]);
  const [notes, setNotes] = useState<ServiceOrderTechnicalNote[]>([]);
  const [kind, setKind] = useState<'checklist' | 'inspection'>('checklist');
  const [category, setCategory] = useState<ServiceOrderTechnicalNote['category']>('Motor');
  const [body, setBody] = useState('');
  const [recommendation, setRecommendation] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [inspectionRows, noteRows] = await Promise.all([listServiceOrderInspection(workshopId, orderId), listServiceOrderTechnicalNotes(workshopId, orderId)]);
      setItems(inspectionRows); setNotes(noteRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a inspeção.'); }
    finally { setLoading(false); }
  }, [workshopId, orderId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['service_order_inspection_items', 'service_order_technical_notes'], refresh);

  const save = async (item: ServiceOrderInspectionItem) => {
    setBusyId(item.id); setError('');
    try { await saveServiceOrderInspectionItem(workshopId, item); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a inspeção.'); }
    finally { setBusyId(''); }
  };
  const patch = (item: ServiceOrderInspectionItem, changes: Partial<ServiceOrderInspectionItem>) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...changes } : row));
  const addNote = async (text = body) => {
    setError(''); setBusyId('note');
    try { await addServiceOrderTechnicalNote(workshopId, orderId, category, text, recommendation); setBody(''); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a nota técnica.'); }
    finally { setBusyId(''); }
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  const current = items.filter((item) => item.item_kind === kind);
  const checked = current.filter((item) => item.condition !== 'not_inspected').length;
  return <View style={styles.wrapper}>
    <Text style={styles.sectionTitle}>Checklist de entrada e laudo</Text>
    <Text style={styles.helper}>Itens não inspecionados permanecem explicitamente pendentes; nenhuma condição é aprovada automaticamente.</Text>
    <View style={styles.tabs}>{(['checklist','inspection'] as const).map((value) => <Pressable key={value} style={[styles.tab, kind === value && styles.tabActive]} onPress={() => setKind(value)}><Text style={[styles.tabText, kind === value && styles.tabTextActive]}>{value === 'checklist' ? 'Entrada do veículo' : 'Inspeção técnica'}</Text></Pressable>)}</View>
    <Text style={styles.progress}>{checked} de {current.length} itens avaliados</Text>
    {current.map((item) => <View key={item.id} style={styles.itemCard}>
      <Text style={styles.itemLabel}>{item.item_label}</Text>
      <Text style={styles.progress}>Situação: {conditions.find((option) => option.value === item.condition)?.label}</Text>
      <View style={styles.conditions}>{conditions.map((option) => <Pressable key={option.value} disabled={!canUpdate || busyId === item.id} accessibilityRole="radio" accessibilityState={{ selected: item.condition === option.value }} style={[styles.condition, item.condition === option.value && styles.conditionActive]} onPress={() => patch(item, { condition: option.value })}><Text style={[styles.conditionText, item.condition === option.value && styles.conditionTextActive]}>{option.label}</Text></Pressable>)}</View>
      <FormField label="Observações" value={item.observations} onChangeText={(value) => patch(item, { observations: value })} multiline />
      <FormField label="Recomendação" value={item.recommendation} onChangeText={(value) => patch(item, { recommendation: value })} multiline />
      {canUpdate ? <Pressable disabled={busyId === item.id} style={styles.saveButton} onPress={() => save(item)}><Text style={styles.saveText}>{busyId === item.id ? 'Salvando…' : 'Salvar avaliação'}</Text></Pressable> : null}
    </View>)}
    <Text style={styles.sectionTitle}>Notas técnicas</Text>
    <Text style={styles.helper}>Registre separadamente uma recomendação preventiva ou um diagnóstico confirmado.</Text>
    <View style={styles.conditions}>{categories.map((value) => <Pressable key={value} style={[styles.condition, category === value && styles.conditionActive]} onPress={() => setCategory(value)}><Text style={[styles.conditionText, category === value && styles.conditionTextActive]}>{value}</Text></Pressable>)}</View>
    <View style={styles.conditions}>{[true,false].map((value) => <Pressable key={String(value)} style={[styles.condition, recommendation === value && styles.conditionActive]} onPress={() => setRecommendation(value)}><Text style={[styles.conditionText, recommendation === value && styles.conditionTextActive]}>{value ? 'Recomendação preventiva' : 'Diagnóstico confirmado'}</Text></Pressable>)}</View>
    {noteTemplates[category] ? <Pressable style={styles.templateButton} disabled={!canUpdate || busyId === 'note'} onPress={() => addNote(noteTemplates[category])}><Text style={styles.templateText}>Adicionar nota padrão: “{noteTemplates[category]}”</Text></Pressable> : null}
    <FormField label="Nota técnica" value={body} onChangeText={setBody} multiline placeholder="Escreva uma nota objetiva e profissional" />
    {canUpdate ? <Pressable disabled={busyId === 'note' || body.trim().length < 5} style={styles.saveButton} onPress={() => addNote()}><Text style={styles.saveText}>Salvar nota</Text></Pressable> : null}
    {notes.map((note) => <View key={note.id} style={styles.noteCard}><Text style={styles.itemLabel}>{note.category} · {note.is_recommendation ? 'Recomendação preventiva' : 'Diagnóstico confirmado'}</Text><Text style={styles.helper}>{note.body}</Text><Text style={styles.noteDate}>{new Date(note.created_at).toLocaleString('pt-BR')}</Text></View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ wrapper: { marginTop: 16 }, loading: { padding: 20 }, sectionTitle: { marginTop: 18, marginBottom: 6, color: '#10243a', fontSize: 16, fontWeight: '800' }, helper: { color: '#718197', fontSize: 11, lineHeight: 17 }, progress: { marginVertical: 8, color: '#52657a', fontSize: 11, fontWeight: '700' }, tabs: { flexDirection: 'row', gap: 7, marginTop: 10 }, tab: { padding: 9, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8 }, tabActive: { backgroundColor: '#10243a', borderColor: '#10243a' }, tabText: { color: '#53657b', fontSize: 11 }, tabTextActive: { color: '#fff', fontWeight: '700' }, itemCard: { marginTop: 9, padding: 12, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 10, backgroundColor: '#fff' }, itemLabel: { color: '#26394e', fontSize: 12, fontWeight: '800' }, conditions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 }, condition: { paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8 }, conditionActive: { backgroundColor: '#10243a', borderColor: '#10243a' }, conditionText: { color: '#53657b', fontSize: 10 }, conditionTextActive: { color: '#fff', fontWeight: '700' }, saveButton: { minHeight: 38, marginTop: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e97824' }, saveText: { color: '#fff', fontSize: 11, fontWeight: '800' }, templateButton: { padding: 10, marginTop: 8, borderRadius: 8, backgroundColor: '#fff5ed' }, templateText: { color: '#8d4c19', fontSize: 11, lineHeight: 16 }, noteCard: { padding: 11, marginTop: 8, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 9, backgroundColor: '#fff' }, noteDate: { marginTop: 5, color: '#8b98a7', fontSize: 9 }, error: { marginTop: 8, color: '#a23d33', fontSize: 12 } });
