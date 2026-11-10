import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { emptyProfileThemes, parseProfileThemeCollection } from '@/lib/profile/themes';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers });
}

async function readThemeBody(request: Request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET() {
  try {
    const account = await getAuthenticatedUserContext();
    if (!account) return response({ error: 'Entre para ver seus temas.' }, 401);
    const { data, error } = await supabase.from('profile_themes')
      .select('drafts, active, revision').eq('user_id', account.userId).maybeSingle();
    if (error) throw error;
    const collection = data ? parseProfileThemeCollection(data) : emptyProfileThemes;
    if (!collection) throw Error('Invalid saved theme collection');
    return response(collection);
  } catch {
    return response({ error: 'Não foi possível carregar seus temas.' }, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const account = await getAuthenticatedUserContext();
    if (!account) return response({ error: 'Entre para salvar seus temas.' }, 401);
    const raw = await readThemeBody(request);
    if (raw === null) return response({ error: 'A coleção de temas é muito grande.' }, 413);
    const collection = parseProfileThemeCollection(JSON.parse(raw));
    if (!collection) return response({ error: 'Confira os nomes, as cores e o contraste dos temas.' }, 400);
    const { drafts, active, revision } = collection;
    const next = { drafts, active, revision: revision + 1 };
    const table = supabase.from('profile_themes');
    const { data, error } = revision === 0
      ? await table.insert({ user_id: account.userId, ...next }).select('revision').single()
      : await table.update(next).eq('user_id', account.userId).eq('revision', revision).select('revision').maybeSingle();
    if (error?.code === '23505' || (!error && !data)) {
      return response({ error: 'Seus temas mudaram em outra sessão. Atualize a página e tente novamente.' }, 409);
    }
    if (error) throw error;
    return response(next);
  } catch (error) {
    if (error instanceof SyntaxError) return response({ error: 'Dados de tema inválidos.' }, 400);
    return response({ error: 'Não foi possível salvar seus temas.' }, 500);
  }
}
