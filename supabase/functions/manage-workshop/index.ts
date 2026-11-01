// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const modules = ['dashboard', 'clients', 'vehicles', 'service_orders', 'estimates', 'inventory', 'finance', 'reports', 'employees', 'settings'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const validId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function removeWorkshopFiles(admin: ReturnType<typeof createClient>, bucket: string, workshopId: string) {
  const { data: bucketData, error: bucketError } = await admin.storage.getBucket(bucket);
  if (bucketError) {
    if (String(bucketError.statusCode) === '404' || /not found|does not exist|no such bucket/i.test(bucketError.message ?? '')) return;
    throw bucketError;
  }
  if (!bucketData) return;

  const storage = admin.storage.from(bucket);
  const paths: string[] = [];
  const visit = async (prefix: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset });
      if (error) throw error;
      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry.name || entry.name === '.' || entry.name === '..') continue;
        const path = `${prefix}/${entry.name}`;
        if (entry.id) paths.push(path);
        else await visit(path);
      }
      if (entries.length < 1000) break;
    }
  };
  await visit(workshopId);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await storage.remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

async function cleanupWorkshopFiles(admin: ReturnType<typeof createClient>, workshopId: string) {
  let failed = false;
  for (const bucket of ['service-order-photos', 'workshop-logos']) {
    try { await removeWorkshopFiles(admin, bucket, workshopId); }
    catch (error) {
      failed = true;
      console.error('Falha ao remover arquivos privados da oficina.', bucket, error instanceof Error ? error.message : 'Falha desconhecida.');
    }
  }
  return failed;
}

function invitationRedirectUrl() {
  return 'https://joaokeven14.github.io/oficina-inteligente/';
}

