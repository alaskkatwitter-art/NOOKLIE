import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const [{ data: policies, error: policyError }, { data: accepted, error: acceptedError }] = await Promise.all([
      supabase.from('policy_documents').select('id, slug, version, title, requires_reacceptance').eq('status', 'published').order('published_at', { ascending: false }).limit(100),
      supabase.from('policy_acceptances').select('policy_document_id').eq('profile_id', user.userId),
    ]);
    if (policyError || acceptedError) throw policyError || acceptedError;
    const latest = new Map<string, NonNullable<typeof policies>[number]>();
    for (const policy of policies || []) if (!latest.has(policy.slug)) latest.set(policy.slug, policy);
    const acceptedIds = new Set((accepted || []).map((row) => row.policy_document_id));
    return NextResponse.json({ required: [...latest.values()].filter((policy) => policy.requires_reacceptance && !acceptedIds.has(policy.id)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/policies/status:', error);
    return NextResponse.json({ error: 'Não foi possível verificar os aceites.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
