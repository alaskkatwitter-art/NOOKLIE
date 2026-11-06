import type { SupabaseClient } from '@supabase/supabase-js';

const columns = 'id, name, slug, category_id, created_at';

export function tagSlug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function findCatalogTag(db: SupabaseClient, name: string, slug = tagSlug(name)) {
  // Names and slugs are independently unique. Seeded translations may have
  // a Portuguese name and an English slug (Fantasia / fantasy).
  const exactName = name.replace(/[\\%_]/g, '\\$&');
  const named = await db.from('tags').select(columns).ilike('name', exactName).maybeSingle();
  if (named.error) throw named.error;
  if (named.data) return named.data;
  const bySlug = await db.from('tags').select(columns).eq('slug', slug).maybeSingle();
  if (bySlug.error) throw bySlug.error;
  return bySlug.data;
}

export async function ensureCatalogTag(db: SupabaseClient, name: string, categoryId: string | null, userId: string) {
  const slug = tagSlug(name);
  if (!slug) return null;
  const existing = await findCatalogTag(db, name, slug);
  if (existing) return existing;
  const result = await db.from('tags').insert({ name, slug, category_id: categoryId, created_by: userId })
    .select(columns).single();
  if (!result.error) return result.data;
  if (result.error.code === '23505') {
    const concurrent = await findCatalogTag(db, name, slug);
    if (concurrent) return concurrent;
  }
  throw result.error;
}
