import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { getEmployeeProductivity, getWorkshopPermissions, getWorkshopSettings, listCustomers, listEstimates, listFinancialEntries, listInventoryProducts, listMaintenanceReminders, listPayables, listPurchases, listServiceOrders, listServiceWarranties, listVehicles, listWorkshopEmployees } from '../services/workshopData';
import type { Customer, EmployeeProductivity, Estimate, FinancialEntry, InventoryProduct, MaintenanceReminder, Payable, Purchase, ServiceOrder, ServiceWarranty, Vehicle, WorkshopEmployee } from '../types/workshop';
import { formatLocalDate } from '../utils/date';
import { openPrintableDocument } from '../utils/printDocument';

const dateValue = formatLocalDate;
const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const toTime = (value: string | null) => value ? new Date(value).getTime() : null;

type Data = { customers: Customer[]; vehicles: Vehicle[]; orders: ServiceOrder[]; estimates: Estimate[]; stock: InventoryProduct[]; purchases: Purchase[]; entries: FinancialEntry[]; payables: Payable[]; reminders: MaintenanceReminder[]; warranties: ServiceWarranty[]; employees: WorkshopEmployee[] };

export default function ReportsScreen({ workshopId, workshopName, isOwner }: { workshopId: string; workshopName: string; isOwner: boolean }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(dateValue(monthStart));
  const [to, setTo] = useState(dateValue(today));
  const [data, setData] = useState<Data | null>(null);
  const [productivity, setProductivity] = useState<EmployeeProductivity[]>([]);
  const [productivityRequested, setProductivityRequested] = useState(false);
  const [canLoadProductivity, setCanLoadProductivity] = useState(false);
  const [canViewAfterSales, setCanViewAfterSales] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');

  const refresh = useCallback(async () => {
    try {
      const permissions = await getWorkshopPermissions(workshopId);
      setCanViewAfterSales(permissions.after_sales?.view ?? false);
      const [customers, vehicles, orders, estimates, stock, purchases, entries, payables, reminders, warranties, employees] = await Promise.all([
        permissions.clients.view ? listCustomers(workshopId) : Promise.resolve([]),
        permissions.vehicles.view ? listVehicles(workshopId) : Promise.resolve([]),
        permissions.service_orders.view ? listServiceOrders(workshopId) : Promise.resolve([]),
        permissions.estimates.view ? listEstimates(workshopId) : Promise.resolve([]),
        permissions.inventory.view ? listInventoryProducts(workshopId) : Promise.resolve([]),
        permissions.inventory.view ? listPurchases(workshopId) : Promise.resolve([]),
        permissions.finance.view ? listFinancialEntries(workshopId) : Promise.resolve([]),
        permissions.finance.view ? listPayables(workshopId) : Promise.resolve([]),
        permissions.after_sales?.view ? listMaintenanceReminders(workshopId) : Promise.resolve([]),
        permissions.after_sales?.view ? listServiceWarranties(workshopId) : Promise.resolve([]),
        permissions.employees.view ? listWorkshopEmployees(workshopId) : Promise.resolve([]),
      ]);
      setData({ customers, vehicles, orders, estimates, stock, purchases, entries, payables, reminders, warranties, employees });
      setCanLoadProductivity(isOwner && permissions.reports.view && permissions.employees.view);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível montar os relatórios.'); }
    finally { setLoading(false); }
  }, [workshopId, isOwner]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['customers', 'vehicles', 'service_orders', 'service_order_items', 'estimates', 'estimate_items', 'inventory_products', 'inventory_movements', 'suppliers', 'purchases', 'purchase_items', 'financial_entries', 'financial_entry_reversals', 'payables', 'payable_payment_reversals', 'maintenance_reminders', 'service_warranties'], refresh);

  const loadProductivity = useCallback(async () => {
    setBusy(true); setError('');
    try { setProductivity(await getEmployeeProductivity(workshopId, from, to)); setProductivityRequested(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a produtividade.'); }
    finally { setBusy(false); }
  }, [from, to, workshopId]);

  const refreshProductivity = useCallback(async () => {
    if (!productivityRequested || !canLoadProductivity) return;
    try { setProductivity(await getEmployeeProductivity(workshopId, from, to)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a produtividade.'); }
  }, [canLoadProductivity, from, productivityRequested, to, workshopId]);
  useWorkshopLiveRefresh(workshopId, ['service_order_time_entries'], refreshProductivity, productivityRequested && canLoadProductivity);

  const report = useMemo(() => {
    if (!data) return [] as Array<[string, string]>;
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59.999`).getTime();
    const within = (value: string | null) => { const parsed = toTime(value); return parsed !== null && parsed >= start && parsed <= end; };
    const orders = data.orders.filter((order) => within(order.opened_at));
    const delivered = orders.filter((order) => order.status === 'delivered');
    const estimates = data.estimates.filter((estimate) => within(estimate.created_at));
    const received = data.entries.filter((entry) => entry.entry_type === 'receivable' && entry.status === 'paid' && within(entry.settled_at)).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const paidExpenses = data.entries.filter((entry) => entry.entry_type === 'expense' && entry.status === 'paid' && within(entry.settled_at)).reduce((sum, entry) => sum + Number(entry.amount), 0)
      + data.payables.filter((item) => item.status === 'paid' && within(item.paid_at)).reduce((sum, item) => sum + Number(item.amount), 0);
    const pending = data.entries.filter((entry) => entry.status === 'pending').reduce((sum, entry) => sum + Number(entry.amount), 0)
      + data.payables.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount), 0);
    const future = new Date(); future.setDate(future.getDate() + 30);
    const upcomingReminders = data.reminders.filter((reminder) => reminder.due_date && reminder.completed_at === null && reminder.due_date >= dateValue(new Date()) && reminder.due_date <= dateValue(future));
    const employeeMetrics = data.employees.filter((employee) => employee.status === 'active').flatMap((employee) => {
      const assigned = orders.filter((order) => order.assigned_membership_id === employee.id);
      const completed = assigned.filter((order) => ['completed','delivered'].includes(order.status));
      return [[`OS atribuídas a ${employee.profiles.full_name}`, String(assigned.length)], [`OS concluídas/entregues de ${employee.profiles.full_name}`, String(completed.length)], [`Valor de OS concluídas/entregues de ${employee.profiles.full_name}`, money(completed.reduce((sum, order) => sum + Number(order.total_amount), 0))]] as Array<[string, string]>;
    });
    return [
      ['Clientes ativos', String(data.customers.length)], ['Veículos ativos', String(data.vehicles.length)],
      ['OS abertas no período', String(orders.filter((order) => !['completed','delivered','canceled'].includes(order.status)).length)],
      ['OS entregues no período', String(delivered.length)], ['Valor das OS entregues', money(delivered.reduce((sum, order) => sum + Number(order.total_amount), 0))],
      ['Orçamentos no período', String(estimates.length)], ['Orçamentos aprovados', String(estimates.filter((estimate) => ['approved','converted'].includes(estimate.status)).length)],
      ['Estoque abaixo do mínimo', String(data.stock.filter((product) => Number(product.quantity) <= Number(product.minimum_quantity)).length)],
      ['Estoque a custo', money(data.stock.reduce((sum, product) => sum + Number(product.quantity) * Number(product.cost_price), 0))],
      ['Compras recebidas no período', String(data.purchases.filter((purchase) => purchase.status === 'received' && within(purchase.received_at)).length)],
      ['Recebido no período', money(received)], ['Despesas pagas no período', money(paidExpenses)], ['Resultado realizado no período', money(received - paidExpenses)],
      ['Contas pendentes', money(pending)],
      ...(canViewAfterSales ? [['Garantias vigentes', String(data.warranties.filter((item) => !item.voided_at && item.ends_on >= dateValue(new Date())).length)], ['Lembretes nos próximos 30 dias', String(upcomingReminders.length)]] as Array<[string, string]> : []),
      ...employeeMetrics,
      ...productivity.flatMap((employee) => [
        [`Tempo registrado de ${employee.full_name}`, `${Math.round(Number(employee.minutes_logged))} min`],
        [`Mão de obra concluída de ${employee.full_name}`, money(Number(employee.labor_value))],
      ]) as Array<[string, string]>,
    ];
  }, [data, from, to, productivity, canViewAfterSales]);

  const financeBreakdown = useMemo(() => {
    if (!data) return { categories: [] as Array<{ name: string; income: number; expense: number }>, months: [] as Array<{ label: string; income: number; expense: number }> };
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59.999`).getTime();
    const paidEntries = data.entries.filter((entry) => { const settledAt = toTime(entry.settled_at); return entry.status === 'paid' && settledAt !== null && settledAt >= start && settledAt <= end; });
    const paidPayables = data.payables.filter((item) => { const paidAt = toTime(item.paid_at); return item.status === 'paid' && paidAt !== null && paidAt >= start && paidAt <= end; });
    const grouped = new Map<string, { name: string; income: number; expense: number }>();
    for (const entry of paidEntries) {
      const row = grouped.get(entry.category) ?? { name: entry.category, income: 0, expense: 0 };
      row[entry.entry_type === 'receivable' ? 'income' : 'expense'] += Number(entry.amount);
      grouped.set(entry.category, row);
    }
    for (const item of paidPayables) {
      const row = grouped.get('Compras') ?? { name: 'Compras', income: 0, expense: 0 };
      row.expense += Number(item.amount); grouped.set('Compras', row);
    }
    const months: Array<{ label: string; income: number; expense: number }> = [];
    const cursor = new Date(`${from}T12:00:00`); cursor.setDate(1);
    const limit = new Date(`${to}T12:00:00`); limit.setDate(1);
    for (let i = 0; i < 12 && cursor <= limit; i += 1, cursor.setMonth(cursor.getMonth() + 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const income = paidEntries.filter((entry) => entry.entry_type === 'receivable' && entry.settled_at && formatLocalDate(new Date(entry.settled_at)).slice(0, 7) === key).reduce((sum, entry) => sum + Number(entry.amount), 0);
      const expense = paidEntries.filter((entry) => entry.entry_type === 'expense' && entry.settled_at && formatLocalDate(new Date(entry.settled_at)).slice(0, 7) === key).reduce((sum, entry) => sum + Number(entry.amount), 0)
        + paidPayables.filter((item) => item.paid_at && formatLocalDate(new Date(item.paid_at)).slice(0, 7) === key).reduce((sum, item) => sum + Number(item.amount), 0);
      months.push({ label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), income, expense });
    }
    return { categories: Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), months };
  }, [data, from, to]);
  const visibleCategories = categoryFilter === 'Todas' ? financeBreakdown.categories : financeBreakdown.categories.filter((category) => category.name === categoryFilter);
  const chartMaximum = Math.max(1, ...financeBreakdown.months.flatMap((month) => [month.income, month.expense]));

  const exportCsv = async () => {
    if (!report.length) return;
    setBusy(true); setError('');
    const content = [['Relatório Oficina Inteligente', 'Valor'], ...report].map((row) => row.map((cell) => `"${cell.replaceAll('"','""')}"`).join(';')).join('\r\n');
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `relatorio-oficina-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(link.href);
      } else if (Platform.OS !== 'windows') await Share.share({ title: 'Relatório Oficina Inteligente', message: content });
      else setError('A exportação de planilhas pelo aplicativo de computador ainda não está disponível. Abra a versão no navegador para exportar o resumo.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível exportar o relatório.'); }
    finally { setBusy(false); }
  };

  const exportPdf = async () => {
    if (!report.length) return;
    setBusy(true); setError('');
    try {
      const settings = await getWorkshopSettings(workshopId);
      await openPrintableDocument('Relatório operacional', settings.name || workshopName, report.map(([label, value]) => ({ label, value })), `Período: ${from} a ${to}`, settings.logo_url);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o documento.'); }
    finally { setBusy(false); }
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Relatórios</Text><Text style={styles.subtitle}>Indicadores calculados a partir dos registros salvos. O período filtra movimentações; cadastros e posição de estoque mostram o estado atual.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.card}><Text style={styles.section}>Período</Text><View style={styles.row}><View style={styles.half}><FormField label="De" value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD" /></View><View style={styles.half}><FormField label="Até" value={to} onChangeText={setTo} placeholder="AAAA-MM-DD" /></View></View><View style={styles.exportActions}><Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.exportButton]} onPress={() => { exportCsv().catch(() => undefined); }}><Text style={styles.buttonText}>{busy ? 'Preparando…' : 'Exportar resumo CSV'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Gerar documento do relatório" disabled={busy} style={[styles.button, styles.exportButton, styles.pdfButton]} onPress={() => { exportPdf().catch(() => undefined); }}><Text style={styles.buttonText}>{busy ? 'Preparando…' : Platform.OS === 'web' ? 'Imprimir / salvar PDF' : 'Compartilhar relatório'}</Text></Pressable>{canLoadProductivity ? <Pressable accessibilityRole="button" accessibilityLabel="Atualizar produtividade" disabled={busy} style={[styles.button, styles.exportButton]} onPress={() => { loadProductivity().catch(() => undefined); }}><Text style={styles.buttonText}>{busy ? 'Carregando…' : 'Atualizar produtividade'}</Text></Pressable> : null}</View></View>
    <View style={styles.grid}>{report.map(([label, value]) => <View key={label} style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>)}</View>
    {financeBreakdown.months.length ? <View style={styles.card}><Text style={styles.section}>Recebimentos e despesas por mês</Text><View style={styles.legend}><Text style={styles.legendIncome}>■ Recebido</Text><Text style={styles.legendExpense}>■ Despesas pagas</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartRow}>{financeBreakdown.months.map((month) => <View key={month.label} style={styles.chartMonth}><View style={styles.bars}><View style={[styles.bar, styles.barIncome, { height: Math.max(3, 76 * month.income / chartMaximum) }]} /><View style={[styles.bar, styles.barExpense, { height: Math.max(3, 76 * month.expense / chartMaximum) }]} /></View><Text style={styles.chartLabel}>{month.label}</Text></View>)}</ScrollView></View> : null}
    {financeBreakdown.categories.length ? <View style={styles.card}><Text style={styles.section}>Financeiro por categoria</Text><View style={styles.chips}>{['Todas', ...financeBreakdown.categories.map((category) => category.name)].map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: categoryFilter === category }} style={[styles.chip, categoryFilter === category && styles.chipSelected]} onPress={() => setCategoryFilter(category)}><Text style={[styles.chipText, categoryFilter === category && styles.chipTextSelected]}>{category}</Text></Pressable>)}</View>{visibleCategories.map((category) => <View key={category.name} style={styles.categoryRow}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.categoryAmount}>Entradas {money(category.income)} · Saídas {money(category.expense)}</Text></View>)}</View> : null}
    {!report.length ? <Text style={styles.muted}>Sem dados para as permissões deste usuário.</Text> : null}
    <Text style={styles.disclaimer}>O resultado realizado é uma visão operacional de recebimentos e despesas pagos. Não substitui conciliação bancária, contabilidade ou apuração fiscal.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { paddingVertical: 22, paddingBottom: 35, gap: 12 }, loading: { marginTop: 34 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#718197', fontSize: 12, lineHeight: 18 }, card: { padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff', gap: 7 }, section: { color: '#10243a', fontSize: 14, fontWeight: '800' }, row: { flexDirection: 'row', gap: 9 }, half: { flex: 1 }, exportActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, exportButton: { flexGrow: 1, flexBasis: '45%' }, pdfButton: { backgroundColor: '#e97824' }, button: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, buttonText: { color: '#fff', fontSize: 11, fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, metric: { flexGrow: 1, flexBasis: '30%', minWidth: 130, padding: 12, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 11, backgroundColor: '#fff' }, metricValue: { color: '#10243a', fontSize: 15, fontWeight: '800' }, metricLabel: { marginTop: 5, color: '#718197', fontSize: 10 }, legend: { flexDirection: 'row', gap: 16 }, legendIncome: { color: '#36764c', fontSize: 10, fontWeight: '700' }, legendExpense: { color: '#e97824', fontSize: 10, fontWeight: '700' }, chartRow: { gap: 12, paddingVertical: 4 }, chartMonth: { width: 54, alignItems: 'center', justifyContent: 'flex-end' }, bars: { height: 82, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }, bar: { width: 16, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, barIncome: { backgroundColor: '#36764c' }, barExpense: { backgroundColor: '#e97824' }, chartLabel: { marginTop: 5, color: '#718197', fontSize: 9 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#dae2ea', borderRadius: 8 }, chipSelected: { borderColor: '#10243a', backgroundColor: '#10243a' }, chipText: { color: '#41546a', fontSize: 10 }, chipTextSelected: { color: '#fff', fontWeight: '700' }, categoryRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#edf0f4' }, categoryName: { color: '#20354b', fontSize: 11, fontWeight: '700' }, categoryAmount: { marginTop: 3, color: '#718197', fontSize: 10 }, muted: { color: '#718197', fontSize: 11 }, disclaimer: { color: '#8a98a9', fontSize: 10, lineHeight: 15 }, error: { color: '#a23d33', fontSize: 12 } });
