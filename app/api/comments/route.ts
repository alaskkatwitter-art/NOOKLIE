import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';
import { areUsersBlocked } from '@/lib/community/blocks';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.SUPABASE_SECRET_KEY!
);

async function getUserId(request: Request) {
const cookieHeader = request.headers.get('cookie') || '';

const match = cookieHeader.match(
/toriland_session=([^;]+)/
);

if (!match) {
return null;
}

const token = match[1];

const tokenHash = createHash('sha256')
.update(token)
.digest('hex');

const { data: session } = await supabase
.from('auth_sessions')
.select('user_id, expires_at')
.eq('token_hash', tokenHash)
.maybeSingle();

if (!session) {
return null;
}

if (new Date(session.expires_at) < new Date()) {
return null;
}

return session.user_id;
}

export async function GET(request: Request) {
try {
const { searchParams } = new URL(request.url);

const chapterId = searchParams.get('chapter_id');

if (!chapterId) {
  return NextResponse.json(
    {
      error: 'Capítulo não informado.',
    },
    { status: 400 }
  );
}

const { data: chapterVisibility } = await supabase
  .from('chapters')
  .select('story_id, moderation_hidden_at')
  .eq('id', chapterId)
  .maybeSingle();
if (!chapterVisibility || chapterVisibility.moderation_hidden_at || !(await isPublicStoryVisible(supabase, chapterVisibility.story_id))) {
  return NextResponse.json({ comments: [] });
}

const { data: comments, error } = await supabase
  .from('comments')
  .select(`
    id,
    chapter_id,
    user_id,
    body,
    selected_text,
    start_offset,
    parent_comment_id,
    sticker_id,
    created_at,
    profiles:user_id (
      username,
      display_name,
      avatar_url
    ),
    user_stickers:sticker_id (
      id,
      image_url
    )
  `)
  .eq('chapter_id', chapterId)
  .is('moderation_hidden_at', null)
  .order('created_at', {
    ascending: true,
  });

if (error) {
  return NextResponse.json(
    {
      error: 'Não foi possível carregar os comentários.',
    },
    { status: 500 }
  );
}

const viewerId = await getUserId(request);
let visibleComments = comments || [];
if (viewerId) {
  const [blocked, blockers] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', viewerId),
  ]);
  if (blocked.error || blockers.error) throw blocked.error || blockers.error;
  const hiddenIds = new Set([
    ...(blocked.data || []).map((row) => row.blocked_id),
    ...(blockers.data || []).map((row) => row.blocker_id),
  ]);
  visibleComments = visibleComments.filter((comment) => !hiddenIds.has(comment.user_id));
}

return NextResponse.json({ comments: visibleComments });

} catch {
return NextResponse.json(
{
error: 'Não foi possível carregar os comentários.',
},
{ status: 500 }
);
}
}

export async function POST(request: Request) {
try {
const userId = await getUserId(request);

if (!userId) {
  return NextResponse.json(
    {
      error: 'Você precisa estar logado para comentar.',
    },
    { status: 401 }
  );
}

const body = await request.json();

const chapterId = body.chapter_id;
const commentBody = body.body;
const selectedText = body.selected_text || null;

const startOffset =
  typeof body.start_offset === 'number'
    ? body.start_offset
    : null;

const stickerId =
  typeof body.sticker_id === 'string'
    ? body.sticker_id
    : null;

if (!chapterId) {
  return NextResponse.json(
    {
      error: 'Capítulo não informado.',
    },
    { status: 400 }
  );
}

if (
  !commentBody ||
  typeof commentBody !== 'string' ||
  !commentBody.trim()
) {
  return NextResponse.json(
    {
      error: 'O comentário não pode estar vazio.',
    },
    { status: 400 }
  );
}

const { data: chapter } = await supabase
  .from('chapters')
  .select('id, moderation_hidden_at')
  .eq('id', chapterId)
  .eq('published', true)
  .is('moderation_hidden_at', null)
  .maybeSingle();

if (!chapter) {
  return NextResponse.json(
    {
      error: 'Capítulo não encontrado.',
    },
    { status: 404 }
  );
}

const { data: chapterStory } = await supabase.from('chapters').select('story_id').eq('id', chapterId).maybeSingle();
if (!chapterStory || !(await isPublicStoryVisible(supabase, chapterStory.story_id))) {
  return NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404 });
}

const { data: storyOwner, error: storyOwnerError } = await supabase
  .from('stories').select('author_id').eq('id', chapterStory.story_id).maybeSingle();
if (storyOwnerError) throw storyOwnerError;
if (storyOwner && await areUsersBlocked(supabase, userId, storyOwner.author_id)) {
  return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
}

if (typeof body.parent_comment_id === 'string') {
  const { data: parent, error: parentError } = await supabase.from('comments')
    .select('user_id').eq('id', body.parent_comment_id).eq('chapter_id', chapterId).is('moderation_hidden_at', null).maybeSingle();
  if (parentError) throw parentError;
  if (parent && await areUsersBlocked(supabase, userId, parent.user_id)) {
    return NextResponse.json({ error: 'Esta interação não está disponível.' }, { status: 403 });
  }
}

let sticker = null;

if (stickerId) {
  const { data: stickerData } = await supabase
    .from('user_stickers')
    .select('id, image_url')
    .eq('id', stickerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!stickerData) {
    return NextResponse.json(
      {
        error: 'Figurinha não encontrada.',
      },
      { status: 400 }
    );
  }

  sticker = stickerData;
}

const { data: comment, error } = await supabase
  .from('comments')
  .insert({
    chapter_id: chapterId,
    user_id: userId,
    body: commentBody.trim(),
    selected_text: selectedText,
    start_offset: startOffset,
    sticker_id: stickerId,
  })
  .select(`
    id,
    chapter_id,
    user_id,
    body,
    selected_text,
    start_offset,
    parent_comment_id,
    sticker_id,
    created_at,
    profiles:user_id (
      username,
      display_name,
      avatar_url
    ),
    user_stickers:sticker_id (
      id,
      image_url
    )
  `)
  .single();

if (error) {
  return NextResponse.json(
    {
      error: 'Não foi possível criar o comentário.',
    },
    { status: 500 }
  );
}

if (sticker) {
  await supabase
    .from('user_stickers')
    .update({
      last_used_at: new Date().toISOString(),
    })
    .eq('id', sticker.id)
    .eq('user_id', userId);
}

return NextResponse.json(
  {
    comment,
  },
  { status: 201 }
);

} catch {
return NextResponse.json(
{
error: 'Não foi possível criar o comentário.',
},
{ status: 500 }
);
}
}
