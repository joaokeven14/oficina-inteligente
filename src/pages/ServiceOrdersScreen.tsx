import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import ServiceOrderInspectionPanel from './ServiceOrderInspectionPanel';
import ServiceOrderAuthorizationPanel from './ServiceOrderAuthorizationPanel';
import ServiceOrderAttachmentsPanel from './ServiceOrderAttachmentsPanel';
import { openPrintableDocument } from '../utils/printDocument';
import {
  archiveServiceOrderItem,
  createServiceOrder,
  createServiceOrderItem,
  getWorkshopPermissions,
  getWorkshopSettings,
  getMyActiveServiceOrderTimer,
  listInventoryProducts,
  listCustomers,
  listServiceOrderItems,
  listServiceOrderInspection,
  listServiceOrderTechnicalNotes,
  listServiceOrderAuthorizations,
  listServiceOrders,
  listVehicles,
  listWorkshopEmployees,
  serviceOrderStatuses,
  startServiceOrderTimer,
  stopServiceOrderTimer,
  updateServiceOrder,
} from '../services/workshopData';
import type { Customer, InventoryProduct, ServiceOrder, ServiceOrderItem, ServiceOrderStatus, ServiceOrderTimeEntry, Vehicle, WorkshopEmployee } from '../types/workshop';

const money = (value: number | string) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const openedDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');
const statusLabel = (value: ServiceOrderStatus) => serviceOrderStatuses.find((status) => status.value === value)?.label ?? value;
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const compactSearchKey = (value: string) => searchKey(value).replace(/[^a-z0-9]/g, '');

