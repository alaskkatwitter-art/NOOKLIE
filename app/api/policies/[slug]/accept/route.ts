import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

type Context = { params: Promise<{ slug: string }> };
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function POST(_request: Request, context: Context) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para registrar o aceite.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const { slug } = await context.params;
    const { data: policy, error: policyError } = await supabase.from('policy_documents').select('id, version')
      .eq('slug', slug).eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle();
    if (policyError) throw policyError;
    if (!policy) return NextResponse.json({ error: 'Documento publicado não encontrado.' }, { status: 404 });
    const { error } = await supabase.from('policy_acceptances').upsert({ policy_document_id: policy.id, profile_id: user.userId }, { onConflict: 'policy_document_id,profile_id', ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ accepted: true, version: policy.version }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/policies/[slug]/accept:', error);
    return NextResponse.json({ error: 'Não foi possível registrar o aceite.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
