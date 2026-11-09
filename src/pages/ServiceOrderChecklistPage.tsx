import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import {
  createServiceOrderChecklistSignature,
  listServiceOrderChecklistSignatures,
  listServiceOrderInspection,
  saveServiceOrderInspectionItem,
} from '../services/workshopData';
import type { ServiceOrderChecklistDecision, ServiceOrderChecklistSignature, ServiceOrderInspectionItem, SignaturePoint } from '../types/workshop';

const conditions: Array<{ value: ServiceOrderInspectionItem['condition']; label: string }> = [
  { value: 'good', label: 'Bom' },
  { value: 'attention', label: 'Atenção' },
  { value: 'critical', label: 'Crítico' },
  { value: 'not_inspected', label: 'Não inspecionado' },
];
const decisionLabel = (decision: ServiceOrderChecklistDecision) => decision === 'authorized' ? 'Cliente autorizou' : 'Cliente não autorizou';
const defaultStatement = (decision: ServiceOrderChecklistDecision, orderNumber: number) => decision === 'authorized'
  ? `Declaro que conferi o checklist de entrada da OS #${orderNumber} e autorizo a execução dos serviços explicados pela oficina.`
  : `Declaro que conferi o checklist de entrada da OS #${orderNumber} e não autorizo a execução dos serviços neste momento.`;

function makeSignatureLines(strokes: SignaturePoint[][], width: number, height: number) {
  return strokes.flatMap((stroke, strokeIndex) => stroke.slice(1).map((point, index) => {
    const previous = stroke[index];
    const x1 = previous.x * width; const y1 = previous.y * height;
    const x2 = point.x * width; const y2 = point.y * height;
    const length = Math.hypot(x2 - x1, y2 - y1);
    return { key: `${strokeIndex}-${index}`, left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1.5, length, angle: Math.atan2(y2 - y1, x2 - x1) };
  }));
}

