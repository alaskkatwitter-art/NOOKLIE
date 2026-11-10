import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { clientIpForAuth } from '@/lib/security/rate-key';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SECRET_KEY!
);

const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };
}

function hashRateLimitKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Username e senha são obrigatórios.' }, { status: 400, headers: noStoreHeaders() });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json({ error: 'Username ou senha incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }

    const clientIp = clientIpForAuth(request);
    const limiterKeys = [
      { value: `login:user:${username}:ip:${clientIp}`, limit: 10 },
      { value: `login:ip:${clientIp}`, limit: 60 },
    ];
    for (const entry of limiterKeys) {
      const { data: allowed, error } = await supabase.rpc('consume_auth_rate_limit', {
        p_key_hash: hashRateLimitKey(entry.value),
        p_limit: entry.limit,
        p_window_seconds: RATE_WINDOW_SECONDS,
      });
      if (error || typeof allowed !== 'boolean') {
        console.error('Não foi possível aplicar limite de tentativas de login:', error);
        return NextResponse.json({ error: 'Não foi possível realizar o login agora.' }, { status: 503, headers: noStoreHeaders() });
      }
      if (!allowed) {
        return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429, headers: { ...noStoreHeaders(), 'Retry-After': String(RATE_WINDOW_SECONDS) } });
      }
    }

    const { data: account, error: accountError } = await supabase
      .from('auth_accounts')
      .select('id, username, password_hash, account_status')
      .eq('username', username)
      .maybeSingle();

    if (accountError) {
      console.error('Erro ao verificar conta:', accountError);
      return NextResponse.json({ error: 'Não foi possível realizar o login agora.' }, { status: 503, headers: noStoreHeaders() });
    }

    const passwordIsValid = account
      ? await bcrypt.compare(password, account.password_hash)
      : false;
    if (!account || !passwordIsValid) {
      return NextResponse.json({ error: 'Username ou senha incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }
    if (account.account_status !== 'active') {
      return NextResponse.json({ error: 'Esta conta está suspensa. Entre em contato com o suporte do Nooklie.' }, { status: 403, headers: noStoreHeaders() });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    const { error: sessionError } = await supabase.from('auth_sessions').insert({
      id: crypto.randomUUID(),
      user_id: account.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (sessionError) {
      console.error('Erro ao criar sessão:', sessionError);
      return NextResponse.json({ error: 'Não foi possível criar sua sessão.' }, { status: 503, headers: noStoreHeaders() });
    }

    const response = NextResponse.json({
      message: 'Login realizado com sucesso.',
      authenticated: true,
      user: { id: account.id, username: account.username },
    }, { status: 200, headers: noStoreHeaders() });
    response.cookies.set({
      name: 'toriland_session',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('Erro inesperado no login:', error);
    return NextResponse.json({ error: 'Não foi possível realizar o login.' }, { status: 400, headers: noStoreHeaders() });
  }
}
