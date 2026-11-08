import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { createServiceOrderAuthorization, listServiceOrderAuthorizations } from '../services/workshopData';
import type { ServiceOrderAuthorization, SignaturePoint } from '../types/workshop';

type AuthorizationType = ServiceOrderAuthorization['authorization_type'];
const money = (value: number | string) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const labels: Record<AuthorizationType, string> = { estimate: 'Orçamento', service: 'Serviço', delivery: 'Entrega' };
function defaultStatement(type: AuthorizationType, number: number, amount: number | string) {
  const value = money(amount);
  if (type === 'estimate') return `Autorizo o orçamento da OS #${number}, no valor de ${value}.`;
  if (type === 'delivery') return `Confirmo o recebimento do veículo referente à OS #${number} e dos serviços descritos, no valor de ${value}.`;
  return `Autorizo a execução dos serviços descritos na OS #${number}, no valor total de ${value}.`;
}
function makeSignatureLines(strokes: SignaturePoint[][], width: number, height: number) {
  return strokes.flatMap((stroke, strokeIndex) => stroke.slice(1).map((point, index) => {
    const previous = stroke[index];
    const x1 = previous.x * width; const y1 = previous.y * height;
    const x2 = point.x * width; const y2 = point.y * height;
    const length = Math.hypot(x2 - x1, y2 - y1);
    return { key: `${strokeIndex}-${index}`, left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1.5, length, angle: Math.atan2(y2 - y1, x2 - x1) };
  }));
}