export default function ServiceOrderChecklistPage({
  workshopId, orderId, customerId, customerName, orderNumber, canSign, onBack,
}: {
  workshopId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  orderNumber: number;
  canSign: boolean;
  onBack: () => void;
}) {
  const [items, setItems] = useState<ServiceOrderInspectionItem[]>([]);
  const [history, setHistory] = useState<ServiceOrderChecklistSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<ServiceOrderChecklistDecision | null>(null);
  const [signerName, setSignerName] = useState(customerName);
  const [statement, setStatement] = useState('');
  const [signatureStrokes, setSignatureStrokes] = useState<SignaturePoint[][]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [inspectionRows, signatureRows] = await Promise.all([
        listServiceOrderInspection(workshopId, orderId),
        listServiceOrderChecklistSignatures(workshopId, orderId),
      ]);
      setItems(inspectionRows.filter((item) => item.item_kind === 'checklist'));
      setHistory(signatureRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o checklist.');
    } finally { setLoading(false); }
  }, [workshopId, orderId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['service_order_inspection_items', 'service_order_checklist_signatures'], refresh);

  const lines = useMemo(() => makeSignatureLines(signatureStrokes, canvasSize.width, canvasSize.height), [signatureStrokes, canvasSize]);
  const evaluatedCount = items.filter((item) => item.condition !== 'not_inspected').length;

  const recordPoint = (x: number, y: number, start: boolean) => {
    if (!canvasSize.width || !canvasSize.height) return;
    const point = { x: Math.min(1, Math.max(0, x / canvasSize.width)), y: Math.min(1, Math.max(0, y / canvasSize.height)) };
    if (start) setSignatureStrokes((current) => [...current, [point]]);
    else setSignatureStrokes((current) => {
      if (!current.length) return [[point]];
      const next = [...current];
      const last = [...next[next.length - 1]];
      const previous = last[last.length - 1];
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.0015) last.push(point);
      next[next.length - 1] = last;
      return next;
    });
  };

  const patchItem = (item: ServiceOrderInspectionItem, changes: Partial<ServiceOrderInspectionItem>) => {
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...changes } : row));
  };

  const saveAndSign = async () => {
    if (!decision) { setError('Marque se o cliente autorizou ou não os serviços.'); return; }
    if (!signatureStrokes.length) { setError('Peça ao cliente para assinar antes de registrar.'); return; }
    setBusy(true); setError('');
    try {
      for (const item of items) await saveServiceOrderInspectionItem(workshopId, item);
      const persistedItems = (await listServiceOrderInspection(workshopId, orderId)).filter((item) => item.item_kind === 'checklist');
      const snapshot = persistedItems.map(({ item_key, item_label, condition, observations, recommendation }) => ({ item_key, item_label, condition, observations, recommendation }));
      await createServiceOrderChecklistSignature(workshopId, orderId, customerId, decision, signerName, statement, snapshot, signatureStrokes);
      setItems(persistedItems);
      setDecision(null);
      setSignatureStrokes([]);
      setStatement('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar e assinar o checklist.');
    } finally { setBusy(false); }
  };

  return <View style={styles.page}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Checklist de entrada · OS #{orderNumber}</Text>
        <Text style={styles.subtitle}>{customerName ? `Cliente: ${customerName}` : 'Inspeção inicial do veículo'}</Text>
      </View>
      <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}><Text style={styles.backText}>Voltar à ordem</Text></Pressable>
    </View>
    {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.introCard}>
        <Text style={styles.sectionTitle}>Conferência de entrada</Text>
        <Text style={styles.helper}>Registre o estado observado no momento em que o veículo foi recebido. Itens não avaliados ficam marcados como pendentes.</Text>
        <Text style={styles.progress}>{evaluatedCount} de {items.length} itens avaliados · {items.length - evaluatedCount} pendente(s)</Text>
      </View>
      {items.map((item) => <View key={item.id} style={styles.itemCard}>
        <Text style={styles.itemTitle}>{item.item_label}</Text>
        <View style={styles.conditions}>{conditions.map((option) => <Pressable
          key={option.value}
          disabled={!canSign || busy}
          accessibilityRole="radio"
          accessibilityState={{ selected: item.condition === option.value }}
          style={[styles.condition, item.condition === option.value && styles.conditionActive, (!canSign || busy) && styles.disabled]}
          onPress={() => patchItem(item, { condition: option.value })}
        ><Text style={[styles.conditionText, item.condition === option.value && styles.conditionTextActive]}>{option.label}</Text></Pressable>)}</View>
        <FormField label="Observações" value={item.observations} onChangeText={(value) => patchItem(item, { observations: value })} editable={canSign && !busy} multiline placeholder="Descreva marcas, danos ou itens entregues" />
        <FormField label="Recomendação" value={item.recommendation} onChangeText={(value) => patchItem(item, { recommendation: value })} editable={canSign && !busy} multiline placeholder="Opcional" />
        {canSign ? <Pressable accessibilityRole="button" disabled={busy} style={[styles.saveItemButton, busy && styles.disabled]} onPress={async () => {
          setBusy(true); setError('');
          try { await saveServiceOrderInspectionItem(workshopId, item); await refresh(); }
          catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o item.'); }
          finally { setBusy(false); }
        }}><Text style={styles.saveItemText}>Salvar este item</Text></Pressable> : null}
      </View>)}
      {!items.length ? <Text style={styles.empty}>Nenhum item de checklist foi configurado para esta ordem.</Text> : null}

      <View style={styles.signCard}>
        <Text style={styles.sectionTitle}>Decisão e assinatura do cliente</Text>
        <Text style={styles.helper}>Registre a resposta dada pelo cliente. A assinatura desenhada e o checklist desta tela ficarão guardados no histórico da OS.</Text>
        <View style={styles.decisionChoices}>
          {(['authorized', 'not_authorized'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: decision === value }} disabled={!canSign || busy} style={[styles.decisionButton, decision === value && styles.decisionButtonActive, value === 'not_authorized' && decision === value && styles.decisionNoActive, (!canSign || busy) && styles.disabled]} onPress={() => { setDecision(value); setStatement(defaultStatement(value, orderNumber)); }}>
            <Text style={[styles.decisionText, decision === value && styles.decisionTextActive]}>{decisionLabel(value)}</Text>
          </Pressable>)}
        </View>
        <FormField label="Nome de quem assinou" required value={signerName} onChangeText={setSignerName} editable={canSign && !busy} />
        <FormField label="Declaração registrada" required value={statement} onChangeText={setStatement} editable={canSign && !busy} multiline placeholder="Selecione a decisão para preencher a declaração" />
        <Text style={styles.fieldLabel}>Assinatura do cliente ou responsável</Text>
        <View accessibilityLabel="Área para desenhar a assinatura do cliente" onLayout={(event) => setCanvasSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
          onStartShouldSetResponder={() => canSign && !busy} onMoveShouldSetResponder={() => canSign && !busy}
          onResponderGrant={(event) => recordPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true)}
          onResponderMove={(event) => recordPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, false)}
          style={[styles.canvas, (!canSign || busy) && styles.canvasDisabled]}>
          {lines.map((line) => <View key={line.key} pointerEvents="none" style={[styles.ink, { left: line.left, top: line.top, width: line.length, transform: [{ rotate: `${line.angle}rad` }] }]} />)}
          {!signatureStrokes.length ? <Text pointerEvents="none" style={styles.canvasPlaceholder}>{canSign ? 'Assine aqui com o dedo ou mouse' : 'Seu usuário não pode registrar assinaturas nesta OS'}</Text> : null}
        </View>
        <View style={styles.signActions}>
          <Pressable accessibilityRole="button" disabled={busy} style={[styles.clearButton, busy && styles.disabled]} onPress={() => setSignatureStrokes([])}><Text style={styles.clearText}>Limpar assinatura</Text></Pressable>
          {canSign ? <Pressable accessibilityRole="button" disabled={busy || !items.length || !decision || signatureStrokes.length === 0} style={[styles.signButton, (busy || !items.length || !decision || signatureStrokes.length === 0) && styles.disabled]} onPress={() => { saveAndSign().catch(() => undefined); }}><Text style={styles.signButtonText}>{busy ? 'Salvando checklist e assinatura…' : 'Salvar checklist e assinar'}</Text></Pressable> : null}
        </View>
        <Text style={styles.disclaimer}>O sistema registra a assinatura desenhada e a conta que fez o registro. Isso não equivale a uma assinatura digital certificada.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Histórico de checklists assinados</Text>
        {!history.length ? <Text style={styles.empty}>Ainda não há checklist assinado nesta OS.</Text> : history.map((record) => <SignatureHistoryCard key={record.id} record={record} />)}
      </View>
    </ScrollView>}
  </View>;
}

