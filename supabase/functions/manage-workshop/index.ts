// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const modules = ['dashboard', 'clients', 'vehicles', 'service_orders', 'estimates', 'inventory', 'finance', 'reports', 'employees', 'settings'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function invitationRedirectUrl() {
  const configured = Deno.env.get('APP_WEB_URL') ?? 'https://joaokeven14.github.io/oficina-inteligente/';
  try {
    const target = new URL(configured);
    if (target.protocol !== 'https:' || target.username || target.password) return null;
    target.search = ''; target.hash = '';
    return target.href;
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método de solicitação não permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'A sessão ou a configuração do servidor está indisponível.' }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actorData, error: actorError } = await caller.auth.getUser();
  if (actorError || !actorData.user) return json({ error: 'Sua sessão expirou. Entre novamente.' }, 401);

  try {
    const body = await request.json();
    const inviteRedirect = invitationRedirectUrl();
    if (['create_workshop', 'invite_employee'].includes(body.action) && !inviteRedirect) {
      return json({ error: 'Os convites estão indisponíveis no momento. Contate o responsável pela plataforma.' }, 503);
    }
    if (body.action === 'create_workshop') {
      const { data: platformAdmin, error: adminError } = await caller.from('platform_admins').select('active').eq('user_id', actorData.user.id).maybeSingle();
      if (adminError) {
        console.error('Não foi possível verificar o acesso de administrador.', adminError.message);
        return json({ error: 'Não foi possível verificar seu acesso de administrador. Atualize a página e tente novamente.' }, 500);
      }
      if (!platformAdmin?.active) return json({ error: 'Sua conta não tem acesso de administrador da plataforma.' }, 403);
      const workshopName = String(body.workshop_name ?? '').trim();
      const ownerName = String(body.owner_name ?? '').trim();
      const ownerEmail = String(body.owner_email ?? '').trim().toLowerCase();
      if (workshopName.length < 2 || ownerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return json({ error: 'Informe o nome da oficina, o nome do proprietário e um e-mail válido.' }, 400);
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, { data: { full_name: ownerName }, redirectTo: inviteRedirect });
      if (inviteError || !invite.user) {
        console.error('Falha ao enviar convite ao proprietário.', inviteError?.message ?? 'Resposta sem usuário.');
        const alreadyRegistered = /already (been )?registered|user already exists/i.test(inviteError?.message ?? '');
        return json({ error: alreadyRegistered
          ? 'Este e-mail já está cadastrado. Use outro endereço para o proprietário.'
          : 'Não foi possível enviar o convite ao proprietário. Confira o e-mail e tente novamente.' }, 400);
      }
      const { data: workshopId, error: createError } = await caller.rpc('admin_create_workshop', { workshop_name: workshopName, owner_user_id: invite.user.id });
      if (createError) {
        console.error('Falha ao criar oficina; convite revogado.', createError.message);
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Não foi possível criar a oficina. O convite não foi enviado.' }, 400);
      }
      return json({ workshop_id: workshopId });
    }

    if (body.action === 'invite_employee') {
      const workshopId = String(body.workshop_id ?? '');
      const { data: membership, error: ownerError } = await caller.from('workshop_memberships')
        .select('id, role, status, workshops!inner(status)')
        .eq('workshop_id', workshopId).eq('user_id', actorData.user.id).maybeSingle();
      if (ownerError) {
        console.error('Não foi possível verificar o vínculo do proprietário.', ownerError.message);
        return json({ error: 'Não foi possível verificar seu acesso à oficina. Atualize a página e tente novamente.' }, 500);
      }
      if (membership?.role !== 'owner' || membership.status !== 'active' || membership.workshops?.status !== 'active') return json({ error: 'É necessário ter acesso ativo de proprietário a esta oficina.' }, 403);

      const name = String(body.full_name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Informe o nome do funcionário e um e-mail válido.' }, 400);
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: inviteRedirect });
      if (inviteError || !invite.user) {
        console.error('Falha ao enviar convite ao funcionário.', inviteError?.message ?? 'Resposta sem usuário.');
        const alreadyRegistered = /already (been )?registered|user already exists/i.test(inviteError?.message ?? '');
        return json({ error: alreadyRegistered
          ? 'Este e-mail já está cadastrado. Use outro endereço para o funcionário.'
          : 'Não foi possível enviar o convite ao funcionário. Confira o e-mail e tente novamente.' }, 400);
      }
      const { data: newMembership, error: membershipError } = await admin.from('workshop_memberships')
        .insert({ workshop_id: workshopId, user_id: invite.user.id, role: 'staff', status: 'active' }).select('id').single();
      if (membershipError || !newMembership) {
        console.error('Falha ao criar o vínculo do funcionário.', membershipError?.message ?? 'Vínculo não retornado.');
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Não foi possível criar o acesso do funcionário. O convite não foi enviado.' }, 400);
      }
      const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};
      const rows = modules.map((module) => {
        const p = permissions[module] ?? {};
        return { workshop_id: workshopId, membership_id: newMembership.id, module,
          can_view: p.view === true, can_create: p.create === true, can_update: p.update === true, can_delete: p.delete === true };
      });
      const { error: permissionsError } = await admin.from('workshop_member_permissions').insert(rows);
      if (permissionsError) {
        console.error('Falha ao salvar as permissões do funcionário.', permissionsError.message);
        await admin.from('workshop_memberships').delete().eq('id', newMembership.id).eq('workshop_id', workshopId);
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Não foi possível salvar as permissões. O convite não foi enviado.' }, 400);
      }
      return json({ membership_id: newMembership.id });
    }

    return json({ error: 'Operação não reconhecida.' }, 400);
  } catch {
    return json({ error: 'Não foi possível processar a solicitação. Tente novamente.' }, 400);
  }
});
