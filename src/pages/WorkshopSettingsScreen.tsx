import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import FormField from '../components/FormField';
import { useWorkshopLiveRefresh } from '../hooks/useWorkshopLiveRefresh';
import { getWorkshopSettings, removeWorkshopLogo, saveWorkshopSettings, uploadWorkshopLogo } from '../services/workshopData';
import type { WorkshopSettings } from '../types/workshop';

const blank = (value: string | null | undefined) => value ?? '';

export default function WorkshopSettingsScreen({ workshopId, isOwner }: { workshopId: string; isOwner: boolean }) {
  const [settings, setSettings] = useState<WorkshopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const refresh = useCallback(async () => {
    try { setSettings(await getWorkshopSettings(workshopId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as configurações.'); }
    finally { setLoading(false); }
  }, [workshopId]);
  useEffect(() => { refresh(); }, [refresh]);
  useWorkshopLiveRefresh(workshopId, ['workshops'], refresh);

  const change = (field: keyof WorkshopSettings, value: string) => {
    if (!settings) return;
    setSaved(false); setSettings({ ...settings, [field]: value });
  };
  const save = async () => {
    if (!settings || !isOwner) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await saveWorkshopSettings(workshopId, {
        name: settings.name, cnpj: blank(settings.cnpj), phone: blank(settings.phone), whatsapp: blank(settings.whatsapp),
        email: blank(settings.email), address: blank(settings.address), city: blank(settings.city), state: blank(settings.state),
        responsible_name: blank(settings.responsible_name), opening_hours: blank(settings.opening_hours),
      });
      await refresh(); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as configurações.'); }
    finally { setBusy(false); }
  };

  const changeLogo = async () => {
    if (!isOwner) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      let selected: { file: Blob; name: string; type: string } | null = null;
      if (Platform.OS === 'web') {
        selected = await new Promise((resolve, reject) => {
          const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
          input.onchange = () => { const file = input.files?.[0]; resolve(file ? { file, name: file.name, type: file.type } : null); };
          input.onerror = () => reject(new Error('Não foi possível abrir o seletor de arquivos.')); input.click();
        });
      } else if (Platform.OS !== 'windows') {
        const response = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1, maxWidth: 1200, maxHeight: 1200, assetRepresentationMode: 'compatible' });
        if (response.didCancel) return;
        if (response.errorCode) throw new Error('Não foi possível acessar as fotos do aparelho. Tente novamente.');
        const asset = response.assets?.[0];
        if (asset?.uri) selected = { file: await (await fetch(asset.uri)).blob(), name: asset.fileName ?? 'logotipo', type: asset.type ?? '' };
      } else throw new Error('O envio do logotipo pelo aplicativo para computador não está disponível. Abra a versão no navegador e acesse Configurações da oficina.');
      if (!selected) return;
      await uploadWorkshopLogo(workshopId, selected.file, selected.name, selected.type.toLocaleLowerCase());
      await refresh(); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o logotipo.'); }
    finally { setBusy(false); }
  };

  const deleteLogo = async () => {
    if (!isOwner) return;
    setBusy(true); setError(''); setSaved(false);
    try { await removeWorkshopLogo(workshopId); await refresh(); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível remover o logotipo.'); }
    finally { setBusy(false); }
  };

  if (loading) return <ActivityIndicator style={styles.loading} color="#e97824" />;
  if (!settings) return <View style={styles.page}><Text style={styles.title}>Configurações da oficina</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Configurações da oficina</Text>
    <Text style={styles.subtitle}>Dados institucionais usados na identificação da oficina e nos documentos gerados.</Text>
    {!isOwner ? <Text style={styles.notice}>Somente o proprietário pode alterar esses dados.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.card}>
      <Text style={styles.section}>Identificação</Text>
      <Text style={styles.fieldLabel}>Logotipo da oficina</Text>
      {settings.logo_url ? <Image source={{ uri: settings.logo_url }} resizeMode="contain" style={styles.logoPreview} /> : <Text style={styles.helper}>Nenhum logotipo cadastrado.</Text>}
      {isOwner ? <View style={styles.logoActions}><Pressable accessibilityRole="button" disabled={busy} style={[styles.logoButton, busy && styles.disabled]} onPress={() => { changeLogo().catch(() => undefined); }}><Text style={styles.buttonText}>{busy ? 'Enviando…' : 'Enviar ou trocar logotipo'}</Text></Pressable>{settings.logo_path ? <Pressable accessibilityRole="button" disabled={busy} style={[styles.removeLogoButton, busy && styles.disabled]} onPress={() => { deleteLogo().catch(() => undefined); }}><Text style={styles.removeLogoText}>Remover</Text></Pressable> : null}</View> : null}
      <Text style={styles.helper}>JPEG, PNG ou WebP · até 5 MB · arquivos privados da oficina. Para enviar o logotipo pelo aplicativo instalado no computador, use a versão no navegador.</Text>
      <FormField label="Nome da oficina" required value={settings.name} onChangeText={(value) => change('name', value)} />
      <FormField label="CNPJ" value={blank(settings.cnpj)} onChangeText={(value) => change('cnpj', value)} keyboardType="number-pad" />
      <FormField label="Responsável" value={blank(settings.responsible_name)} onChangeText={(value) => change('responsible_name', value)} />
      <FormField label="E-mail" value={blank(settings.email)} onChangeText={(value) => change('email', value)} keyboardType="email-address" />
    </View>
    <View style={styles.card}>
      <Text style={styles.section}>Contato</Text>
      <FormField label="Telefone" value={blank(settings.phone)} onChangeText={(value) => change('phone', value)} keyboardType="phone-pad" />
      <FormField label="WhatsApp" value={blank(settings.whatsapp)} onChangeText={(value) => change('whatsapp', value)} keyboardType="phone-pad" />
    </View>
    <View style={styles.card}>
      <Text style={styles.section}>Endereço e horário</Text>
      <FormField label="Endereço" value={blank(settings.address)} onChangeText={(value) => change('address', value)} />
      <View style={styles.row}><View style={styles.half}><FormField label="Cidade" value={blank(settings.city)} onChangeText={(value) => change('city', value)} /></View><View style={styles.half}><FormField label="UF" value={blank(settings.state)} onChangeText={(value) => change('state', value)} /></View></View>
      <FormField label="Horário de funcionamento" value={blank(settings.opening_hours)} onChangeText={(value) => change('opening_hours', value)} multiline placeholder="Segunda a sexta, das 8h às 18h" />
    </View>
    {isOwner ? <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={save}><Text style={styles.buttonText}>{busy ? 'Salvando…' : saved ? 'Alterações salvas' : 'Salvar configurações'}</Text></Pressable> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { paddingTop: 22, paddingBottom: 34, gap: 11 }, loading: { marginTop: 32 }, title: { color: '#10243a', fontSize: 24, fontWeight: '800' }, subtitle: { color: '#718197', fontSize: 12, lineHeight: 18 }, notice: { color: '#9b5b1a', fontSize: 12 }, card: { padding: 15, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 13, backgroundColor: '#fff', gap: 7 }, section: { color: '#10243a', fontSize: 15, fontWeight: '800' }, fieldLabel: { color: '#33465b', fontSize: 12, fontWeight: '700' }, logoPreview: { width: 180, height: 82, alignSelf: 'flex-start', backgroundColor: '#f4f7fb', borderRadius: 8 }, logoActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, logoButton: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#10243a' }, removeLogoButton: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e0bdb8', borderRadius: 8 }, removeLogoText: { color: '#a23d33', fontSize: 11, fontWeight: '700' }, helper: { color: '#718197', fontSize: 10, lineHeight: 15 }, row: { flexDirection: 'row', gap: 9 }, half: { flex: 1 }, button: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#10243a' }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.5 }, error: { color: '#a23d33', fontSize: 12 } });
