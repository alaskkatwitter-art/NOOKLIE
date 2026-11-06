import { findCatalogTag, ensureCatalogTag } from '@/lib/stories/tags';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!);
const RATE_WINDOW_SECONDS = 60 * 60;

function noStore() {
  return { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };
}

function createSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function getUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionCookie = cookieHeader.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('toriland_session='));
  if (!sessionCookie) return null;

  let token: string;
  try {
    token = decodeURIComponent(sessionCookie.slice('toriland_session='.length));
  } catch {
    return null;
  }
  if (!token) return null;

  const tokenHash = hash(token);
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !session || new Date(session.expires_at).getTime() <= Date.now()) return null;
  return session.user_id;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawQuery = (params.get('q') || '').trim();
    if (rawQuery.length > 100) {
      return NextResponse.json({ error: 'A busca de tags é muito longa.' }, { status: 400, headers: noStore() });
    }
    const query = rawQuery.replace(/[%_]/g, '');
    const categorySlug = (params.get('category') || '').trim().toLowerCase();

    const { data: categories, error: categoryError } = await supabase
      .from('tag_categories')
      .select('id, name, slug')
      .order('name', { ascending: true });

    if (categoryError) {
      console.error('Erro ao carregar categorias de tags:', categoryError);
      return NextResponse.json({ error: 'Não foi possível carregar as categorias.' }, { status: 503, headers: noStore() });
    }

    let tagsQuery = supabase
      .from('tags')
      .select('id, name, slug, category_id, created_at')
      .order('name', { ascending: true })
      .limit(120);

    if (query) tagsQuery = tagsQuery.ilike('name', `%${query}%`);
    if (categorySlug) {
      const category = (categories || []).find((item) => item.slug === categorySlug);
      if (!category) return NextResponse.json({ categories: categories || [], tags: [] }, { headers: noStore() });
      tagsQuery = tagsQuery.eq('category_id', category.id);
    }

    const { data: tags, error: tagError } = await tagsQuery;
    if (tagError) {
      console.error('Erro ao carregar catálogo de tags:', tagError);
      return NextResponse.json({ error: 'Não foi possível carregar as tags.' }, { status: 503, headers: noStore() });
    }

    const categoryMap = new Map((categories || []).map((category) => [category.id, category]));
    return NextResponse.json({
      categories: categories || [],
      tags: (tags || []).map((tag) => ({
        ...tag,
        category: tag.category_id ? categoryMap.get(tag.category_id) || null : null,
      })),
    }, { headers: noStore() });
  } catch (error) {
    console.error('Erro inesperado ao carregar tags:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as tags.' }, { status: 500, headers: noStore() });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Entre na sua conta para publicar uma tag.' }, { status: 401, headers: noStore() });
    }

    const payload = await request.json();
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : '';
    const categorySlug = typeof payload.category === 'string' ? payload.category.trim().toLowerCase() : '';

    if (name.length < 2 || name.length > 50 || /[\u0000-\u001f\u007f]/.test(name)) {
      return NextResponse.json({ error: 'A tag precisa ter entre 2 e 50 caracteres.' }, { status: 400, headers: noStore() });
    }
    const slug = createSlug(name);
    if (!slug || slug.length > 60) {
      return NextResponse.json({ error: 'Essa tag não pode ser usada. Tente outro nome.' }, { status: 400, headers: noStore() });
    }

    const { data: allowed, error: rateError } = await supabase.rpc('consume_auth_rate_limit', {
      p_key_hash: hash(`tag-create:${userId}`),
      p_limit: 30,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError || typeof allowed !== 'boolean') {
      console.error('Erro ao verificar limite de criação de tags:', rateError);
      return NextResponse.json({ error: 'Não foi possível publicar a tag agora.' }, { status: 503, headers: noStore() });
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Você atingiu o limite de tags novas por enquanto. Tente novamente mais tarde.' }, { status: 429, headers: { ...noStore(), 'Retry-After': String(RATE_WINDOW_SECONDS) } });
    }

    const { data: category, error: categoryError } = await supabase
      .from('tag_categories')
      .select('id, name, slug')
      .eq('slug', categorySlug)
      .maybeSingle();
    if (categoryError || !category) {
      return NextResponse.json({ error: 'Escolha uma categoria válida.' }, { status: 400, headers: noStore() });
    }

    const existing = await findCatalogTag(supabase, name, slug);
    if (existing) {
      return NextResponse.json({
        created: false,
        message: 'Essa tag já existe no catálogo.',
        tag: { ...existing, category: existing.category_id === category.id ? category : null },
      }, { status: 200, headers: noStore() });
    }

    const tag = await ensureCatalogTag(supabase, name, category.id, userId);
    if (!tag) throw new Error('Invalid tag');

    return NextResponse.json({
      created: true,
      message: 'Tag publicada no catálogo.',
      tag: { ...tag, category },
    }, { status: 201, headers: noStore() });
  } catch (error) {
    console.error('Erro inesperado ao criar tag:', error);
    return NextResponse.json({ error: 'Não foi possível publicar a tag.' }, { status: 400, headers: noStore() });
  }
}
