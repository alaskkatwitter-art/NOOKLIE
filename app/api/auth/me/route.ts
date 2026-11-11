import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getPublicStaffBadges } from '@/lib/admin/public-badges';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET(request: Request) {
  try {
    const summary = new URL(request.url).searchParams.get('summary') === '1';
    const cookieStore = await cookies();

    const sessionToken =
      cookieStore.get('toriland_session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { data: session, error: sessionError } =
      await supabase
        .from('auth_sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

    if (sessionError) {
      console.error(
        'ERRO AO PROCURAR SESSÃO:',
        sessionError
      );

      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    if (
      new Date(session.expires_at).getTime() <=
      Date.now()
    ) {
      await supabase
        .from('auth_sessions')
        .delete()
        .eq('token_hash', tokenHash);

      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    const fields = 'id, username, display_name, bio, avatar_url, cover_url, theme_color, is_private, verified, is_official, header_layout, avatar_position, video_autoplay';
    const profiles = supabase.from('profiles');
    const selection = summary
      ? profiles.select(fields)
      : profiles.select(`${fields}, avatar_animation, cover_animation`);
    const { data: profile, error: profileError } = await selection.eq('user_id', session.user_id).maybeSingle();

    if (profileError) {
      console.error(
        'ERRO AO PROCURAR PERFIL:',
        profileError
      );

      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
        },
        { status: 401 }
      );
    }

    if (summary) {
      const { id, username, display_name, avatar_url, verified, is_official, video_autoplay } = profile;
      return NextResponse.json({
        authenticated: true,
        user: { id, username, display_name, avatar_url, verified, is_official, video_autoplay },
      });
    }

    const staffBadges = await getPublicStaffBadges(supabase, session.user_id);

    return NextResponse.json({
      authenticated: true,
      user: { ...profile, staff_badges: staffBadges },
    });
  } catch (error) {
    console.error(
      'ERRO AO VERIFICAR AUTENTICAÇÃO:',
      error
    );

    return NextResponse.json(
      {
        authenticated: false,
        user: null,
      },
      { status: 500 }
    );
  }
}
