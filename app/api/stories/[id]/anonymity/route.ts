import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    if (typeof body?.is_anonymous !== 'boolean') {
      return NextResponse.json({ error: 'Escolha se deseja publicar esta história anonimamente.' }, { status: 400 });
    }

    const { data: story, error: storyError } = await supabase.from('stories')
      .select('id, is_anonymous').eq('id', id).eq('author_id', user.userId).maybeSingle();
    if (storyError) throw storyError;
    if (!story) return NextResponse.json({ error: 'Somente a autoria principal pode alterar o anonimato.' }, { status: 404 });
    if (story.is_anonymous === body.is_anonymous) return NextResponse.json({ is_anonymous: story.is_anonymous });

    const { error: updateError } = await supabase.from('stories').update({
      is_anonymous: body.is_anonymous,
      anonymity_changed_at: new Date().toISOString(),
    }).eq('id', id).eq('author_id', user.userId);
    if (updateError) throw updateError;

    const { error: historyError } = await supabase.from('story_anonymity_events').insert({
      story_id: id,
      actor_id: user.userId,
      is_anonymous: body.is_anonymous,
    });
    if (historyError) {
      await supabase.from('stories').update({ is_anonymous: story.is_anonymous }).eq('id', id).eq('author_id', user.userId);
      throw historyError;
    }

    return NextResponse.json({ is_anonymous: body.is_anonymous, message: body.is_anonymous ? 'Autoria ocultada.' : 'Autoria revelada.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/stories/[id]/anonymity:', error);
    return NextResponse.json({ error: 'Não foi possível alterar a privacidade da história.' }, { status: 500 });
  }
}
