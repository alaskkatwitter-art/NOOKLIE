import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SECRET_KEY!
);

const RATE_WINDOW_SECONDS = 15 * 60;

function hashRateLimitKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
    const recoveryKey = typeof payload.recoveryKey === 'string' ? payload.recoveryKey : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';

    if (!username || !recoveryKey || !newPassword) {
      return NextResponse.json({ error: 'Username, chave de recuperação e nova senha são obrigatórios.' }, { status: 400, headers: noStoreHeaders() });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username) || newPassword.length < 8) {
      return NextResponse.json({ error: 'Username ou chave de recuperação incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }

    if (bcrypt.truncates(newPassword)) {
      return NextResponse.json(
        { error: 'A senha deve ter até 72 bytes. Acentos e emojis podem ocupar mais de um byte.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const clientIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limiterKeys = [
      { value: `recovery:user:${username}:ip:${clientIp}`, limit: 10 },
      { value: `recovery:ip:${clientIp}`, limit: 60 },
    ];
    for (const entry of limiterKeys) {
      const { data: allowed, error: limitError } = await supabase.rpc('consume_auth_rate_limit', {
        p_key_hash: hashRateLimitKey(entry.value),
        p_limit: entry.limit,
        p_window_seconds: RATE_WINDOW_SECONDS,
      });
      if (limitError || typeof allowed !== 'boolean') {
        console.error('Não foi possível aplicar limite de tentativas de recuperação:', limitError);
        return NextResponse.json({ error: 'Não foi possível recuperar sua conta agora.' }, { status: 503, headers: noStoreHeaders() });
      }
      if (!allowed) {
        return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429, headers: { ...noStoreHeaders(), 'Retry-After': String(RATE_WINDOW_SECONDS) } });
      }
    }

    const { data: account, error } = await supabase
      .from('auth_accounts')
      .select('id, recovery_key_hash')
      .eq('username', username)
      .maybeSingle();

    if (error || !account) {
      return NextResponse.json({ error: 'Username ou chave de recuperação incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }

    const recoveryKeyCorrect = await bcrypt.compare(recoveryKey, account.recovery_key_hash);
    if (!recoveryKeyCorrect) {
      return NextResponse.json({ error: 'Username ou chave de recuperação incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const newRecoveryKey = crypto.randomBytes(16).toString('hex');
    const newRecoveryKeyHash = await bcrypt.hash(newRecoveryKey, 12);
    const { data: recovered, error: recoveryError } = await supabase.rpc('complete_auth_recovery', {
      p_account_id: account.id,
      p_expected_recovery_key_hash: account.recovery_key_hash,
      p_new_password_hash: newPasswordHash,
      p_consumed_recovery_key_hash: newRecoveryKeyHash,
    });

    if (recoveryError || recovered !== true) {
      if (recoveryError) console.error('Erro ao concluir recuperação:', recoveryError);
      return NextResponse.json({ error: 'Username ou chave de recuperação incorretos.' }, { status: 401, headers: noStoreHeaders() });
    }

    return NextResponse.json({
      message: 'Senha alterada com sucesso.',
      recoveryKey: newRecoveryKey,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error('Erro inesperado na recuperação:', error);
    return NextResponse.json({ error: 'Não foi possível recuperar sua conta.' }, { status: 400, headers: noStoreHeaders() });
  }
}
