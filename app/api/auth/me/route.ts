import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Auth } from '@/lib/database/d1-auth';
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

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
      const session = await d1Auth(db).session(tokenHash);
      if (!session) return NextResponse.json({ authenticated: false, user: null }, { status: 401, headers });
      const summaryFields = 'id, username, display_name, avatar_url, verified, is_official, video_autoplay';
      const fields = summary ? summaryFields : `${summaryFields}, bio, cover_url, theme_color, is_private,
        header_layout, avatar_position, avatar_animation, cover_animation, spotify_link`;
      const profile = await db.prepare(`SELECT ${fields} FROM profiles WHERE user_id = ?`)
        .bind(session.user_id).first<Record<string, unknown>>();
      if (!profile) return NextResponse.json({ authenticated: false, user: null }, { status: 401, headers });

      for (const field of ['verified', 'is_official', 'video_autoplay', 'is_private']) {
        if (field in profile) profile[field] = Boolean(profile[field]);
      }
      if (!summary) {
        for (const field of ['avatar_animation', 'cover_animation']) {
          const value = profile[field];
          if (typeof value === 'string') profile[field] = JSON.parse(value);
        }
        const [root, badges] = await Promise.all([
          db.prepare('SELECT 1 FROM platform_admins WHERE user_id = ?').bind(session.user_id).first(),
          db.prepare(`SELECT coalesce(nullif(r.badge_title, ''), r.name) AS title,
            coalesce(nullif(r.badge_description, ''), d.name) AS description
            FROM team_memberships m
            JOIN team_roles r ON r.id = m.role_id AND r.department_id = m.department_id AND r.status = 'active'
            JOIN departments d ON d.id = m.department_id AND d.status = 'active'
            WHERE m.user_id = ? AND m.status = 'active'`).bind(session.user_id)
            .all<{ title: string; description: string }>(),
        ]);
        if (!badges.success) throw Error('Unable to read staff badges');
        profile.staff_badges = root
          ? [{ title: 'Administração do Nooklie', description: 'Equipe oficial do Nooklie' }, ...badges.results]
          : badges.results;
      }
      return NextResponse.json({ authenticated: true, user: profile }, { headers });
    }

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
      : profiles.select(`${fields}, avatar_animation, cover_animation, spotify_link`);
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
