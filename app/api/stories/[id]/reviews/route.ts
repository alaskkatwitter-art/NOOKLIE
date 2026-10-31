import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

type Context = { params: Promise<{ id: string }> };

async function getStory(storyId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('id, author_id, title, status')
    .eq('id', storyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const story = await getStory(id);
    if (!story || !(await isPublicStoryVisible(supabase, id))) {
      return NextResponse.json({ error: 'História não encontrada.' }, { status: 404 });
    }

    const viewer = await getAuthenticatedUserContext();
    const { data: reviews, error } = await supabase
      .from('story_reviews')
      .select(`id, story_id, reviewer_id, rating, body, contains_spoilers, created_at, updated_at,
        reviewer:profiles!story_reviews_reviewer_id_fkey(id, username, display_name, avatar_url, deactivated_at, moderation_hidden_at)`)
      .eq('story_id', id)
      .is('moderation_hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    let filteredReviews = (reviews || []).filter((review) => {
      const profile = Array.isArray(review.reviewer) ? review.reviewer[0] : review.reviewer;
      return profile && !profile.deactivated_at && !profile.moderation_hidden_at;
    });
    if (viewer && filteredReviews.length) {
      const reviewerIds = Array.from(new Set(filteredReviews.map((review) => review.reviewer_id)));
      const [outgoing, incoming] = await Promise.all([
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', viewer.userId).in('blocked_id', reviewerIds),
        supabase.from('user_blocks').select('blocker_id').eq('blocked_id', viewer.userId).in('blocker_id', reviewerIds),
      ]);
      if (outgoing.error || incoming.error) throw outgoing.error || incoming.error;
      const blockedIds = new Set([...(outgoing.data || []).map((item) => item.blocked_id), ...(incoming.data || []).map((item) => item.blocker_id)]);
      filteredReviews = filteredReviews.filter((review) => !blockedIds.has(review.reviewer_id));
    }
    const reviewIds = filteredReviews.map((review) => review.id);
    const [likesResult, commentsResult] = reviewIds.length ? await Promise.all([
      supabase.from('review_likes').select('review_id, user_id').in('review_id', reviewIds),
      supabase.from('review_comments').select('review_id').in('review_id', reviewIds).is('moderation_hidden_at', null),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;
    const likeCounts = new Map<string, number>();
    const likedByViewer = new Set<string>();
    for (const like of likesResult.data || []) {
      likeCounts.set(like.review_id, (likeCounts.get(like.review_id) || 0) + 1);
      if (viewer?.userId === like.user_id) likedByViewer.add(like.review_id);
    }
    const commentCounts = new Map<string, number>();
    for (const comment of commentsResult.data || []) commentCounts.set(comment.review_id, (commentCounts.get(comment.review_id) || 0) + 1);
    const visible = filteredReviews.map((review) => {
      const profile = Array.isArray(review.reviewer) ? review.reviewer[0] : review.reviewer;
      return {
        id: review.id,
        rating: review.rating,
        body: review.body,
        contains_spoilers: review.contains_spoilers,
        created_at: review.created_at,
        updated_at: review.updated_at,
        is_mine: viewer?.userId === review.reviewer_id,
        likes_count: likeCounts.get(review.id) || 0,
        liked_by_me: likedByViewer.has(review.id),
        comments_count: commentCounts.get(review.id) || 0,
        reviewer: { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
      };
    });
    const { data: summary, error: summaryError } = await supabase.rpc('get_story_review_summary', { p_story_id: id });
    if (summaryError) throw summaryError;

    return NextResponse.json({ story: { id: story.id, title: story.title }, reviews: visible, summary }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('GET /api/stories/[id]/reviews:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as avaliações.' }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para avaliar.' }, { status: 401 });
    const { id } = await context.params;
    const story = await getStory(id);
    if (!story || !(await isPublicStoryVisible(supabase, id))) {
      return NextResponse.json({ error: 'História não encontrada.' }, { status: 404 });
    }
    if (story.author_id === user.userId) {
      return NextResponse.json({ error: 'Você não pode avaliar a própria história.' }, { status: 403 });
    }
    if (story.status !== 'Concluída') {
      return NextResponse.json({ error: 'Só é possível avaliar histórias concluídas.' }, { status: 409 });
    }

    const body = await request.json();
    const rating = Number(body?.rating);
    const reviewBody = typeof body?.body === 'string' ? body.body.trim() : '';
    const containsSpoilers = body?.contains_spoilers === true;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewBody.length > 10000 || (containsSpoilers && !reviewBody)) {
      return NextResponse.json({ error: 'Confira a nota e o texto da resenha.' }, { status: 400 });
    }

    const [{ data: lastChapter, error: chapterError }, { data: blockedByAuthor, error: blockError }] = await Promise.all([
      supabase.from('chapters').select('id').eq('story_id', id).eq('published', true).is('moderation_hidden_at', null).order('chapter_number', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('user_blocks').select('id').eq('blocker_id', story.author_id).eq('blocked_id', user.userId).maybeSingle(),
    ]);
    if (chapterError || blockError) throw chapterError || blockError;
    if (!lastChapter) return NextResponse.json({ error: 'A história ainda não tem capítulos publicados.' }, { status: 409 });

    const [{ data: readerHasBlockedAuthor }, { data: hasReadLastChapter }] = await Promise.all([
      supabase.from('user_blocks').select('id').eq('blocker_id', user.userId).eq('blocked_id', story.author_id).maybeSingle(),
      supabase.from('reading_progress').select('progress_percent').eq('user_id', user.userId).eq('story_id', id).eq('chapter_id', lastChapter.id).gte('progress_percent', 100).maybeSingle(),
    ]);
    if (blockedByAuthor || readerHasBlockedAuthor) return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
    if (!hasReadLastChapter) return NextResponse.json({ error: 'Leia o capítulo final antes de avaliar a história.' }, { status: 409 });

    const { data, error } = await supabase.from('story_reviews').upsert({
      story_id: id,
      reviewer_id: user.userId,
      rating,
      body: reviewBody || null,
      contains_spoilers: containsSpoilers,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'story_id,reviewer_id' }).select('id, story_id, reviewer_id, rating, body, contains_spoilers, created_at, updated_at').single();
    if (error) throw error;
    return NextResponse.json({ review: data }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/stories/[id]/reviews:', error);
    return NextResponse.json({ error: 'Não foi possível salvar sua avaliação.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await context.params;
    const reviewId = new URL(_request.url).searchParams.get('review_id');
    if (!reviewId) return NextResponse.json({ error: 'Avaliação não informada.' }, { status: 400 });
    const { error } = await supabase.from('story_reviews').delete().eq('id', reviewId).eq('story_id', id).eq('reviewer_id', user.userId);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/stories/[id]/reviews:', error);
    return NextResponse.json({ error: 'Não foi possível remover sua avaliação.' }, { status: 500 });
  }
}

