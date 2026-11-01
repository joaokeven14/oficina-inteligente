// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const photoMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const logoMimes = ['image/jpeg', 'image/png', 'image/webp'];
const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const badRequest = (message: string) => json({ error: message }, 400);

async function ensurePrivateBucket(admin: ReturnType<typeof createClient>, bucket: string) {
  const current = await admin.storage.getBucket(bucket);
  if (current.data) {
    if (current.data.public) throw new Error('The private file bucket is configured as public.');
    return;
  }

  const isPhoto = bucket === 'service-order-photos';
  const created = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: isPhoto ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
    allowedMimeTypes: isPhoto ? photoMimes : logoMimes,
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;

  const verified = await admin.storage.getBucket(bucket);
  if (verified.error || !verified.data || verified.data.public) throw new Error('The private file bucket could not be verified.');
}

async function hasPermission(caller: ReturnType<typeof createClient>, userId: string, workshopId: string, module: string, action: 'view' | 'update', ownerOnly = false) {
  const { data: membership, error: membershipError } = await caller.from('workshop_memberships')
    .select('role,status,workshops!inner(status)')
    .eq('workshop_id', workshopId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (membershipError || !membership || membership.status !== 'active' || membership.workshops?.status !== 'active') return false;
  if (ownerOnly && membership.role !== 'owner') return false;
  if (membership.role === 'owner') return true;
  const { data: permissions, error } = await caller.rpc('get_workshop_permissions', { target_workshop_id: workshopId });
  if (error) return false;
  const modulePermissions = permissions?.find((row: { module: string }) => row.module === module);
  return action === 'view' ? modulePermissions?.can_view === true : modulePermissions?.can_update === true;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Sessão ou configuração do servidor indisponível.' }, 401);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: authError } = await caller.auth.getUser();
  if (authError || !actor.user) return json({ error: 'Sua sessão expirou. Entre novamente.' }, 401);

  try {
    const body = await request.json();
    const action = String(body.action ?? '');
    const kind = String(body.kind ?? '');
    const workshopId = body.workshop_id;
    if (!validId(workshopId)) return badRequest('Oficina inválida.');

    if (kind === 'logo' && action !== 'sign_logo') {
      if (!await hasPermission(caller, actor.user.id, workshopId, 'settings', 'update', true)) {
        return json({ error: 'Somente o proprietário ativo da oficina pode alterar o logotipo.' }, 403);
      }
    } else if (kind === 'photo') {
      const orderId = body.service_order_id;
      if (!validId(orderId)) return badRequest('Ordem de serviço inválida.');
      if (!await hasPermission(caller, actor.user.id, workshopId, 'service_orders', action === 'sign_photos' ? 'view' : 'update')) {
        return json({ error: 'Seu usuário não tem permissão para acessar essas fotos.' }, 403);
      }
      const { data: order, error: orderError } = await caller.from('service_orders')
        .select('id,status').eq('id', orderId).eq('workshop_id', workshopId).maybeSingle();
      if (orderError || !order) return json({ error: 'Ordem de serviço não encontrada ou sem acesso.' }, 404);
      if (action === 'prepare_upload' && order.status === 'canceled') return json({ error: 'A OS cancelada não aceita fotos novas.' }, 409);
    } else {
      return badRequest('Tipo de arquivo inválido.');
    }

    const bucket = kind === 'photo' ? 'service-order-photos' : 'workshop-logos';
    await ensurePrivateBucket(admin, bucket);

    if (action === 'prepare_upload') {
      const mimeType = String(body.mime_type ?? '');
      const sizeBytes = Number(body.size_bytes);
      const allowed = kind === 'photo' ? photoMimes : logoMimes;
      const maxSize = kind === 'photo' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (!allowed.includes(mimeType) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxSize) {
        return badRequest('Formato ou tamanho de imagem não permitido.');
      }
      const extension = extensionByMime[mimeType];
      const path = kind === 'photo'
        ? `${workshopId}/${body.service_order_id}/${crypto.randomUUID()}.${extension}`
        : `${workshopId}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) return json({ error: 'Não foi possível preparar o envio privado do arquivo.' }, 500);
      return json({ path: data.path, token: data.token });
    }

    if (action === 'sign_logo') {
      const { data: workshop, error } = await caller.from('workshops').select('logo_path').eq('id', workshopId).maybeSingle();
      if (error || !workshop) return json({ error: 'Oficina não encontrada ou sem acesso.' }, 404);
      if (!workshop.logo_path) return json({ signed_url: null });
      const { data, error: signError } = await admin.storage.from(bucket).createSignedUrl(workshop.logo_path, 3600);
      if (signError || !data) return json({ error: 'Não foi possível abrir o logotipo privado.' }, 404);
      return json({ signed_url: data.signedUrl });
    }

    if (action === 'sign_photos') {
      const ids = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(validId) : [];
      if (ids.length > 100) return badRequest('Solicitação de fotos muito grande.');
      if (ids.length === 0) return json({ attachments: [] });
      const { data: rows, error } = await caller.from('service_order_attachments')
        .select('id,storage_path').eq('workshop_id', workshopId)
        .eq('service_order_id', body.service_order_id).in('id', ids);
      if (error || !rows || rows.length !== new Set(ids).size) return json({ error: 'Uma ou mais fotos não estão disponíveis.' }, 403);
      const attachments = await Promise.all(rows.map(async (row) => {
        const { data, error: signError } = await admin.storage.from(bucket).createSignedUrl(row.storage_path, 3600);
        if (signError || !data) throw new Error('A protected photo could not be signed.');
        return { id: row.id, signed_url: data.signedUrl };
      }));
      return json({ attachments });
    }

    if (action === 'remove_logo') {
      const path = body.storage_path;
      const { data: workshop, error } = await caller.from('workshops').select('logo_path').eq('id', workshopId).maybeSingle();
      if (error || !workshop) return json({ error: 'Oficina não encontrada ou sem acesso.' }, 404);
      if (typeof path !== 'string' || !new RegExp(`^${workshopId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, 'i').test(path)) return badRequest('Caminho de logotipo inválido.');
      if (workshop.logo_path === path) return json({ error: 'Remova a referência do logotipo antes de apagar o arquivo.' }, 409);
      const { error: removeError } = await admin.storage.from(bucket).remove([path]);
      if (removeError) return json({ error: 'O logotipo foi desvinculado, mas o arquivo não pôde ser apagado.' }, 503);
      return json({ success: true });
    }

    if (action === 'remove_photo') {
      const orderId = body.service_order_id;
      const path = body.storage_path;
      if (typeof path !== 'string' || !new RegExp(`^${workshopId}/${orderId}/[0-9a-f-]{36}\\.(jpg|png|webp|heic|heif)$`, 'i').test(path)) return badRequest('Caminho de foto inválido.');
      const { data: attachment, error } = await caller.from('service_order_attachments').select('id')
        .eq('workshop_id', workshopId).eq('service_order_id', orderId).eq('storage_path', path).maybeSingle();
      if (error) return json({ error: 'Não foi possível verificar a referência da foto.' }, 500);
      if (attachment) {
        const { error: deleteError } = await caller.from('service_order_attachments').delete()
          .eq('id', attachment.id).eq('workshop_id', workshopId).eq('service_order_id', orderId);
        if (deleteError) return json({ error: 'Seu usuário não pode remover esta foto.' }, 403);
      }
      const { error: removeError } = await admin.storage.from(bucket).remove([path]);
      if (removeError) return json({ error: 'A referência foi removida, mas o arquivo protegido não pôde ser apagado.' }, 503);
      return json({ success: true });
    }

    return badRequest('Operação de arquivo inválida.');
  } catch (error) {
    console.error('manage-private-files failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'Não foi possível concluir a operação de arquivo.' }, 500);
  }
});
