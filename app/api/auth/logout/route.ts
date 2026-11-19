import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { d1Auth } from '@/lib/database/d1-auth';
import { getD1PreviewDatabase } from '@/lib/database/preview';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';

    const sessionCookie = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) =>
        cookie.startsWith('toriland_session=')
      );

    if (sessionCookie) {
      const sessionToken = decodeURIComponent(
        sessionCookie.substring('toriland_session='.length)
      );

      const tokenHash = crypto
        .createHash('sha256')
        .update(sessionToken)
        .digest('hex');

      const db = getD1PreviewDatabase('auth');
      if (db) await d1Auth(db).revokeSession(tokenHash);
      else await supabase
        .from('auth_sessions')
        .delete()
        .eq('token_hash', tokenHash);
    }

    const response = NextResponse.json({
      message: 'Logout realizado com sucesso.',
    });

    response.cookies.set('toriland_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        error: 'Não foi possível sair da conta.',
      },
      { status: 500 }
    );
  }
}
