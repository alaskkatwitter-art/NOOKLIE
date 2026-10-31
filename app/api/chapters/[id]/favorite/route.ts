import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ favorited: false });
    const { id } = await context.params;
    const { data, error } = await supabase.from('chapter_favorites').select('id').eq('chapter_id', id).eq('user_id', user.userId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ favorited: Boolean(data) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/chapters/[id]/favorite:', error);
    return NextResponse.json({ error: 'Não foi possível verificar o favorito.' }, { status: 500 });
  }
}
export async function POST(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para favoritar capítulos.' }, { status: 401 });
    const { id } = await context.params;
    const { data: chapter, error: chapterError } = await supabase.from('chapters').select('id, published, story_id').eq('id', id).is('moderation_hidden_at', null).maybeSingle();
    if (chapterError) throw chapterError;
    if (!chapter || !chapter.published || !(await isPublicStoryVisible(supabase, chapter.story_id))) return NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404 });
    const { error } = await supabase.from('chapter_favorites').upsert({ chapter_id: id, user_id: user.userId }, { onConflict: 'chapter_id,user_id', ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ favorited: true });
  } catch (error) {
    console.error('POST /api/chapters/[id]/favorite:', error);
    return NextResponse.json({ error: 'Não foi possível favoritar o capítulo.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await context.params;
    const { error } = await supabase.from('chapter_favorites').delete().eq('chapter_id', id).eq('user_id', user.userId);
    if (error) throw error;
    return NextResponse.json({ favorited: false });
  } catch (error) {
    console.error('DELETE /api/chapters/[id]/favorite:', error);
    return NextResponse.json({ error: 'Não foi possível remover o favorito.' }, { status: 500 });
  }
}


