import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomersScreen from './CustomersScreen';
import VehiclesScreen from './VehiclesScreen';
import ServiceOrdersScreen from './ServiceOrdersScreen';
import InventoryScreen from './InventoryScreen';
import PurchasesScreen from './PurchasesScreen';
import EstimatesScreen from './EstimatesScreen';
import AfterSalesScreen from './AfterSalesScreen';
import EmployeesScreen from './EmployeesScreen';
import PlatformAdminScreen from './PlatformAdminScreen';
import FinanceScreen from './FinanceScreen';
import WorkshopSettingsScreen from './WorkshopSettingsScreen';
import ReportsScreen from './ReportsScreen';
import DashboardOverview from '../components/DashboardOverview';
import { listCurrentWorkshops, getDashboardMetrics, getFinanceDashboardMetrics, getWorkshopPermissions, isPlatformAdministrator } from '../services/workshopData';
import type { DashboardMetrics, FinanceDashboardMetrics, WorkshopContext, WorkshopPermissions } from '../types/workshop';

type Tab = 'Início' | 'Ordens' | 'Clientes' | 'Veículos' | 'Estoque' | 'Compras' | 'Financeiro' | 'Orçamentos' | 'Pós-venda' | 'Funcionários' | 'Relatórios' | 'Configurações' | 'Admin';

