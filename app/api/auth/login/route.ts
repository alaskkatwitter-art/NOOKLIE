import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const cleanUsername = username?.trim().toLowerCase();

    if (!cleanUsername || !password) {
      return NextResponse.json(
        {
          error: 'Username e senha são obrigatórios.',
        },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return NextResponse.json(
        {
          error:
            'O username deve ter entre 3 e 30 caracteres e usar apenas letras, números e _.',
        },
        { status: 400 }
      );
    }

    /*
     * Procura a conta pelo username.
     */
    const { data: account, error: accountError } =
      await supabase
        .from('auth_accounts')
        .select('id, username, password_hash')
        .eq('username', cleanUsername)
        .maybeSingle();

    if (accountError) {
      console.error(
        'ERRO AO PROCURAR CONTA:',
        accountError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar sua conta.',
        },
        { status: 500 }
      );
    }

    /*
     * Username inexistente.
     */
    if (!account) {
      return NextResponse.json(
        {
          error: 'Username ou senha incorretos.',
        },
        { status: 401 }
      );
    }

    /*
     * Confere a senha salva no cadastro.
     */
    const passwordIsValid = await bcrypt.compare(
      password,
      account.password_hash
    );

    if (!passwordIsValid) {
      return NextResponse.json(
        {
          error: 'Username ou senha incorretos.',
        },
        { status: 401 }
      );
    }

    /*
     * Cria um token de sessão completamente aleatório.
     */
    const sessionToken = crypto
      .randomBytes(32)
      .toString('hex');

    /*
     * No banco guardamos somente o hash do token.
     */
    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    /*
     * Sessão válida por 30 dias.
     */
    const expiresAt = new Date(
      Date.now() + SESSION_SECONDS * 1000
    ).toISOString();

    /*
     * Salva a sessão no banco.
     *
     * A tabela auth_sessions possui uma coluna id
     * obrigatória, então geramos um UUID para ela.
     */
    const { error: sessionError } = await supabase
      .from('auth_sessions')
      .insert({
        id: crypto.randomUUID(),
        user_id: account.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (sessionError) {
      console.error(
        'ERRO AO CRIAR SESSÃO NO SUPABASE:',
        sessionError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível criar sua sessão.',
        },
        { status: 500 }
      );
    }

    /*
     * Cria a resposta.
     */
    const response = NextResponse.json(
      {
        message: 'Login realizado com sucesso.',
        authenticated: true,
        user: {
          id: account.id,
          username: account.username,
        },
      },
      { status: 200 }
    );

    /*
     * Cria o cookie que o /api/auth/me procura.
     */
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
    console.error(
      'ERRO INESPERADO NO LOGIN:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível realizar o login.',
      },
      { status: 500 }
    );
  }
}
