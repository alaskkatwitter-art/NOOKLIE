import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { NextResponse } from 'next/server';
import { currentViewerProfileId } from '@/lib/moderation/content-visibility';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const actor = await d1FollowActor(db);
      const headers = {'Cache-Control':'no-store, private',Vary:'Cookie'};
      if (!actor) return NextResponse.json({error:'Não autenticado.'},{status:401,headers});
      const stories = await db.prepare(`SELECT s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at
        FROM released_stories s JOIN profiles p ON p.id=s.author_id AND p.moderation_hidden_at IS NULL
        JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
        JOIN d1_social_actors v ON v.token_hash=?1
        WHERE s.author_id=?2 AND (p.is_private=0 OR p.id=v.profile_id OR EXISTS(
          SELECT 1 FROM follows WHERE follower_id=v.profile_id AND following_id=p.id))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=v.profile_id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.profile_id))
        ORDER BY s.updated_at DESC,s.id`).bind(actor.hash,actor.id).all<Record<string,unknown>>();
      if (!stories.success) throw Error('Unable to load author stories');
      return NextResponse.json({stories:stories.results},{headers});
    }
    const userId = await currentViewerProfileId(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    /*
     * Busca TODAS as histórias criadas pelo usuário.
     * Não depende de capítulos publicados.
     */
    const { data: stories, error: storiesError } = await supabase
      .from('released_stories')
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
