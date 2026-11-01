import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { archiveVehicle, getWorkshopPermissions, listCustomers, listVehicles, saveVehicle } from '../services/workshopData';
import type { Customer, ModulePermissions, Vehicle, VehicleInput } from '../types/workshop';

const emptyVehicle: VehicleInput = {
  customer_id: '', make: '', model: '', year_manufacture: null, model_year: null,
  plate: '', color: null, mileage_km: null, fuel: null, chassis: null, notes: null,
};

function toInput(vehicle: Vehicle): VehicleInput {
  const { customer_id, make, model, year_manufacture, model_year, plate, color, mileage_km, fuel, chassis, notes } = vehicle;
  return { customer_id, make, model, year_manufacture, model_year, plate, color, mileage_km, fuel, chassis, notes };
}

const fuelOptions: { value: NonNullable<VehicleInput['fuel']>; label: string }[] = [
  { value: 'flex', label: 'Flex' }, { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' }, { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Elétrico' }, { value: 'hybrid', label: 'Híbrido' },
];

export default function VehiclesScreen({ workshopId }: { workshopId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [permissions, setPermissions] = useState<ModulePermissions>({ view: false, create: false, update: false, delete: false });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleInput>(emptyVehicle);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [vehicleRows, customerRows, access] = await Promise.all([listVehicles(workshopId), listCustomers(workshopId), getWorkshopPermissions(workshopId)]);
      setVehicles(vehicleRows);
      setCustomers(customerRows);
      setPermissions(access.vehicles);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os veículos.'); }
    finally { setLoading(false); }
  }, [workshopId]);

  useEffect(() => { refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return vehicles;
    return vehicles.filter((vehicle) => [vehicle.plate, vehicle.make, vehicle.model, vehicle.customers?.full_name]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [vehicles, query]);

  const beginCreate = () => { setSelected({ id: '__new__' } as Vehicle); setForm(emptyVehicle); setError(''); };
  const beginEdit = (vehicle: Vehicle) => { setSelected(vehicle); setForm(toInput(vehicle)); setError(''); };
  const closeForm = () => { if (!busy) setSelected(null); };
  const set = (key: keyof VehicleInput, value: string) => setForm((current) => ({
    ...current,
    [key]: key === 'year_manufacture' || key === 'model_year' || key === 'mileage_km'
      ? (value ? Number(value.replace(/\D/g, '')) : null)
      : value || null,
  }));
  const save = async () => {
    if (!form.make.trim() || !form.model.trim()) { setError('Informe a marca e o modelo.'); return; }
    setBusy(true); setError('');
    try {
      await saveVehicle(workshopId, form, selected?.id === '__new__' ? undefined : selected?.id);
      setSelected(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o veículo.'); }
    finally { setBusy(false); }
  };
  const confirmArchive = (vehicle: Vehicle) => Alert.alert(
    'Arquivar veículo',
    `O veículo ${vehicle.plate} será ocultado das novas operações. O histórico será preservado.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Arquivar', style: 'destructive', onPress: () => { (async () => {
      try { await archiveVehicle(workshopId, vehicle.id); await refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível arquivar o veículo.'); }
    })().catch(() => setError('Não foi possível arquivar o veículo.')); } }],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingText}><Text style={styles.title}>Veículos</Text><Text style={styles.subtitle}>{vehicles.length} cadastro(s) ativo(s)</Text></View>
        {permissions.create ? <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={beginCreate}><Text style={styles.primaryButtonText}>+ Novo</Text></Pressable> : null}
      </View>
      <FormField label="Pesquisar" value={query} onChangeText={setQuery} placeholder="Placa, marca, modelo ou cliente" />
      {error && !selected ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {visible.map((vehicle) => (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <Pressable disabled={!permissions.update} style={styles.vehicleMain} onPress={() => beginEdit(vehicle)}>
                <View style={styles.vehicleTitleRow}><Text style={styles.plate}>{vehicle.plate}</Text><Text style={styles.vehicleName}>{vehicle.make} {vehicle.model}</Text></View>
                <Text style={styles.meta}>{vehicle.customers?.full_name ?? 'Cliente'}{vehicle.model_year ? ` · ${vehicle.model_year}` : ''}{vehicle.mileage_km !== null ? ` · ${vehicle.mileage_km.toLocaleString('pt-BR')} km` : ''}</Text>
              </Pressable>
              {permissions.update ? <Pressable accessibilityRole="button" accessibilityLabel={`Arquivar veículo ${vehicle.plate}`} style={styles.archiveButton} onPress={() => confirmArchive(vehicle)}><Text style={styles.archiveText}>Arquivar</Text></Pressable> : null}
            </View>
          ))}
          {!visible.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{query ? 'Nenhum veículo encontrado' : customers.length ? 'Ainda não há veículos' : 'Cadastre um cliente primeiro'}</Text><Text style={styles.meta}>{query ? 'Altere sua pesquisa.' : customers.length ? 'Cadastre o primeiro veículo da oficina.' : 'O veículo precisa estar vinculado a um cliente cadastrado.'}</Text></View> : null}
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}><View><Text style={styles.title}>{selected?.id === '__new__' ? 'Novo veículo' : 'Editar veículo'}</Text><Text style={styles.subtitle}>Vincule o veículo a um cliente cadastrado.</Text></View><Pressable onPress={closeForm}><Text style={styles.cancelText}>Fechar</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Cliente *</Text>
            {customers.length ? customers.map((customer) => {
              const active = form.customer_id === customer.id;
              return <Pressable key={customer.id} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.customerChoice, active && styles.customerChoiceActive]} onPress={() => setForm((current) => ({ ...current, customer_id: customer.id }))}><Text style={[styles.customerChoiceText, active && styles.customerChoiceTextActive]}>{customer.full_name}{customer.document ? ` · ${customer.document}` : ''}</Text></Pressable>;
            }) : <Text style={styles.noCustomers}>Cadastre um cliente antes de incluir o veículo.</Text>}
            <FormField label="Marca" required value={form.make} onChangeText={(value) => set('make', value)} />
            <FormField label="Modelo" required value={form.model} onChangeText={(value) => set('model', value)} />
            <FormField label="Placa" required value={form.plate} onChangeText={(value) => set('plate', value.toUpperCase())} placeholder="ABC1D23" />
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Ano de fabricação" value={form.year_manufacture?.toString() ?? ''} onChangeText={(value) => set('year_manufacture', value)} keyboardType="number-pad" /></View><View style={styles.column}><FormField label="Ano do modelo" value={form.model_year?.toString() ?? ''} onChangeText={(value) => set('model_year', value)} keyboardType="number-pad" /></View></View>
            <View style={styles.twoColumns}><View style={styles.column}><FormField label="Cor" value={form.color ?? ''} onChangeText={(value) => set('color', value)} /></View><View style={styles.column}><FormField label="Quilometragem" value={form.mileage_km?.toString() ?? ''} onChangeText={(value) => set('mileage_km', value)} keyboardType="number-pad" /></View></View>
            <Text style={[styles.label, styles.fuelHeading]}>Combustível</Text>
            <View style={styles.fuelChoices}>{fuelOptions.map((option) => { const active = form.fuel === option.value; return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.fuelChoice, active && styles.fuelChoiceActive]} onPress={() => setForm((current) => ({ ...current, fuel: option.value }))}><Text style={[styles.fuelChoiceText, active && styles.fuelChoiceTextActive]}>{option.label}</Text></Pressable>; })}</View>
            <FormField label="Chassi" value={form.chassis ?? ''} onChangeText={(value) => set('chassis', value)} />
            <FormField label="Observações" value={form.notes ?? ''} onChangeText={(value) => set('notes', value)} multiline />
            <Pressable accessibilityRole="button" disabled={busy || !customers.length} style={[styles.primaryButton, styles.saveButton, (busy || !customers.length) && styles.disabled]} onPress={() => { save(); }}><Text style={styles.primaryButtonText}>{busy ? 'Salvando…' : 'Salvar veículo'}</Text></Pressable>
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
  vehicleCard: { minHeight: 75, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  vehicleMain: { flex: 1, paddingRight: 8 },
  vehicleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  plate: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: '#eef3f8', color: '#24415e', fontSize: 11, fontWeight: '800' },
  vehicleName: { color: '#1a2c40', fontSize: 13, fontWeight: '700' },
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
  label: { marginTop: 14, marginBottom: 6, color: '#33465b', fontSize: 12, fontWeight: '700' },
  customerChoice: { padding: 11, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 8, backgroundColor: '#fff', marginBottom: 6 },
  customerChoiceActive: { borderColor: '#e97824', backgroundColor: '#fff5ed' },
  customerChoiceText: { color: '#41536a', fontSize: 12 },
  customerChoiceTextActive: { color: '#9d4b12', fontWeight: '700' },
  noCustomers: { padding: 10, color: '#9d4b3c', fontSize: 12 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  fuelHeading: { marginTop: 16 },
  fuelChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fuelChoice: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: '#dce3eb', backgroundColor: '#fff' },
  fuelChoiceActive: { borderColor: '#10243a', backgroundColor: '#10243a' },
  fuelChoiceText: { color: '#53657b', fontSize: 11 },
  fuelChoiceTextActive: { color: '#fff', fontWeight: '700' },
  saveButton: { marginTop: 22, minHeight: 48 },
  disabled: { opacity: 0.6 },
});
