import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { archiveCustomer, getWorkshopPermissions, listCustomers, saveCustomer } from '../services/workshopData';
import type { Customer, CustomerInput, ModulePermissions } from '../types/workshop';

const emptyCustomer: CustomerInput = {
  full_name: '', document: null, phone: null, whatsapp: null, email: null,
  address: null, city: null, state: null, notes: null,
};

function toInput(customer: Customer): CustomerInput {
  const { full_name, document, phone, whatsapp, email, address, city, state, notes } = customer;
  return { full_name, document, phone, whatsapp, email, address, city, state, notes };
}

export default function CustomersScreen({ workshopId }: { workshopId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [permissions, setPermissions] = useState<ModulePermissions>({ view: false, create: false, update: false, delete: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyCustomer);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [rows, access] = await Promise.all([listCustomers(workshopId), getWorkshopPermissions(workshopId)]);
      setCustomers(rows);
      setPermissions(access.clients);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar clientes.'); }
    finally { setLoading(false); }
  }, [workshopId]);

  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['customers'], refresh);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return customers;
    return customers.filter((customer) => [customer.full_name, customer.document, customer.phone, customer.email]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [customers, query]);

  const beginCreate = () => { setSelected(null); setForm(emptyCustomer); setError(''); };
  const beginEdit = (customer: Customer) => { setSelected(customer); setForm(toInput(customer)); setError(''); };
  const closeForm = () => { if (!busy) setSelected((current) => current?.id === '__new__' ? null : current); };
  const set = (key: keyof CustomerInput, value: string) => setForm((current) => ({ ...current, [key]: value || null }));
  const save = async () => {
    if (!form.full_name.trim()) { setError('Informe o nome do cliente.'); return; }
    setBusy(true); setError('');
    try {
      await saveCustomer(workshopId, form, selected?.id === '__new__' ? undefined : selected?.id);
      setSelected(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o cliente.'); }
    finally { setBusy(false); }
  };
  const confirmArchive = (customer: Customer) => Alert.alert(
    'Arquivar cliente',
    `O cadastro de ${customer.full_name} será ocultado das novas operações. O histórico permanece preservado.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Arquivar', style: 'destructive', onPress: () => { (async () => {
      try { await archiveCustomer(workshopId, customer.id); await refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível arquivar o cliente.'); }
    })().catch(() => setError('Não foi possível arquivar o cliente.')); } }],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}><Text style={styles.title}>Clientes</Text><Text style={styles.subtitle}>{customers.length} cadastro(s) ativo(s)</Text></View>
        {permissions.create ? <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => { beginCreate(); setSelected({ id: '__new__' } as Customer); }}><Text style={styles.primaryButtonText}>+ Novo</Text></Pressable> : null}
      </View>
      <FormField label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Nome, CPF/CNPJ, telefone ou e-mail" />
      {error && !selected ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {visible.map((customer) => (
            <View key={customer.id} style={styles.customerCard}>
              <Pressable disabled={!permissions.update} style={styles.customerMain} onPress={() => beginEdit(customer)}>
                <Text style={styles.customerName}>{customer.full_name}</Text>
                <Text style={styles.meta}>{[customer.document, customer.phone || customer.whatsapp, customer.email].filter(Boolean).join(' · ') || 'Sem contato informado'}</Text>
              </Pressable>
              {permissions.update ? <Pressable accessibilityRole="button" accessibilityLabel={`Arquivar ${customer.full_name}`} style={styles.archiveButton} onPress={() => confirmArchive(customer)}><Text style={styles.archiveText}>Arquivar</Text></Pressable> : null}
            </View>
          ))}
          {!visible.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}</Text><Text style={styles.meta}>{query ? 'Altere sua pesquisa.' : 'Cadastre o primeiro cliente para vincular veículos e ordens de serviço.'}</Text></View> : null}
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>{selected?.id === '__new__' ? 'Novo cliente' : 'Editar cliente'}</Text><Text style={styles.subtitle}>Os campos com * são obrigatórios.</Text></View><Pressable onPress={closeForm}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <FormField label="Nome completo" required value={form.full_name} onChangeText={(value) => set('full_name', value)} />
            <FormField label="CPF ou CNPJ" value={form.document ?? ''} onChangeText={(value) => set('document', value)} keyboardType="number-pad" />
            <Text style={styles.lookupHint}>Não fazemos consulta automática pelo CPF/CNPJ. Preencha os demais dados do cliente manualmente.</Text>
            <FormField label="Telefone" value={form.phone ?? ''} onChangeText={(value) => set('phone', value)} keyboardType="phone-pad" />
            <FormField label="WhatsApp" value={form.whatsapp ?? ''} onChangeText={(value) => set('whatsapp', value)} keyboardType="phone-pad" />
            <FormField label="E-mail" value={form.email ?? ''} onChangeText={(value) => set('email', value)} keyboardType="email-address" />
            <FormField label="Endereço" value={form.address ?? ''} onChangeText={(value) => set('address', value)} />
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Cidade" value={form.city ?? ''} onChangeText={(value) => set('city', value)} /></View><View style={styles.stateField}><FormField label="UF" value={form.state ?? ''} onChangeText={(value) => set('state', value.toUpperCase().slice(0, 2))} /></View></View>
            <FormField label="Observações" value={form.notes ?? ''} onChangeText={(value) => set('notes', value)} multiline />
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.primaryButton, styles.saveButton, busy && styles.disabled]} onPress={() => { save(); }}><Text style={styles.primaryButtonText}>{busy ? 'Salvando…' : 'Salvar cliente'}</Text></Pressable>
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
  loading: { marginTop: 36 },
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingBottom: 25, gap: 9 },
  customerCard: { minHeight: 75, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  customerMain: { flex: 1, paddingRight: 8 },
  customerName: { color: '#1a2c40', fontSize: 14, fontWeight: '700' },
  meta: { marginTop: 5, color: '#7b8999', fontSize: 11, lineHeight: 16 },
  archiveButton: { padding: 8 },
  archiveText: { color: '#9d4b3c', fontSize: 11, fontWeight: '700' },
  empty: { marginTop: 16, padding: 21, alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  emptyTitle: { color: '#26394e', fontSize: 14, fontWeight: '700' },
  limit: { padding: 12, color: '#77879a', fontSize: 11 },
  error: { marginTop: 10, color: '#a23d33', fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, paddingTop: 24, paddingHorizontal: 20, backgroundColor: '#f4f7fb' },
  modalHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  cancelText: { padding: 8, color: '#315a80', fontSize: 12, fontWeight: '700' },
  formContent: { paddingBottom: 34 },
  lookupHint: { marginTop: 5, color: '#77879a', fontSize: 10, lineHeight: 15 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  stateField: { width: 74 },
  saveButton: { marginTop: 22, minHeight: 48 },
  disabled: { opacity: 0.6 },
});
