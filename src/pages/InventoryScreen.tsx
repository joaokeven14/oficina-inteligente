import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import {
  archiveInventoryProduct,
  getWorkshopPermissions,
  listInventoryMovements,
  listInventoryProducts,
  recordInventoryMovement,
  saveInventoryProduct,
} from '../services/workshopData';
import type { InventoryMovement, InventoryProduct, InventoryProductInput, ModulePermissions } from '../types/workshop';

const emptyProduct: InventoryProductInput = {
  name: '', code: null, category: null, brand: null, minimum_quantity: 0,
  cost_price: 0, sale_price: 0, location: null, notes: null,
};
const numberText = (value: number | string) => String(value).replace('.', ',');
const money = (value: number | string) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventoryScreen({ workshopId }: { workshopId: string }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [permissions, setPermissions] = useState<ModulePermissions>({ view: false, create: false, update: false, delete: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<InventoryProduct | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<InventoryProductInput>(emptyProduct);
  const [movementDirection, setMovementDirection] = useState<'entry' | 'exit' | null>(null);
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [rows, access] = await Promise.all([listInventoryProducts(workshopId), getWorkshopPermissions(workshopId)]);
      setProducts(rows);
      setPermissions(access.inventory);
      setSelected((current) => current ? rows.find((product) => product.id === current.id) ?? current : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o estoque.'); }
    finally { setLoading(false); }
  }, [workshopId]);

  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['inventory_products', 'inventory_movements'], refresh);

  useEffect(() => {
    let active = true;
    if (!selected) { setMovements([]); return () => { active = false; }; }
    listInventoryMovements(workshopId, selected.id)
      .then((rows) => { if (active) setMovements(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os movimentos.'); });
    return () => { active = false; };
  }, [selected, workshopId]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return products;
    return products.filter((product) => [product.name, product.code, product.category, product.brand]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [products, query]);
  const lowStockCount = products.filter((product) => Number(product.quantity) <= Number(product.minimum_quantity)).length;
  const totalCost = products.reduce((total, product) => total + Number(product.quantity) * Number(product.cost_price), 0);

  const startNew = () => { setSelected(null); setForm(emptyProduct); setError(''); setEditing(true); };
  const startEdit = (product: InventoryProduct) => {
    setForm({
      name: product.name, code: product.code, category: product.category, brand: product.brand,
      minimum_quantity: Number(product.minimum_quantity), cost_price: Number(product.cost_price),
      sale_price: Number(product.sale_price), location: product.location, notes: product.notes,
    });
    setSelected(product); setError(''); setEditing(true);
  };
  const set = (key: keyof InventoryProductInput, value: string) => {
    const numeric = key === 'minimum_quantity' || key === 'cost_price' || key === 'sale_price';
    setForm((current) => ({ ...current, [key]: numeric ? (value ? Number(value.replace(',', '.')) : 0) : (value || null) }));
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      await saveInventoryProduct(workshopId, form, selected?.id);
      setEditing(false); setSelected(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o produto.'); }
    finally { setBusy(false); }
  };
  const archive = (product: InventoryProduct) => Alert.alert(
    'Arquivar produto',
    `Arquivar ${product.name}? O histórico de estoque será preservado.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Arquivar', style: 'destructive', onPress: () => { (async () => {
      await archiveInventoryProduct(workshopId, product.id); setSelected(null); await refresh();
    })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível arquivar o produto.')); } }],
  );
  const startMovement = (direction: 'entry' | 'exit') => { setError(''); setMovementQuantity(''); setMovementNote(''); setMovementDirection(direction); };
  const saveMovement = async () => {
    if (!selected || !movementDirection) return;
    setBusy(true); setError('');
    try {
      await recordInventoryMovement(workshopId, selected.id, movementDirection, Number(movementQuantity.replace(',', '.')), movementNote);
      setMovementDirection(null); await refresh();
      setMovements(await listInventoryMovements(workshopId, selected.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o movimento.'); }
    finally { setBusy(false); }
  };
  const closeEditing = () => { if (!busy) setEditing(false); };
  const closeSelected = () => { if (!busy) setSelected(null); };

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}><Text style={styles.title}>Estoque</Text><Text style={styles.subtitle}>{products.length} produto(s) · {money(totalCost)} em custo</Text></View>
        {permissions.create ? <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={startNew}><Text style={styles.primaryButtonText}>+ Produto</Text></Pressable> : null}
      </View>
      {lowStockCount > 0 ? <View style={styles.lowStockBanner}><Text style={styles.lowStockText}>{lowStockCount} produto(s) no mínimo ou abaixo dele</Text></View> : null}
      <FormField label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Nome, código, categoria ou marca" />
      {error && !selected && !editing ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {visible.map((product) => {
            const low = Number(product.quantity) <= Number(product.minimum_quantity);
            return (
              <Pressable key={product.id} style={styles.productCard} onPress={() => { setError(''); setSelected(product); }}>
                <View style={styles.productTop}><Text style={styles.productName}>{product.name}</Text><Text style={[styles.stockBadge, low ? styles.stockLow : styles.stockGood]}>{numberText(product.quantity)} un.</Text></View>
                <Text style={styles.meta}>{[product.code, product.category, product.brand].filter(Boolean).join(' · ') || 'Sem código ou categoria'}</Text>
                <View style={styles.productBottom}><Text style={styles.meta}>Mínimo: {numberText(product.minimum_quantity)} · Venda: {money(product.sale_price)}</Text><Text style={styles.meta}>Custo: {money(product.cost_price)}</Text></View>
              </Pressable>
            );
          })}
          {!visible.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? 'Nenhum produto encontrado' : 'Ainda não há produtos'}</Text><Text style={styles.meta}>{query ? 'Altere sua pesquisa.' : 'Cadastre produtos para controlar saldo e movimentos do estoque.'}</Text></View> : null}
        </ScrollView>
      )}

      <Modal visible={editing} animationType="slide" onRequestClose={closeEditing}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>{selected ? 'Editar produto' : 'Novo produto'}</Text><Text style={styles.subtitle}>O saldo só muda por entrada ou saída.</Text></View><Pressable onPress={closeEditing}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <FormField label="Nome do produto" required value={form.name} onChangeText={(value) => set('name', value)} />
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Código" value={form.code ?? ''} onChangeText={(value) => set('code', value)} /></View><View style={styles.column}><FormField label="Categoria" value={form.category ?? ''} onChangeText={(value) => set('category', value)} /></View></View>
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Marca" value={form.brand ?? ''} onChangeText={(value) => set('brand', value)} /></View><View style={styles.column}><FormField label="Localização" value={form.location ?? ''} onChangeText={(value) => set('location', value)} /></View></View>
            <FormField label="Estoque mínimo" value={numberText(form.minimum_quantity)} onChangeText={(value) => set('minimum_quantity', value)} keyboardType="decimal-pad" />
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Custo unitário (R$)" value={numberText(form.cost_price)} onChangeText={(value) => set('cost_price', value)} keyboardType="decimal-pad" /></View><View style={styles.column}><FormField label="Preço de venda (R$)" value={numberText(form.sale_price)} onChangeText={(value) => set('sale_price', value)} keyboardType="decimal-pad" /></View></View>
            <FormField label="Observações" value={form.notes ?? ''} onChangeText={(value) => set('notes', value)} multiline />
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, styles.saveButton, busy && styles.disabled]} onPress={() => { save(); }}><Text style={styles.primaryButtonText}>{busy ? 'Salvando…' : 'Salvar produto'}</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!selected && !editing} animationType="slide" onRequestClose={closeSelected}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>{selected?.name}</Text><Text style={styles.subtitle}>{selected?.code || selected?.category || 'Produto da oficina'}</Text></View><Pressable onPress={closeSelected}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent}>
            <View style={styles.detailCard}><Text style={styles.detailStock}>{numberText(selected?.quantity ?? 0)} unidades</Text><Text style={styles.meta}>Mínimo {numberText(selected?.minimum_quantity ?? 0)} · Custo {money(selected?.cost_price ?? 0)} · Venda {money(selected?.sale_price ?? 0)}</Text></View>
            <View style={styles.actionRow}>
              {permissions.create ? <Pressable accessibilityRole="button" style={styles.stockEntry} onPress={() => startMovement('entry')}><Text style={styles.actionText}>+ Entrada</Text></Pressable> : null}
              {permissions.create ? <Pressable accessibilityRole="button" style={styles.stockExit} onPress={() => startMovement('exit')}><Text style={styles.actionText}>− Saída</Text></Pressable> : null}
              {permissions.update ? <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => { startEdit(selected!); }}><Text style={styles.secondaryButtonText}>Editar</Text></Pressable> : null}
              {permissions.update ? <Pressable accessibilityRole="button" style={styles.archiveButton} onPress={() => archive(selected!)}><Text style={styles.archiveText}>Arquivar</Text></Pressable> : null}
            </View>
            <Text style={styles.sectionTitle}>Histórico de movimentos</Text>
            {!movements.length ? <Text style={styles.noData}>Nenhum movimento de estoque registrado.</Text> : movements.map((movement) => (
              <View key={movement.id} style={styles.movementRow}><View style={styles.movementMain}><Text style={styles.movementTitle}>{movement.direction === 'entry' ? 'Entrada' : 'Saída'} · {numberText(movement.quantity)} un.</Text><Text style={styles.meta}>{movement.note || 'Movimento manual'} · {new Date(movement.created_at).toLocaleString('pt-BR')}</Text></View><Text style={[styles.movementSign, movement.direction === 'entry' ? styles.entryText : styles.exitText]}>{movement.direction === 'entry' ? '+' : '−'}</Text></View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!movementDirection} transparent animationType="fade" onRequestClose={() => { if (!busy) setMovementDirection(null); }}>
        <View style={styles.overlay}><View style={styles.movementModal}>
          <Text style={styles.title}>{movementDirection === 'entry' ? 'Entrada de estoque' : 'Saída de estoque'}</Text>
          <Text style={styles.subtitle}>{selected?.name} · saldo atual {numberText(selected?.quantity ?? 0)}</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <FormField label="Quantidade" required value={movementQuantity} onChangeText={setMovementQuantity} keyboardType="decimal-pad" />
          <FormField label="Observação" value={movementNote} onChangeText={setMovementNote} placeholder="Motivo do movimento" />
          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryButton} onPress={() => { if (!busy) setMovementDirection(null); }}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
            <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => { saveMovement(); }}><Text style={styles.primaryButtonText}>{busy ? 'Salvando…' : 'Confirmar movimento'}</Text></Pressable>
          </View>
        </View></View>
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
  secondaryButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cad6e2', borderRadius: 9, backgroundColor: '#fff' },
  secondaryButtonText: { color: '#26425f', fontSize: 11, fontWeight: '700' },
  lowStockBanner: { marginTop: 10, padding: 10, borderRadius: 9, backgroundColor: '#fff2e8' },
  lowStockText: { color: '#a64f14', fontSize: 11, fontWeight: '700' },
  loading: { marginTop: 36 },
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingBottom: 25, gap: 9 },
  productCard: { padding: 14, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' },
  productTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  productName: { flex: 1, color: '#1a2c40', fontSize: 13, fontWeight: '700' },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 10, fontWeight: '800' },
  stockLow: { backgroundColor: '#fff2e8', color: '#ad5716' },
  stockGood: { backgroundColor: '#e9f5ed', color: '#36764c' },
  productBottom: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  meta: { marginTop: 5, color: '#7b8999', fontSize: 11, lineHeight: 16 },
  empty: { marginTop: 16, padding: 21, alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  emptyTitle: { color: '#26394e', fontSize: 14, fontWeight: '700' },
  limit: { padding: 12, color: '#77879a', fontSize: 11 },
  error: { marginTop: 10, color: '#a23d33', fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, paddingTop: 24, paddingHorizontal: 20, backgroundColor: '#f4f7fb' },
  modalHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  cancelText: { padding: 8, color: '#315a80', fontSize: 12, fontWeight: '700' },
  formContent: { paddingBottom: 34 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  saveButton: { marginTop: 22, minHeight: 48 },
  disabled: { opacity: 0.6 },
  detailCard: { marginTop: 10, padding: 16, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' },
  detailStock: { color: '#10243a', fontSize: 22, fontWeight: '900' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' },
  stockEntry: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#e9f5ed' },
  stockExit: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#fff2e8' },
  actionText: { color: '#24415e', fontSize: 11, fontWeight: '800' },
  archiveButton: { minHeight: 40, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  archiveText: { color: '#9d4b3c', fontSize: 11, fontWeight: '700' },
  sectionTitle: { marginTop: 24, marginBottom: 8, color: '#10243a', fontSize: 16, fontWeight: '800' },
  noData: { padding: 10, color: '#8996a5', fontSize: 12, lineHeight: 17 },
  movementRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e4eaf0' },
  movementMain: { flex: 1 },
  movementTitle: { color: '#26394e', fontSize: 12, fontWeight: '700' },
  movementSign: { fontSize: 20, fontWeight: '800' },
  entryText: { color: '#36764c' },
  exitText: { color: '#ad5716' },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(10, 24, 39, 0.45)' },
  movementModal: { padding: 20, borderRadius: 16, backgroundColor: '#f4f7fb' },
});