function inviteFailureMessage(errorMessage: string | undefined, recipient: 'proprietário' | 'funcionário') {
  const normalized = (errorMessage ?? '').toLowerCase();
  if (normalized.includes('email address not authorized') || normalized.includes('email address is not authorized')) {
    return 'O envio de teste do Supabase só permite enviar e-mails para endereços autorizados da equipe do projeto. Para convidar outros endereços, configure um serviço de envio de e-mail (SMTP) nas configurações de autenticação.';
  }
  if (/rate.?limit|too many requests|email rate limit/.test(normalized)) {
    return 'O limite de envio de e-mails foi atingido. Aguarde alguns minutos e tente novamente.';
  }
  return `Não foi possível enviar o convite ao ${recipient}. Confira o e-mail e tente novamente.`;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error };
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return { user, error: null };
    if (data.users.length < perPage) return { user: null, error: null };
  }
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
    if (body.action === 'delete_workshop') {
      const workshopId = body.workshop_id;
      const confirmationName = String(body.confirmation_name ?? '').trim();
      if (!validId(workshopId)) return json({ error: 'Oficina inválida.' }, 400);
      const { data: platformAdmin, error: adminError } = await caller.from('platform_admins').select('active').eq('user_id', actorData.user.id).maybeSingle();
      if (adminError) {
        console.error('Não foi possível verificar o acesso de administrador.', adminError.message);
        return json({ error: 'Não foi possível verificar seu acesso de administrador. Atualize a página e tente novamente.' }, 500);
      }
      if (!platformAdmin?.active) return json({ error: 'Sua conta não tem acesso de administrador da plataforma.' }, 403);
      const { data: workshop, error: workshopError } = await admin.from('workshops').select('id,name').eq('id', workshopId).maybeSingle();
      if (workshopError) {
        console.error('Não foi possível consultar a oficina para exclusão.', workshopError.message);
        return json({ error: 'Não foi possível consultar a oficina. Atualize a página e tente novamente.' }, 500);
      }
      if (!workshop) return json({ error: 'A oficina não foi encontrada. Atualize a lista e tente novamente.' }, 404);
      if (confirmationName !== workshop.name) return json({ error: 'O nome digitado não corresponde à oficina.' }, 400);
      const { data: cleanupBatchId, error: deleteError } = await caller.rpc('admin_delete_workshop', { target_workshop_id: workshopId, confirmation_name: confirmationName });
      if (deleteError) {
        console.error('Falha ao excluir oficina.', deleteError.message);
        if (deleteError.code === 'P0002') return json({ error: 'A oficina não foi encontrada. Atualize a lista e tente novamente.' }, 404);
        if (deleteError.code === '22023') return json({ error: 'O nome digitado não corresponde à oficina.' }, 400);
        return json({ error: 'Não foi possível excluir a oficina. Atualize a página e tente novamente.' }, 500);
      }
      const filesPending = await cleanupWorkshopFiles(admin, workshopId);
      let accountCleanup: Record<string, unknown> | null = null;
      let accountCleanupFailed = false;
      if (validId(cleanupBatchId)) {
        const { data, error: cleanupError } = await caller.rpc('admin_finalize_workshop_account_cleanup', { target_batch_id: cleanupBatchId });
        if (cleanupError) {
          accountCleanupFailed = true;
          console.error('A oficina foi excluída, mas não foi possível liberar as contas sem vínculo.', cleanupError.message);
        } else if (data && typeof data === 'object') {
          accountCleanup = data as Record<string, unknown>;
        } else {
          accountCleanupFailed = true;
          console.error('A oficina foi excluída, mas a limpeza das contas não retornou um resultado válido.');
        }
      } else {
        accountCleanupFailed = true;
        console.error('A oficina foi excluída, mas não foi possível identificar as contas para limpeza.');
      }
      const warnings = [];
      if (filesPending) warnings.push('Alguns arquivos privados não puderam ser removidos. Contate o suporte.');
      if (accountCleanupFailed) warnings.push('Não foi possível confirmar a liberação dos e-mails das contas sem vínculo. Contate o suporte.');
      return json({
        deleted: true,
        releasedAccounts: typeof accountCleanup?.released_accounts === 'number' ? accountCleanup.released_accounts : null,
        preservedLinkedAccounts: typeof accountCleanup?.preserved_linked_accounts === 'number' ? accountCleanup.preserved_linked_accounts : null,
        preservedStorageAccounts: typeof accountCleanup?.preserved_storage_accounts === 'number' ? accountCleanup.preserved_storage_accounts : null,
        warning: warnings.length ? warnings.join(' ') : null,
      });
    }

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
      let ownerUserId = invite?.user?.id;
      let reusedExistingAccount = false;
      if (inviteError || !ownerUserId) {
        const alreadyRegistered = /already (been )?registered|user already exists/i.test(inviteError?.message ?? '');
        if (!alreadyRegistered) {
          console.error('Falha ao enviar convite ao proprietário.', inviteError?.message ?? 'Resposta sem usuário.');
          return json({ error: inviteFailureMessage(inviteError?.message, 'proprietário') }, 400);
        }

        const { user: existingUser, error: lookupError } = await findAuthUserByEmail(admin, ownerEmail);
        if (lookupError) {
          console.error('Não foi possível localizar a conta existente do proprietário.', lookupError.message);
          return json({ error: 'O e-mail já possui cadastro, mas não foi possível localizar a conta agora. Tente novamente.' }, 500);
        }
        if (!existingUser) return json({ error: 'Este e-mail já está cadastrado, mas a conta não foi localizada. Contate o suporte.' }, 409);

        const { data: adminMembership, error: membershipError } = await admin.from('platform_admins')
          .select('active').eq('user_id', existingUser.id).maybeSingle();
        if (membershipError) {
          console.error('Não foi possível verificar o tipo da conta existente.', membershipError.message);
          return json({ error: 'Não foi possível verificar a conta existente. Tente novamente.' }, 500);
        }
        if (adminMembership?.active) return json({ error: 'Este e-mail pertence a um administrador da plataforma e não pode ser usado como proprietário.' }, 400);

        ownerUserId = existingUser.id;
        reusedExistingAccount = true;
      }
      const { data: workshopId, error: createError } = await caller.rpc('admin_create_workshop', { workshop_name: workshopName, owner_user_id: ownerUserId });
      if (createError) {
        console.error('Falha ao criar oficina para o proprietário.', createError.message);
        if (!reusedExistingAccount && ownerUserId) await admin.auth.admin.deleteUser(ownerUserId, true);
        return json({ error: reusedExistingAccount
          ? 'Não foi possível vincular a conta existente à oficina. Nenhum cadastro foi apagado.'
          : 'Não foi possível criar a oficina. O convite não foi enviado.' }, 400);
      }
      return json({ workshop_id: workshopId, reused_existing_account: reusedExistingAccount });
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
      let employeeUserId = invite?.user?.id;
      let reusedExistingAccount = false;
      if (inviteError || !employeeUserId) {
        const alreadyRegistered = /already (been )?registered|user already exists/i.test(inviteError?.message ?? '');
        if (!alreadyRegistered) {
          console.error('Falha ao enviar convite ao funcionário.', inviteError?.message ?? 'Resposta sem usuário.');
          return json({ error: inviteFailureMessage(inviteError?.message, 'funcionário') }, 400);
        }

        const { user: existingUser, error: lookupError } = await findAuthUserByEmail(admin, email);
        if (lookupError) {
          console.error('Não foi possível localizar a conta existente do funcionário.', lookupError.message);
          return json({ error: 'O e-mail já possui cadastro, mas não foi possível localizar a conta agora. Tente novamente.' }, 500);
        }
        if (!existingUser) return json({ error: 'Este e-mail já está cadastrado, mas a conta não foi localizada. Contate o suporte.' }, 409);

        const { data: adminMembership, error: adminMembershipError } = await admin.from('platform_admins')
          .select('active').eq('user_id', existingUser.id).maybeSingle();
        if (adminMembershipError) {
          console.error('Não foi possível verificar o tipo da conta existente.', adminMembershipError.message);
          return json({ error: 'Não foi possível verificar a conta existente. Tente novamente.' }, 500);
        }
        if (adminMembership?.active) return json({ error: 'Este e-mail pertence a um administrador da plataforma e não pode ser usado como funcionário.' }, 400);

        employeeUserId = existingUser.id;
        reusedExistingAccount = true;
      }
      if (!employeeUserId) return json({ error: 'Não foi possível localizar a conta do funcionário. Tente novamente.' }, 500);

      const { data: existingMembership, error: existingMembershipError } = await caller.from('workshop_memberships')
        .select('id, role').eq('workshop_id', workshopId).eq('user_id', employeeUserId).maybeSingle();
      if (existingMembershipError) {
        console.error('Não foi possível verificar se o funcionário já tem acesso.', existingMembershipError.message);
        return json({ error: 'Não foi possível verificar o acesso do funcionário. Atualize a página e tente novamente.' }, 500);
      }
      if (existingMembership) {
        return json({ error: existingMembership.role === 'owner'
          ? 'Este e-mail já é proprietário desta oficina.'
          : 'Este e-mail já tem acesso a esta oficina.' }, 409);
      }

      // Use the authenticated owner's client so the explicit table grants and RLS policies apply.
      const { data: newMembership, error: membershipError } = await caller.from('workshop_memberships')
        .insert({ workshop_id: workshopId, user_id: employeeUserId, role: 'staff', status: 'active' }).select('id').single();
      if (membershipError || !newMembership) {
        console.error('Falha ao criar o vínculo do funcionário.', membershipError?.message ?? 'Vínculo não retornado.');
        return json({ error: reusedExistingAccount
          ? 'Não foi possível vincular o acesso do funcionário. A conta existente foi preservada; tente novamente.'
          : 'O convite foi enviado, mas não foi possível concluir o acesso do funcionário. A conta foi preservada; tente novamente.' }, 400);
      }
      const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};
      const rows = modules.map((module) => {
        const p = permissions[module] ?? {};
        return { workshop_id: workshopId, membership_id: newMembership.id, module,
          can_view: p.view === true, can_create: p.create === true, can_update: p.update === true, can_delete: p.delete === true };
      });
      const { error: permissionsError } = await caller.from('workshop_member_permissions').insert(rows);
      if (permissionsError) {
        console.error('Falha ao salvar as permissões do funcionário.', permissionsError.message);
        const { error: rollbackError } = await caller.from('workshop_memberships').delete()
          .eq('id', newMembership.id).eq('workshop_id', workshopId);
        if (rollbackError) console.error('Não foi possível desfazer o vínculo incompleto do funcionário.', rollbackError.message);
        return json({ error: reusedExistingAccount
          ? 'Não foi possível salvar as permissões. A conta foi preservada; tente novamente.'
          : 'O convite foi enviado, mas não foi possível concluir as permissões. A conta foi preservada; tente novamente.' }, 400);
      }
      return json({ membership_id: newMembership.id, reused_existing_account: reusedExistingAccount, invitation_sent: !reusedExistingAccount });
    }

    return json({ error: 'Operação não reconhecida.' }, 400);
  } catch {
    return json({ error: 'Não foi possível processar a solicitação. Tente novamente.' }, 400);
  }
});
