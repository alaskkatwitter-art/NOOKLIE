import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function GET() {
  try {
    const { data, error } = await supabase.from('policy_documents').select('slug, version, title, content_md, requires_reacceptance, published_at')
      .eq('status', 'published').order('published_at', { ascending: false }).limit(100);
    if (error) throw error;
    const latest = new Map<string, (typeof data)[number]>();
    for (const document of data || []) if (!latest.has(document.slug)) latest.set(document.slug, document);
    return NextResponse.json({ policies: [...latest.values()] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/policies:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as políticas.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
