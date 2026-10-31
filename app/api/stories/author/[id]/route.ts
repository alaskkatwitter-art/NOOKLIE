import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Usuário não informado.' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('toriland_session')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    const { data: session, error: sessionError } =
      await supabase
        .from('auth_sessions')
        .select('user_id, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (
      sessionError ||
      !session ||
      (
        session.expires_at &&
        new Date(session.expires_at).getTime() <= Date.now()
      )
    ) {
      return NextResponse.json(
        { error: 'Sessão inválida ou expirada.' },
        { status: 401 }
      );
    }

    const { data: stories, error: storiesError } =
      await supabase
        .from('stories')
        .select(
          `
          id,
          author_id,
          title,
          description,
          cover_url,
          status,
          rating,
          created_at,
          updated_at
          `
        )
        .eq('author_id', id)
        .is('moderation_hidden_at', null)
        .order('updated_at', {
          ascending: false,
        });

    if (storiesError) {
      console.error(
        'Erro ao buscar histórias do autor:',
        storiesError
      );

      return NextResponse.json(
        { error: 'Não foi possível carregar as histórias.' },
        { status: 500 }
      );
    }

    if (!(await isPublicProfileVisible(supabase, id))) {
      return NextResponse.json({ stories: [] });
    }

    return NextResponse.json({
      stories: stories || [],
    });
  } catch (error) {
    console.error(
      'Erro inesperado ao buscar histórias do autor:',
      error
    );

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