export default function ServiceOrderAuthorizationPanel({ workshopId, orderId, customerId, customerName, orderNumber, amount, canSign }: {
  workshopId: string; orderId: string; customerId: string; customerName: string; orderNumber: number; amount: number | string; canSign: boolean;
}) {
  const [rows, setRows] = useState<ServiceOrderAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>('service');
  const [signerName, setSignerName] = useState(customerName);
  const [statement, setStatement] = useState(defaultStatement('service', orderNumber, amount));
  const [signatureStrokes, setSignatureStrokes] = useState<SignaturePoint[][]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const refresh = useCallback(async () => {
    try { setRows(await listServiceOrderAuthorizations(workshopId, orderId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as autorizações.'); }
    finally { setLoading(false); }
  }, [workshopId, orderId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['service_order_authorizations'], refresh);

  const recordPoint = (x: number, y: number, start: boolean) => {
    if (!canvasSize.width || !canvasSize.height) return;
    const point = { x: Math.min(1, Math.max(0, x / canvasSize.width)), y: Math.min(1, Math.max(0, y / canvasSize.height)) };
    if (start) setSignatureStrokes((current) => [...current, [point]]);
    else setSignatureStrokes((current) => {
      if (!current.length) return [[point]];
      const strokes = [...current];
      const last = [...strokes[strokes.length - 1]];
      const previous = last[last.length - 1];
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.0015) last.push(point);
      strokes[strokes.length - 1] = last;
      return strokes;
    });
  };

  const lines = useMemo(() => makeSignatureLines(signatureStrokes, canvasSize.width, canvasSize.height), [signatureStrokes, canvasSize]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      await createServiceOrderAuthorization(workshopId, orderId, customerId, authorizationType, signerName, statement, Number(amount), signatureStrokes);
      setSignatureStrokes([]); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a autorização.'); }
    finally { setBusy(false); }
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  return <View style={styles.panel}>
    <Text style={styles.heading}>Autorizações do cliente</Text>
    <Text style={styles.hint}>Registre a assinatura desenhada, o texto autorizado e o funcionário que confirmou o registro. Isso documenta o aceite na oficina e não substitui uma assinatura digital certificada.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {canSign ? <>
      <Text style={styles.fieldLabel}>Tipo de autorização</Text>
      <View style={styles.choices}>{(['estimate','service','delivery'] as const).map((type) => <Pressable key={type} style={[styles.choice, authorizationType === type && styles.choiceActive]} onPress={() => { setAuthorizationType(type); setStatement(defaultStatement(type, orderNumber, amount)); }}><Text style={[styles.choiceText, authorizationType === type && styles.choiceTextActive]}>{labels[type]}</Text></Pressable>)}</View>
      <FormField label="Nome de quem autorizou" required value={signerName} onChangeText={setSignerName} />
      <FormField label="Valor autorizado (R$)" required value={String(amount)} onChangeText={() => undefined} editable={false} />
      <FormField label="Texto exato da autorização" required value={statement} onChangeText={setStatement} multiline />
      <Text style={styles.fieldLabel}>Assinatura</Text>
      <View accessibilityLabel="Área para desenhar a assinatura do cliente" onLayout={(event) => setCanvasSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        onStartShouldSetResponder={() => !busy} onMoveShouldSetResponder={() => !busy}
        onResponderGrant={(event) => recordPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true)}
        onResponderMove={(event) => recordPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, false)}
        style={styles.canvas}>
        {lines.map((line) => <View key={line.key} pointerEvents="none" style={[styles.ink, { left: line.left, top: line.top, width: line.length, transform: [{ rotate: `${line.angle}rad` }] }]} />)}
        {!signatureStrokes.length ? <Text pointerEvents="none" style={styles.canvasPlaceholder}>Assine aqui com o dedo ou mouse</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.clearButton} onPress={() => setSignatureStrokes([])}><Text style={styles.clearText}>Limpar assinatura</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={[styles.saveButton, busy && styles.disabled]} onPress={() => { save().catch(() => undefined); }}><Text style={styles.saveText}>{busy ? 'Registrando…' : 'Registrar autorização'}</Text></Pressable>
      </View>
    </> : <Text style={styles.hint}>Seu usuário pode consultar os registros; é necessária permissão de edição da OS para registrar uma autorização.</Text>}
    <Text style={styles.fieldLabel}>Histórico imutável</Text>
    {rows.map((row) => <View key={row.id} style={styles.savedRow}>
      <View style={styles.savedHeader}><Text style={styles.savedTitle}>{labels[row.authorization_type]} · {row.signer_name}</Text><Text style={styles.savedAmount}>{money(row.amount)}</Text></View>
      <Text style={styles.savedBody}>{row.statement}</Text>
      <View accessibilityLabel="Assinatura registrada" style={styles.signaturePreview}>{makeSignatureLines(row.signature_strokes, 220, 40).map((line) => <View key={line.key} pointerEvents="none" style={[styles.ink, { left: line.left, top: line.top, width: line.length, transform: [{ rotate: `${line.angle}rad` }] }]} />)}</View>
      <Text style={styles.savedDate}>{new Date(row.signed_at).toLocaleString('pt-BR')} · confirmação registrada por usuário autenticado</Text>
    </View>)}
    {!rows.length ? <Text style={styles.empty}>Nenhuma autorização registrada nesta OS.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ panel: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fbfcfd', gap: 8 }, loading: { marginTop: 20 }, heading: { color: '#10243a', fontSize: 15, fontWeight: '800' }, hint: { color: '#718197', fontSize: 10, lineHeight: 15 }, fieldLabel: { marginTop: 6, color: '#52657a', fontSize: 11, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, choice: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff' }, choiceActive: { borderColor: '#10243a', backgroundColor: '#10243a' }, choiceText: { color: '#41546a', fontSize: 10 }, choiceTextActive: { color: '#fff', fontWeight: '700' }, canvas: { height: 150, overflow: 'hidden', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#9baaba', borderRadius: 9, backgroundColor: '#fff' }, canvasPlaceholder: { textAlign: 'center', color: '#9aa6b4', fontSize: 11 }, ink: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: '#183a59' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, clearButton: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cad6e2', borderRadius: 8 }, clearText: { color: '#52657a', fontSize: 10, fontWeight: '700' }, saveButton: { flex: 1, minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#10243a' }, saveText: { color: '#fff', fontSize: 10, fontWeight: '700' }, disabled: { opacity: 0.5 }, savedRow: { padding: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ef', gap: 4 }, savedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, savedTitle: { flex: 1, color: '#20354b', fontSize: 11, fontWeight: '700' }, savedAmount: { color: '#10243a', fontSize: 11, fontWeight: '800' }, savedBody: { color: '#40546b', fontSize: 10, lineHeight: 14 }, signaturePreview: { width: 220, height: 40, borderBottomWidth: 1, borderBottomColor: '#cbd6e0', overflow: 'hidden' }, savedDate: { color: '#8491a0', fontSize: 9 }, empty: { color: '#7b8999', fontSize: 10 }, error: { color: '#a23d33', fontSize: 11 } });
