import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import FormField from './FormField';
import { listEstimates, listFinancialEntries, listMaintenanceReminders, listPayables, listServiceOrders } from '../services/workshopData';
import type { Estimate, FinancialEntry, MaintenanceReminder, Payable, ServiceOrder, WorkshopPermissions } from '../types/workshop';
import { formatLocalDate } from '../utils/date';

type Data = { orders: ServiceOrder[]; entries: FinancialEntry[]; payables: Payable[]; estimates: Estimate[]; reminders: MaintenanceReminder[] };
type Props = { workshopId: string; permissions: WorkshopPermissions; onOpenAfterSales: () => void };
type Period = 'Hoje' | '7 dias' | '30 dias' | 'Este mês';
const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayStart = (value: string) => new Date(`${value}T00:00:00`).getTime();
const dayEnd = (value: string) => new Date(`${value}T23:59:59.999`).getTime();
const within = (value: string | null, start: number, end: number) => value !== null && new Date(value).getTime() >= start && new Date(value).getTime() <= end;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dayStart(value)) && formatLocalDate(new Date(`${value}T12:00:00`)) === value;
const monthStart = () => { const date = new Date(); date.setDate(1); return formatLocalDate(date); };

export default function DashboardOverview({ workshopId, permissions, onOpenAfterSales }: Props) {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => formatLocalDate(new Date()));
  const [draftFrom, setDraftFrom] = useState(monthStart);
  const [draftTo, setDraftTo] = useState(() => formatLocalDate(new Date()));
  const [period, setPeriod] = useState<Period | null>('Este mês');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    const load = async () => {
      try {
        const [orders, entries, payables, estimates, reminders] = await Promise.all([
          permissions.service_orders.view ? listServiceOrders(workshopId) : Promise.resolve([]),
          permissions.finance.view ? listFinancialEntries(workshopId) : Promise.resolve([]),
          permissions.finance.view ? listPayables(workshopId) : Promise.resolve([]),
          permissions.estimates.view ? listEstimates(workshopId) : Promise.resolve([]),
          permissions.after_sales?.view ? listMaintenanceReminders(workshopId) : Promise.resolve([]),
        ]);
        if (active) setData({ orders, entries, payables, estimates, reminders });
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o painel por período.'); }
      finally { if (active) setLoading(false); }
    };
    if (permissions.dashboard.view) load(); else setLoading(false);
    return () => { active = false; };
  }, [workshopId, permissions, reload]);

  const selectPeriod = useCallback((next: Period) => {
    const today = new Date(); const start = new Date(today);
    if (next === 'Este mês') start.setDate(1);
    if (next === '7 dias') start.setDate(start.getDate() - 6);
    if (next === '30 dias') start.setDate(start.getDate() - 29);
    const startText = formatLocalDate(start); const endText = formatLocalDate(today);
    setFrom(startText); setTo(endText); setDraftFrom(startText); setDraftTo(endText); setPeriod(next); setDateError('');
  }, []);
  const applyDates = () => {
    if (!validDate(draftFrom) || !validDate(draftTo) || draftFrom > draftTo) { setDateError('Informe datas válidas em AAAA-MM-DD, com início até o fim.'); return; }
    setFrom(draftFrom); setTo(draftTo); setPeriod(null); setDateError(''); setReload((value) => value + 1);
  };

  const report = useMemo(() => {
    if (!data) return null;
    const start = dayStart(from); const end = dayEnd(to);
    const orders = data.orders.filter((order) => within(order.opened_at, start, end));
    const estimates = data.estimates.filter((estimate) => within(estimate.created_at, start, end));
    const receivedEntries = data.entries.filter((entry) => entry.entry_type === 'receivable' && entry.status === 'paid' && within(entry.settled_at, start, end));
    const paidExpenses = data.entries.filter((entry) => entry.entry_type === 'expense' && entry.status === 'paid' && within(entry.settled_at, start, end));
    const paidPurchases = data.payables.filter((payable) => payable.status === 'paid' && within(payable.paid_at, start, end));
    const income = receivedEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expense = paidExpenses.reduce((sum, entry) => sum + Number(entry.amount), 0) + paidPurchases.reduce((sum, payable) => sum + Number(payable.amount), 0);
    const statuses = [
      { label: 'Abertas / diagnóstico', value: orders.filter((order) => ['open', 'diagnosis'].includes(order.status)).length, color: '#537ba3' },
      { label: 'Aguardando', value: orders.filter((order) => ['awaiting_approval', 'awaiting_parts'].includes(order.status)).length, color: '#dba34e' },
      { label: 'Em execução', value: orders.filter((order) => order.status === 'in_progress').length, color: '#e97824' },
      { label: 'Concluídas / entregues', value: orders.filter((order) => ['completed', 'delivered'].includes(order.status)).length, color: '#39876f' },
      { label: 'Canceladas', value: orders.filter((order) => order.status === 'canceled').length, color: '#b5bfcc' },
    ];
    const today = formatLocalDate(new Date()); const limit = new Date(); limit.setDate(limit.getDate() + 30);
    const reminders = data.reminders.filter((reminder) => !reminder.completed_at && (!reminder.due_date || reminder.due_date <= formatLocalDate(limit)))
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')).slice(0, 5);
    return { orders, estimates, income, expense, statuses, reminders, today };
  }, [data, from, to]);

  if (!permissions.dashboard.view) return null;
  const summary: Array<[string, string]> = report ? [
    ...(permissions.service_orders.view ? [['OS criadas no período', String(report.orders.length)] as [string, string]] : []),
    ...(permissions.estimates.view ? [['Orçamentos criados', String(report.estimates.length)] as [string, string]] : []),
    ...(permissions.finance.view ? [['Recebido no período', money(report.income)], ['Despesas pagas', money(report.expense)]] as Array<[string, string]> : []),
  ] : [];
  return <View style={styles.overview}>
    <View style={styles.toolbar}>
      <View style={styles.heading}><Text style={styles.title}>Visão por período</Text><Text style={styles.subtitle}>OS e orçamentos por criação; financeiro pela data do pagamento.</Text></View>
      <Pressable accessibilityRole="button" disabled={loading} style={styles.refresh} onPress={() => setReload((value) => value + 1)}><Text style={styles.refreshText}>{loading ? 'Atualizando…' : 'Atualizar dados'}</Text></Pressable>
    </View>
    <View style={styles.presets}>{(['Hoje', '7 dias', '30 dias', 'Este mês'] as Period[]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }} style={[styles.preset, period === value && styles.presetActive]} onPress={() => selectPeriod(value)}><Text style={[styles.presetText, period === value && styles.presetTextActive]}>{value}</Text></Pressable>)}</View>
    <View style={styles.dates}><View style={styles.dateField}><FormField label="De (AAAA-MM-DD)" value={draftFrom} onChangeText={setDraftFrom} /></View><View style={styles.dateField}><FormField label="Até (AAAA-MM-DD)" value={draftTo} onChangeText={setDraftTo} /></View><Pressable accessibilityRole="button" style={styles.apply} onPress={applyDates}><Text style={styles.applyText}>Aplicar período</Text></Pressable></View>
    {dateError ? <Text accessibilityRole="alert" style={styles.error}>{dateError}</Text> : null}
    <Text style={styles.range}>Período aplicado: {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}</Text>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#e97824" /><Text style={styles.subtitle}>Carregando os registros da oficina…</Text></View> : null}
    {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Text style={styles.subtitle}>Use Atualizar dados para tentar novamente.</Text></View> : null}
    {report && !loading ? <>
      <View style={styles.summary}>{summary.map(([label, value]) => <View key={label} style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>)}</View>
      <View style={styles.charts}>
        {permissions.service_orders.view ? <View style={styles.chartCard}><Text style={styles.chartTitle}>Situação das ordens de serviço</Text><Text style={styles.subtitle}>Estado atual das OS criadas no período.</Text>{report.statuses.map((row) => <BarRow key={row.label} label={row.label} value={row.value} display={String(row.value)} maximum={Math.max(1, ...report.statuses.map((item) => item.value))} color={row.color} />)}{!report.orders.length ? <Text style={styles.empty}>Nenhuma OS criada neste período.</Text> : null}</View> : null}
        {permissions.finance.view ? <View style={styles.chartCard}><Text style={styles.chartTitle}>Recebimentos e despesas</Text><Text style={styles.subtitle}>Valores liquidados no período, incluindo compras pagas.</Text><BarRow label="Recebido" value={report.income} display={money(report.income)} maximum={Math.max(1, report.income, report.expense)} color="#39876f" /><BarRow label="Despesas" value={report.expense} display={money(report.expense)} maximum={Math.max(1, report.income, report.expense)} color="#e97824" /><View style={styles.result}><Text style={styles.subtitle}>Resultado realizado</Text><Text style={[styles.resultValue, report.income - report.expense < 0 && styles.negative]}>{money(report.income - report.expense)}</Text></View><Text style={styles.caption}>Recebimentos menos despesas pagas. Visão operacional de caixa.</Text></View> : null}
      </View>
      {permissions.after_sales?.view ? <View style={styles.agenda}><View style={styles.toolbar}><View style={styles.heading}><Text style={styles.chartTitle}>Agenda de manutenção</Text><Text style={styles.subtitle}>Pendentes, vencidos e próximos 30 dias; lembretes por km também aparecem.</Text></View><Pressable accessibilityRole="button" onPress={onOpenAfterSales} style={styles.agendaLink}><Text style={styles.refreshText}>Ver pós-venda →</Text></Pressable></View>{report.reminders.map((reminder) => <View key={reminder.id} style={styles.reminder}><View style={styles.reminderMain}><Text style={styles.reminderTitle}>{reminder.title}</Text><Text style={styles.subtitle}>{reminder.vehicles ? `${reminder.vehicles.plate} · ${reminder.vehicles.make} ${reminder.vehicles.model}` : 'Veículo vinculado'}{reminder.due_odometer_km !== null ? ` · ${reminder.due_odometer_km.toLocaleString('pt-BR')} km` : ''}</Text></View><Text style={[styles.reminderDate, reminder.due_date && reminder.due_date < report.today ? styles.overdue : null]}>{reminder.due_date ? `${reminder.due_date < report.today ? 'Vencido · ' : ''}${reminder.due_date.split('-').reverse().join('/')}` : 'Por quilometragem'}</Text></View>)}{!report.reminders.length ? <Text style={styles.empty}>Nenhum lembrete pendente nesta agenda.</Text> : null}</View> : null}
    </> : null}
  </View>;
}

