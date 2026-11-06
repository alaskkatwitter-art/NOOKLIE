import { NextResponse } from 'next/server';
import { chatActor, uuid, privateHeaders } from '@/lib/chat/server';
import { createClient } from '@supabase/supabase-js';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.SUPABASE_SECRET_KEY!
);

export async function GET(request: Request) {
try {
const { searchParams } = new URL(request.url);

const chapterId = searchParams.get('chapter_id');

if (typeof chapterId !== 'string' || !uuid.test(chapterId)) {
  return NextResponse.json(
    {
      error: 'Capítulo não informado.',
    },
    { status: 400 }
  );
}

const { data: chapterVisibility } = await supabase
  .from('chapters')
  .select('story_id')
  .eq('id', chapterId)
  .maybeSingle();
if (!chapterVisibility || !(await isPublicStoryVisible(supabase, chapterVisibility.story_id))) {
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
      avatar_url, verified, is_official
    ),
    user_stickers:sticker_id (
      id,
      image_url
    )
  `)
  .eq('chapter_id', chapterId)
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

return NextResponse.json({
  comments: comments || [],
});

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
const userId = (await chatActor())?.profileId;

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
const parentId = body.parent_comment_id || null;

const startOffset =
  typeof body.start_offset === 'number'
    ? body.start_offset
    : null;

const stickerId =
  typeof body.sticker_id === 'string'
    ? body.sticker_id
    : null;

if (typeof chapterId !== 'string' || !uuid.test(chapterId)) {
  return NextResponse.json(
    {
      error: 'Capítulo não informado.',
    },
    { status: 400 }
  );
}

if (
  typeof commentBody !== 'string' ||
  (!commentBody.trim() && !stickerId) || commentBody.length > 10000
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
  .select('id')
  .eq('id', chapterId)
  .eq('published', true)
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

if (parentId !== null) {
  if (typeof parentId !== 'string' || !uuid.test(parentId)) {
    return NextResponse.json({error: 'Comentário de origem inválido.'}, {status: 400});
  }
  const parent = await supabase.from('comments').select('id').eq('id', parentId).eq('chapter_id', chapterId).maybeSingle();
  if (parent.error) throw parent.error;
  if (!parent.data) return NextResponse.json({error: 'O comentário original não está disponível neste capítulo.'}, {status: 404});
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
    parent_comment_id: parentId,
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
      avatar_url, verified, is_official
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
  { status: 201, headers: privateHeaders }
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