export default function ServiceOrdersScreen({ workshopId }: { workshopId: string }) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);
  const [employees, setEmployees] = useState<WorkshopEmployee[]>([]);
  const [canViewInventory, setCanViewInventory] = useState(false);
  const [canUseInventory, setCanUseInventory] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [items, setItems] = useState<ServiceOrderItem[]>([]);
  const [activeTimer, setActiveTimer] = useState<ServiceOrderTimeEntry | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleCustomerSearch, setVehicleCustomerSearch] = useState('');
  const [vehicleCustomerPickerOpen, setVehicleCustomerPickerOpen] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [odometer, setOdometer] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [discountValue, setDiscountValue] = useState('0');
  const [itemType, setItemType] = useState<'part' | 'labor'>('labor');
  const [itemDescription, setItemDescription] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [orderRows, customerRows, vehicleRows, access] = await Promise.all([
        listServiceOrders(workshopId), listCustomers(workshopId), listVehicles(workshopId), getWorkshopPermissions(workshopId),
      ]);
      const stockRows = access.inventory.view ? await listInventoryProducts(workshopId) : [];
      const employeeRows = access.employees.view ? await listWorkshopEmployees(workshopId) : [];
      setOrders(orderRows);
      setCustomers(customerRows);
      setVehicles(vehicleRows);
      setInventoryProducts(stockRows);
      setEmployees(employeeRows.filter((employee) => employee.status === 'active'));
      setCanViewInventory(access.inventory.view);
      setCanUseInventory(access.inventory.create);
      setCanCreate(access.service_orders.create);
      setCanUpdate(access.service_orders.update);
      setCanDelete(access.service_orders.delete);
      setSelectedOrder((current) => current ? orderRows.find((order) => order.id === current.id) ?? current : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as ordens de serviço.'); }
    finally { setLoading(false); }
  }, [workshopId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!selectedOrder) { setItems([]); setActiveTimer(null); return () => { active = false; }; }
    Promise.all([listServiceOrderItems(workshopId, selectedOrder.id), getMyActiveServiceOrderTimer(workshopId, selectedOrder.id)])
      .then(([rows, timer]) => { if (active) { setItems(rows); setActiveTimer(timer); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os itens da ordem.'); });
    setDiagnosis(selectedOrder.diagnosis);
    setDiscountValue(String(selectedOrder.discount));
    setSelectedMembershipId(selectedOrder.assigned_membership_id ?? '');
    return () => { active = false; };
  }, [selectedOrder, workshopId]);

  const toggleTimer = async () => {
    if (!selectedOrder || !canUpdate) return;
    setBusy(true); setError('');
    try {
      if (activeTimer) await stopServiceOrderTimer(workshopId, selectedOrder.id);
      else await startServiceOrderTimer(workshopId, selectedOrder.id);
      setActiveTimer(await getMyActiveServiceOrderTimer(workshopId, selectedOrder.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o cronômetro.'); }
    finally { setBusy(false); }
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return orders;
    return orders.filter((order) => [String(order.order_number), order.customers?.full_name, order.vehicles?.plate, order.vehicles?.make, order.vehicles?.model]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [orders, query]);

  const customersById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const selectedOrderVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const selectedCustomer = customersById.get(selectedCustomerId) ?? null;
  const matchingOrderVehicles = useMemo(() => {
    const query = searchKey(vehicleCustomerSearch);
    const compactQuery = compactSearchKey(vehicleCustomerSearch);
    const documentDigits = vehicleCustomerSearch.replace(/\D/g, '');
    if (!query) return vehicles;
    return vehicles.filter((vehicle) => {
      const customer = customersById.get(vehicle.customer_id);
      const fields = [vehicle.plate, vehicle.make, vehicle.model, customer?.full_name ?? ''];
      const textMatch = fields.some((value) => searchKey(value).includes(query) || (compactQuery && compactSearchKey(value).includes(compactQuery)));
      const document = customer?.document?.replace(/\D/g, '') ?? '';
      return textMatch || (documentDigits.length > 0 && document.includes(documentDigits));
    });
  }, [customersById, vehicleCustomerSearch, vehicles]);
  const customersWithoutVehicles = useMemo(() => {
    const query = searchKey(vehicleCustomerSearch);
    const documentDigits = vehicleCustomerSearch.replace(/\D/g, '');
    if (!query) return [];
    const customersWithVehicle = new Set(vehicles.map((vehicle) => vehicle.customer_id));
    return customers.filter((customer) => {
      if (customersWithVehicle.has(customer.id)) return false;
      const nameMatch = searchKey(customer.full_name).includes(query);
      const document = customer.document?.replace(/\D/g, '') ?? '';
      return nameMatch || (documentDigits.length > 0 && document.includes(documentDigits));
    });
  }, [customers, vehicleCustomerSearch, vehicles]);
  const displayedOrderVehicles = matchingOrderVehicles.slice(0, 40);
  const availableInventoryProducts = useMemo(() => inventoryProducts.filter((product) => Number(product.quantity) > 0), [inventoryProducts]);
  const matchingInventoryProducts = useMemo(() => {
    const query = searchKey(inventorySearch);
    const compactQuery = compactSearchKey(inventorySearch);
    if (!query) return availableInventoryProducts;
    return availableInventoryProducts.filter((product) => [product.name, product.code ?? '', product.brand ?? '', product.category ?? '', product.location ?? '']
      .some((value) => searchKey(value).includes(query) || (compactQuery && compactSearchKey(value).includes(compactQuery))));
  }, [availableInventoryProducts, inventorySearch]);
  const displayedInventoryProducts = matchingInventoryProducts.slice(0, 40);

  const beginCreate = () => {
    setSelectedCustomerId(''); setSelectedVehicleId(''); setVehicleCustomerSearch(''); setVehicleCustomerPickerOpen(false); setSelectedMembershipId(employees[0]?.id ?? ''); setComplaint(''); setOdometer(''); setError(''); setCreating(true);
  };

  const saveOrder = async () => {
    if (!selectedCustomerId || !selectedVehicleId) { setError('Selecione o cliente e um dos veículos vinculados a ele.'); return; }
    setBusy(true); setError('');
    try {
      const order = await createServiceOrder(workshopId, {
        customer_id: selectedCustomerId,
        vehicle_id: selectedVehicleId,
        assigned_membership_id: selectedMembershipId || null,
        odometer_km: odometer ? Number(odometer.replace(/\D/g, '')) : null,
        complaint,
        diagnosis: '',
        notes: '',
      });
      setCreating(false);
      await refresh();
      setSelectedOrder(order);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a ordem.'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (status: ServiceOrderStatus) => {
    if (!selectedOrder || !canUpdate) return;
    setBusy(true); setError('');
    try { await updateServiceOrder(workshopId, selectedOrder.id, { status }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o status.'); }
    finally { setBusy(false); }
  };

  const saveDiagnosis = async () => {
    if (!selectedOrder || !canUpdate) return;
    setBusy(true); setError('');
    try { await updateServiceOrder(workshopId, selectedOrder.id, { diagnosis }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o diagnóstico.'); }
    finally { setBusy(false); }
  };

  const saveDiscount = async () => {
    if (!selectedOrder || !canUpdate) return;
    const parsed = Number(discountValue.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number(selectedOrder.items_subtotal)) {
      setError('Informe um desconto entre zero e o subtotal da ordem.');
      return;
    }
    setBusy(true); setError('');
    try { await updateServiceOrder(workshopId, selectedOrder.id, { discount: parsed }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o desconto.'); }
    finally { setBusy(false); }
  };

  const saveAssignee = async () => {
    if (!selectedOrder || !canUpdate) return;
    setBusy(true); setError('');
    try { await updateServiceOrder(workshopId, selectedOrder.id, { assigned_membership_id: selectedMembershipId || null }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o responsável.'); }
    finally { setBusy(false); }
  };

  const printOrder = async () => {
    if (!selectedOrder) return;
    setBusy(true); setError('');
    try {
      const [settings, inspection, technicalNotes, authorizations] = await Promise.all([
        getWorkshopSettings(workshopId), listServiceOrderInspection(workshopId, selectedOrder.id),
        listServiceOrderTechnicalNotes(workshopId, selectedOrder.id), listServiceOrderAuthorizations(workshopId, selectedOrder.id),
      ]);
      const conditions = { good: 'Bom', attention: 'Atenção', critical: 'Crítico', not_inspected: 'Não inspecionado' };
      const rows = [
        { label: 'Ordem de serviço', value: `#${selectedOrder.order_number} · ${statusLabel(selectedOrder.status)}` },
        { label: 'Abertura', value: openedDate(selectedOrder.opened_at) },
        { label: 'Cliente', value: selectedOrder.customers?.full_name ?? '—' },
        { label: 'Veículo', value: `${selectedOrder.vehicles?.make ?? ''} ${selectedOrder.vehicles?.model ?? ''} · ${selectedOrder.vehicles?.plate ?? ''}`.trim() },
        { label: 'Quilometragem', value: selectedOrder.odometer_km === null ? 'Não informada' : `${selectedOrder.odometer_km.toLocaleString('pt-BR')} km` },
        { label: 'Relato do cliente', value: selectedOrder.complaint || '—' },
        { label: 'Diagnóstico', value: selectedOrder.diagnosis || 'Pendente' },
        ...items.map((item, index) => ({ label: `${item.item_type === 'labor' ? 'Serviço' : 'Peça'} ${index + 1}: ${item.description}`, value: `${item.quantity} × ${money(item.unit_price)} = ${money(item.line_total)}` })),
        { label: 'Subtotal', value: money(selectedOrder.items_subtotal) },
        { label: 'Desconto', value: money(selectedOrder.discount) },
        { label: 'Total', value: money(selectedOrder.total_amount) },
        ...inspection.map((item) => ({ label: `${item.item_kind === 'checklist' ? 'Checklist' : 'Inspeção'} · ${item.item_label} (${conditions[item.condition]})`, value: [item.observations, item.recommendation ? `Recomendação: ${item.recommendation}` : ''].filter(Boolean).join(' · ') || 'Sem observações' })),
        ...technicalNotes.map((note) => ({ label: `Nota técnica · ${note.category}${note.is_recommendation ? ' · preventiva' : ' · diagnóstico'}`, value: note.body })),
        ...authorizations.map((authorization) => ({ label: `Autorização ${authorization.authorization_type} · ${authorization.signer_name} · ${new Date(authorization.signed_at).toLocaleString('pt-BR')}`, value: `${authorization.statement} · ${money(authorization.amount)}` })),
      ];
      const workshopDetails = [settings.name, settings.cnpj ? `CNPJ ${settings.cnpj}` : '', settings.phone ?? '', settings.address ?? '', [settings.city, settings.state].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
      await openPrintableDocument(`Ordem de serviço #${selectedOrder.order_number}`, workshopDetails, rows, undefined, settings.logo_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o documento da OS.'); }
    finally { setBusy(false); }
  };

  const printDeliveryReceipt = async () => {
    if (!selectedOrder) return;
    setBusy(true); setError('');
    try {
      const [settings, authorizations] = await Promise.all([
        getWorkshopSettings(workshopId), listServiceOrderAuthorizations(workshopId, selectedOrder.id),
      ]);
      const delivery = authorizations.find((authorization) => authorization.authorization_type === 'delivery');
      if (!delivery) throw new Error('Registre primeiro a autorização assinada do tipo Entrega nesta OS.');
      const workshopDetails = [settings.name, settings.cnpj ? `CNPJ ${settings.cnpj}` : '', settings.phone ?? '', settings.address ?? '', [settings.city, settings.state].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
      const rows = [
        { label: 'Comprovante de entrega', value: `OS #${selectedOrder.order_number}` },
        { label: 'Cliente', value: selectedOrder.customers?.full_name ?? '—' },
        { label: 'Veículo', value: `${selectedOrder.vehicles?.make ?? ''} ${selectedOrder.vehicles?.model ?? ''} · ${selectedOrder.vehicles?.plate ?? ''}`.trim() },
        { label: 'Data da entrega', value: new Date(delivery.signed_at).toLocaleString('pt-BR') },
        { label: 'Recebido por', value: delivery.signer_name },
        { label: 'Declaração', value: delivery.statement },
        { label: 'Valor da OS', value: money(delivery.amount) },
        ...items.map((item, index) => ({ label: `${item.item_type === 'labor' ? 'Serviço' : 'Peça'} ${index + 1}: ${item.description}`, value: `${item.quantity} × ${money(item.unit_price)} = ${money(item.line_total)}` })),
        { label: 'Total', value: money(selectedOrder.total_amount) },
        { label: 'Registro de assinatura', value: `Assinatura desenhada armazenada no histórico da OS · ${delivery.signer_name} · ${new Date(delivery.signed_at).toLocaleString('pt-BR')}` },
      ];
      await openPrintableDocument(`Comprovante de entrega da OS #${selectedOrder.order_number}`, workshopDetails, rows, undefined, settings.logo_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o comprovante de entrega.'); }
    finally { setBusy(false); }
  };

  const addItem = async () => {
    if (!selectedOrder) return;
    setBusy(true); setError('');
    try {
      await createServiceOrderItem(workshopId, selectedOrder.id, {
        item_type: itemType, description: itemDescription, quantity: Number(itemQuantity.replace(',', '.')), unit_price: Number(itemPrice.replace(',', '.')),
        inventory_product_id: itemType === 'part' ? selectedProductId || null : null,
      });
      setItemDescription(''); setInventorySearch(''); setItemQuantity('1'); setItemPrice(''); setSelectedProductId('');
      setItems(await listServiceOrderItems(workshopId, selectedOrder.id));
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o item.'); }
    finally { setBusy(false); }
  };

  const removeItem = (item: ServiceOrderItem) => Alert.alert(
    'Remover item da ordem',
    `Remover “${item.description}” da ordem? O total será recalculado pelo banco.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Remover', style: 'destructive', onPress: () => { (async () => {
      try {
        await archiveServiceOrderItem(workshopId, item.id);
        if (selectedOrder) setItems(await listServiceOrderItems(workshopId, selectedOrder.id));
        await refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível remover o item.'); }
    })().catch(() => setError('Não foi possível remover o item.')); } }],
  );

  const closeCreate = () => { if (!busy) setCreating(false); };
  const closeOrder = () => { if (!busy) setSelectedOrder(null); };

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}><Text style={styles.title}>Ordens de serviço</Text><Text style={styles.subtitle}>{orders.length} ordem(ns)</Text></View>
        {canCreate ? <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={beginCreate}><Text style={styles.primaryButtonText}>+ Nova OS</Text></Pressable> : null}
      </View>
      <FormField label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Número da OS, cliente ou placa" />
      {error && !creating && !selectedOrder ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {visible.map((order) => (
            <Pressable key={order.id} style={styles.orderCard} onPress={() => { setError(''); setSelectedOrder(order); }}>
              <View style={styles.orderTop}><Text style={styles.orderNumber}>OS #{order.order_number}</Text><Text style={[styles.status, order.status === 'canceled' ? styles.statusCancelled : null]}>{statusLabel(order.status)}</Text></View>
              <Text style={styles.orderTitle}>{order.customers?.full_name ?? 'Cliente'} · {order.vehicles?.make} {order.vehicles?.model}</Text>
              <View style={styles.orderBottom}><Text style={styles.meta}>{order.vehicles?.plate} · {openedDate(order.opened_at)}{order.assigned_membership_id ? ` · ${employees.find((employee) => employee.id === order.assigned_membership_id)?.profiles.full_name ?? 'Responsável'}` : ''}</Text><Text style={styles.amount}>{money(order.total_amount)}</Text></View>
            </Pressable>
          ))}
          {!visible.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? 'Nenhuma ordem encontrada' : 'Ainda não há ordens'}</Text><Text style={styles.meta}>{query ? 'Altere sua pesquisa.' : 'Abra uma OS para registrar a reclamação e começar o histórico do veículo.'}</Text></View> : null}
        </ScrollView>
      )}

      <Modal visible={creating} animationType="slide" onRequestClose={closeCreate}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>Nova ordem de serviço</Text><Text style={styles.subtitle}>Escolha um cliente e um veículo cadastrado.</Text></View><Pressable onPress={closeCreate}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Cliente e veículo *</Text>
            {selectedOrderVehicle && selectedCustomer ? <View style={styles.selectedVehicleCard}>
              <View style={styles.selectedVehicleInfo}>
                <Text style={styles.selectedVehiclePlate}>{selectedOrderVehicle.plate} · {selectedOrderVehicle.make} {selectedOrderVehicle.model}</Text>
                <Text style={styles.selectedVehicleCustomer}>{selectedCustomer.full_name}{selectedCustomer.document ? ` · ${selectedCustomer.document}` : ''}</Text>
              </View>
              <Pressable accessibilityRole="button" style={styles.changeVehicleButton} onPress={() => { setVehicleCustomerPickerOpen(true); setVehicleCustomerSearch(''); }}><Text style={styles.changeVehicleText}>Trocar</Text></Pressable>
            </View> : <Pressable accessibilityRole="button" style={styles.selectVehicleButton} onPress={() => { setVehicleCustomerPickerOpen(true); setVehicleCustomerSearch(''); }}>
              <Text style={styles.selectVehicleText}>Pesquisar cliente ou veículo</Text>
            </Pressable>}
            {vehicleCustomerPickerOpen ? <View style={styles.vehicleCustomerPicker}>
              <View style={styles.vehicleCustomerPickerHeader}>
                <Text style={styles.vehicleCustomerPickerTitle}>Buscar por cliente ou veículo</Text>
                <Pressable accessibilityRole="button" onPress={() => { setVehicleCustomerPickerOpen(false); setVehicleCustomerSearch(''); }}><Text style={styles.changeVehicleText}>Fechar busca</Text></Pressable>
              </View>
              <FormField label="Nome, CPF, placa, marca ou modelo" value={vehicleCustomerSearch} onChangeText={setVehicleCustomerSearch} placeholder="Digite um nome, CPF ou dado do veículo" />
              {displayedOrderVehicles.map((vehicle) => {
                const customer = customersById.get(vehicle.customer_id);
                return <Pressable key={vehicle.id} accessibilityRole="button" style={styles.vehicleSearchChoice} onPress={() => {
                  setSelectedVehicleId(vehicle.id);
                  setSelectedCustomerId(vehicle.customer_id);
                  setVehicleCustomerPickerOpen(false);
                  setVehicleCustomerSearch('');
                }}>
                  <Text style={styles.vehicleSearchTitle}>{vehicle.plate} · {vehicle.make} {vehicle.model}</Text>
                  <Text style={styles.vehicleSearchSubtitle}>{customer?.full_name ?? 'Cliente'}{customer?.document ? ` · ${customer.document}` : ''}</Text>
                </Pressable>;
              })}
              {matchingOrderVehicles.length > displayedOrderVehicles.length ? <Text style={styles.noData}>Mostrando 40 resultados. Digite mais dados para refinar a busca.</Text> : null}
              {vehicleCustomerSearch.trim() && !matchingOrderVehicles.length && customersWithoutVehicles.length ? customersWithoutVehicles.map((customer) => <Text key={customer.id} style={styles.noData}>{customer.full_name}{customer.document ? ` · ${customer.document}` : ''} — sem veículo cadastrado para abrir a OS.</Text>) : null}
              {vehicleCustomerSearch.trim() && !matchingOrderVehicles.length && !customersWithoutVehicles.length ? <Text style={styles.noData}>Nenhum cliente ou veículo encontrado. Confira o que digitou ou cadastre primeiro o cliente e o veículo.</Text> : null}
              {!vehicles.length && !customers.length ? <Text style={styles.noData}>Cadastre um cliente e um veículo antes de abrir a OS.</Text> : null}
            </View> : null}
            {employees.length ? <><Text style={styles.label}>Responsável pela OS</Text><View style={styles.statusOptions}>{employees.map((employee) => <Pressable key={employee.id} style={[styles.statusOption, selectedMembershipId === employee.id && styles.statusOptionActive]} onPress={() => setSelectedMembershipId(employee.id)}><Text style={[styles.statusOptionText, selectedMembershipId === employee.id && styles.statusOptionTextActive]}>{employee.profiles.full_name}</Text></Pressable>)}</View></> : null}
            <FormField label="Quilometragem de entrada" value={odometer} onChangeText={setOdometer} keyboardType="number-pad" />
            <FormField label="Reclamação do cliente" required value={complaint} onChangeText={setComplaint} multiline placeholder="Descreva o problema relatado pelo cliente" />
            <Pressable accessibilityRole="button" disabled={busy || !canCreate} style={[styles.primaryButton, styles.saveButton, (busy || !canCreate) && styles.disabled]} onPress={() => { saveOrder(); }}><Text style={styles.primaryButtonText}>{busy ? 'Abrindo…' : 'Abrir ordem de serviço'}</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!selectedOrder} animationType="slide" onRequestClose={closeOrder}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>OS #{selectedOrder?.order_number}</Text><Text style={styles.subtitle}>{selectedOrder?.customers?.full_name} · {selectedOrder?.vehicles?.plate}</Text></View><Pressable onPress={closeOrder}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => { printOrder().catch(() => undefined); }}><Text style={styles.primaryButtonText}>Imprimir / compartilhar OS, checklist e laudo</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]} onPress={() => { printDeliveryReceipt().catch(() => undefined); }}><Text style={styles.secondaryButtonText}>Comprovante de entrega</Text></Pressable>
            {canUpdate && selectedOrder && !['completed','delivered','canceled'].includes(selectedOrder.status) ? <View style={styles.timerCard}><View style={styles.timerCopy}><Text style={styles.label}>Tempo de execução</Text><Text style={styles.meta}>{activeTimer ? `Em andamento desde ${new Date(activeTimer.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Registre o tempo efetivamente dedicado a esta ordem.'}</Text></View><Pressable accessibilityRole="button" disabled={busy} style={[styles.timerButton, activeTimer && styles.timerStop]} onPress={() => { toggleTimer().catch(() => undefined); }}><Text style={styles.timerButtonText}>{busy ? 'Aguarde…' : activeTimer ? 'Encerrar' : 'Iniciar'}</Text></Pressable></View> : null}
            {employees.length && canUpdate ? <View><Text style={styles.label}>Responsável pela OS</Text><ScrollView horizontal contentContainerStyle={styles.statusOptions} showsHorizontalScrollIndicator={false}><Pressable style={[styles.statusOption, !selectedMembershipId && styles.statusOptionActive]} onPress={() => setSelectedMembershipId('')}><Text style={[styles.statusOptionText, !selectedMembershipId && styles.statusOptionTextActive]}>Sem responsável</Text></Pressable>{employees.map((employee) => <Pressable key={employee.id} style={[styles.statusOption, selectedMembershipId === employee.id && styles.statusOptionActive]} onPress={() => setSelectedMembershipId(employee.id)}><Text style={[styles.statusOptionText, selectedMembershipId === employee.id && styles.statusOptionTextActive]}>{employee.profiles.full_name}</Text></Pressable>)}</ScrollView><Pressable disabled={busy} style={styles.secondaryButton} onPress={() => saveAssignee()}><Text style={styles.secondaryButtonText}>Salvar responsável</Text></Pressable></View> : null}
            <Text style={styles.label}>Status</Text>
            <ScrollView horizontal contentContainerStyle={styles.statusOptions} showsHorizontalScrollIndicator={false}>
              {serviceOrderStatuses.map((status) => { const active = selectedOrder?.status === status.value; return <Pressable key={status.value} disabled={!canUpdate || busy} style={[styles.statusOption, active && styles.statusOptionActive]} onPress={() => { changeStatus(status.value); }}><Text style={[styles.statusOptionText, active && styles.statusOptionTextActive]}>{status.label}</Text></Pressable>; })}
            </ScrollView>
            <View style={styles.complaintCard}><Text style={styles.label}>Reclamação do cliente</Text><Text style={styles.body}>{selectedOrder?.complaint}</Text><Text style={styles.meta}>Entrada em {selectedOrder ? openedDate(selectedOrder.opened_at) : ''}{selectedOrder?.odometer_km !== null ? ` · ${selectedOrder?.odometer_km?.toLocaleString('pt-BR')} km` : ''}</Text></View>
            <FormField label="Diagnóstico" value={diagnosis} onChangeText={setDiagnosis} multiline />
            {canUpdate ? <Pressable accessibilityRole="button" disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]} onPress={() => { saveDiagnosis(); }}><Text style={styles.secondaryButtonText}>Salvar diagnóstico</Text></Pressable> : null}

            {selectedOrder ? <ServiceOrderInspectionPanel key={selectedOrder.id} workshopId={workshopId} orderId={selectedOrder.id} canUpdate={canUpdate} /> : null}
            {selectedOrder ? <ServiceOrderAuthorizationPanel key={`authorization-${selectedOrder.id}`} workshopId={workshopId} orderId={selectedOrder.id} customerId={selectedOrder.customer_id} customerName={selectedOrder.customers?.full_name ?? ''} orderNumber={selectedOrder.order_number} amount={selectedOrder.total_amount} canSign={canUpdate} /> : null}
            {selectedOrder ? <ServiceOrderAttachmentsPanel key={`attachments-${selectedOrder.id}`} workshopId={workshopId} orderId={selectedOrder.id} canManage={canUpdate} /> : null}

            <Text style={styles.sectionTitle}>Serviços e peças</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemMain}><Text style={styles.itemName}>{item.description}</Text><Text style={styles.meta}>{item.item_type === 'labor' ? 'Mão de obra' : 'Peça'} · {item.quantity} × {money(item.unit_price)}</Text></View>
                <Text style={styles.amount}>{money(item.line_total)}</Text>
                {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.description}`} style={styles.removeButton} onPress={() => removeItem(item)}><Text style={styles.removeText}>×</Text></Pressable> : null}
              </View>
            ))}
            {!items.length ? <Text style={styles.noData}>Nenhum serviço ou peça foi lançado nesta ordem.</Text> : null}

            {canCreate ? (
              <View style={styles.addItemCard}>
                <Text style={styles.label}>Adicionar item</Text>
                <View style={styles.typeChoices}>{(['labor', 'part'] as const).map((type) => { const active = itemType === type; return <Pressable key={type} style={[styles.typeChoice, active && styles.typeChoiceActive]} onPress={() => { setItemType(type); setSelectedProductId(''); setInventorySearch(''); setItemDescription(''); setItemPrice(''); }}><Text style={[styles.typeChoiceText, active && styles.typeChoiceTextActive]}>{type === 'labor' ? 'Mão de obra' : 'Peça'}</Text></Pressable>; })}</View>
                {itemType === 'part' && canViewInventory ? <>
                  <Text style={styles.meta}>{canUseInventory ? 'Pesquise uma peça com saldo. Ao adicioná-la à OS, o estoque será baixado automaticamente.' : 'Pesquise peças disponíveis. Sua conta pode consultar o estoque, mas não pode fazer a baixa automática.'}</Text>
                  <FormField label="Pesquisar peça em estoque" value={inventorySearch} onChangeText={setInventorySearch} placeholder="Nome, código, marca ou categoria" />
                  {displayedInventoryProducts.length ? <View style={styles.inventorySearchResults}>
                    {displayedInventoryProducts.map((product) => <Pressable key={product.id} accessibilityRole="button" style={[styles.inventoryProductChoice, selectedProductId === product.id && styles.inventoryProductChoiceActive]} onPress={() => {
                      setSelectedProductId(canUseInventory ? product.id : '');
                      setItemDescription(product.name);
                      setItemPrice(String(product.sale_price));
                      setInventorySearch('');
                    }}>
                      <Text style={styles.inventoryProductName}>{product.name}{product.code ? ` · ${product.code}` : ''}</Text>
                      <Text style={styles.inventoryProductMeta}>{product.brand ? `${product.brand} · ` : ''}{product.category ? `${product.category} · ` : ''}{Number(product.quantity).toLocaleString('pt-BR')} disponível(is) · {money(product.sale_price)}</Text>
                    </Pressable>)}
                    {matchingInventoryProducts.length > displayedInventoryProducts.length ? <Text style={styles.noData}>Mostrando 40 peças. Digite mais dados para refinar a busca.</Text> : null}
                  </View> : <Text style={styles.noData}>{availableInventoryProducts.length ? 'Nenhuma peça em estoque encontrada.' : 'Não há peças com saldo disponível no estoque.'}</Text>}
                </> : itemType === 'part' ? <Text style={styles.noData}>A consulta ao estoque não está liberada para sua conta. Peça ao proprietário para liberar o acesso.</Text> : null}
                <FormField label={itemType === 'labor' ? 'Descrição da mão de obra' : 'Descrição da peça'} value={itemDescription} onChangeText={(value) => { setItemDescription(value); if (selectedProductId) setSelectedProductId(''); }} placeholder={itemType === 'labor' ? 'Descreva o serviço realizado' : 'Descreva a peça utilizada'} />
                <View style={styles.twoColumns}><View style={styles.column}><FormField label="Quantidade" value={itemQuantity} onChangeText={setItemQuantity} keyboardType="decimal-pad" /></View><View style={styles.column}><FormField label="Valor unitário (R$)" value={itemPrice} onChangeText={setItemPrice} keyboardType="decimal-pad" placeholder="0,00" /></View></View>
                <Pressable accessibilityRole="button" disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]} onPress={() => { addItem(); }}><Text style={styles.secondaryButtonText}>{busy ? 'Salvando…' : 'Adicionar à ordem'}</Text></Pressable>
              </View>
            ) : null}

            <View style={styles.totalCard}>
              <View style={styles.totalLine}><Text style={styles.meta}>Subtotal</Text><Text style={styles.totalSmall}>{money(selectedOrder?.items_subtotal ?? 0)}</Text></View>
              {canUpdate ? <><FormField label="Desconto (R$)" value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" placeholder="0,00" /><Pressable accessibilityRole="button" disabled={busy} style={[styles.secondaryButton, busy && styles.disabled]} onPress={() => { saveDiscount(); }}><Text style={styles.secondaryButtonText}>Salvar desconto</Text></Pressable></> : <View style={styles.totalLine}><Text style={styles.meta}>Desconto</Text><Text style={styles.totalSmall}>{money(selectedOrder?.discount ?? 0)}</Text></View>}
              {canUpdate ? <View style={styles.totalLine}><Text style={styles.meta}>Desconto atual</Text><Text style={styles.totalSmall}>{money(selectedOrder?.discount ?? 0)}</Text></View> : null}
              <View style={styles.totalLine}><Text style={styles.totalLabel}>Total da OS</Text><Text style={styles.totalValue}>{money(selectedOrder?.total_amount ?? 0)}</Text></View>
              <Text style={styles.totalNote}>Totais são calculados pelo banco. Peças vinculadas a produto têm baixa automática e estorno ao remover ou cancelar a OS.</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 22 },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  headingText: { flex: 1 },
  title: { color: '#10243a', fontSize: 25, fontWeight: '800' },
  subtitle: { marginTop: 4, color: '#718197', fontSize: 12 },
  primaryButton: { minHeight: 40, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' },
  primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  secondaryButton: { minHeight: 42, marginTop: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cad6e2', borderRadius: 9, backgroundColor: '#fff' },
  secondaryButtonText: { color: '#26425f', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  loading: { marginTop: 36 },
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingBottom: 25, gap: 9 },
  orderCard: { padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { color: '#23415e', fontSize: 12, fontWeight: '800' },
  status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#fff2e8', color: '#ad5716', fontSize: 10, fontWeight: '700' },
  statusCancelled: { backgroundColor: '#fbeceb', color: '#9d4b3c' },
  orderTitle: { marginTop: 10, color: '#1a2c40', fontSize: 13, fontWeight: '700' },
  orderBottom: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { color: '#10243a', fontSize: 12, fontWeight: '800' },
  meta: { marginTop: 4, color: '#7b8999', fontSize: 11, lineHeight: 16 },
  empty: { marginTop: 16, padding: 21, alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  emptyTitle: { color: '#26394e', fontSize: 14, fontWeight: '700' },
  limit: { padding: 12, color: '#77879a', fontSize: 11 },
  error: { marginTop: 10, color: '#a23d33', fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, paddingTop: 24, paddingHorizontal: 20, backgroundColor: '#f4f7fb' },
  modalHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  cancelText: { padding: 8, color: '#315a80', fontSize: 12, fontWeight: '700' },
  formContent: { paddingBottom: 34 },
  label: { marginTop: 14, marginBottom: 6, color: '#33465b', fontSize: 12, fontWeight: '700' },
  selectedVehicleCard: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#d8e5db', borderRadius: 9, backgroundColor: '#f5fbf5' },
  selectedVehicleInfo: { flex: 1 },
  selectedVehiclePlate: { color: '#1d3d2a', fontSize: 12, fontWeight: '700' },
  selectedVehicleCustomer: { marginTop: 4, color: '#5e7967', fontSize: 11 },
  changeVehicleButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#e8f0e9' },
  changeVehicleText: { color: '#315a80', fontSize: 11, fontWeight: '700' },
  selectVehicleButton: { minHeight: 42, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#b8c5d3', borderRadius: 9, backgroundColor: '#fff' },
  selectVehicleText: { color: '#315a80', fontSize: 12, fontWeight: '700' },
  vehicleCustomerPicker: { marginTop: 8, padding: 10, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 9, backgroundColor: '#fff' },
  vehicleCustomerPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  vehicleCustomerPickerTitle: { color: '#33465b', fontSize: 12, fontWeight: '700' },
  vehicleSearchChoice: { padding: 11, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff', marginTop: 6 },
  vehicleSearchTitle: { color: '#33465b', fontSize: 12, fontWeight: '700' },
  vehicleSearchSubtitle: { marginTop: 3, color: '#718197', fontSize: 11 },
  choice: { padding: 11, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff', marginBottom: 6 },
  choiceActive: { borderColor: '#e97824', backgroundColor: '#fff5ed' },
  choiceText: { color: '#41536a', fontSize: 12 },
  choiceTextActive: { color: '#9d4b12', fontWeight: '700' },
  noData: { padding: 10, color: '#8996a5', fontSize: 12, lineHeight: 17 },
  complaintCard: { marginTop: 15, padding: 13, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 10, backgroundColor: '#fff' },
  body: { color: '#34485f', fontSize: 13, lineHeight: 20 },
  statusOptions: { gap: 7, paddingVertical: 4 },
  statusOption: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff' },
  statusOptionActive: { borderColor: '#10243a', backgroundColor: '#10243a' },
  statusOptionText: { color: '#53657b', fontSize: 11 },
  statusOptionTextActive: { color: '#fff', fontWeight: '700' },
  sectionTitle: { marginTop: 23, marginBottom: 7, color: '#10243a', fontSize: 16, fontWeight: '800' },
  itemRow: { minHeight: 62, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e4eaf0' },
  itemMain: { flex: 1, paddingRight: 8 },
  itemName: { color: '#26394e', fontSize: 12, fontWeight: '700' },
  inventorySearchResults: { marginTop: 7, gap: 6 },
  inventoryProductChoice: { padding: 11, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff' },
  inventoryProductChoiceActive: { borderColor: '#e97824', backgroundColor: '#fff5ed' },
  inventoryProductName: { color: '#33465b', fontSize: 12, fontWeight: '700' },
  inventoryProductMeta: { marginTop: 4, color: '#718197', fontSize: 11 },
  removeButton: { marginLeft: 8, width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fbeceb' },
  removeText: { color: '#9d4b3c', fontSize: 20, lineHeight: 23 },
  addItemCard: { marginTop: 17, padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' },
  typeChoices: { flexDirection: 'row', gap: 8 },
  typeChoice: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8 },
  typeChoiceActive: { backgroundColor: '#10243a', borderColor: '#10243a' },
  typeChoiceText: { color: '#53657b', fontSize: 11 },
  typeChoiceTextActive: { color: '#fff', fontWeight: '700' },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  totalCard: { marginTop: 19, padding: 15, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e8ef' },
  totalLine: { minHeight: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalSmall: { color: '#56677c', fontSize: 12, fontWeight: '600' },
  totalLabel: { color: '#10243a', fontSize: 13, fontWeight: '800' },
  totalValue: { color: '#10243a', fontSize: 17, fontWeight: '900' },
  totalNote: { marginTop: 7, color: '#8b98a7', fontSize: 10, lineHeight: 15 },
  timerCard: { marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 10, backgroundColor: '#fff' },
  timerCopy: { flex: 1 },
  timerButton: { minHeight: 36, minWidth: 82, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#36764c' },
  timerStop: { backgroundColor: '#a44239' },
  timerButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  saveButton: { marginTop: 22, minHeight: 48 },
});
