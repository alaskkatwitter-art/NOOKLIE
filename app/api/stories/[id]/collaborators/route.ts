import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';
import { areUsersBlocked } from '@/lib/community/blocks';
import { getStoryEditAccess } from '@/lib/stories/access';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const roles = new Set(['coauthor', 'designer', 'reviewer', 'beta_reader', 'translator']);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    if (!(await isPublicStoryVisible(supabase, id))) return NextResponse.json({ error: 'História não encontrada.' }, { status: 404 });
    const { data, error } = await supabase.from('story_collaborators')
      .select('role, accepted_at, profile:profiles!story_collaborators_profile_id_fkey(username, display_name, avatar_url)')
      .eq('story_id', id).eq('status', 'active').order('created_at', { ascending: true });
    if (error) throw error;
    const collaborators = (data || []).map((row) => ({ role: row.role, accepted_at: row.accepted_at, profile: Array.isArray(row.profile) ? row.profile[0] : row.profile }));
    return NextResponse.json({ collaborators }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/stories/[id]/collaborators:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os créditos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para convidar colaboradores.' }, { status: 401 });
    const { id } = await context.params;
    const access = await getStoryEditAccess(supabase, id, user.userId);
    if (!access.canEdit) return NextResponse.json({ error: 'Você não tem permissão para convidar nesta história.' }, { status: 403 });
    const body = await request.json();
    const role = typeof body?.role === 'string' ? body.role : '';
    const username = typeof body?.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
    if (!roles.has(role) || !/^[a-z0-9_]{3,30}$/.test(username)) return NextResponse.json({ error: 'Informe um usuário e uma função válidos.' }, { status: 400 });
    const { data: target, error: profileError } = await supabase.from('profiles').select('id, username').eq('username', username).maybeSingle();
    if (profileError) throw profileError;
    if (!target) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    if (target.id === user.userId) return NextResponse.json({ error: 'Você não pode convidar sua própria conta.' }, { status: 400 });
    if (await areUsersBlocked(supabase, user.userId, target.id)) return NextResponse.json({ error: 'Este convite não pode ser enviado.' }, { status: 403 });
    const { data: invite, error } = await supabase.from('collaborator_invites').insert({ story_id: id, inviter_id: user.userId, invitee_id: target.id, role }).select('id').single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Já existe um convite pendente para este perfil e função.' }, { status: 409 });
      throw error;
    }
    const { data: story } = await supabase.from('stories').select('title').eq('id', id).maybeSingle();
    const { error: notificationError } = await supabase.from('user_notifications').insert({
      user_id: target.id,
      notification_type: 'collaboration_invite',
      title: role === 'coauthor' ? 'Convite de coautoria' : 'Convite de colaboração',
      body: `Você recebeu um convite para colaborar em “${story?.title || 'uma história'}”.`,
      href: '/convites',
    });
    if (notificationError) console.error('Could not create collaboration notification:', notificationError);
    return NextResponse.json({ invited: true, invite_id: invite.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/stories/[id]/collaborators:', error);
    return NextResponse.json({ error: 'Não foi possível enviar o convite.' }, { status: 500 });
  }
}
