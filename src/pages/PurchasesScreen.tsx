import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { archiveSupplier, createPurchase, getWorkshopPermissions, listInventoryProducts, listPayablePaymentReversals, listPayables, listPurchases, listSuppliers, markPayablePaid, receivePurchase, reversePayablePayment, saveSupplier } from '../services/workshopData';
import type { InventoryProduct, Payable, PayablePaymentReversal, Purchase, Supplier } from '../types/workshop';
import { paymentMethodLabel, paymentMethods } from '../utils/paymentMethods';
import type { PaymentMethod } from '../utils/paymentMethods';

const money = (amount: number | string) => `R$ ${Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const compactSearchKey = (value: string) => searchKey(value).replace(/[^a-z0-9]/g, '');
export default function PurchasesScreen({ workshopId }: { workshopId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payableReversals, setPayableReversals] = useState<PayablePaymentReversal[]>([]);
  const [hasPurchaseAccess, setHasPurchaseAccess] = useState(false);
  const [purchaseCreate, setPurchaseCreate] = useState(false);
  const [inventoryCreate, setInventoryCreate] = useState(false);
  const [financeView, setFinanceView] = useState(false);
  const [financeUpdate, setFinanceUpdate] = useState(false);
  const [payableToReverse, setPayableToReverse] = useState<Payable | null>(null);
  const [payableToSettle, setPayableToSettle] = useState<Payable | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<PaymentMethod>('on_account');
  const [reversalReason, setReversalReason] = useState('');
  const [supplierCreate, setSupplierCreate] = useState(false);
  const [supplierUpdate, setSupplierUpdate] = useState(false);
  const [supplierDelete, setSupplierDelete] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [draftItems, setDraftItems] = useState<Array<{ product_id: string; quantity: number; unit_cost: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const confirmPayableSettlement = () => {
    if (!payableToSettle) return;
    perform(async () => {
      await markPayablePaid(workshopId, payableToSettle.id, paymentMethod);
      setPayableToSettle(null);
    });
  };

  const refresh = useCallback(async () => {
    try {
      const permissions = await getWorkshopPermissions(workshopId);
      const purchaseAccess = permissions.purchases ?? { view: false, create: false, update: false, delete: false };
      setHasPurchaseAccess(purchaseAccess.view); setPurchaseCreate(purchaseAccess.create); setInventoryCreate(permissions.inventory.create);
      setFinanceView(permissions.finance.view); setFinanceUpdate(permissions.finance.update);
      setSupplierCreate(purchaseAccess.create); setSupplierUpdate(purchaseAccess.update); setSupplierDelete(purchaseAccess.update);
      if (!purchaseAccess.view) {
        setSuppliers([]); setProducts([]); setPurchases([]); setPayables([]); setPayableReversals([]);
        return;
      }
      const [vendorRows, productRows, purchaseRows] = await Promise.all([
        listSuppliers(workshopId), listInventoryProducts(workshopId), listPurchases(workshopId),
      ]);
      const [payableRows, reversalRows] = permissions.finance.view ? await Promise.all([listPayables(workshopId), listPayablePaymentReversals(workshopId)]) : [[], []];
      setSuppliers(vendorRows); setProducts(productRows); setPurchases(purchaseRows); setPayables(payableRows); setPayableReversals(reversalRows);
      setSupplierId((current) => current || vendorRows[0]?.id || ''); setProductId((current) => current || '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar compras.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const selectedProduct = products.find((product) => product.id === productId) ?? null;
  const matchingSuppliers = useMemo(() => {
    const query = searchKey(supplierSearch);
    const compactQuery = compactSearchKey(supplierSearch);
    if (!query) return suppliers;
    return suppliers.filter((supplier) => [supplier.name, supplier.cnpj ?? '', supplier.phone ?? '', supplier.email ?? '', supplier.contact_name ?? '']
      .some((value) => searchKey(value).includes(query) || (compactQuery && compactSearchKey(value).includes(compactQuery))));
  }, [supplierSearch, suppliers]);
  const matchingProducts = useMemo(() => {
    const query = searchKey(productSearch);
    const compactQuery = compactSearchKey(productSearch);
    if (!query) return products;
    return products.filter((product) => [product.name, product.code ?? '', product.brand ?? '', product.category ?? '', product.location ?? '']
      .some((value) => searchKey(value).includes(query) || (compactQuery && compactSearchKey(value).includes(compactQuery))));
  }, [productSearch, products]);
  const displayedSuppliers = matchingSuppliers.slice(0, 30);
  const displayedProducts = matchingProducts.slice(0, 30);

  const perform = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const saveSupplierDetails = () => perform(async () => {
    await saveSupplier(workshopId, { name: supplierName, cnpj: supplierCnpj || null, phone: supplierPhone || null, email: supplierEmail || null, address: supplierAddress || null, contact_name: supplierContact || null, notes: supplierNotes || null }, editingSupplierId ?? undefined);
    setEditingSupplierId(null); setSupplierName(''); setSupplierCnpj(''); setSupplierPhone(''); setSupplierEmail(''); setSupplierAddress(''); setSupplierContact(''); setSupplierNotes('');
  });
  const editSupplier = (supplier: Supplier) => {
    setEditingSupplierId(supplier.id); setSupplierName(supplier.name); setSupplierCnpj(supplier.cnpj ?? ''); setSupplierPhone(supplier.phone ?? '');
    setSupplierEmail(supplier.email ?? ''); setSupplierAddress(supplier.address ?? ''); setSupplierContact(supplier.contact_name ?? ''); setSupplierNotes(supplier.notes ?? ''); setError('');
  };
  const confirmArchiveSupplier = (supplier: Supplier) => Alert.alert('Arquivar fornecedor', `Arquivar ${supplier.name}? O histórico de compras será preservado.`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Arquivar', style: 'destructive', onPress: () => { perform(async () => { await archiveSupplier(workshopId, supplier.id); if (supplierId === supplier.id) setSupplierId(''); }).catch(() => undefined); } },
  ]);
  const addPurchase = () => perform(async () => {
    await createPurchase(workshopId, supplierId, draftItems, dueDate, purchasePaymentMethod);
    setDraftItems([]); setQuantity('1');
  });
  const confirmPayableReversal = () => {
    if (!payableToReverse || reversalReason.trim().length < 3) { setError('Informe o motivo do estorno (mínimo de 3 caracteres).'); return; }
    perform(async () => { await reversePayablePayment(workshopId, payableToReverse.id, reversalReason); setPayableToReverse(null); setReversalReason(''); });
  };
  const addDraftItem = () => {
    const parsedQuantity = Number(quantity.replace(',', '.'));
    const parsedCost = Number(unitCost.replace(',', '.'));
    if (!productId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedCost) || parsedCost < 0) {
      setError('Selecione um produto e informe quantidade e custo válidos.'); return;
    }
    setError('');
    setDraftItems((items) => [...items, { product_id: productId, quantity: parsedQuantity, unit_cost: parsedCost }]);
    setQuantity('1');
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  if (!hasPurchaseAccess) return <View style={styles.page}><Text style={styles.title}>Compras</Text><Text style={styles.error}>O proprietário ainda não autorizou seu acesso a esta área.</Text></View>;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Fornecedores e compras</Text>
    <Text style={styles.subtitle}>Receber uma compra atualiza o estoque e cria a conta a pagar de forma atômica.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {supplierCreate || supplierUpdate ? <View style={styles.card}>
      <Text style={styles.section}>{editingSupplierId ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</Text>
      <FormField label="Nome" required value={supplierName} onChangeText={setSupplierName} />
      <FormField label="CNPJ" value={supplierCnpj} onChangeText={setSupplierCnpj} keyboardType="number-pad" />
      <View style={styles.row}><View style={styles.half}><FormField label="Telefone" value={supplierPhone} onChangeText={setSupplierPhone} keyboardType="phone-pad" /></View><View style={styles.half}><FormField label="Contato" value={supplierContact} onChangeText={setSupplierContact} /></View></View>
      <FormField label="E-mail" value={supplierEmail} onChangeText={setSupplierEmail} keyboardType="email-address" />
      <FormField label="Endereço" value={supplierAddress} onChangeText={setSupplierAddress} />
      <FormField label="Observações" value={supplierNotes} onChangeText={setSupplierNotes} multiline />
      <Pressable disabled={busy || !supplierName.trim() || (editingSupplierId ? !supplierUpdate : !supplierCreate)} style={[styles.button, busy && styles.disabled]} onPress={saveSupplierDetails}><Text style={styles.buttonText}>{editingSupplierId ? 'Salvar alterações' : 'Salvar fornecedor'}</Text></Pressable>
      {editingSupplierId ? <Pressable disabled={busy} style={styles.secondaryButton} onPress={() => { setEditingSupplierId(null); setSupplierName(''); setSupplierCnpj(''); setSupplierPhone(''); setSupplierEmail(''); setSupplierAddress(''); setSupplierContact(''); setSupplierNotes(''); }}><Text style={styles.secondaryButtonText}>Cancelar edição</Text></Pressable> : null}
    </View> : null}
    <View style={styles.card}><Text style={styles.section}>Fornecedores</Text>
      {suppliers.map((supplier) => <View key={supplier.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{supplier.name}</Text><Text style={styles.muted}>{[supplier.cnpj, supplier.phone, supplier.email].filter(Boolean).join(' · ') || 'Sem contato informado'}</Text></View>{supplierUpdate ? <Pressable style={styles.smallButton} onPress={() => editSupplier(supplier)}><Text style={styles.smallButtonText}>Editar</Text></Pressable> : null}{supplierDelete ? <Pressable style={styles.removeButton} onPress={() => confirmArchiveSupplier(supplier)}><Text style={styles.removeText}>Arquivar</Text></Pressable> : null}</View>)}
      {!suppliers.length ? <Text style={styles.muted}>Cadastre um fornecedor para registrar compras.</Text> : null}
    </View>
    {purchaseCreate ? <View style={styles.card}>
      <Text style={styles.section}>Nova compra</Text>
      <FormField label="Pesquisar fornecedor por nome, CNPJ, telefone ou contato" value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Digite para localizar o fornecedor" />
      {selectedSupplier ? <Text style={[styles.muted, { color: '#315a80', fontWeight: '700' }]}>Fornecedor selecionado: {selectedSupplier.name}</Text> : null}
      <View style={styles.chips}>{displayedSuppliers.map((supplier) => <Pressable key={supplier.id} accessibilityRole="button" accessibilityState={{ selected: supplierId === supplier.id }} style={[styles.chip, supplierId === supplier.id && styles.chipSelected]} onPress={() => setSupplierId(supplier.id)}><Text style={[styles.chipText, supplierId === supplier.id && styles.chipTextSelected]}>{supplier.name}</Text></Pressable>)}</View>
      {matchingSuppliers.length > displayedSuppliers.length ? <Text style={styles.muted}>Mostrando 30 fornecedores. Digite mais dados para refinar.</Text> : null}
      {supplierSearch.trim() && !matchingSuppliers.length ? <Text style={styles.muted}>Nenhum fornecedor encontrado com esses dados.</Text> : null}
      <FormField label="Pesquisar produto por nome, código, marca ou categoria" value={productSearch} onChangeText={setProductSearch} placeholder="Digite para localizar o produto" />
      {selectedProduct ? <Text style={[styles.muted, { color: '#315a80', fontWeight: '700' }]}>Produto selecionado: {selectedProduct.name}</Text> : null}
      <View style={styles.chips}>{displayedProducts.map((product) => <Pressable key={product.id} accessibilityRole="button" accessibilityState={{ selected: productId === product.id }} style={[styles.chip, productId === product.id && styles.chipSelected]} onPress={() => { setProductId(product.id); setUnitCost(String(product.cost_price)); }}><Text style={[styles.chipText, productId === product.id && styles.chipTextSelected]}>{product.name}{product.code ? ` · ${product.code}` : ''}</Text></Pressable>)}</View>
      {matchingProducts.length > displayedProducts.length ? <Text style={styles.muted}>Mostrando 30 produtos. Digite mais dados para refinar.</Text> : null}
      {productSearch.trim() && !matchingProducts.length ? <Text style={styles.muted}>Nenhum produto encontrado com esses dados.</Text> : null}
      <View style={styles.row}><View style={styles.half}><FormField label="Quantidade" required value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></View><View style={styles.half}><FormField label="Custo unitário (R$)" required value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" /></View></View>
      <FormField label="Vencimento (AAAA-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="2026-12-31" />
      <Text style={styles.label}>Forma de pagamento prevista</Text>
      <View style={styles.chips}>{paymentMethods.map((method) => <Pressable key={method.value} accessibilityRole="button" accessibilityState={{ selected: purchasePaymentMethod === method.value }} style={[styles.chip, purchasePaymentMethod === method.value && styles.chipSelected]} onPress={() => setPurchasePaymentMethod(method.value)}><Text style={[styles.chipText, purchasePaymentMethod === method.value && styles.chipTextSelected]}>{method.label}</Text></Pressable>)}</View>
      <Pressable disabled={busy || !productId} style={[styles.secondaryButton, busy && styles.disabled]} onPress={addDraftItem}><Text style={styles.secondaryButtonText}>Adicionar produto à compra</Text></Pressable>
      {draftItems.map((item, index) => <View key={`${item.product_id}-${index}`} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{products.find((product) => product.id === item.product_id)?.name ?? 'Produto'} · {item.quantity} un. · {money(item.quantity * item.unit_cost)}</Text><Text style={styles.muted}>{money(item.unit_cost)} por unidade</Text></View><Pressable accessibilityRole="button" style={styles.removeButton} onPress={() => setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Text style={styles.removeText}>Remover</Text></Pressable></View>)}
      {draftItems.length ? <Text style={styles.itemTitle}>Total previsto: {money(draftItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0))}</Text> : null}
      <Pressable disabled={busy || !supplierId || draftItems.length === 0} style={[styles.button, busy && styles.disabled]} onPress={addPurchase}><Text style={styles.buttonText}>Registrar compra</Text></Pressable>
      {!products.length ? <Text style={styles.muted}>Cadastre produtos no estoque antes de comprar.</Text> : null}
    </View> : null}
    <View style={styles.card}><Text style={styles.section}>Recebimentos pendentes</Text>
      {purchaseCreate && !inventoryCreate ? <Text style={styles.muted}>Para receber compras e atualizar o estoque, o proprietário também precisa liberar “Criar” em Estoque.</Text> : null}
      {purchases.filter((purchase) => purchase.status === 'ordered').map((purchase) => <View key={purchase.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{purchase.suppliers?.name ?? 'Fornecedor'}</Text><Text style={styles.muted}>Pedido em {new Date(purchase.created_at).toLocaleDateString('pt-BR')} · vencimento {purchase.due_date ?? 'não informado'} · previsto: {paymentMethodLabel(purchase.payment_method) ?? 'não informado'}</Text></View>{purchaseCreate && inventoryCreate ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => perform(() => receivePurchase(workshopId, purchase.id))}><Text style={styles.smallButtonText}>Receber</Text></Pressable> : null}</View>)}
      {!purchases.some((purchase) => purchase.status === 'ordered') ? <Text style={styles.muted}>Nenhuma compra aguardando recebimento.</Text> : null}
    </View>
    {financeView ? <View style={styles.card}><Text style={styles.section}>Contas a pagar</Text>
      {payables.map((payable) => <View key={payable.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.itemTitle}>{payable.suppliers?.name ?? payable.description} · {money(payable.amount)}</Text><Text style={styles.muted}>{payable.status === 'paid' ? `Paga · ${paymentMethodLabel(payable.payment_method) ?? 'forma não informada'}` : 'Pendente'} · vencimento {payable.due_date ?? 'não informado'}</Text>{payableReversals.filter((entry) => entry.payable_id === payable.id).map((entry) => <Text key={entry.id} style={styles.reversalText}>Estorno em {new Date(entry.reversed_at).toLocaleString('pt-BR')}: {entry.reason}{entry.previous_payment_method ? ` · forma anterior: ${paymentMethodLabel(entry.previous_payment_method) ?? entry.previous_payment_method}` : ''}</Text>)}</View>{payable.status === 'pending' && financeUpdate ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => { setPayableToSettle(payable); setPaymentMethod('pix'); }}><Text style={styles.smallButtonText}>Marcar paga</Text></Pressable> : payable.status === 'paid' && financeUpdate ? <Pressable accessibilityRole="button" accessibilityLabel={`Estornar pagamento ${payable.id}`} disabled={busy} style={styles.reverseButton} onPress={() => { setPayableToReverse(payable); setReversalReason(''); setError(''); }}><Text style={styles.reverseButtonText}>Estornar pagamento</Text></Pressable> : null}</View>)}
      {!payables.length ? <Text style={styles.muted}>As contas surgem quando uma compra é recebida.</Text> : null}
    </View> : null}
    <Modal transparent visible={!!payableToReverse} animationType="fade" onRequestClose={() => setPayableToReverse(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.section}>Estornar pagamento ao fornecedor</Text><Text style={styles.muted}>{payableToReverse?.description} · {payableToReverse ? money(payableToReverse.amount) : ''}</Text><Text style={styles.muted}>A conta voltará a pendente e o motivo ficará na trilha imutável.</Text><FormField label="Motivo do estorno" required value={reversalReason} onChangeText={setReversalReason} multiline placeholder="Ex.: pagamento duplicado" /><View style={styles.modalActions}><Pressable disabled={busy} style={styles.cancelButton} onPress={() => setPayableToReverse(null)}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Confirmar estorno da conta a pagar" disabled={busy} style={styles.confirmButton} onPress={confirmPayableReversal}><Text style={styles.buttonText}>{busy ? 'Estornando…' : 'Confirmar estorno'}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={!!payableToSettle} animationType="fade" onRequestClose={() => { if (!busy) setPayableToSettle(null); }}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.section}>Registrar pagamento</Text><Text style={styles.muted}>{payableToSettle?.description} · {payableToSettle ? money(payableToSettle.amount) : ''}</Text><Text style={styles.label}>Forma usada</Text><View style={styles.chips}>{paymentMethods.map((method) => <Pressable key={method.value} accessibilityRole="button" accessibilityState={{ selected: paymentMethod === method.value }} style={[styles.chip, paymentMethod === method.value && styles.chipSelected]} onPress={() => setPaymentMethod(method.value)}><Text style={[styles.chipText, paymentMethod === method.value && styles.chipTextSelected]}>{method.label}</Text></Pressable>)}</View><View style={styles.modalActions}><Pressable disabled={busy} style={styles.cancelButton} onPress={() => setPayableToSettle(null)}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={confirmPayableSettlement}><Text style={styles.buttonText}>{busy ? 'Salvando…' : 'Confirmar pagamento'}</Text></Pressable></View></View></View></Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { paddingVertical: 22, paddingBottom: 36, gap: 12 }, loading: { marginTop: 35 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#718197', fontSize: 12, lineHeight: 18 }, card: { padding: 15, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 13, backgroundColor: '#fff', gap: 8 }, section: { color: '#10243a', fontSize: 15, fontWeight: '800' }, label: { marginTop: 5, color: '#52657a', fontSize: 11, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#dae2ea', borderRadius: 8 }, chipSelected: { borderColor: '#10243a', backgroundColor: '#10243a' }, chipText: { color: '#41546a', fontSize: 10 }, chipTextSelected: { color: '#fff', fontWeight: '700' }, row: { flexDirection: 'row', gap: 9 }, half: { flex: 1 }, button: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' }, secondaryButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cad6e2', borderRadius: 9 }, secondaryButtonText: { color: '#26425f', fontSize: 11, fontWeight: '700' }, disabled: { opacity: 0.5 }, listRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#edf0f4' }, flex: { flex: 1 }, itemTitle: { color: '#20354b', fontSize: 12, fontWeight: '700' }, removeButton: { padding: 6 }, removeText: { color: '#a23d33', fontSize: 10, fontWeight: '700' }, muted: { color: '#7b8999', fontSize: 10, lineHeight: 15 }, reversalText: { marginTop: 4, color: '#986025', fontSize: 9, lineHeight: 13 }, smallButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7, backgroundColor: '#e97824' }, smallButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' }, reverseButton: { paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: '#d6a49a', borderRadius: 7 }, reverseButtonText: { color: '#a23d33', fontSize: 9, fontWeight: '700' }, modalBackdrop: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: '#0008' }, modalCard: { padding: 17, gap: 9, borderRadius: 14, backgroundColor: '#fff' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, cancelButton: { minHeight: 38, paddingHorizontal: 12, justifyContent: 'center' }, cancelText: { color: '#52657a', fontSize: 11 }, confirmButton: { minHeight: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#a23d33' }, error: { color: '#a23d33', fontSize: 12 }, });
