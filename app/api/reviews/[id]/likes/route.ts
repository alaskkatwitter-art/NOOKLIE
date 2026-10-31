import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { areUsersBlocked } from '@/lib/community/blocks';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
type Context = { params: Promise<{ id: string }> };

async function visibleReview(reviewId: string) {
  const { data, error } = await supabase.from('story_reviews').select('id, reviewer_id, story_id').eq('id', reviewId).is('moderation_hidden_at', null).maybeSingle();
  if (error) throw error;
  if (!data || !(await isPublicStoryVisible(supabase, data.story_id))) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('deactivated_at, moderation_hidden_at').eq('id', data.reviewer_id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.deactivated_at || profile.moderation_hidden_at) return null;
  return data;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    const viewer = await getAuthenticatedUserContext();
    const [{ count, error: countError }, { data: like, error: likeError }] = await Promise.all([
      supabase.from('review_likes').select('id', { count: 'exact', head: true }).eq('review_id', id),
      viewer ? supabase.from('review_likes').select('id').eq('review_id', id).eq('user_id', viewer.userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (countError || likeError) throw countError || likeError;
    return NextResponse.json({ count: count || 0, liked: Boolean(like) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/reviews/[id]/likes:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as curtidas.' }, { status: 500 });
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para curtir.' }, { status: 401 });
    const { id } = await context.params;
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    if (review.reviewer_id === user.userId || await areUsersBlocked(supabase, user.userId, review.reviewer_id)) {
      return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
    }
    const { error } = await supabase.from('review_likes').upsert({ review_id: id, user_id: user.userId }, { onConflict: 'review_id,user_id', ignoreDuplicates: true });
    if (error) throw error;
    const { count, error: countError } = await supabase.from('review_likes').select('id', { count: 'exact', head: true }).eq('review_id', id);
    if (countError) throw countError;
    return NextResponse.json({ liked: true, count: count || 0 });
  } catch (error) {
    console.error('POST /api/reviews/[id]/likes:', error);
    return NextResponse.json({ error: 'Não foi possível curtir a resenha.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await context.params;
    const review = await visibleReview(id);
    if (!review) return NextResponse.json({ error: 'Resenha não encontrada.' }, { status: 404 });
    const { error } = await supabase.from('review_likes').delete().eq('review_id', id).eq('user_id', user.userId);
    if (error) throw error;
    const { count, error: countError } = await supabase.from('review_likes').select('id', { count: 'exact', head: true }).eq('review_id', id);
    if (countError) throw countError;
    return NextResponse.json({ liked: false, count: count || 0 });
  } catch (error) {
    console.error('DELETE /api/reviews/[id]/likes:', error);
    return NextResponse.json({ error: 'Não foi possível remover a curtida.' }, { status: 500 });
  }
}
