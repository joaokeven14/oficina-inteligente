import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { deleteWorkshopEmployee, getWorkshopPermissions, inviteWorkshopEmployee, listWorkshopEmployees, saveWorkshopEmployeePermissions, setWorkshopEmployeeStatus } from '../services/workshopData';
import type { ModulePermissions, WorkshopEmployee } from '../types/workshop';

const modules = [
  ['dashboard', 'Painel'], ['clients', 'Clientes'], ['vehicles', 'Veículos'], ['service_orders', 'Ordens de serviço'], ['after_sales', 'Pós-venda'], ['estimates', 'Orçamentos'],
  ['inventory', 'Estoque'], ['purchases', 'Compras'], ['finance', 'Financeiro'], ['reports', 'Relatórios'], ['employees', 'Funcionários'], ['settings', 'Configurações'],
] as const;
const emptyPermissions = (): Record<string, ModulePermissions> => Object.fromEntries(modules.map(([module]) => [module, { view: false, create: false, update: false, delete: false }]));
const actionLabels = [['view', 'Ver'], ['create', 'Criar'], ['update', 'Editar'], ['delete', 'Excluir']] as const;

export default function EmployeesScreen({ workshopId, isOwner }: { workshopId: string; isOwner: boolean }) {
  const [employees, setEmployees] = useState<WorkshopEmployee[]>([]);
  const [canView, setCanView] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<WorkshopEmployee | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<Record<string, ModulePermissions>>(emptyPermissions);

  const refresh = useCallback(async () => {
    try {
      const access = await getWorkshopPermissions(workshopId);
      setCanView(access.employees.view); setCanCreate(access.employees.create); setCanUpdate(access.employees.update); setCanDelete(access.employees.delete);
      setEmployees(access.employees.view ? await listWorkshopEmployees(workshopId) : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os funcionários.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['workshop_memberships', 'workshop_member_permissions'], refresh);

  const editPermissions = (employee: WorkshopEmployee) => {
    const current = emptyPermissions();
    for (const item of employee.workshop_member_permissions) {
      current[item.module] = { view: item.can_view, create: item.can_create, update: item.can_update, delete: item.can_delete };
    }
    setSelected(employee); setPermissions(current); setFullName(''); setEmail(''); setError(''); setModalOpen(true);
  };
  const beginInvite = () => { setSelected(null); setPermissions(emptyPermissions()); setFullName(''); setEmail(''); setError(''); setModalOpen(true); };
  const toggle = (module: string, action: keyof ModulePermissions) => setPermissions((current) => ({
    ...current, [module]: { ...current[module], [action]: !current[module][action] },
  }));
  const save = async () => {
    setBusy(true); setError('');
    try {
      let inviteResult: { reusedExistingAccount: boolean; invitationSent: boolean } | null = null;
      if (selected) await saveWorkshopEmployeePermissions(workshopId, selected, permissions);
      else inviteResult = await inviteWorkshopEmployee(workshopId, fullName, email, permissions);
      setModalOpen(false); await refresh();
      if (inviteResult) {
        Alert.alert(
          inviteResult.invitationSent ? 'Convite enviado' : 'Acesso vinculado',
          inviteResult.reusedExistingAccount
            ? 'Este e-mail já tinha uma conta. Ela foi vinculada à oficina; o funcionário pode entrar com a senha atual.'
            : inviteResult.invitationSent
              ? 'O convite foi enviado ao funcionário. Ele deve abrir o e-mail para criar o acesso.'
              : 'O acesso do funcionário foi vinculado à oficina.',
        );
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as permissões.'); }
    finally { setBusy(false); }
  };
  const toggleStatus = (employee: WorkshopEmployee) => {
    const nextStatus = employee.status === 'active' ? 'disabled' : 'active';
    Alert.alert(nextStatus === 'disabled' ? 'Desativar funcionário' : 'Reativar funcionário', `${employee.profiles.full_name} poderá ${nextStatus === 'active' ? 'voltar a acessar' : 'perder acesso a'} esta oficina.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: nextStatus === 'disabled' ? 'Desativar' : 'Reativar', onPress: () => { setBusy(true); setWorkshopEmployeeStatus(workshopId, employee, nextStatus).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o funcionário.')).finally(() => setBusy(false)); } },
    ]);
  };
  const removeEmployee = (employee: WorkshopEmployee) => Alert.alert('Remover funcionário', `Remover o acesso de ${employee.profiles.full_name} a esta oficina?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Remover', style: 'destructive', onPress: () => { setBusy(true); deleteWorkshopEmployee(workshopId, employee).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível remover o funcionário.')).finally(() => setBusy(false)); } },
  ]);

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  if (!canView) return <View style={styles.page}><Text style={styles.title}>Funcionários</Text><Text style={styles.muted}>Seu usuário não tem permissão para visualizar funcionários.</Text></View>;
  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.flex}><Text style={styles.title}>Funcionários</Text><Text style={styles.subtitle}>{employees.length} acesso(s) individual(is)</Text></View>{isOwner && canCreate ? <Pressable style={styles.primary} onPress={beginInvite}><Text style={styles.primaryText}>+ Convidar</Text></Pressable> : null}</View>
    {error && !modalOpen ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <ScrollView contentContainerStyle={styles.list}>
      {employees.map((employee) => <View key={employee.id} style={styles.card}>
        <View style={styles.employeeRow}><View style={styles.flex}><Text style={styles.name}>{employee.profiles.full_name}</Text><Text style={styles.muted}>{employee.status === 'active' ? 'Acesso ativo' : 'Acesso desativado'}</Text></View>
          {isOwner && canUpdate ? <Pressable disabled={busy} style={styles.smallButton} onPress={() => editPermissions(employee)}><Text style={styles.smallText}>Permissões</Text></Pressable> : null}
        </View>
        {(isOwner && (canUpdate || canDelete)) ? <View style={styles.employeeRow}><Text style={styles.muted}>{employee.workshop_member_permissions.filter((p) => p.can_view).length} módulo(s) visíveis</Text>
          {canUpdate ? <Pressable disabled={busy} style={styles.linkButton} onPress={() => toggleStatus(employee)}><Text style={styles.linkText}>{employee.status === 'active' ? 'Desativar' : 'Reativar'}</Text></Pressable> : null}
          {canDelete ? <Pressable disabled={busy} style={styles.linkButton} onPress={() => removeEmployee(employee)}><Text style={styles.deleteText}>Excluir</Text></Pressable> : null}
        </View> : null}
      </View>)}
      {!employees.length ? <View style={styles.card}><Text style={styles.name}>Nenhum funcionário cadastrado</Text><Text style={styles.muted}>Convide uma pessoa por e-mail e configure as permissões de acesso.</Text></View> : null}
    </ScrollView>
    <Modal visible={modalOpen} animationType="slide" onRequestClose={() => { if (!busy) setModalOpen(false); }}>
      <View style={styles.modal}><View style={styles.modalHeader}><View><Text style={styles.title}>{selected ? 'Permissões' : 'Convidar funcionário'}</Text><Text style={styles.subtitle}>Cada ação também é validada pelo banco.</Text></View><Pressable onPress={() => { if (!busy) setModalOpen(false); }}><Text style={styles.close}>Fechar</Text></Pressable></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <ScrollView contentContainerStyle={styles.modalContent}>
          {!selected ? <><FormField label="Nome completo" required value={fullName} onChangeText={setFullName} /><FormField label="E-mail de convite" required value={email} onChangeText={setEmail} keyboardType="email-address" /></> : <Text style={styles.employeeName}>{selected.profiles.full_name}</Text>}
          <Text style={styles.section}>Permissões por módulo</Text>
          <View style={styles.permissionHeader}><Text style={styles.moduleCol}>Módulo</Text>{actionLabels.map(([,label]) => <Text key={label} style={styles.actionCol}>{label}</Text>)}</View>
          {modules.map(([module,label]) => <View key={module} style={styles.permissionRow}><Text style={styles.moduleCol}>{label}</Text>{actionLabels.map(([key]) => {
            const enabled = permissions[module]?.[key] ?? false;
            return <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: enabled }} style={[styles.permissionToggle, enabled && styles.permissionToggleOn]} onPress={() => toggle(module,key)}><Text style={[styles.toggleText,enabled && styles.toggleTextOn]}>{enabled ? '✓' : '—'}</Text></Pressable>;
          })}</View>)}
          <Text style={styles.muted}>Pós-venda e Compras têm permissões próprias. Somente o proprietário pode liberar essas áreas; Compras também começa sem acesso. Para receber compras, conceda “Criar” em Estoque.</Text>
          <Text style={styles.muted}>Administradores da plataforma e proprietários da oficina não podem ser criados como funcionários por esta tela.</Text>
          <Pressable disabled={busy || (!selected && (!fullName.trim() || !email.trim()))} style={[styles.primary, styles.saveButton, busy && styles.disabled]} onPress={() => { save(); }}><Text style={styles.primaryText}>{busy ? 'Salvando…' : selected ? 'Salvar permissões' : 'Enviar convite'}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, paddingTop: 20 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { marginTop: 3, color: '#718197', fontSize: 11 }, primary: { minHeight: 39, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, primaryText: { color: '#fff', fontSize: 11, fontWeight: '700' }, list: { paddingVertical: 12, paddingBottom: 30, gap: 8 }, card: { padding: 13, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fff', gap: 8 }, employeeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, name: { color: '#1a2c40', fontSize: 13, fontWeight: '700' }, muted: { marginTop: 3, color: '#77879a', fontSize: 10, lineHeight: 15 }, smallButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: '#eaf0f6' }, smallText: { color: '#24415e', fontSize: 10, fontWeight: '700' }, linkButton: { paddingHorizontal: 7, paddingVertical: 5 }, linkText: { color: '#a64f14', fontSize: 10, fontWeight: '700' }, deleteText: { color: '#a23d33', fontSize: 10, fontWeight: '700' }, loading: { marginTop: 30 }, error: { marginTop: 9, color: '#a23d33', fontSize: 12 }, modal: { flex: 1, paddingTop: 24, paddingHorizontal: 18, backgroundColor: '#f4f7fb' }, modalHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { color: '#315a80', fontSize: 12, fontWeight: '700' }, modalContent: { paddingBottom: 35 }, section: { marginTop: 18, marginBottom: 8, color: '#10243a', fontSize: 15, fontWeight: '800' }, employeeName: { marginTop: 15, color: '#26394e', fontSize: 13, fontWeight: '700' }, permissionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dbe3eb' }, permissionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e8edf2' }, moduleCol: { flex: 1, color: '#33465b', fontSize: 10, fontWeight: '700' }, actionCol: { width: 50, textAlign: 'center', color: '#718197', fontSize: 9 }, permissionToggle: { width: 50, height: 34, alignItems: 'center', justifyContent: 'center' }, permissionToggleOn: { borderRadius: 7, backgroundColor: '#e8f4ec' }, toggleText: { color: '#a1acb8', fontSize: 15, fontWeight: '800' }, toggleTextOn: { color: '#36764c' }, saveButton: { marginTop: 15 }, disabled: { opacity: 0.5 } });
