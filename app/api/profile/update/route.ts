import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const PROFILE_THEME_COLORS = new Set([
  '#ff78b9',
  '#ff9aca',
  '#b77cff',
  '#7c8cff',
  '#62c8ff',
  '#61d6a4',
  '#9be15d',
  '#ffd166',
  '#ff8a65',
  '#ffffff',
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function PATCH(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';

    const sessionCookie = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) =>
        cookie.startsWith('toriland_session=')
      );

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Você precisa estar logado.' },
        { status: 401 }
      );
    }

    const sessionToken = decodeURIComponent(
      sessionCookie.substring('toriland_session='.length)
    );

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Sessão inválida.' },
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

    if (
      sessionError ||
      !session ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: 'Sua sessão expirou. Entre novamente.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Dados do perfil inválidos.' },
        { status: 400 }
      );
    }

    const updates: {
      display_name?: string | null;
      bio?: string | null;
      theme_color?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'display_name')) {
      if (body.display_name !== null && typeof body.display_name !== 'string') {
        return NextResponse.json(
          { error: 'Nome de exibição inválido.' },
          { status: 400 }
        );
      }

      const displayName =
        typeof body.display_name === 'string'
          ? body.display_name.trim()
          : '';

      if (displayName.length > 50) {
        return NextResponse.json(
          {
            error:
              'O nome de exibição pode ter no máximo 50 caracteres.',
          },
          { status: 400 }
        );
      }

      updates.display_name = displayName || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      if (body.bio !== null && typeof body.bio !== 'string') {
        return NextResponse.json(
          { error: 'Bio inválida.' },
          { status: 400 }
        );
      }

      const bio =
        typeof body.bio === 'string'
          ? body.bio.trim()
          : '';

      if (bio.length > 500) {
        return NextResponse.json(
          {
            error:
              'A bio pode ter no máximo 500 caracteres.',
          },
          { status: 400 }
        );
      }

      updates.bio = bio || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'theme_color')) {
      if (
        typeof body.theme_color !== 'string' ||
        !PROFILE_THEME_COLORS.has(body.theme_color)
      ) {
        return NextResponse.json(
          { error: 'Cor do perfil inválida.' },
          { status: 400 }
        );
      }

      updates.theme_color = body.theme_color;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma alteração válida foi informada.' },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', session.user_id)
        .select(
          'id, username, display_name, bio, avatar_url, cover_url, theme_color, verified, is_official'
        )
        .single();

    if (profileError || !profile) {
      return NextResponse.json(
        {
          error: 'Não foi possível atualizar seu perfil.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Perfil atualizado com sucesso.',
      user: profile,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Não foi possível atualizar seu perfil.',
      },
      { status: 500 }
    );
  }
}
