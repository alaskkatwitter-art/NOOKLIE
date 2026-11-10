import { normalizeHashtag } from '@/lib/social/feed-links';
import { visiblePosts, visibleReposts } from '@/lib/social/posts';
import { hiddenFeedProfiles } from '@/lib/moderation/feed-controls';
import { currentViewerProfileId, getPublicProfileIds } from '@/lib/moderation/content-visibility';
import { chatDb } from '@/lib/chat/server';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 20;
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const viewer = await currentViewerProfileId(chatDb);
    if (!viewer) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });

    const params = new URL(request.url).searchParams;
    const scope = params.get('scope');
    if (scope && scope !== 'following') return NextResponse.json({ error: 'Filtro inválido.' }, { status: 400, headers });
    const follows = scope === 'following' ? await chatDb.from('follows').select('following_id').eq('follower_id', viewer) : null;
    if (follows?.error) throw follows.error;
    const followed = new Set((follows?.data || []).map(row => row.following_id));
    const rawTag = params.get('tag');
    const tag = rawTag ? normalizeHashtag(rawTag) : '';
    if (rawTag && !tag) return NextResponse.json({ error: 'Hashtag inválida.' }, { status: 400, headers });

    const rawCursor = params.get('before');
    const cursor = rawCursor?.match(/^(\d{1,15}):(post|repost):([0-9a-f-]{36})$/);
    if (rawCursor && !cursor) return NextResponse.json({ error: 'Página do feed inválida.' }, { status: 400, headers });
    const beforeTime = cursor ? Number(cursor[1]) : Infinity;
    const beforeKey = cursor ? cursor[2] + ':' + cursor[3] : '';

    let query = chatDb.from('nook_posts')
      .select('id,user_id,created_at')
      .is('moderation_hidden_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (tag) query = query.contains('hashtags', [tag]);

    const [result, hidden] = await Promise.all([query, hiddenFeedProfiles()]);
    if (result.error) throw result.error;
    const candidates = result.data || [];
    const authors = await getPublicProfileIds(chatDb, candidates.map(post => post.user_id), viewer);
    const originals = candidates.filter(post => authors.has(post.user_id) && !hidden.has(post.user_id));
    const originalIds = new Set(originals.map(post => post.id));
    const reposts = originals.length ? await visibleReposts(undefined, undefined, viewer) : [];
    const timeline = [
      ...originals.filter(post => scope !== 'following' || followed.has(post.user_id)).map(post => ({
        postId: post.id, key: 'post:' + post.id, time: Date.parse(post.created_at), repost: null,
      })),
      ...reposts.filter(repost => originalIds.has(repost.post_id) && !hidden.has(repost.user_id) && (scope !== 'following' || followed.has(repost.user_id))).map(repost => ({
        postId: repost.post_id, key: 'repost:' + repost.id, time: Date.parse(repost.created_at), repost,
      })),
    ].filter(entry => entry.time < beforeTime || (entry.time === beforeTime && entry.key < beforeKey))
      .sort((a, b) => b.time - a.time || (a.key === b.key ? 0 : a.key > b.key ? -1 : 1));

    const page = timeline.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const next_cursor = timeline.length > PAGE_SIZE && last ? last.time + ':' + last.key : null;
    const posts = await visiblePosts(page.map(entry => entry.postId), viewer);
    const byId = new Map(posts.map(post => [post.id, post]));
    return NextResponse.json({
      posts: page.flatMap(entry => {
        const post = byId.get(entry.postId);
        return post ? [entry.repost ? { ...post, repost: entry.repost } : post] : [];
      }),
      next_cursor,
    }, { headers });
  } catch (error) {
    console.error('ERRO GERAL NO FEED:', error);
    return NextResponse.json({ error: 'Não foi possível carregar o Feed.' }, { status: 500, headers });
  }
}
