import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { areUsersBlocked } from '@/lib/community/blocks';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
type Context = { params: Promise<{ id: string }> };

async function visibleReview(reviewId: string) {
  const { data, error } = await supabase.from('story_reviews').select('id, reviewer_id, story_id, contains_spoilers').eq('id', reviewId).is('moderation_hidden_at', null).maybeSingle();
  if (error) throw error;
  if (!data || !(await isPublicStoryVisible(supabase, data.story_id))) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('deactivated_at, moderation_hidden_at').eq('id', data.reviewer_id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.deactivated_at || profile.moderation_hidden_at) return null;
  return data;
}

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    const spoilersRevealed = new URL(request.url).searchParams.get('reveal_spoilers') === '1';
    if (review.contains_spoilers && !spoilersRevealed) return NextResponse.json({ error: 'Revele os spoilers da resenha antes de abrir os comentários.' }, { status: 403 });
    const viewer = await getAuthenticatedUserContext();
    const { data: comments, error } = await supabase.from('review_comments')
      .select('id, review_id, user_id, parent_comment_id, body, contains_spoilers, created_at, updated_at')
      .eq('review_id', id).is('moderation_hidden_at', null).order('created_at', { ascending: true }).limit(200);
    if (error) throw error;
    const userIds = Array.from(new Set((comments || []).map((comment) => comment.user_id)));
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from('profiles').select('id, username, display_name, avatar_url, deactivated_at, moderation_hidden_at').in('id', userIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const visible = [];
    let blockedIds = new Set<string>();
    if (viewer && userIds.length) {
      const [outgoing, incoming] = await Promise.all([
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', viewer.userId).in('blocked_id', userIds),
        supabase.from('user_blocks').select('blocker_id').eq('blocked_id', viewer.userId).in('blocker_id', userIds),
      ]);
      if (outgoing.error || incoming.error) throw outgoing.error || incoming.error;
      blockedIds = new Set([...(outgoing.data || []).map((item) => item.blocked_id), ...(incoming.data || []).map((item) => item.blocker_id)]);
    }
    for (const comment of comments || []) {
      const profile = (profiles || []).find((item) => item.id === comment.user_id);
      if (!profile || profile.deactivated_at || profile.moderation_hidden_at) continue;
      if (blockedIds.has(comment.user_id)) continue;
      visible.push({
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        body: comment.body,
        contains_spoilers: comment.contains_spoilers,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_mine: viewer?.userId === comment.user_id,
        can_manage: viewer?.userId === comment.user_id || viewer?.userId === review.reviewer_id,
        author: { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
      });
    }
    return NextResponse.json({ comments: visible }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/reviews/[id]/comments:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os comentários.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await context.params;
    const commentId = new URL(request.url).searchParams.get('comment_id');
    if (!commentId) return NextResponse.json({ error: 'Comentário não informado.' }, { status: 400 });
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    const { data: comment, error: commentError } = await supabase.from('review_comments')
      .select('id, user_id').eq('id', commentId).eq('review_id', id).maybeSingle();
    if (commentError) throw commentError;
    if (!comment) return NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 });
    if (comment.user_id !== user.userId && review.reviewer_id !== user.userId) {
      return NextResponse.json({ error: 'Você não pode remover este comentário.' }, { status: 403 });
    }
    const { error } = await supabase.from('review_comments').delete().eq('id', commentId).eq('review_id', id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/reviews/[id]/comments:', error);
    return NextResponse.json({ error: 'Não foi possível remover o comentário.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para comentar.' }, { status: 401 });
    const { id } = await context.params;
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    if (await areUsersBlocked(supabase, user.userId, review.reviewer_id)) {
      return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
    }
    const body = await request.json();
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    const parentId = typeof body?.parent_comment_id === 'string' ? body.parent_comment_id : null;
    const containsSpoilers = body?.contains_spoilers === true;
    if (!text || text.length > 5000 || (body?.contains_spoilers != null && typeof body.contains_spoilers !== 'boolean')) {
      return NextResponse.json({ error: 'O comentário deve ter de 1 a 5.000 caracteres.' }, { status: 400 });
    }
    if (parentId) {
      const { data: parent, error: parentError } = await supabase.from('review_comments').select('id, user_id').eq('id', parentId).eq('review_id', id).is('moderation_hidden_at', null).maybeSingle();
      if (parentError) throw parentError;
      if (!parent) return NextResponse.json({ error: 'O comentário respondido não está disponível.' }, { status: 404 });
      if (await areUsersBlocked(supabase, user.userId, parent.user_id)) return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
    }
    const { data: comment, error } = await supabase.from('review_comments').insert({
      review_id: id,
      user_id: user.userId,
      parent_comment_id: parentId,
      body: text,
      contains_spoilers: containsSpoilers,
    }).select('id, parent_comment_id, body, contains_spoilers, created_at, updated_at').single();
    if (error) throw error;
    const recipientId = parentId
      ? (await supabase.from('review_comments').select('user_id').eq('id', parentId).maybeSingle()).data?.user_id
      : review.reviewer_id;
    if (recipientId && recipientId !== user.userId) {
      const { data: story } = await supabase.from('stories').select('title').eq('id', review.story_id).maybeSingle();
      const { error: notificationError } = await supabase.from('user_notifications').insert({
        user_id: recipientId,
        notification_type: parentId ? 'review_reply' : 'review_comment',
        title: parentId ? 'Nova resposta à resenha' : 'Novo comentário na sua resenha',
        body: `Há uma nova interação na resenha de “${story?.title || 'uma história'}”.`,
        href: `/historia/${encodeURIComponent(review.story_id)}/avaliacoes`,
      });
      if (notificationError) console.error('POST /api/reviews/[id]/comments notification:', notificationError);
    }
    return NextResponse.json({ comment: { ...comment, is_mine: true, author: null } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/reviews/[id]/comments:', error);
    return NextResponse.json({ error: 'Não foi possível publicar o comentário.' }, { status: 500 });
  }
}
