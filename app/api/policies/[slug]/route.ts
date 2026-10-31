import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { slug } = await context.params;
    const { data, error } = await supabase.from('policy_documents').select('slug, version, title, content_md, requires_reacceptance, published_at')
      .eq('slug', slug).eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    return NextResponse.json({ policy: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/policies/[slug]:', error);
    return NextResponse.json({ error: 'Não foi possível carregar o documento.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
