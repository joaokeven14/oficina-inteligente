import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import FormField from '../components/FormField';
import { listServiceOrderAttachments, removeServiceOrderPhoto, uploadServiceOrderPhoto } from '../services/workshopData';
import type { ServiceOrderAttachment } from '../types/workshop';

export default function ServiceOrderAttachmentsPanel({ workshopId, orderId, canManage }: { workshopId: string; orderId: string; canManage: boolean }) {
  const [photos, setPhotos] = useState<ServiceOrderAttachment[]>([]);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setPhotos(await listServiceOrderAttachments(workshopId, orderId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as fotos da OS.'); }
    finally { setLoading(false); }
  }, [workshopId, orderId]);
  useEffect(() => { refresh(); }, [refresh]);

  const addPhoto = async () => {
    if (Platform.OS === 'windows') { setError('Para enviar fotos no Windows, use a versão web instalada ou aberta no navegador.'); return; }
    setBusy(true); setError('');
    try {
      const response = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8, maxWidth: 1600, maxHeight: 1600, assetRepresentationMode: 'compatible' });
      if (response.didCancel) return;
      if (response.errorCode) throw new Error('Não foi possível abrir a galeria de fotos. Tente novamente.');
      const asset = response.assets?.[0];
      if (!asset?.uri) throw new Error('Não foi possível ler a foto selecionada.');
      const mimeType = asset.type?.toLocaleLowerCase() ?? '';
      if (!mimeType.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
      const file = await (await fetch(asset.uri)).blob();
      await uploadServiceOrderPhoto(workshopId, orderId, file, asset.fileName ?? 'foto', mimeType, caption);
      setCaption(''); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a foto.'); }
    finally { setBusy(false); }
  };

  const removePhoto = (photo: ServiceOrderAttachment) => Alert.alert('Remover foto da OS', `Remover “${photo.file_name}” desta ordem?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Remover', style: 'destructive', onPress: () => { setBusy(true); removeServiceOrderPhoto(workshopId, photo).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível remover a foto.')).finally(() => setBusy(false)); } },
  ]);

  return <View style={styles.panel}>
    <Text style={styles.heading}>Fotos e anexos</Text>
    <Text style={styles.hint}>Fotos privadas da oficina, ligadas a esta OS e protegidas por permissões. Cada link de visualização expira após uma hora.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {canManage ? <>
      {Platform.OS === 'windows' ? <Text style={styles.hint}>Para adicionar fotos no Windows, abra a versão web/PWA; as fotos já salvas continuam visíveis aqui.</Text> : null}
      <FormField label="Legenda (opcional)" value={caption} onChangeText={setCaption} placeholder="Ex.: Avaria no para-choque dianteiro" />
      <Pressable accessibilityRole="button" disabled={busy || Platform.OS === 'windows'} style={[styles.button, (busy || Platform.OS === 'windows') && styles.disabled]} onPress={() => { addPhoto().catch(() => undefined); }}><Text style={styles.buttonText}>{busy ? 'Salvando foto…' : 'Adicionar foto à OS'}</Text></Pressable>
      <Text style={styles.hint}>JPEG, PNG, WebP ou HEIC · máximo de 10 MB por foto.</Text>
    </> : null}
    {loading ? <Text style={styles.hint}>Carregando anexos…</Text> : null}
    {!loading && !photos.length ? <Text style={styles.empty}>Nenhuma foto anexada a esta ordem.</Text> : null}
    <ScrollView horizontal contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false}>
      {photos.map((photo) => <View key={photo.id} style={styles.photoCard}>
        <Image source={{ uri: photo.signed_url }} resizeMode="cover" style={styles.photo} />
        <Text numberOfLines={1} style={styles.fileName}>{photo.caption || photo.file_name}</Text>
        <Text style={styles.fileMeta}>{(photo.size_bytes / 1024).toFixed(0)} KB · {new Date(photo.created_at).toLocaleDateString('pt-BR')}</Text>
        {canManage ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => removePhoto(photo)} style={styles.remove}><Text style={styles.removeText}>Remover foto</Text></Pressable> : null}
      </View>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ panel: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 12, backgroundColor: '#fbfcfd', gap: 8 }, heading: { color: '#10243a', fontSize: 15, fontWeight: '800' }, hint: { color: '#718197', fontSize: 10, lineHeight: 15 }, error: { color: '#a23d33', fontSize: 11 }, button: { minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e97824' }, buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' }, disabled: { opacity: 0.5 }, empty: { color: '#7b8999', fontSize: 10 }, gallery: { gap: 8, paddingVertical: 3 }, photoCard: { width: 132, padding: 7, borderWidth: 1, borderColor: '#e1e8ef', borderRadius: 9, backgroundColor: '#fff' }, photo: { width: 116, height: 82, borderRadius: 6, backgroundColor: '#edf1f5' }, fileName: { marginTop: 5, color: '#20354b', fontSize: 10, fontWeight: '700' }, fileMeta: { marginTop: 2, color: '#8491a0', fontSize: 8 }, remove: { marginTop: 5 }, removeText: { color: '#a23d33', fontSize: 9, fontWeight: '700' } });
