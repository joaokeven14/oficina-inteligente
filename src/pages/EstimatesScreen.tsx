import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { convertEstimate, createEstimate, getWorkshopPermissions, getWorkshopSettings, listCustomers, listEstimateItems, listEstimates, listVehicles, reviewEstimate } from '../services/workshopData';
import type { Customer, Estimate, EstimateItemInput, Vehicle } from '../types/workshop';
import { formatLocalDate } from '../utils/date';
import { openPrintableDocument } from '../utils/printDocument';

const money = (amount: number | string) => `R$ ${Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const today = formatLocalDate(new Date());
export default function EstimatesScreen({ workshopId }: { workshopId: string }) {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canConvert, setCanConvert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [itemType, setItemType] = useState<'part' | 'labor'>('labor');
  const [itemDescription, setItemDescription] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [items, setItems] = useState<EstimateItemInput[]>([]);
  const refresh = useCallback(async () => {
    try {
      const [rows, customerRows, vehicleRows, permissions] = await Promise.all([listEstimates(workshopId), listCustomers(workshopId), listVehicles(workshopId), getWorkshopPermissions(workshopId)]);
      setEstimates(rows); setCustomers(customerRows); setVehicles(vehicleRows); setCanCreate(permissions.estimates.create); setCanUpdate(permissions.estimates.update); setCanConvert(permissions.service_orders.create);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os orçamentos.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);
  const availableVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.customer_id === customerId), [vehicles, customerId]);
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  const total = Math.max(0, subtotal - Number(discount.replace(',', '.')) || 0);
  const beginCreate = () => { setCustomerId(''); setVehicleId(''); setComplaint(''); setValidUntil(''); setDiscount('0'); setItems([]); setError(''); setCreating(true); };
  const addItem = () => {
    const quantity = Number(itemQuantity.replace(',', '.')); const unitPrice = Number(itemPrice.replace(',', '.'));
    if (!itemDescription.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) { setError('Preencha a descrição, quantidade e valor do item.'); return; }
    setItems((current) => [...current, { item_type: itemType, description: itemDescription.trim(), quantity, unit_price: unitPrice }]);
    setItemDescription(''); setItemQuantity('1'); setItemPrice(''); setError('');
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await createEstimate(workshopId, customerId, vehicleId, validUntil, complaint, '', Number(discount.replace(',', '.')), items); setCreating(false); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o orçamento.'); }
    finally { setBusy(false); }
  };
  const act = async (estimate: Estimate, action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const printEstimate = async (estimate: Estimate) => {
    setBusy(true); setError('');
    try {
      const [settings, estimateItems] = await Promise.all([getWorkshopSettings(workshopId), listEstimateItems(workshopId, estimate.id)]);
      const rows = [
        { label: 'Orçamento', value: `#${estimate.estimate_number} · ${statusLabel(estimate)}` },
        { label: 'Data', value: new Date(estimate.created_at).toLocaleDateString('pt-BR') },
        { label: 'Validade', value: estimate.valid_until ? new Date(`${estimate.valid_until}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo' },
        { label: 'Cliente', value: estimate.customers?.full_name ?? '—' },
        { label: 'Veículo', value: `${estimate.vehicles?.make ?? ''} ${estimate.vehicles?.model ?? ''} · ${estimate.vehicles?.plate ?? ''}`.trim() },
        { label: 'Solicitação', value: estimate.complaint },
        ...estimateItems.map((item, index) => ({ label: `${item.item_type === 'labor' ? 'Serviço' : 'Peça'} ${index + 1}: ${item.description}`, value: `${item.quantity} × ${money(item.unit_price)} = ${money(item.line_total)}` })),
        { label: 'Subtotal', value: money(estimate.items_subtotal) },
        { label: 'Desconto', value: money(estimate.discount) },
        { label: 'Total estimado', value: money(estimate.total_amount) },
        { label: 'Condição', value: 'Serviços sujeitos à autorização do cliente e à disponibilidade das peças.' },
      ];
      const workshopDetails = [settings.name, settings.cnpj ? `CNPJ ${settings.cnpj}` : '', settings.phone ?? '', settings.whatsapp ? `WhatsApp ${settings.whatsapp}` : '', settings.address ?? '', [settings.city, settings.state].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
      await openPrintableDocument(`Orçamento #${estimate.estimate_number}`, workshopDetails, rows, undefined, settings.logo_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o orçamento.'); }
    finally { setBusy(false); }
  };
  const statusLabel = (estimate: Estimate) => estimate.status === 'pending' && estimate.valid_until && estimate.valid_until < today ? 'Vencido' : ({ pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', expired: 'Expirado', converted: 'Convertido' }[estimate.status]);
  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.flex}><Text style={styles.title}>Orçamentos</Text><Text style={styles.subtitle}>Valores e conversão calculados pelo banco.</Text></View>{canCreate ? <Pressable style={styles.primary} onPress={beginCreate}><Text style={styles.primaryText}>+ Novo</Text></Pressable> : null}</View>
    {error && !creating ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : <ScrollView contentContainerStyle={styles.list}>
      {estimates.map((estimate) => <View key={estimate.id} style={styles.card}>
        <View style={styles.row}><Text style={styles.number}>Orçamento #{estimate.estimate_number}</Text><Text style={[styles.badge, estimate.status === 'approved' ? styles.good : null]}>{statusLabel(estimate)}</Text></View>
        <Text style={styles.name}>{estimate.customers?.full_name ?? 'Cliente'} · {estimate.vehicles?.make} {estimate.vehicles?.model} · {estimate.vehicles?.plate}</Text>
        <Text style={styles.muted}>{estimate.complaint}</Text><Text style={styles.total}>{money(estimate.total_amount)}</Text>
        <Text style={styles.muted}>Validade: {estimate.valid_until ? new Date(`${estimate.valid_until}T12:00:00`).toLocaleDateString('pt-BR') : 'sem prazo'}</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.documentButton} onPress={() => { printEstimate(estimate).catch(() => undefined); }}><Text style={styles.documentButtonText}>{Platform.OS === 'web' ? 'Imprimir / salvar orçamento em PDF' : 'Compartilhar orçamento'}</Text></Pressable>
        {canUpdate && estimate.status === 'pending' && !(estimate.valid_until && estimate.valid_until < today) ? <View style={styles.actions}><Pressable disabled={busy} style={styles.approve} onPress={() => act(estimate, () => reviewEstimate(workshopId, estimate.id, 'approved'))}><Text style={styles.actionText}>Aprovar</Text></Pressable><Pressable disabled={busy} style={styles.reject} onPress={() => act(estimate, () => reviewEstimate(workshopId, estimate.id, 'rejected'))}><Text style={styles.rejectText}>Rejeitar</Text></Pressable></View> : null}
        {canUpdate && canConvert && estimate.status === 'approved' ? <Pressable disabled={busy} style={styles.primary} onPress={() => act(estimate, async () => { await convertEstimate(workshopId, estimate.id); Alert.alert('Orçamento convertido', 'A ordem de serviço foi criada com os mesmos itens e valores.'); })}><Text style={styles.primaryText}>Converter em ordem de serviço</Text></Pressable> : null}
        {estimate.status === 'converted' ? <Text style={styles.muted}>Ordem de serviço vinculada: {estimate.converted_order_id}</Text> : null}
      </View>)}
      {!estimates.length ? <View style={styles.empty}><Text style={styles.name}>Nenhum orçamento cadastrado</Text><Text style={styles.muted}>Crie uma proposta vinculada a um cliente e veículo.</Text></View> : null}
    </ScrollView>}
    <Modal visible={creating} animationType="slide" onRequestClose={() => { if (!busy) setCreating(false); }}>
      <View style={styles.modal}><View style={styles.modalHead}><Text style={styles.title}>Novo orçamento</Text><Pressable onPress={() => { if (!busy) setCreating(false); }}><Text style={styles.close}>Fechar</Text></Pressable></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Cliente</Text><View style={styles.choices}>{customers.map((customer) => <Pressable key={customer.id} style={[styles.choice, customerId === customer.id && styles.choiceSelected]} onPress={() => { setCustomerId(customer.id); setVehicleId(''); }}><Text style={styles.choiceText}>{customer.full_name}</Text></Pressable>)}</View>
          <Text style={styles.label}>Veículo</Text><View style={styles.choices}>{availableVehicles.map((vehicle) => <Pressable key={vehicle.id} style={[styles.choice, vehicleId === vehicle.id && styles.choiceSelected]} onPress={() => setVehicleId(vehicle.id)}><Text style={styles.choiceText}>{vehicle.make} {vehicle.model} · {vehicle.plate}</Text></Pressable>)}</View>
          <FormField label="Reclamação ou serviço solicitado" required value={complaint} onChangeText={setComplaint} multiline />
          <FormField label="Válido até (AAAA-MM-DD)" value={validUntil} onChangeText={setValidUntil} placeholder="2026-12-31" />
          <View style={styles.itemBox}><Text style={styles.label}>Itens do orçamento</Text><View style={styles.actions}><Pressable style={[styles.choice, itemType === 'labor' && styles.choiceSelected]} onPress={() => setItemType('labor')}><Text style={styles.choiceText}>Mão de obra</Text></Pressable><Pressable style={[styles.choice, itemType === 'part' && styles.choiceSelected]} onPress={() => setItemType('part')}><Text style={styles.choiceText}>Peça</Text></Pressable></View>
            <FormField label="Descrição" value={itemDescription} onChangeText={setItemDescription} /><View style={styles.actions}><View style={styles.half}><FormField label="Quantidade" value={itemQuantity} onChangeText={setItemQuantity} keyboardType="decimal-pad" /></View><View style={styles.half}><FormField label="Valor unitário" value={itemPrice} onChangeText={setItemPrice} keyboardType="decimal-pad" /></View><Pressable style={styles.add} onPress={addItem}><Text style={styles.actionText}>Adicionar</Text></Pressable></View>
            {items.map((item, index) => <View key={`${item.description}-${index}`} style={styles.itemLine}><Text style={styles.muted}>{item.description} · {item.quantity} × {money(item.unit_price)}</Text><Pressable onPress={() => setItems((current) => current.filter((_, i) => i !== index))}><Text style={styles.remove}>Remover</Text></Pressable></View>)}
          </View>
          <FormField label="Desconto (R$)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
          <Text style={styles.total}>Total estimado: {money(total)}</Text>
          <Pressable disabled={busy} style={[styles.primary, styles.save, busy && styles.disabled]} onPress={save}><Text style={styles.primaryText}>{busy ? 'Salvando…' : 'Salvar orçamento'}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, paddingTop: 20 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { marginTop: 4, color: '#718197', fontSize: 11 }, primary: { minHeight: 39, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, primaryText: { color: '#fff', fontSize: 11, fontWeight: '700' }, documentButton: { minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e97824' }, documentButtonText: { color: '#fff', fontSize: 10, fontWeight: '700' }, loading: { marginTop: 30 }, list: { paddingVertical: 12, paddingBottom: 30, gap: 9 }, card: { padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff', gap: 6 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, number: { color: '#23415e', fontSize: 12, fontWeight: '800' }, badge: { padding: 5, borderRadius: 7, backgroundColor: '#fff2e8', color: '#ad5716', fontSize: 9, fontWeight: '700' }, good: { backgroundColor: '#e9f5ed', color: '#36764c' }, name: { color: '#1a2c40', fontSize: 12, fontWeight: '700' }, muted: { color: '#77879a', fontSize: 10, lineHeight: 15 }, total: { marginTop: 4, color: '#10243a', fontSize: 16, fontWeight: '900' }, actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }, approve: { padding: 9, borderRadius: 8, backgroundColor: '#36764c' }, reject: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d6a09a' }, rejectText: { color: '#9d4b3c', fontSize: 10, fontWeight: '700' }, actionText: { color: '#fff', fontSize: 10, fontWeight: '700' }, empty: { padding: 18, alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 12 }, error: { marginTop: 8, color: '#a23d33', fontSize: 12 }, modal: { flex: 1, paddingTop: 25, paddingHorizontal: 18, backgroundColor: '#f4f7fb' }, modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, close: { color: '#315a80', fontSize: 12, fontWeight: '700' }, form: { paddingVertical: 12, paddingBottom: 35, gap: 5 }, label: { marginTop: 8, color: '#33465b', fontSize: 11, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, choice: { padding: 8, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff' }, choiceSelected: { borderColor: '#e97824', backgroundColor: '#fff4eb' }, choiceText: { color: '#43566d', fontSize: 10 }, itemBox: { marginTop: 10, padding: 12, backgroundColor: '#fff', borderRadius: 11, borderWidth: 1, borderColor: '#e1e8ef' }, half: { flex: 1 }, add: { alignSelf: 'flex-end', padding: 10, borderRadius: 8, backgroundColor: '#e97824' }, itemLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }, remove: { color: '#a23d33', fontSize: 10 }, save: { marginTop: 12, minHeight: 45 }, disabled: { opacity: 0.5 } });
