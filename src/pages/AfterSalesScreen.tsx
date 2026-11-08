import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { completeMaintenanceReminder, createMaintenanceReminder, createServiceWarranty, getWorkshopPermissions, getWorkshopSettings, listMaintenanceReminders, listServiceOrderItems, listServiceOrders, listServiceWarranties, listVehicles } from '../services/workshopData';
import type { MaintenanceReminder, ServiceOrder, ServiceWarranty, Vehicle } from '../types/workshop';
import { formatLocalDate } from '../utils/date';
import { openPrintableDocument } from '../utils/printDocument';

const today = formatLocalDate(new Date());
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const compactSearchKey = (value: string) => searchKey(value).replace(/[^a-z0-9]/g, '');
const matchesSearch = (value: string, query: string, compactQuery: string) => searchKey(value).includes(query) || (!!compactQuery && compactSearchKey(value).includes(compactQuery));
export default function AfterSalesScreen({ workshopId, workshopName }: { workshopId: string; workshopName: string }) {
  const [reminders, setReminders] = useState<MaintenanceReminder[]>([]);
  const [warranties, setWarranties] = useState<ServiceWarranty[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [canView, setCanView] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueKm, setDueKm] = useState('');
  const [orderId, setOrderId] = useState('');
  const [warrantySearch, setWarrantySearch] = useState('');
  const [warrantyRecordsSearch, setWarrantyRecordsSearch] = useState('');
  const [warrantyTitle, setWarrantyTitle] = useState('');
  const [days, setDays] = useState('90');
  const [conditions, setConditions] = useState('');
  const refresh = useCallback(async () => {
    try {
      const permissions = await getWorkshopPermissions(workshopId);
      const access = permissions.after_sales ?? { view: false, create: false, update: false, delete: false };
      setCanView(access.view); setCanCreate(access.create); setCanUpdate(access.update);
      if (!access.view) {
        setReminders([]); setWarranties([]); setVehicles([]); setOrders([]);
        return;
      }
      const [reminderRows, warrantyRows, vehicleRows, orderRows] = await Promise.all([
        listMaintenanceReminders(workshopId), listServiceWarranties(workshopId, undefined, true), listVehicles(workshopId), listServiceOrders(workshopId, undefined, true),
      ]);
      setReminders(reminderRows); setWarranties(warrantyRows); setVehicles(vehicleRows); setOrders(orderRows);
      setVehicleId((current) => current || vehicleRows[0]?.id || '');
      setOrderId((current) => current && orderRows.some((order) => order.id === current && (order.status === 'completed' || order.status === 'delivered')) ? current : '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar garantias e lembretes.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['customers', 'vehicles', 'service_orders', 'maintenance_reminders', 'service_warranties'], refresh);
  const eligibleOrders = useMemo(() => orders.filter((order) => order.status === 'completed' || order.status === 'delivered'), [orders]);
  const matchingWarrantyOrders = useMemo(() => {
    const query = searchKey(warrantySearch);
    const compactQuery = compactSearchKey(warrantySearch);
    if (!query) return [];
    return eligibleOrders.filter((order) => [String(order.order_number), `OS ${order.order_number}`, order.vehicles?.plate ?? '', order.customers?.full_name ?? '', order.customers?.document ?? '']
      .some((value) => matchesSearch(value, query, compactQuery)));
  }, [eligibleOrders, warrantySearch]);
  const matchingWarrantyRecords = useMemo(() => {
    const query = searchKey(warrantyRecordsSearch);
    const compactQuery = compactSearchKey(warrantyRecordsSearch);
    if (!query) return warranties;
    return warranties.filter((warranty) => [String(warranty.service_orders?.order_number ?? ''), `OS ${warranty.service_orders?.order_number ?? ''}`, warranty.service_orders?.vehicles?.plate ?? '', warranty.service_orders?.customers?.full_name ?? '', warranty.service_orders?.customers?.document ?? '']
      .some((value) => matchesSearch(value, query, compactQuery)));
  }, [warranties, warrantyRecordsSearch]);
  const selectedWarrantyOrder = eligibleOrders.find((order) => order.id === orderId) ?? null;
  const perform = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const addReminder = () => perform(async () => {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) throw new Error('Selecione um veículo ativo.');
    await createMaintenanceReminder(workshopId, vehicle.id, vehicle.customer_id, title, dueDate, dueKm ? Number(dueKm) : null, ''); setTitle(''); setDueDate(''); setDueKm('');
  });
  const addWarranty = () => perform(async () => {
    await createServiceWarranty(workshopId, orderId, warrantyTitle, today, Number(days), conditions); setWarrantyTitle(''); setConditions('');
  });
  const printVehicleHistory = async (vehicle: Vehicle) => {
    setBusy(true); setError('');
    try {
      const [settings, customerOrders] = await Promise.all([
        getWorkshopSettings(workshopId), Promise.resolve(orders.filter((order) => order.vehicle_id === vehicle.id)),
      ]);
      const orderItems = await Promise.all(customerOrders.map((order) => listServiceOrderItems(workshopId, order.id)));
      const rows = [
        { label: 'Oficina', value: settings.name || workshopName },
        { label: 'Cliente', value: vehicle.customers?.full_name ?? '—' },
        { label: 'Veículo', value: `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` },
        { label: 'Ano / quilometragem atual', value: [vehicle.model_year, vehicle.mileage_km !== null ? `${vehicle.mileage_km.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' · ') || '—' },
        ...customerOrders.flatMap((order, index) => [
          { label: `OS #${order.order_number} · ${new Date(order.opened_at).toLocaleDateString('pt-BR')} · ${order.status}`, value: order.complaint || 'Sem relato registrado' },
          ...(order.diagnosis ? [{ label: `Diagnóstico da OS #${order.order_number}`, value: order.diagnosis }] : []),
          ...orderItems[index].map((item) => ({ label: `${item.item_type === 'labor' ? 'Serviço' : 'Peça'} da OS #${order.order_number}: ${item.description}`, value: `${item.quantity} × R$ ${Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` })),
          { label: `Total da OS #${order.order_number}`, value: `R$ ${Number(order.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
        ]),
        ...warranties.filter((warranty) => orders.find((order) => order.id === warranty.service_order_id)?.vehicle_id === vehicle.id).map((warranty) => ({ label: `Garantia · ${warranty.description} · até ${new Date(`${warranty.ends_on}T12:00:00`).toLocaleDateString('pt-BR')}`, value: warranty.conditions || 'Condições não informadas' })),
        ...reminders.filter((reminder) => reminder.vehicle_id === vehicle.id).map((reminder) => ({ label: `Lembrete · ${reminder.title}`, value: `Data ${reminder.due_date ?? '—'} · KM ${reminder.due_odometer_km ?? '—'}${reminder.completed_at ? ' · concluído' : ''}` })),
      ];
      await openPrintableDocument('Histórico de manutenção do veículo', settings.name || workshopName, rows, undefined, settings.logo_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o histórico do veículo.'); }
    finally { setBusy(false); }
  };
  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  if (!canView) return <View style={styles.page}><Text style={styles.title}>Pós-venda</Text><Text style={styles.error}>O proprietário ainda não autorizou seu acesso a esta área.</Text></View>;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Pós-venda</Text><Text style={styles.subtitle}>Garantias de OS concluídas e lembretes de manutenção por veículo.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {canCreate ? <View style={styles.card}><Text style={styles.section}>Novo lembrete</Text>
      <Text style={styles.label}>Veículo</Text><View style={styles.chips}>{vehicles.map((vehicle) => <Pressable key={vehicle.id} style={[styles.chip, vehicleId === vehicle.id && styles.active]} onPress={() => setVehicleId(vehicle.id)}><Text style={styles.chipText}>{vehicle.make} {vehicle.model} · {vehicle.plate}</Text></Pressable>)}</View>
      <FormField label="Manutenção" required value={title} onChangeText={setTitle} placeholder="Troca de óleo, filtros, revisão…" />
      <View style={styles.row}><View style={styles.half}><FormField label="Data (AAAA-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="2027-01-31" /></View><View style={styles.half}><FormField label="Quilometragem" value={dueKm} onChangeText={setDueKm} keyboardType="number-pad" /></View></View>
      <Pressable disabled={busy || !vehicleId} style={[styles.button, busy && styles.disabled]} onPress={addReminder}><Text style={styles.buttonText}>Salvar lembrete</Text></Pressable>
    </View> : null}
    <View style={styles.card}><Text style={styles.section}>Lembretes</Text>
      {reminders.map((reminder) => <View key={reminder.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{reminder.title} · {reminder.vehicles?.plate}</Text><Text style={styles.muted}>Data {reminder.due_date ?? '—'} · KM {reminder.due_odometer_km ?? '—'}{reminder.completed_at ? ' · Concluído' : ''}</Text></View>{canUpdate && !reminder.completed_at ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => perform(() => completeMaintenanceReminder(workshopId, reminder.id))}><Text style={styles.buttonText}>Concluir</Text></Pressable> : null}</View>)}
      {!reminders.length ? <Text style={styles.muted}>Nenhum lembrete registrado.</Text> : null}
    </View>
    <View style={styles.card}><Text style={styles.section}>Histórico de manutenção</Text><Text style={styles.muted}>Gere um documento com as ordens, serviços, garantias e lembretes vinculados ao veículo.</Text>
      {vehicles.map((vehicle) => <View key={vehicle.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{vehicle.make} {vehicle.model} · {vehicle.plate}</Text><Text style={styles.muted}>{vehicle.customers?.full_name ?? 'Cliente'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Gerar histórico ${vehicle.plate}`} disabled={busy} style={styles.smallButton} onPress={() => { printVehicleHistory(vehicle).catch(() => undefined); }}><Text style={styles.buttonText}>{Platform.OS === 'web' ? 'PDF' : 'Compartilhar'}</Text></Pressable></View>)}
      {!vehicles.length ? <Text style={styles.muted}>Cadastre veículos para consultar seus históricos.</Text> : null}
    </View>
    {canCreate ? <View style={styles.card}><Text style={styles.section}>Registrar garantia</Text>
      <FormField label="Pesquisar por placa, proprietário, CPF ou número da OS" value={warrantySearch} onChangeText={(value) => { setWarrantySearch(value); setOrderId(''); }} placeholder="Digite a placa, o nome, o CPF ou a OS" />
      {selectedWarrantyOrder ? <Text style={styles.selectedOrder}>OS selecionada: #{selectedWarrantyOrder.order_number} · {selectedWarrantyOrder.customers?.full_name ?? 'Proprietário'} · {selectedWarrantyOrder.vehicles?.plate ?? 'Sem placa'}</Text> : null}
      <View style={styles.chips}>{matchingWarrantyOrders.slice(0, 30).map((order) => <Pressable key={order.id} accessibilityRole="button" accessibilityState={{ selected: orderId === order.id }} style={[styles.chip, orderId === order.id && styles.active]} onPress={() => setOrderId(order.id)}><Text style={styles.chipText}>OS #{order.order_number} · {order.vehicles?.plate} · {order.customers?.full_name}</Text></Pressable>)}</View>
      {!warrantySearch.trim() ? <Text style={styles.muted}>Pesquise pela placa, pelo proprietário, pelo CPF ou pelo número da OS para localizar uma OS concluída ou entregue.</Text> : null}
      {warrantySearch.trim() && !matchingWarrantyOrders.length ? <Text style={styles.muted}>Nenhuma OS concluída ou entregue encontrada com esses dados.</Text> : null}
      {matchingWarrantyOrders.length > 30 ? <Text style={styles.muted}>Mostrando 30 resultados. Digite mais dados para refinar a pesquisa.</Text> : null}
      {!eligibleOrders.length ? <Text style={styles.muted}>Não há OS concluída ou entregue disponível para garantia.</Text> : null}
      <FormField label="Serviço coberto" required value={warrantyTitle} onChangeText={setWarrantyTitle} />
      <View style={styles.row}><View style={styles.half}><FormField label="Prazo (dias)" required value={days} onChangeText={setDays} keyboardType="number-pad" /></View><View style={styles.half}><Text style={styles.label}>Início</Text><Text style={styles.itemTitle}>{new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR')}</Text></View></View>
      <FormField label="Condições" value={conditions} onChangeText={setConditions} multiline />
      <Pressable disabled={busy || !orderId} style={[styles.button, busy && styles.disabled]} onPress={addWarranty}><Text style={styles.buttonText}>Salvar garantia</Text></Pressable>
    </View> : null}
    <View style={styles.card}><Text style={styles.section}>Garantias</Text>
      <FormField label="Pesquisar garantia por placa, proprietário, CPF ou número da OS" value={warrantyRecordsSearch} onChangeText={setWarrantyRecordsSearch} placeholder="Digite a placa, o nome, o CPF ou a OS" />
      {matchingWarrantyRecords.map((warranty) => <View key={warranty.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{warranty.description} · OS #{warranty.service_orders?.order_number}</Text><Text style={styles.muted}>{warranty.service_orders?.customers?.full_name} · {warranty.service_orders?.vehicles?.plate} · até {new Date(`${warranty.ends_on}T12:00:00`).toLocaleDateString('pt-BR')}</Text><Text style={styles.muted}>{warranty.voided_at ? 'Cancelada' : warranty.ends_on < today ? 'Vencida' : 'Vigente'}{warranty.conditions ? ` · ${warranty.conditions}` : ''}</Text></View></View>)}
      {warranties.length > 0 && warrantyRecordsSearch.trim() && !matchingWarrantyRecords.length ? <Text style={styles.muted}>Nenhuma garantia encontrada com esses dados.</Text> : null}
      {!warranties.length ? <Text style={styles.muted}>Nenhuma garantia cadastrada.</Text> : null}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { paddingVertical: 20, paddingBottom: 36, gap: 11 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#718197', fontSize: 11, lineHeight: 17 }, card: { padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff', gap: 8 }, section: { color: '#10243a', fontSize: 15, fontWeight: '800' }, label: { color: '#52657a', fontSize: 10, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { padding: 8, borderWidth: 1, borderColor: '#dae2ea', borderRadius: 8 }, active: { borderColor: '#e97824', backgroundColor: '#fff4eb' }, chipText: { color: '#41546a', fontSize: 10 }, selectedOrder: { color: '#315a80', fontSize: 11, fontWeight: '700', lineHeight: 16 }, row: { flexDirection: 'row', gap: 8 }, half: { flex: 1 }, button: { minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#10243a' }, buttonText: { color: '#fff', fontSize: 10, fontWeight: '700' }, disabled: { opacity: 0.5 }, listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#edf0f4' }, flex: { flex: 1 }, itemTitle: { color: '#20354b', fontSize: 11, fontWeight: '700' }, muted: { color: '#7b8999', fontSize: 10, lineHeight: 15 }, smallButton: { padding: 8, borderRadius: 7, backgroundColor: '#e97824' }, loading: { marginTop: 30 }, error: { color: '#a23d33', fontSize: 12 } });
