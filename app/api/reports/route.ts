import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const allowedReasons = new Set(['harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other']);

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para enviar uma denúncia.' }, { status: 401 });
    const body = await request.json();
    const evidenceUrls = body?.evidence_urls === undefined ? [] : body.evidence_urls;
    const normalizedEvidenceUrls = Array.isArray(evidenceUrls)
      ? evidenceUrls.map((value: unknown) => typeof value === 'string' ? value.trim() : value)
      : evidenceUrls;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !['profile', 'post', 'story', 'chapter', 'comment', 'review', 'review_comment'].includes(body.content_type) ||
        typeof body.content_id !== 'string' ||
        !allowedReasons.has(body.reason) ||
        (body.details != null && typeof body.details !== 'string') ||
        (body.details || '').trim().length > 3000 ||
        !Array.isArray(normalizedEvidenceUrls) || normalizedEvidenceUrls.length > 3 ||
        !normalizedEvidenceUrls.every((value: unknown) => {
          if (typeof value !== 'string' || value.length > 2000) return false;
          try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
          } catch { return false; }
        })) {
      return NextResponse.json({ error: 'Confira o conteúdo e o motivo da denúncia.' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('submit_moderation_report', {
      p_session_token_hash: user.sessionTokenHash,
      p_content_type: body.content_type,
      p_content_id: body.content_id,
      p_reason: body.reason,
      p_details: (body.details || '').trim(),
      p_evidence_urls: normalizedEvidenceUrls,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Você já tem uma denúncia aberta para este conteúdo.' }, { status: 409 });
      if (error.code === '22023') return NextResponse.json({ error: error.message.includes('own content') ? 'Não é possível denunciar o próprio perfil.' : 'Confira os dados da denúncia.' }, { status: 400 });
      if (error.code === 'P0002') return NextResponse.json({ error: 'O conteúdo não está disponível.' }, { status: 404 });
      console.error('POST /api/reports:', error);
      return NextResponse.json({ error: 'Não foi possível enviar a denúncia.' }, { status: 500 });
    }
    return NextResponse.json({ report_id: data, message: 'Denúncia enviada para a equipe de moderação.' }, { status: 201 });
  } catch (error) {
    console.error('POST /api/reports:', error);
    return NextResponse.json({ error: 'Não foi possível enviar a denúncia.' }, { status: 500 });
  }
}