function SignatureHistoryCard({ record }: { record: ServiceOrderChecklistSignature }) {
  const lines = makeSignatureLines(record.signature_strokes, 220, 40);
  return <View style={styles.historyCard}>
    <Text style={[styles.historyDecision, record.customer_decision === 'not_authorized' && styles.historyDecisionNo]}>{decisionLabel(record.customer_decision)}</Text>
    <Text style={styles.historySigner}>{record.signer_name}</Text>
    <Text style={styles.historyStatement}>{record.statement}</Text>
    <Text style={styles.snapshotHeading}>Itens assinados ({record.checklist_snapshot.length})</Text>
    {record.checklist_snapshot.map((item) => <Text key={item.item_key} style={styles.snapshotLine}>• {item.item_label}: {conditions.find((option) => option.value === item.condition)?.label ?? 'Não informado'}{item.observations ? ` — ${item.observations}` : ''}{item.recommendation ? ` · Recomendação: ${item.recommendation}` : ''}</Text>)}
    <View accessibilityLabel="Assinatura arquivada" style={styles.signaturePreview}>{lines.map((line) => <View key={line.key} pointerEvents="none" style={[styles.ink, { left: line.left, top: line.top, width: line.length, transform: [{ rotate: `${line.angle}rad` }] }]} />)}</View>
    <Text style={styles.historyDate}>{new Date(record.signed_at).toLocaleString('pt-BR')} · registro vinculado ao usuário autenticado</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, backgroundColor: '#f5f7fa' },
  header: { minHeight: 70, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e1e8ef', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1 }, title: { color: '#10243a', fontSize: 18, fontWeight: '800' }, subtitle: { marginTop: 4, color: '#718197', fontSize: 12 },
  backButton: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8 }, backText: { color: '#33465b', fontSize: 11, fontWeight: '700' },
  loading: { padding: 30 }, scroll: { flex: 1 }, content: { padding: 16, gap: 11 }, introCard: { padding: 14, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ef' },
  sectionTitle: { color: '#10243a', fontSize: 16, fontWeight: '800' }, helper: { marginTop: 5, color: '#718197', fontSize: 11, lineHeight: 17 }, progress: { marginTop: 9, color: '#52657a', fontSize: 11, fontWeight: '800' },
  itemCard: { padding: 13, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ef' }, itemTitle: { color: '#26394e', fontSize: 13, fontWeight: '800' },
  conditions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, condition: { paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8 }, conditionActive: { backgroundColor: '#10243a', borderColor: '#10243a' }, conditionText: { color: '#53657b', fontSize: 10 }, conditionTextActive: { color: '#fff', fontWeight: '700' },
  saveItemButton: { minHeight: 36, marginTop: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff5ed' }, saveItemText: { color: '#8d4c19', fontSize: 10, fontWeight: '800' },
  signCard: { padding: 14, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ef', gap: 7 }, decisionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 }, decisionButton: { minHeight: 40, flexGrow: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cdd8e3', borderRadius: 9 }, decisionButtonActive: { borderColor: '#2b8054', backgroundColor: '#eaf5ee' }, decisionNoActive: { borderColor: '#a94740', backgroundColor: '#fbefee' }, decisionText: { color: '#52657a', fontSize: 11, fontWeight: '700' }, decisionTextActive: { color: '#1c633e' },
  fieldLabel: { marginTop: 5, color: '#52657a', fontSize: 11, fontWeight: '700' }, canvas: { height: 145, overflow: 'hidden', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#9baaba', borderRadius: 9, backgroundColor: '#fff' }, canvasDisabled: { backgroundColor: '#f6f8fa' }, canvasPlaceholder: { textAlign: 'center', color: '#9aa6b4', fontSize: 11 }, ink: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: '#183a59' },
  signActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 }, clearButton: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cad6e2', borderRadius: 8 }, clearText: { color: '#52657a', fontSize: 10, fontWeight: '700' }, signButton: { flex: 1, minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e97824' }, signButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' }, disabled: { opacity: 0.5 }, disclaimer: { marginTop: 2, color: '#718197', fontSize: 10, lineHeight: 15 }, error: { marginTop: 4, color: '#a23d33', fontSize: 11 }, empty: { paddingVertical: 8, color: '#7b8999', fontSize: 11 },
  historySection: { gap: 9, marginTop: 5 }, historyCard: { padding: 12, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 10, backgroundColor: '#fff', gap: 5 }, historyDecision: { color: '#1c633e', fontSize: 12, fontWeight: '800' }, historyDecisionNo: { color: '#a94740' }, historySigner: { color: '#26394e', fontSize: 11, fontWeight: '700' }, historyStatement: { color: '#40546b', fontSize: 10, lineHeight: 15 }, snapshotHeading: { marginTop: 4, color: '#52657a', fontSize: 10, fontWeight: '800' }, snapshotLine: { color: '#596b7f', fontSize: 9, lineHeight: 14 }, signaturePreview: { width: 220, height: 40, borderBottomWidth: 1, borderBottomColor: '#cbd6e0', overflow: 'hidden' }, historyDate: { color: '#8491a0', fontSize: 9 },
});
