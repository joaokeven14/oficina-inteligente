import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { createFinancialEntry, getWorkshopPermissions, getWorkshopSettings, listCustomers, listFinancialEntries, listFinancialEntryReversals, listPayables, markPayablePaid, reverseFinancialEntry, settleFinancialEntry } from '../services/workshopData';
import type { Customer, FinancialEntry, FinancialEntryReversal, Payable } from '../types/workshop';
import { formatLocalDate } from '../utils/date';
import { openPrintableDocument } from '../utils/printDocument';
import { paymentMethodLabel, paymentMethods } from '../utils/paymentMethods';
import type { PaymentMethod } from '../utils/paymentMethods';

const amountValue = (value: number | string) => Number(value);
const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const today = formatLocalDate(new Date());

export default function FinanceScreen({ workshopId }: { workshopId: string }) {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [reversals, setReversals] = useState<FinancialEntryReversal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canSettle, setCanSettle] = useState(false);
  const [type, setType] = useState<'receivable' | 'expense'>('receivable');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Serviços');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [customerId, setCustomerId] = useState('');
  const [filter, setFilter] = useState<'all' | 'receivable' | 'expense'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entryToReverse, setEntryToReverse] = useState<FinancialEntry | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [settlementTarget, setSettlementTarget] = useState<{ kind: 'entry'; entry: FinancialEntry } | { kind: 'payable'; payable: Payable } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');

  const refresh = useCallback(async () => {
    try {
      const [rows, people, bills, permissions, reversalRows] = await Promise.all([
        listFinancialEntries(workshopId), listCustomers(workshopId), listPayables(workshopId), getWorkshopPermissions(workshopId), listFinancialEntryReversals(workshopId),
      ]);
      setEntries(rows); setCustomers(people); setPayables(bills); setCanCreate(permissions.finance.create); setCanSettle(permissions.finance.update); setReversals(reversalRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o financeiro.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['customers', 'vehicles', 'service_orders', 'financial_entries', 'financial_entry_reversals', 'payables', 'payable_payment_reversals'], refresh);

  const visible = useMemo(() => entries.filter((entry) => filter === 'all' || entry.entry_type === filter), [entries, filter]);
  const totals = useMemo(() => entries.reduce((summary, entry) => {
    const key = entry.entry_type === 'receivable' ? 'income' : 'expense';
    summary[key] += amountValue(entry.amount);
    if (entry.status === 'paid') summary[entry.entry_type === 'receivable' ? 'received' : 'paid'] += amountValue(entry.amount);
    else summary.pending += amountValue(entry.amount);
    return summary;
  }, { income: 0, expense: 0, received: 0, paid: 0, pending: 0 }), [entries]);
  const fullTotals = useMemo(() => payables.reduce((summary, payable) => {
    summary.expense += amountValue(payable.amount);
    if (payable.status === 'paid') summary.paid += amountValue(payable.amount);
    else summary.pending += amountValue(payable.amount);
    return summary;
  }, { ...totals }), [payables, totals]);

  const perform = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const create = () => {
    const parsed = Number(amount.replace(',', '.'));
    if (!description.trim() || !category.trim() || !Number.isFinite(parsed) || parsed <= 0) { setError('Informe descrição, categoria e um valor maior que zero.'); return; }
    perform(async () => {
      await createFinancialEntry(workshopId, { entry_type: type, description, category, amount: parsed, due_date: dueDate || null, customer_id: type === 'receivable' ? customerId || null : null });
      setDescription(''); setAmount('');
    });
  };

  const confirmSettlement = () => {
    if (!settlementTarget) return;
    perform(async () => {
      if (settlementTarget.kind === 'entry') await settleFinancialEntry(workshopId, settlementTarget.entry.id, paymentMethod);
      else await markPayablePaid(workshopId, settlementTarget.payable.id, paymentMethod);
      setSettlementTarget(null);
    });
  };

  const confirmReversal = () => {
    if (!entryToReverse || reversalReason.trim().length < 3) { setError('Informe o motivo do estorno (mínimo de 3 caracteres).'); return; }
    perform(async () => { await reverseFinancialEntry(workshopId, entryToReverse.id, reversalReason); setEntryToReverse(null); setReversalReason(''); });
  };

  const shareReceipt = async (entry: FinancialEntry) => {
    setBusy(true); setError('');
    try {
      const settings = await getWorkshopSettings(workshopId);
      await openPrintableDocument('Comprovante de recebimento', settings.name, [
        { label: 'Descrição', value: entry.description }, { label: 'Categoria', value: entry.category },
        { label: 'Valor recebido', value: money(amountValue(entry.amount)) }, { label: 'Forma de recebimento', value: paymentMethodLabel(entry.payment_method) ?? 'Não informada' }, { label: 'Data do recebimento', value: entry.settled_at ? new Date(entry.settled_at).toLocaleString('pt-BR') : '—' },
        { label: 'Cliente', value: entry.customers?.full_name ?? 'Não vinculado' },
        { label: 'Ordem de serviço', value: entry.service_orders?.order_number ? `#${entry.service_orders.order_number}` : 'Não vinculada' },
        { label: 'Contato da oficina', value: [settings.phone, settings.whatsapp, settings.email].filter(Boolean).join(' · ') || '—' },
      ], undefined, settings.logo_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o comprovante.'); }
    finally { setBusy(false); }
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Financeiro</Text>
    <Text style={styles.subtitle}>Receitas de OS entregues são lançadas automaticamente. Confira valores recebidos separadamente das contas previstas.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.summaryGrid}>
      <Summary label="Receitas previstas" value={fullTotals.income} />
      <Summary label="Despesas lançadas" value={fullTotals.expense} />
      <Summary label="Recebido" value={fullTotals.received} />
      <Summary label="Pago" value={fullTotals.paid} />
      <Summary label="Pendente" value={fullTotals.pending} />
      <Summary label="Resultado recebido" value={fullTotals.received - fullTotals.paid} />
    </View>
    {canCreate ? <View style={styles.card}>
      <Text style={styles.section}>Novo lançamento</Text>
      <View style={styles.chips}>{(['receivable', 'expense'] as const).map((entryType) => <Pressable key={entryType} accessibilityRole="button" accessibilityState={{ selected: type === entryType }} style={[styles.chip, type === entryType && styles.chipSelected]} onPress={() => { setType(entryType); setCategory(entryType === 'receivable' ? 'Serviços' : 'Outros'); }}><Text style={[styles.chipText, type === entryType && styles.chipTextSelected]}>{entryType === 'receivable' ? 'Conta a receber' : 'Despesa'}</Text></Pressable>)}</View>
      <FormField label="Descrição" required value={description} onChangeText={setDescription} placeholder={type === 'receivable' ? 'Ex.: serviço adicional' : 'Ex.: energia elétrica'} />
      <FormField label="Categoria" required value={category} onChangeText={setCategory} placeholder="Serviços, aluguel, impostos…" />
      <View style={styles.row}><View style={styles.half}><FormField label="Valor (R$)" required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" /></View><View style={styles.half}><FormField label="Vencimento (AAAA-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="2026-12-31" /></View></View>
      {type === 'receivable' ? <><Text style={styles.label}>Cliente (opcional)</Text><View style={styles.chips}><Pressable style={[styles.chip, !customerId && styles.chipSelected]} onPress={() => setCustomerId('')}><Text style={[styles.chipText, !customerId && styles.chipTextSelected]}>Sem vínculo</Text></Pressable>{customers.map((customer) => <Pressable key={customer.id} style={[styles.chip, customerId === customer.id && styles.chipSelected]} onPress={() => setCustomerId(customer.id)}><Text style={[styles.chipText, customerId === customer.id && styles.chipTextSelected]}>{customer.full_name}</Text></Pressable>)}</View></> : null}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={create}><Text style={styles.buttonText}>Salvar lançamento</Text></Pressable>
    </View> : null}
    <View style={styles.card}>
      <Text style={styles.section}>Lançamentos</Text>
      <View style={styles.chips}>{(['all', 'receivable', 'expense'] as const).map((item) => <Pressable key={item} style={[styles.chip, filter === item && styles.chipSelected]} onPress={() => setFilter(item)}><Text style={[styles.chipText, filter === item && styles.chipTextSelected]}>{item === 'all' ? 'Todos' : item === 'receivable' ? 'Receitas' : 'Despesas'}</Text></Pressable>)}</View>
      {visible.map((entry) => <View key={entry.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{entry.description} · {money(amountValue(entry.amount))}</Text><Text style={styles.muted}>{entry.category} · {entry.entry_type === 'receivable' ? (entry.status === 'paid' ? 'Recebido' : 'A receber') : (entry.status === 'paid' ? 'Despesa paga' : 'Despesa pendente')}{entry.status === 'pending' ? ` · vence ${entry.due_date ? new Date(`${entry.due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}` : ''}{entry.payment_method ? ` · ${paymentMethodLabel(entry.payment_method) ?? entry.payment_method}` : ''}</Text>{entry.customers?.full_name ? <Text style={styles.muted}>{entry.customers.full_name}</Text> : null}{entry.service_orders?.order_number ? <Text style={styles.muted}>Gerado pela OS #{entry.service_orders.order_number}</Text> : null}{reversals.filter((item) => item.financial_entry_id === entry.id).map((item) => <Text key={item.id} style={styles.reversalText}>Estorno em {new Date(item.reversed_at).toLocaleString('pt-BR')}: {item.reason}{item.previous_payment_method ? ` · forma anterior: ${paymentMethodLabel(item.previous_payment_method) ?? item.previous_payment_method}` : ''}</Text>)}</View>{entry.status === 'pending' && canSettle ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => { setSettlementTarget({ kind: 'entry', entry }); setPaymentMethod('pix'); }}><Text style={styles.smallButtonText}>{entry.entry_type === 'receivable' ? 'Receber' : 'Marcar pago'}</Text></Pressable> : null}{entry.status === 'paid' && entry.entry_type === 'receivable' ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => { shareReceipt(entry).catch(() => undefined); }}><Text style={styles.smallButtonText}>Comprovante</Text></Pressable> : null}{entry.status === 'paid' && canSettle ? <Pressable disabled={busy} style={styles.reverseButton} onPress={() => { setEntryToReverse(entry); setReversalReason(''); setError(''); }}><Text style={styles.reverseText}>Estornar</Text></Pressable> : null}</View>)}
      {!visible.length ? <Text style={styles.muted}>Nenhum lançamento neste filtro.</Text> : null}
      {filter !== 'receivable' ? <>
        <Text style={styles.section}>Contas a pagar de compras</Text>
        {payables.map((payable) => <View key={payable.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{payable.description} · {money(amountValue(payable.amount))}</Text><Text style={styles.muted}>{payable.suppliers?.name ?? 'Fornecedor'} · {payable.status === 'paid' ? `Pago · ${paymentMethodLabel(payable.payment_method) ?? 'forma não informada'}` : `Pendente · vence ${payable.due_date ? new Date(`${payable.due_date}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}`}</Text></View>{payable.status === 'pending' && canSettle ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => { setSettlementTarget({ kind: 'payable', payable }); setPaymentMethod('pix'); }}><Text style={styles.smallButtonText}>Marcar pago</Text></Pressable> : null}</View>)}
        {!payables.length ? <Text style={styles.muted}>Nenhuma conta a pagar originada por compra.</Text> : null}
      </> : null}
    </View>
    <Modal visible={!!entryToReverse} transparent animationType="fade" onRequestClose={() => { if (!busy) setEntryToReverse(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.section}>Estornar lançamento recebido</Text><Text style={styles.muted}>{entryToReverse?.description} · {entryToReverse ? money(amountValue(entryToReverse.amount)) : ''}</Text><Text style={styles.muted}>O lançamento voltará a pendente; o estorno ficará registrado na auditoria da oficina.</Text><FormField label="Motivo do estorno" required value={reversalReason} onChangeText={setReversalReason} multiline placeholder="Ex.: pagamento lançado na conta errada" /><View style={styles.modalActions}><Pressable disabled={busy} style={styles.cancelButton} onPress={() => setEntryToReverse(null)}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable disabled={busy} style={styles.reverseConfirm} onPress={confirmReversal}><Text style={styles.buttonText}>{busy ? 'Estornando…' : 'Confirmar estorno'}</Text></Pressable></View></View></View>
    </Modal>
    <Modal visible={!!settlementTarget} transparent animationType="fade" onRequestClose={() => { if (!busy) setSettlementTarget(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.section}>Registrar forma de pagamento</Text><Text style={styles.muted}>{settlementTarget?.kind === 'entry' ? settlementTarget.entry.description : settlementTarget?.payable.description} · {settlementTarget ? money(amountValue(settlementTarget.kind === 'entry' ? settlementTarget.entry.amount : settlementTarget.payable.amount)) : ''}</Text><Text style={styles.label}>Forma usada</Text><View style={styles.chips}>{paymentMethods.map((method) => <Pressable key={method.value} accessibilityRole="button" accessibilityState={{ selected: paymentMethod === method.value }} style={[styles.chip, paymentMethod === method.value && styles.chipSelected]} onPress={() => setPaymentMethod(method.value)}><Text style={[styles.chipText, paymentMethod === method.value && styles.chipTextSelected]}>{method.label}</Text></Pressable>)}</View><View style={styles.modalActions}><Pressable disabled={busy} style={styles.cancelButton} onPress={() => setSettlementTarget(null)}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={confirmSettlement}><Text style={styles.buttonText}>{busy ? 'Salvando…' : settlementTarget?.kind === 'entry' && settlementTarget.entry.entry_type === 'receivable' ? 'Confirmar recebimento' : 'Confirmar pagamento'}</Text></Pressable></View></View></View>
    </Modal>
  </ScrollView>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryValue}>{money(value)}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({ page: { paddingVertical: 22, paddingBottom: 36, gap: 12 }, loading: { marginTop: 35 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#718197', fontSize: 12, lineHeight: 18 }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, summaryCard: { flexGrow: 1, flexBasis: '30%', minWidth: 120, padding: 12, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' }, summaryValue: { color: '#10243a', fontSize: 17, fontWeight: '800' }, summaryLabel: { marginTop: 4, color: '#718197', fontSize: 10 }, card: { padding: 15, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 13, backgroundColor: '#fff', gap: 9 }, section: { color: '#10243a', fontSize: 15, fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#dae2ea', borderRadius: 8 }, chipSelected: { borderColor: '#10243a', backgroundColor: '#10243a' }, chipText: { color: '#41546a', fontSize: 10 }, chipTextSelected: { color: '#fff', fontWeight: '700' }, label: { color: '#52657a', fontSize: 11, fontWeight: '700' }, row: { flexDirection: 'row', gap: 9 }, half: { flex: 1 }, button: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.5 }, listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#edf0f4' }, flex: { flex: 1 }, itemTitle: { color: '#20354b', fontSize: 12, fontWeight: '700' }, muted: { color: '#7b8999', fontSize: 10, lineHeight: 15 }, smallButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7, backgroundColor: '#e97824' }, smallButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' }, reverseButton: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 7, backgroundColor: '#fff0ee', borderWidth: 1, borderColor: '#e6c5c1' }, reverseText: { color: '#9d4b3c', fontSize: 10, fontWeight: '800' }, reversalText: { color: '#9d4b3c', fontSize: 10, lineHeight: 15 }, modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(10,24,40,0.6)' }, modalCard: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 18, borderRadius: 15, backgroundColor: '#fff', gap: 9 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, cancelButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12 }, cancelText: { color: '#51657a', fontSize: 11, fontWeight: '700' }, reverseConfirm: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#a44239' }, error: { color: '#a23d33', fontSize: 12 } });
