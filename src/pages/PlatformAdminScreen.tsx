import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import FormField from '../components/FormField';
import { createPlatformWorkshop, deletePlatformWorkshop, getPlatformMetrics, listPlatformWorkshops, setPlatformWorkshopStatus } from '../services/workshopData';
import type { PlatformMetrics, PlatformWorkshop } from '../types/workshop';

export default function PlatformAdminScreen() {
  const [workshops, setWorkshops] = useState<PlatformWorkshop[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [workshopToDelete, setWorkshopToDelete] = useState<PlatformWorkshop | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const refresh = useCallback(async () => {
    try { const [rows, platformMetrics] = await Promise.all([listPlatformWorkshops(), getPlatformMetrics()]); setWorkshops(rows); setMetrics(platformMetrics); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as oficinas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return term ? workshops.filter((item) => [item.name, ...item.owners.flatMap((owner) => [owner.full_name, owner.email ?? ''])]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(term))) : workshops;
  }, [workshops, query]);
  const create = async () => {
    setBusy(true); setError('');
    try {
      await createPlatformWorkshop(workshopName, ownerName, ownerEmail);
      setWorkshopName(''); setOwnerName(''); setOwnerEmail(''); await refresh();
      Alert.alert('Convite enviado', 'A oficina foi criada e o convite do proprietário foi enviado por e-mail.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a oficina.'); }
    finally { setBusy(false); }
  };
  const toggleStatus = (workshop: PlatformWorkshop) => {
    const next = workshop.status === 'active' ? 'blocked' : 'active';
    Alert.alert(next === 'blocked' ? 'Bloquear oficina' : 'Reativar oficina', next === 'blocked' ? 'Os usuários perderão o acesso; os dados serão preservados.' : 'Os usuários ativos voltarão a acessar os dados da oficina.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: next === 'blocked' ? 'Bloquear' : 'Reativar', style: next === 'blocked' ? 'destructive' : 'default', onPress: () => { setBusy(true); setPlatformWorkshopStatus(workshop.id, next).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a oficina.')).finally(() => setBusy(false)); } },
    ]);
  };
  const requestWorkshopDeletion = (workshop: PlatformWorkshop) => {
    setDeleteConfirmation(''); setDeleteError(''); setWorkshopToDelete(workshop);
  };
  const cancelWorkshopDeletion = () => {
    if (busy) return;
    setWorkshopToDelete(null); setDeleteConfirmation(''); setDeleteError('');
  };
  const confirmWorkshopDeletion = async () => {
    if (!workshopToDelete || deleteConfirmation.trim() !== workshopToDelete.name) return;
    setBusy(true); setDeleteError('');
    try {
      const deletedName = workshopToDelete.name;
      const deletedId = workshopToDelete.id;
      const result = await deletePlatformWorkshop(deletedId, deleteConfirmation.trim());
      setWorkshopToDelete(null); setDeleteConfirmation('');
      setWorkshops((current) => current.filter((workshop) => workshop.id !== deletedId));
      await refresh();
      Alert.alert('Oficina excluída', result.warning ?? `A oficina “${deletedName}” e os dados vinculados foram excluídos. As contas dos usuários foram mantidas.`);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Não foi possível excluir a oficina. Tente novamente.');
    } finally { setBusy(false); }
  };
  return <View style={styles.page}>
    <Text style={styles.title}>Administração da plataforma</Text>
    <Text style={styles.subtitle}>{metrics?.workshops_total ?? workshops.length} oficina(s) · {metrics?.workshops_active ?? workshops.filter((item) => item.status === 'active').length} ativa(s) · {metrics?.workshops_blocked ?? workshops.filter((item) => item.status === 'blocked').length} bloqueada(s)</Text>
    {metrics ? <View style={styles.metrics}><Metric label="Usuários vinculados" value={metrics.members_total} /><Metric label="Usuários em oficinas ativas" value={metrics.members_active} /><Metric label="Oficinas criadas hoje" value={metrics.workshops_created_today} /><Metric label="Atividades auditadas hoje" value={metrics.audit_events_today} /></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}><Text style={styles.section}>Criar oficina e convidar proprietário</Text>
        <FormField label="Nome da oficina" required value={workshopName} onChangeText={setWorkshopName} />
        <FormField label="Nome do proprietário" required value={ownerName} onChangeText={setOwnerName} />
        <FormField label="E-mail do proprietário" required value={ownerEmail} onChangeText={setOwnerEmail} keyboardType="email-address" />
        <Pressable disabled={busy || !workshopName.trim() || !ownerName.trim() || !ownerEmail.trim()} style={[styles.primary, busy && styles.disabled]} onPress={() => { create(); }}><Text style={styles.primaryText}>{busy ? 'Criando…' : 'Criar e enviar convite'}</Text></Pressable>
        <Text style={styles.note}>O serviço seguro envia o convite e cria o vínculo proprietário. Chave administrativa não fica no aplicativo.</Text>
      </View>
      <FormField label="Pesquisar oficinas ou proprietários" value={query} onChangeText={setQuery} placeholder="Oficina, proprietário ou e-mail de login" />
      {loading ? <ActivityIndicator style={styles.loading} color="#e97824" /> : visible.map((workshop) => <View key={workshop.id} style={styles.card}>
        <View style={styles.row}><View style={styles.flex}><Text style={styles.workshopName}>{workshop.name}</Text><Text style={styles.note}>{workshop.status === 'active' ? 'Ativa' : 'Bloqueada'} · {workshop.members_total} usuário(s) · criada {new Date(workshop.created_at).toLocaleDateString('pt-BR')}</Text>
          {workshop.owners.map((owner) => <Text key={`${workshop.id}:${owner.email ?? owner.full_name}`} style={styles.note}>Proprietário: {owner.full_name} · Login: {owner.email ?? 'e-mail não disponível'}{owner.status === 'disabled' ? ' · acesso desativado' : ''}</Text>)}
        </View><View style={styles.actions}><Pressable disabled={busy} style={[styles.statusButton, workshop.status === 'blocked' && styles.unblock]} onPress={() => toggleStatus(workshop)}><Text style={styles.statusText}>{workshop.status === 'active' ? 'Bloquear' : 'Reativar'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Excluir oficina ${workshop.name}`} disabled={busy} style={[styles.deleteButton, busy && styles.disabled]} onPress={() => requestWorkshopDeletion(workshop)}><Text style={styles.deleteText}>Excluir oficina</Text></Pressable></View></View>
      </View>)}
      {!loading && !visible.length ? <Text style={styles.note}>Nenhuma oficina ou proprietário encontrado.</Text> : null}
      {!loading && visible.length ? <Text style={styles.note}>O login é o e-mail da conta. Senhas nunca são exibidas.</Text> : null}
    </ScrollView>
    <Modal transparent visible={!!workshopToDelete} animationType="fade" onRequestClose={cancelWorkshopDeletion}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Excluir oficina definitivamente?</Text>
        <Text style={styles.modalText}>Esta ação apaga permanentemente a oficina, os clientes, veículos, ordens de serviço, orçamentos, estoque, compras, dados financeiros, fotos, logotipo e vínculos dos funcionários.</Text>
        <Text style={styles.modalText}>As contas dos usuários serão mantidas. Os registros de auditoria serão preservados sem vínculo com a oficina; vínculos desses usuários com outras oficinas não serão afetados.</Text>
        <Text style={styles.modalLabel}>Digite o nome da oficina para confirmar: {workshopToDelete?.name}</Text>
        <TextInput accessibilityLabel="Digite o nome da oficina para confirmar a exclusão" value={deleteConfirmation} onChangeText={setDeleteConfirmation} autoCapitalize="sentences" autoCorrect={false} editable={!busy} style={styles.confirmationInput} />
        {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
        <View style={styles.modalActions}>
          <Pressable disabled={busy} style={styles.cancelButton} onPress={cancelWorkshopDeletion}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || !workshopToDelete || deleteConfirmation.trim() !== workshopToDelete.name} style={[styles.deleteConfirm, (busy || !workshopToDelete || deleteConfirmation.trim() !== workshopToDelete.name) && styles.disabled]} onPress={() => { confirmWorkshopDeletion(); }}><Text style={styles.statusText}>{busy ? 'Excluindo…' : 'Excluir definitivamente'}</Text></Pressable>
        </View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, paddingTop: 20 }, title: { color: '#10243a', fontSize: 23, fontWeight: '800' }, subtitle: { marginTop: 4, color: '#718197', fontSize: 11 }, content: { paddingVertical: 12, paddingBottom: 32, gap: 10 }, card: { padding: 14, gap: 8, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff' }, section: { color: '#10243a', fontSize: 14, fontWeight: '800' }, primary: { minHeight: 41, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, primaryText: { color: '#fff', fontSize: 11, fontWeight: '700' }, disabled: { opacity: 0.5 }, note: { color: '#77879a', fontSize: 10, lineHeight: 15 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, workshopName: { color: '#20354b', fontSize: 13, fontWeight: '700' }, actions: { gap: 6, alignItems: 'stretch' }, statusButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7, backgroundColor: '#9d4b3c', alignItems: 'center' }, unblock: { backgroundColor: '#36764c' }, deleteButton: { paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#d6a49a', borderRadius: 7, alignItems: 'center' }, deleteText: { color: '#a23d33', fontSize: 9, fontWeight: '700' }, statusText: { color: '#fff', fontSize: 10, fontWeight: '700' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, metric: { flexGrow: 1, flexBasis: '45%', minWidth: 110, padding: 10, borderRadius: 9, backgroundColor: '#fff' }, metricValue: { color: '#10243a', fontSize: 18, fontWeight: '900' }, metricLabel: { marginTop: 3, color: '#718197', fontSize: 9 }, error: { marginTop: 8, color: '#a23d33', fontSize: 12 }, loading: { marginTop: 24 }, modalBackdrop: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#0008' }, modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 18, gap: 10, borderRadius: 14, backgroundColor: '#fff' }, modalTitle: { color: '#10243a', fontSize: 18, fontWeight: '800' }, modalText: { color: '#52677e', fontSize: 12, lineHeight: 18 }, modalLabel: { marginTop: 3, color: '#27394e', fontSize: 12, fontWeight: '700' }, confirmationInput: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#dce3eb', borderRadius: 9, color: '#1b2c40', backgroundColor: '#fff', fontSize: 14 }, modalActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 4 }, cancelButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: '#52657a', fontSize: 11 }, deleteConfirm: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#a23d33' } });

function Metric({ label, value }: { label: string; value: number }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
