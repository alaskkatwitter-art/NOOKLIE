import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { d1Auth } from '@/lib/database/d1-auth';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { clientIpForAuth, rateLimitKey } from '@/lib/security/rate-key';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: Request) {
  try {
    const { username, password, officialSignupCode, invitedBy } = await request.json();

    const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';

    if (!cleanUsername || typeof password !== 'string' || !password) {
      return NextResponse.json(
        { error: 'Username e senha são obrigatórios.' },
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

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'A senha precisa ter pelo menos 8 caracteres.' },
        { status: 400 }
      );
    }

    if (bcrypt.truncates(password)) {
      return NextResponse.json(
        { error: 'A senha deve ter até 72 bytes. Acentos e emojis podem ocupar mais de um byte.' },
        { status: 400 }
      );
    }

    const d1 = getD1PreviewDatabase('auth');
    const auth = d1 ? d1Auth(d1) : null;
    const windowSeconds = 15 * 60;
    const clientIp = clientIpForAuth(request);
    const { data: allowed, error: limitError } = auth
      ? { data: await auth.consumeRateLimit(rateLimitKey('signup:ip', clientIp), 20, windowSeconds), error: null }
      : await supabase.rpc('consume_auth_rate_limit', {
      p_key_hash: rateLimitKey('signup:ip', clientIp),
      p_limit: 20,
      p_window_seconds: windowSeconds,
    });
    if (limitError || typeof allowed !== 'boolean') {
      return NextResponse.json({ error: 'Não foi possível criar a conta agora.' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        { status: 429, headers: { 'Retry-After': String(windowSeconds) } }
      );
    }

    const { data: existingAccount, error: searchError } = auth
      ? { data: await auth.accountForLogin(cleanUsername), error: null }
      : await supabase
      .from('auth_accounts')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (searchError) {
      return NextResponse.json(
        { error: 'Não foi possível verificar o username.' },
        { status: 500 }
      );
    }

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Esse username já está sendo usado.' },
        { status: 409 }
      );
    }

    const isOfficialAccount = cleanUsername === 'nooklie';

    let officialHash: string | null = null;
    if (isOfficialAccount) {
      if (typeof officialSignupCode !== 'string' || !officialSignupCode.trim()) {
        return NextResponse.json(
          { error: 'A conta @nooklie só pode ser criada com o código oficial de uso único.' },
          { status: 403 }
        );
      }

      const { data: claim, error: claimError } = d1
        ? { data: await d1.prepare('SELECT token_hash FROM official_signup_tokens WHERE singleton = 1 AND used_at IS NULL').first<{ token_hash: string }>(), error: null }
        : await supabase
        .from('official_signup_tokens')
        .select('token_hash')
        .eq('singleton', true)
        .is('used_at', null)
        .maybeSingle();

      const suppliedHash = crypto
        .createHash('sha256')
        .update(officialSignupCode.trim())
        .digest();
      officialHash = suppliedHash.toString('hex');

      const expectedHash = claim?.token_hash
        ? Buffer.from(claim.token_hash, 'hex')
        : null;

      if (
        claimError ||
        !expectedHash ||
        suppliedHash.length !== expectedHash.length ||
        !crypto.timingSafeEqual(suppliedHash, expectedHash)
      ) {
        return NextResponse.json(
          { error: 'O código da conta oficial é inválido ou já foi usado.' },
          { status: 403 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const recoveryKey = crypto.randomBytes(16).toString('hex');
    const recoveryKeyHash = await bcrypt.hash(recoveryKey, 12);

    const userId = crypto.randomUUID();

    if (auth) {
      const created = await auth.register(userId, cleanUsername, passwordHash, recoveryKeyHash, officialHash,
        typeof invitedBy === 'string' ? invitedBy.trim().toLowerCase() : null);
      if (!created) {
        const error = isOfficialAccount
          ? 'O código oficial já foi usado. Solicite um novo código.'
          : 'Esse username já está sendo usado.';
        return NextResponse.json({ error }, { status: 409 });
      }
      return NextResponse.json({ message: 'Conta criada com sucesso.', recoveryKey }, {
        status: 201, headers: { 'Cache-Control': 'no-store' },
      });
    }

    const { error: accountError } = await supabase
      .from('auth_accounts')
      .insert({
        id: userId,
        username: cleanUsername,
        password_hash: passwordHash,
        recovery_key_hash: recoveryKeyHash,
      });

    if (accountError) {
      return NextResponse.json(
        { error: 'Não foi possível criar a conta.' },
        { status: 500 }
      );
    }

    if (isOfficialAccount) {
      const { data: claimedToken, error: claimError } = await supabase
        .from('official_signup_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('singleton', true)
        .is('used_at', null)
        .select('singleton')
        .maybeSingle();

      if (claimError || !claimedToken) {
        await supabase.from('auth_accounts').delete().eq('id', userId);
        return NextResponse.json(
          { error: 'O código oficial já foi usado. Solicite um novo código.' },
          { status: 409 }
        );
      }
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        user_id: userId,
        username: cleanUsername,
        is_official: isOfficialAccount,
      });

    if (profileError) {
      await supabase
        .from('auth_accounts')
        .delete()
        .eq('id', userId);

      return NextResponse.json(
        { error: 'Não foi possível criar o perfil.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Conta criada com sucesso.',
        recoveryKey,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível criar a conta.' },
      { status: 500 }
    );
  }
      }
