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
  const configured = Deno.env.get('APP_WEB_URL');
  if (!configured) return null;
  try {
    const target = new URL(configured);
    if (target.protocol !== 'https:' || target.username || target.password) return null;
    target.search = ''; target.hash = '';
    return target.href;
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Server configuration or authentication is missing.' }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actorData, error: actorError } = await caller.auth.getUser();
  if (actorError || !actorData.user) return json({ error: 'Invalid session.' }, 401);

  try {
    const body = await request.json();
    const inviteRedirect = invitationRedirectUrl();
    if (['create_workshop', 'invite_employee'].includes(body.action) && !inviteRedirect) {
      return json({ error: 'Os convites estão indisponíveis no momento. Contate o responsável pela plataforma.' }, 503);
    }
    if (body.action === 'create_workshop') {
      const { data: platformAdmin, error: adminError } = await admin.from('platform_admins').select('active').eq('user_id', actorData.user.id).maybeSingle();
      if (adminError || !platformAdmin?.active) return json({ error: 'Platform administrator access is required.' }, 403);
      const workshopName = String(body.workshop_name ?? '').trim();
      const ownerName = String(body.owner_name ?? '').trim();
      const ownerEmail = String(body.owner_email ?? '').trim().toLowerCase();
      if (workshopName.length < 2 || ownerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return json({ error: 'Workshop, owner name and a valid email are required.' }, 400);
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, { data: { full_name: ownerName }, redirectTo: inviteRedirect });
      if (inviteError || !invite.user) return json({ error: inviteError?.message ?? 'Could not invite the owner.' }, 400);
      const { data: workshopId, error: createError } = await caller.rpc('admin_create_workshop', { workshop_name: workshopName, owner_user_id: invite.user.id });
      if (createError) {
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Workshop creation failed. The unused owner invite was revoked.' }, 400);
      }
      return json({ workshop_id: workshopId });
    }

    if (body.action === 'invite_employee') {
      const workshopId = String(body.workshop_id ?? '');
      const { data: membership, error: ownerError } = await admin.from('workshop_memberships')
        .select('id, role, status, workshops!inner(status)')
        .eq('workshop_id', workshopId).eq('user_id', actorData.user.id).maybeSingle();
      if (ownerError || membership?.role !== 'owner' || membership.status !== 'active' || membership.workshops?.status !== 'active') return json({ error: 'Active workshop owner access is required.' }, 403);

      const name = String(body.full_name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Employee name and a valid email are required.' }, 400);
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: inviteRedirect });
      if (inviteError || !invite.user) return json({ error: inviteError?.message ?? 'Could not invite this employee.' }, 400);
      const { data: newMembership, error: membershipError } = await admin.from('workshop_memberships')
        .insert({ workshop_id: workshopId, user_id: invite.user.id, role: 'staff', status: 'active' }).select('id').single();
      if (membershipError || !newMembership) {
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Employee access could not be created. The invite was revoked.' }, 400);
      }
      const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};
      const rows = modules.map((module) => {
        const p = permissions[module] ?? {};
        return { workshop_id: workshopId, membership_id: newMembership.id, module,
          can_view: p.view === true, can_create: p.create === true, can_update: p.update === true, can_delete: p.delete === true };
      });
      const { error: permissionsError } = await admin.from('workshop_member_permissions').insert(rows);
      if (permissionsError) {
        await admin.from('workshop_memberships').delete().eq('id', newMembership.id).eq('workshop_id', workshopId);
        await admin.auth.admin.deleteUser(invite.user.id, true);
        return json({ error: 'Employee permissions could not be saved. The invite was revoked.' }, 400);
      }
      return json({ membership_id: newMembership.id });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch {
    return json({ error: 'Request could not be processed.' }, 400);
  }
});
