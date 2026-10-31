import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { getStoryEditAccess } from '@/lib/stories/access';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ id: string }> };

async function authorizedStory(storyId: string) {
  const user = await getAuthenticatedUserContext();
  if (!user) return { user: null, access: false };
  const access = await getStoryEditAccess(supabase, storyId, user.userId);
  return { user, access: access.canEdit };
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { user, access } = await authorizedStory(id);
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    if (!access) return NextResponse.json({ error: 'Somente coautores ativos podem consultar esta solicitação.' }, { status: 403, headers: noStore });
    const { data: request, error } = await supabase.from('story_deletion_requests')
      .select('id, story_id, requested_by, status, created_at, decided_at')
      .eq('story_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!request) return NextResponse.json({ request: null }, { headers: noStore });
    const { data: votes, error: votesError } = await supabase.from('story_deletion_votes')
      .select('coauthor_id, approved, decided_at, profile:profiles!story_deletion_votes_coauthor_id_fkey(username, display_name)')
      .eq('request_id', request.id);
    if (votesError) throw votesError;
    return NextResponse.json({ request: { ...request, votes: (votes || []).map((vote) => ({ ...vote, profile: Array.isArray(vote.profile) ? vote.profile[0] : vote.profile })), can_vote: request.status === 'pending' && (votes || []).some((vote) => vote.coauthor_id === user.userId && vote.approved == null) } }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/stories/[id]/deletion-request:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a solicitação de exclusão.' }, { status: 500, headers: noStore });
  }
}

export async function POST(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { user, access } = await authorizedStory(id);
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    if (!access) return NextResponse.json({ error: 'Somente coautores ativos podem solicitar a exclusão.' }, { status: 403, headers: noStore });
    const { data, error } = await supabase.rpc('request_story_deletion', { p_session_token_hash: user.sessionTokenHash, p_story_id: id });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Já existe uma solicitação pendente para esta história.' }, { status: 409, headers: noStore });
      if (error.code === '42501') return NextResponse.json({ error: 'Somente coautores ativos podem solicitar a exclusão.' }, { status: 403, headers: noStore });
      if (error.code === 'P0002') return NextResponse.json({ error: 'História não encontrada.' }, { status: 404, headers: noStore });
      throw error;
    }
    return NextResponse.json({ request_id: data }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('POST /api/stories/[id]/deletion-request:', error);
    return NextResponse.json({ error: 'Não foi possível solicitar a exclusão.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { user, access } = await authorizedStory(id);
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    if (!access) return NextResponse.json({ error: 'Somente coautores ativos podem votar.' }, { status: 403, headers: noStore });
    const body = await request.json();
    if (!body || typeof body !== 'object' || typeof body.request_id !== 'string' || typeof body.approved !== 'boolean') return NextResponse.json({ error: 'Escolha aprovar ou recusar a solicitação.' }, { status: 400, headers: noStore });
    const { data, error } = await supabase.rpc('decide_story_deletion', { p_session_token_hash: user.sessionTokenHash, p_request_id: body.request_id, p_approved: body.approved });
    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Seu voto já foi registrado ou esta solicitação não pertence à sua equipe.' }, { status: 403, headers: noStore });
      if (error.code === 'P0002') return NextResponse.json({ error: 'A solicitação já foi decidida.' }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ status: data }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/stories/[id]/deletion-request:', error);
    return NextResponse.json({ error: 'Não foi possível registrar seu voto.' }, { status: 500, headers: noStore });
  }
}