export default function HomeScreen({ onSignOut, initialTab = 'Início' }: { onSignOut: () => void; initialTab?: Tab }) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const desktop = useWindowDimensions().width >= 900;
  const [workshop, setWorkshop] = useState<WorkshopContext | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopContext[]>([]);
  const [workshopPickerOpen, setWorkshopPickerOpen] = useState(false);
  const [permissions, setPermissions] = useState<WorkshopPermissions | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [financeMetrics, setFinanceMetrics] = useState<FinanceDashboardMetrics | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([listCurrentWorkshops(), isPlatformAdministrator()])
      .then(([contexts, isAdmin]) => {
        if (!active) return;
        setPlatformAdmin(isAdmin);
        setWorkshops(contexts);
        setWorkshop(contexts[0] ?? null);
        if (isAdmin && contexts.length === 0) setActiveTab('Admin');
      })
      .catch((reason: unknown) => { if (active) setLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar a oficina.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loading && activeTab === 'Admin' && !platformAdmin) setActiveTab('Início');
  }, [activeTab, loading, platformAdmin]);

  useEffect(() => {
    if (!loading && activeTab === 'Compras' && !permissions?.purchases?.view) setActiveTab('Início');
  }, [activeTab, loading, permissions]);

  useEffect(() => {
    let active = true;
    setPermissions(null); setMetrics(null); setFinanceMetrics(null);
    if (!workshop) return () => { active = false; };
    getWorkshopPermissions(workshop.workshopId).then(async (access) => {
      if (!active) return;
      setPermissions(access);
      if (access.dashboard.view) {
        const dashboard = await getDashboardMetrics(workshop.workshopId);
        if (!active) return;
        setMetrics(dashboard);
        if (access.finance.view) setFinanceMetrics(await getFinanceDashboardMetrics(workshop.workshopId));
      }
    }).catch((reason: unknown) => { if (active) setLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados da oficina.'); });
    return () => { active = false; };
  }, [workshop]);

  const visibleTabs: Tab[] = !workshop && platformAdmin ? ['Admin'] : [
    'Início',
    ...(permissions?.clients.view ? ['Clientes' as const] : []),
    ...(permissions?.vehicles.view ? ['Veículos' as const] : []),
    ...(permissions?.service_orders.view ? ['Ordens' as const] : []),
    ...(permissions?.inventory.view ? ['Estoque' as const] : []),
    ...(permissions?.purchases?.view ? ['Compras' as const] : []),
    ...(permissions?.finance.view ? ['Financeiro' as const] : []),
    ...(permissions?.estimates.view ? ['Orçamentos' as const] : []),
    ...(permissions?.service_orders.view ? ['Pós-venda' as const] : []),
    ...(permissions?.employees.view ? ['Funcionários' as const] : []),
    ...(permissions?.reports.view ? ['Relatórios' as const] : []),
    ...(permissions?.settings.view ? ['Configurações' as const] : []),
    ...(platformAdmin ? ['Admin' as const] : []),
  ];

  const navigate = (tab: Tab) => { setActiveTab(tab); setMobileMenuOpen(false); };
  const navigation = visibleTabs.map((tab) => <NavigationItem key={tab} tab={tab} selected={activeTab === tab} onPress={() => navigate(tab)} />);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#10243a" />
      <View style={styles.topBar}>
        {!desktop ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu de módulos" style={styles.menuButton} onPress={() => setMobileMenuOpen(true)}><Text style={styles.menuGlyph}>☰</Text></Pressable> : null}
        <View style={styles.brandIcon}><Text style={styles.brandLetters}>OI</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Selecionar oficina" disabled={workshops.length < 2} onPress={() => setWorkshopPickerOpen(true)} style={styles.brandText}>
          <Text style={styles.brandName}>Oficina Inteligente</Text>
          <Text style={styles.brandCaption}>{workshop?.workshopName ?? (platformAdmin ? 'ADMINISTRADOR DA PLATAFORMA' : 'GESTÃO DA SUA OFICINA')}{workshops.length > 1 ? '  ▾' : ''}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sair da conta" style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sair</Text>
        </Pressable>
      </View>

      <Modal visible={workshopPickerOpen} transparent animationType="fade" onRequestClose={() => setWorkshopPickerOpen(false)}>
        <View style={styles.pickerBackdrop}><View style={styles.pickerCard}><Text style={styles.setupTitle}>Selecionar oficina</Text><Text style={styles.setupBody}>Os dados e permissões mudam conforme a oficina selecionada.</Text>{workshops.map((item) => <Pressable key={item.workshopId} accessibilityRole="button" accessibilityState={{ selected: item.workshopId === workshop?.workshopId }} style={[styles.workshopChoice, item.workshopId === workshop?.workshopId && styles.workshopChoiceActive]} onPress={() => { setWorkshop(item); setActiveTab('Início'); setLoadError(''); setWorkshopPickerOpen(false); }}><Text style={styles.workshopChoiceName}>{item.workshopName}</Text><Text style={styles.workshopChoiceRole}>{item.role === 'owner' ? 'Proprietário' : 'Funcionário'}</Text></Pressable>)}<Pressable style={styles.pickerClose} onPress={() => setWorkshopPickerOpen(false)}><Text style={styles.pickerCloseText}>Fechar</Text></Pressable></View></View>
      </Modal>

      <Modal visible={mobileMenuOpen && !desktop} transparent animationType="fade" onRequestClose={() => setMobileMenuOpen(false)}>
        <View style={styles.menuBackdrop}><View style={styles.menuSheet}><View style={styles.menuHeader}><Text style={styles.menuTitle}>Módulos da oficina</Text><Pressable accessibilityRole="button" accessibilityLabel="Fechar menu" style={styles.menuClose} onPress={() => setMobileMenuOpen(false)}><Text style={styles.pickerCloseText}>Fechar</Text></Pressable></View><ScrollView contentContainerStyle={styles.navigationContent}>{navigation}</ScrollView><Text style={styles.navigationNote}>Os módulos disponíveis seguem suas permissões.</Text></View></View>
      </Modal>

      <View style={styles.body}>
        {desktop ? <View style={styles.sidebar}><Text style={styles.navigationHeading}>NAVEGAÇÃO</Text><ScrollView contentContainerStyle={styles.navigationContent}>{navigation}</ScrollView><Text style={styles.navigationNote}>{workshop?.role === 'owner' ? 'Acesso do proprietário' : 'Acesso conforme permissões'}</Text></View> : null}
        <View style={[styles.pageContainer, desktop && styles.desktopPage]}>
        {activeTab === 'Clientes' && workshop ? <CustomersScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Veículos' && workshop ? <VehiclesScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Ordens' && workshop ? <ServiceOrdersScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Estoque' && workshop ? <InventoryScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Compras' && workshop ? <PurchasesScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Financeiro' && workshop ? <FinanceScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Orçamentos' && workshop ? <EstimatesScreen key={workshop.workshopId} workshopId={workshop.workshopId} /> : null}
        {activeTab === 'Pós-venda' && workshop ? <AfterSalesScreen key={workshop.workshopId} workshopId={workshop.workshopId} workshopName={workshop.workshopName} /> : null}
        {activeTab === 'Funcionários' && workshop ? <EmployeesScreen key={workshop.workshopId} workshopId={workshop.workshopId} isOwner={workshop.role === 'owner'} /> : null}
        {activeTab === 'Configurações' && workshop ? <WorkshopSettingsScreen key={workshop.workshopId} workshopId={workshop.workshopId} isOwner={workshop.role === 'owner'} /> : null}
        {activeTab === 'Relatórios' && workshop ? <ReportsScreen key={workshop.workshopId} workshopId={workshop.workshopId} workshopName={workshop.workshopName} isOwner={workshop.role === 'owner'} /> : null}
        {activeTab === 'Admin' && platformAdmin ? <PlatformAdminScreen /> : null}
        {(activeTab === 'Início' || loading || loadError || (!workshop && !platformAdmin)) ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.greeting}>Bem-vindo</Text>
            <Text style={styles.pageTitle}>{activeTab === 'Início' ? workshop?.workshopName ?? 'Sua oficina' : activeTab}</Text>
            {loading ? <View style={styles.loading}><ActivityIndicator color="#e97824" /><Text style={styles.statusText}>Carregando o vínculo da oficina…</Text></View> : null}
            {loadError ? <View style={styles.setupCard}><Text style={styles.setupTitle}>Não foi possível abrir a oficina</Text><Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text></View> : null}
            {!loading && !loadError && !workshop ? <View style={styles.setupCard}><View style={styles.setupBadge}><Text style={styles.setupBadgeText}>ACESSO NÃO VINCULADO</Text></View><Text style={styles.setupTitle}>Sua conta ainda não está vinculada a uma oficina ativa</Text><Text style={styles.setupBody}>Peça ao administrador da plataforma para criar ou ativar seu acesso. Os dados da oficina ficam preservados enquanto ela estiver bloqueada.</Text></View> : null}
            {!loading && !loadError && workshop && activeTab === 'Início' ? (
              <>
                <View style={styles.dashboardWelcome}><View style={styles.statusDot} /><Text style={styles.statusText}>Painel operacional · {workshop.role === 'owner' ? 'Proprietário' : 'Funcionário'}</Text></View>
                {permissions?.dashboard.view ? <DashboardOverview key={workshop.workshopId} workshopId={workshop.workshopId} permissions={permissions} onOpenAfterSales={() => navigate('Pós-venda')} /> : null}
                {metrics ? <Text style={styles.sectionTitle}>Posição atual da oficina</Text> : null}
                {metrics ? <View style={styles.metricsGrid}>
                  {[
                    ['Clientes', metrics.customers], ['Veículos', metrics.vehicles], ['OS abertas', metrics.orders_open],
                    ['Em execução', metrics.orders_in_progress], ['Concluídas', metrics.orders_completed],
                    ['Orçamentos pendentes', metrics.estimates_pending], ['Estoque baixo', metrics.inventory_low], ['Contas a pagar', metrics.payables_pending],
                  ].map(([label, value]) => <View key={String(label)} style={styles.metricCard}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>)}
                </View> : null}
                {financeMetrics ? <View style={styles.metricsGrid}>
                  {[
                    ['Orçamentos aprovados', financeMetrics.estimates_approved],
                    ['A receber', `R$ ${financeMetrics.receivables_pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
                    ['Vencido', `R$ ${financeMetrics.receivables_overdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
                    ['Recebido no mês', `R$ ${financeMetrics.received_this_month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
                    ['Despesas pagas no mês', `R$ ${financeMetrics.expenses_this_month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
                    ['Resultado do mês', `R$ ${financeMetrics.profit_this_month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
                  ].map(([label, value]) => <View key={String(label)} style={styles.metricCard}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>)}
                </View> : null}
                <Text style={styles.sectionTitle}>Módulos</Text>
                <View style={styles.quickActions}>
                  {visibleTabs.filter((tab) => tab !== 'Início').map((tab) => (
                    <Pressable key={tab} style={styles.quickAction} onPress={() => setActiveTab(tab)}>
                      <View style={styles.actionIcon}><Text style={styles.actionIconText}>{tab === 'Clientes' ? 'CL' : tab === 'Veículos' ? 'VC' : tab === 'Ordens' ? 'OS' : tab === 'Compras' ? 'CP' : tab === 'Financeiro' ? 'FI' : tab === 'Orçamentos' ? 'OR' : tab === 'Pós-venda' ? 'PV' : tab === 'Funcionários' ? 'FU' : tab === 'Relatórios' ? 'RE' : tab === 'Configurações' ? 'CF' : tab === 'Admin' ? 'AD' : 'ES'}</Text></View>
                      <Text style={styles.actionLabel}>{tab}</Text>
                      <Text style={styles.actionHint}>{tab === 'Clientes' || tab === 'Veículos' || tab === 'Ordens' || tab === 'Estoque' || tab === 'Compras' || tab === 'Financeiro' || tab === 'Orçamentos' || tab === 'Pós-venda' || tab === 'Funcionários' || tab === 'Relatórios' || tab === 'Configurações' || tab === 'Admin' ? 'Disponível' : 'Em implantação'}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      </View>
      {!desktop ? <View style={styles.mobileFooter}><Text style={styles.mobileLocation}>{activeTab}</Text><Pressable accessibilityRole="button" style={styles.mobileMenuAction} onPress={() => setMobileMenuOpen(true)}><Text style={styles.refreshNavText}>Menu de módulos</Text></Pressable></View> : null}
    </SafeAreaView>
  );
}


const tabIcons: Record<Tab, string> = { 'Início': 'IN', 'Clientes': 'CL', 'Veículos': 'VC', 'Ordens': 'OS', 'Estoque': 'ES', 'Compras': 'CP', 'Financeiro': 'FI', 'Orçamentos': 'OR', 'Pós-venda': 'PV', 'Funcionários': 'FU', 'Relatórios': 'RE', 'Configurações': 'CF', 'Admin': 'AD' };
function NavigationItem({ tab, selected, onPress }: { tab: Tab; selected: boolean; onPress: () => void }) {
  const label = tab === 'Admin' ? 'Administração' : tab;
  return <Pressable accessibilityRole="tab" accessibilityLabel={tab === 'Admin' ? 'Administração da plataforma' : label} accessibilityState={{ selected }} style={[styles.navigationItem, selected && styles.navigationItemActive]} onPress={onPress}><View style={[styles.navigationIcon, selected && styles.navigationIconActive]}><Text style={[styles.navigationIconText, selected && styles.navigationTextActive]}>{tabIcons[tab]}</Text></View><Text style={[styles.navigationText, selected && styles.navigationTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },
  topBar: { minHeight: 76, backgroundColor: '#10243a', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  brandIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#e97824', alignItems: 'center', justifyContent: 'center' },
  brandLetters: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: -1 },
  brandText: { flex: 1, marginLeft: 12 },
  brandName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  brandCaption: { marginTop: 3, color: '#aab8c8', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  signOut: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#61758c', borderRadius: 10 },
  signOutText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  pageContainer: { flex: 1, minWidth: 0, maxWidth: 1440, width: '100%', paddingHorizontal: 20, alignSelf: 'stretch' },
  desktopPage: { paddingHorizontal: 30 },
  dashboardWelcome: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  sidebar: { width: 218, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e1e8ef', paddingTop: 26 },
  navigationHeading: { color: '#8a98a9', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, paddingHorizontal: 23, marginBottom: 13 },
  navigationContent: { paddingHorizontal: 12, paddingBottom: 20, gap: 4 },
  navigationItem: { flexDirection: 'row', alignItems: 'center', minHeight: 43, paddingHorizontal: 10, gap: 10, borderRadius: 9 },
  navigationItemActive: { backgroundColor: '#10243a' },
  navigationIcon: { width: 27, height: 27, borderRadius: 7, backgroundColor: '#edf2f7', alignItems: 'center', justifyContent: 'center' },
  navigationIconActive: { backgroundColor: '#e97824' },
  navigationIconText: { color: '#61758b', fontSize: 9, fontWeight: '800' },
  navigationText: { color: '#566b82', fontSize: 12, fontWeight: '600' },
  navigationTextActive: { color: '#fff' },
  navigationNote: { color: '#8a98a9', fontSize: 10, lineHeight: 16, padding: 18, borderTopWidth: 1, borderTopColor: '#edf1f5' },
  menuButton: { paddingVertical: 8, paddingRight: 15 },
  menuGlyph: { color: '#fff', fontSize: 24 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(10,24,40,0.6)' },
  menuSheet: { flex: 1, width: '88%', maxWidth: 330, backgroundColor: '#fff', paddingTop: 24 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 20 },
  menuTitle: { color: '#10243a', fontSize: 16, fontWeight: '800' },
  menuClose: { padding: 8 },
  mobileFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e1e8ef', backgroundColor: '#fff' },
  mobileLocation: { color: '#10243a', fontSize: 12, fontWeight: '700' },
  mobileMenuAction: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#edf2f7' },
  refreshNavText: { color: '#315a80', fontSize: 11, fontWeight: '700' },
  content: { paddingTop: 27, paddingBottom: 34 },
  greeting: { color: '#718197', fontSize: 13, fontWeight: '600' },
  pageTitle: { marginTop: 3, marginBottom: 20, color: '#10243a', fontSize: 27, fontWeight: '800', letterSpacing: -0.8 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 17 },
  setupCard: { padding: 20, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 17, backgroundColor: '#fff' },
  setupBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: '#fff2e8' },
  setupBadgeText: { color: '#c56019', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  setupTitle: { marginTop: 14, color: '#10243a', fontSize: 18, fontWeight: '700' },
  setupBody: { marginTop: 8, color: '#617287', fontSize: 14, lineHeight: 21 },
  errorText: { marginTop: 8, color: '#a23d33', fontSize: 13, lineHeight: 19 },
  setupFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#edf0f4' },
  pickerBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(10,24,40,0.6)' },
  pickerCard: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 20, borderRadius: 16, backgroundColor: '#fff', gap: 10 },
  workshopChoice: { padding: 13, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 10 },
  workshopChoiceActive: { borderColor: '#e97824', backgroundColor: '#fff7f0' },
  workshopChoiceName: { color: '#10243a', fontSize: 13, fontWeight: '700' },
  workshopChoiceRole: { marginTop: 3, color: '#718197', fontSize: 10 },
  pickerClose: { alignSelf: 'flex-end', padding: 8 },
  pickerCloseText: { color: '#315a80', fontSize: 12, fontWeight: '700' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e97824' },
  statusText: { color: '#68798d', fontSize: 12, fontWeight: '600' },
  sectionTitle: { marginTop: 27, marginBottom: 13, color: '#10243a', fontSize: 16, fontWeight: '700' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricsGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metricCard: { flexGrow: 1, flexBasis: '22%', minWidth: 105, minHeight: 76, padding: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  metricValue: { color: '#10243a', fontSize: 22, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: '#718197', fontSize: 10, fontWeight: '600' },
  quickAction: { flexGrow: 1, flexBasis: '22%', minHeight: 115, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: '#e1e8ef', backgroundColor: '#fff' },
  actionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef3f8', alignItems: 'center', justifyContent: 'center' },
  actionIconText: { color: '#24415e', fontSize: 10, fontWeight: '800' },
  actionLabel: { marginTop: 10, color: '#1a2c40', fontSize: 13, fontWeight: '700' },
  actionHint: { marginTop: 4, color: '#8a98a9', fontSize: 10 },
  tabBar: { flexDirection: 'row', justifyContent: 'flex-start', gap: 12, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#e5eaf0', backgroundColor: '#fff' },
  tab: { minWidth: 54, alignItems: 'center', gap: 3 },
  tabIcon: { minWidth: 33, height: 27, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIconSelected: { backgroundColor: '#eaf0f6' },
  tabIconText: { color: '#8391a1', fontSize: 10, fontWeight: '800' },
  tabIconTextSelected: { color: '#10243a' },
  tabLabel: { color: '#8996a5', fontSize: 9, fontWeight: '600' },
  tabLabelSelected: { color: '#10243a' },
});