function BarRow({ label, value, display, maximum, color }: { label: string; value: number; display: string; maximum: number; color: string }) {
  return <View style={styles.barRow} accessibilityLabel={`${label}: ${display}`}><View style={styles.barLabels}><Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{display}</Text></View><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(0, value / maximum * 100)}%`, backgroundColor: color }]} /></View></View>;
}

const styles = StyleSheet.create({
  overview: { gap: 12 }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, heading: { flex: 1, minWidth: 180 }, title: { color: '#10243a', fontSize: 19, fontWeight: '800' }, subtitle: { marginTop: 4, color: '#718197', fontSize: 11, lineHeight: 16 }, refresh: { paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: '#dce4ed', borderRadius: 9, backgroundColor: '#fff' }, refreshText: { color: '#315a80', fontSize: 11, fontWeight: '700' }, presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, preset: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 8, backgroundColor: '#eaf0f6' }, presetActive: { backgroundColor: '#10243a' }, presetText: { color: '#526b84', fontSize: 11, fontWeight: '700' }, presetTextActive: { color: '#fff' }, dates: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }, dateField: { flex: 1, minWidth: 140, maxWidth: 230, marginTop: -13 }, apply: { minHeight: 44, paddingHorizontal: 15, justifyContent: 'center', borderRadius: 9, backgroundColor: '#e97824' }, applyText: { color: '#fff', fontSize: 12, fontWeight: '800' }, range: { color: '#718197', fontSize: 10 }, error: { color: '#a23d33', fontSize: 12, lineHeight: 18 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15 }, notice: { padding: 14, borderRadius: 9, backgroundColor: '#fff4eb' }, summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, summaryCard: { flex: 1, minWidth: 150, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff', borderRadius: 12, padding: 15 }, summaryLabel: { color: '#718197', fontSize: 10, fontWeight: '600' }, summaryValue: { marginTop: 6, color: '#10243a', fontSize: 23, fontWeight: '800' }, charts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, chartCard: { flexGrow: 1, flexBasis: 300, padding: 18, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff', borderRadius: 13 }, chartTitle: { color: '#10243a', fontSize: 14, fontWeight: '800' }, barRow: { marginTop: 15 }, barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 }, barLabel: { color: '#52677e', fontSize: 10 }, barValue: { color: '#243d55', fontSize: 10, fontWeight: '700' }, barTrack: { height: 10, borderRadius: 5, backgroundColor: '#edf2f7', overflow: 'hidden' }, barFill: { height: 10, borderRadius: 5 }, result: { marginTop: 23, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e8edf3' }, resultValue: { color: '#39876f', fontSize: 24, fontWeight: '800', marginTop: 6 }, negative: { color: '#a23d33' }, caption: { marginTop: 9, color: '#8a98a9', fontSize: 10, lineHeight: 15 }, agenda: { borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff', borderRadius: 13, padding: 18 }, agendaLink: { paddingVertical: 8 }, reminder: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#edf1f5', marginTop: 8 }, reminderMain: { flex: 1, minWidth: 170 }, reminderTitle: { color: '#27405a', fontSize: 12, fontWeight: '700' }, reminderDate: { color: '#476d8a', fontSize: 10, fontWeight: '700' }, overdue: { color: '#a45733' }, empty: { marginTop: 16, color: '#8a98a9', fontSize: 11, lineHeight: 16 },
});
