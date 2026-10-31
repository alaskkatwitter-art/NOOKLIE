import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { areUsersBlocked } from '@/lib/community/blocks';

type Context = { params: Promise<{ id: string }> };
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json();
    const decision = body?.decision;
    if (!['accept', 'decline'].includes(decision)) return NextResponse.json({ error: 'Resposta inválida.' }, { status: 400 });
    const { data: invite, error: inviteError } = await supabase.from('collaborator_invites')
      .select('id, story_id, inviter_id, invitee_id, role, status').eq('id', id).eq('invitee_id', user.userId).eq('status', 'pending').maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) return NextResponse.json({ error: 'Convite não encontrado ou já respondido.' }, { status: 404 });
    if (decision === 'accept' && invite.role === 'coauthor' && body?.agreement_acknowledged !== true) return NextResponse.json({ error: 'Confirme a leitura do aviso de coautoria antes de aceitar.' }, { status: 400 });
    if (await areUsersBlocked(supabase, user.userId, invite.inviter_id)) return NextResponse.json({ error: 'Este convite não pode ser aceito.' }, { status: 403 });
    const now = new Date().toISOString();
    if (decision === 'accept') {
      const { error: membershipError } = await supabase.from('story_collaborators').upsert({
        story_id: invite.story_id, profile_id: user.userId, role: invite.role, status: 'active', invited_by: invite.inviter_id, accepted_at: now, removed_at: null,
      }, { onConflict: 'story_id,profile_id,role' });
      if (membershipError) throw membershipError;
      if (invite.role !== 'coauthor') {
        const { error: creditError } = await supabase.from('story_credits').upsert({
          story_id: invite.story_id, contributor_id: user.userId, requested_by: invite.inviter_id, role: invite.role, status: 'accepted', decided_at: now,
        }, { onConflict: 'story_id,contributor_id,role' });
        if (creditError) throw creditError;
      }
    }
    const { error: updateError } = await supabase.from('collaborator_invites').update({
      status: decision === 'accept' ? 'accepted' : 'declined', decided_at: now,
      agreement_acknowledged_at: decision === 'accept' && invite.role === 'coauthor' ? now : null,
    }).eq('id', id).eq('status', 'pending');
    if (updateError) throw updateError;
    const { data: story } = await supabase.from('stories').select('title').eq('id', invite.story_id).maybeSingle();
    await supabase.from('user_notifications').insert({ user_id: invite.inviter_id, notification_type: `collaboration_${decision}`, title: decision === 'accept' ? 'Convite aceito' : 'Convite recusado', body: `Sua solicitação para “${story?.title || 'uma história'}” foi ${decision === 'accept' ? 'aceita' : 'recusada'}.`, href: `/historia/${invite.story_id}` });
    return NextResponse.json({ decision, role: invite.role });
  } catch (error) {
    console.error('PATCH /api/collaborator-invites/[id]:', error);
    return NextResponse.json({ error: 'Não foi possível responder ao convite.' }, { status: 500 });
  }
}
