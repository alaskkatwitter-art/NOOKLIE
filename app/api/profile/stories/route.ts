import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET(request: Request) {
  try {
    /*
     * Usa o próprio /api/auth/me para descobrir
     * quem está logado, sem precisar conhecer
     * a estrutura interna de auth_sessions.
     */
    const meResponse = await fetch(
      new URL('/api/auth/me', request.url),
      {
        headers: {
          cookie: (await cookies()).toString(),
        },
        cache: 'no-store',
      }
    );

    const meData = await meResponse.json();

    if (!meResponse.ok || !meData.authenticated || !meData.user?.id) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    const userId = meData.user.id;

    console.log('USUÁRIO DO PERFIL:', userId);

    /*
     * Busca TODAS as histórias criadas pelo usuário.
     * Não depende de capítulos publicados.
     */
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        author_id,
        title,
        description,
        cover_url,
        status,
        rating,
        created_at,
        updated_at
      `)
      .eq('author_id', userId)
      .order('updated_at', {
        ascending: false,
      });

    if (storiesError) {
      console.error('ERRO AO BUSCAR STORIES:', storiesError);

      return NextResponse.json(
        {
          error: 'Erro ao buscar histórias.',
        },
        { status: 500 }
      );
    }

    console.log('HISTÓRIAS ENCONTRADAS:', stories);

    return NextResponse.json({
      stories: stories || [],
    });
  } catch (error) {
    console.error('ERRO GERAL NA API DE STORIES:', error);

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      { status: 500 }
    );
  }
}
