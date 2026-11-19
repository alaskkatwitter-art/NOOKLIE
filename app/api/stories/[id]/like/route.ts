import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'História não encontrada.' },
        { status: 404 }
      );
    }

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const result = await d1Books(db,safeChapterHtml).storyLike(await getSessionTokenHash(),id,false);
      return NextResponse.json(result ?? {likes:0,liked:false},{headers:{'Cache-Control':'no-store, private'}});
    }
    const userId = await getUserId(request);

    const { count, error: countError } =
      await supabase
        .from('story_likes')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('story_id', id);

    if (countError) {
      return NextResponse.json(
        { error: 'Não foi possível carregar as curtidas.' },
        { status: 500 }
      );
    }

    let liked = false;

    if (userId) {
      const { data: existingLike } = await supabase
        .from('story_likes')
        .select('story_id')
        .eq('story_id', id)
        .eq('user_id', userId)
        .maybeSingle();

      liked = !!existingLike;
    }

    return NextResponse.json({
      likes: count || 0,
      liked,
    });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível carregar as curtidas.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const headers = {'Cache-Control':'no-store, private'};
      const origin = request.headers.get('origin');
      if (origin && origin!==new URL(request.url).origin) return NextResponse.json({error:'Acesso restrito.'},{status:403,headers});
      const actor = await d1FollowActor(db);
      if (!actor) return NextResponse.json({error:'Você precisa estar logado para curtir.'},{status:401,headers});
      const result = await d1Books(db,safeChapterHtml).storyLike(actor.hash,id,true);
      return result ? NextResponse.json(result,{headers})
        : NextResponse.json({error:'História não encontrada.'},{status:404,headers});
    }
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Você precisa estar logado para curtir.',
        },
        { status: 401 }
      );
    }

    const { data: existingLike } = await supabase
      .from('story_likes')
      .select('story_id')
      .eq('story_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingLike) {
      await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', id)
        .eq('user_id', userId);
    } else {
      const { error } = await supabase
        .from('story_likes')
        .insert({
          story_id: id,
          user_id: userId,
        });

      if (error) {
        return NextResponse.json(
          {
            error: 'Não foi possível curtir a história.',
          },
          { status: 500 }
        );
      }
    }

    const { count } = await supabase
      .from('story_likes')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('story_id', id);

    return NextResponse.json({
      likes: count || 0,
      liked: !existingLike,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Não foi possível atualizar a curtida.',
      },
      { status: 500 }
    );
  }
        }
