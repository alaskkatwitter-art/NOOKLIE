import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { d1Auth } from '@/lib/database/d1-auth';
import { findCatalogTag, ensureCatalogTag } from '@/lib/stories/tags';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!);
const tagColumns = 'id, name, slug, category_id, created_at';
type Category = { id: string; name: string; slug: string };
type Tag = Category & { category_id: string | null; created_at: string };
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

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const result = await db.prepare('SELECT id,name,slug FROM tag_categories ORDER BY name COLLATE NOCASE,id').all<Category>();
      if (!result.success) return NextResponse.json({ error: 'Não foi possível carregar as categorias.' }, { status: 503, headers: noStore() });
      const categories = result.results;
      const category = categories.find(item => item.slug === categorySlug);
      if (categorySlug && !category) return NextResponse.json({ categories, tags: [] }, { headers: noStore() });
      const rows = await db.prepare(`SELECT ${tagColumns} FROM tags
        WHERE (?1 IS NULL OR category_id=?1) AND (?2='' OR instr(lower(name),lower(?2))>0)
        ORDER BY name COLLATE NOCASE,id LIMIT 120`).bind(category?.id ?? null, query).all<Tag>();
      if (!rows.success) return NextResponse.json({ error: 'Não foi possível carregar as tags.' }, { status: 503, headers: noStore() });
      const categoryMap = new Map(categories.map(item => [item.id, item]));
      return NextResponse.json({ categories, tags: rows.results.map(tag => ({
        ...tag, category: (tag.category_id && categoryMap.get(tag.category_id)) || null,
      })) }, { headers: noStore() });
    }
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
    const db = getD1PreviewDatabase('auth');
    const user = db ? await getAuthenticatedUserContext() : null;
    const userId = db ? user?.userId : await getUserId(request);
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

    if (db && user) {
      let allowed;
      try {
        allowed = await d1Auth(db).consumeRateLimit(hash(`tag-create:${userId}`), 30, RATE_WINDOW_SECONDS);
      } catch {
        return NextResponse.json({ error: 'Não foi possível publicar a tag agora.' }, { status: 503, headers: noStore() });
      }
      if (!allowed) return NextResponse.json({ error: 'Você atingiu o limite de tags novas por enquanto. Tente novamente mais tarde.' },
        { status: 429, headers: { ...noStore(), 'Retry-After': String(RATE_WINDOW_SECONDS) } });
      const category = await db.prepare('SELECT id,name,slug FROM tag_categories WHERE slug=?')
        .bind(categorySlug).first<Category>();
      if (!category) return NextResponse.json({ error: 'Escolha uma categoria válida.' }, { status: 400, headers: noStore() });
      const inserted = await db.prepare(`INSERT INTO tags(id,name,slug,category_id,created_by)
        SELECT ?2,?3,?4,?5,a.profile_id FROM d1_social_actors a WHERE a.token_hash=?1
          AND NOT EXISTS(SELECT 1 FROM tags WHERE slug=?4 OR lower(name)=lower(?3))
        ON CONFLICT DO NOTHING RETURNING ${tagColumns}`)
        .bind(user.sessionTokenHash,crypto.randomUUID(),name,slug,category.id).first<Tag>();
      const tag = inserted || await db.prepare(`SELECT ${tagColumns} FROM tags
        WHERE lower(name)=lower(?1) OR slug=?2 ORDER BY lower(name)=lower(?1) DESC LIMIT 1`)
        .bind(name,slug).first<Tag>();
      if (!tag) throw new Error('Invalid tag');
      return NextResponse.json({ created: Boolean(inserted),
        message: inserted ? 'Tag publicada no catálogo.' : 'Essa tag já existe no catálogo.',
        tag: { ...tag, category: tag.category_id === category.id ? category : null },
      }, { status: inserted ? 201 : 200, headers: noStore() });
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
