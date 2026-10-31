import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { detectEvidenceImageType, type EvidenceImageType } from '@/lib/media/image-signature';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const allowedReasons = new Set(['harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other']);
const maxEvidenceCount = 3;
const maxEvidenceFileSize = 1024 * 1024;
const maxEvidenceTotalSize = 3 * 1024 * 1024;
const extensions: Record<EvidenceImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const uploadedPaths: string[] = [];
  const removeUploadedEvidence = async () => {
    if (!uploadedPaths.length) return;
    const { error } = await supabase.storage.from('moderation-evidence').remove(uploadedPaths);
    if (error) console.error('Could not clean up failed report evidence upload:', error);
    uploadedPaths.length = 0;
  };

  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return errorResponse('Entre na sua conta para enviar uma denúncia.', 401);

    const isMultipart = request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data') || false;
    const contentLength = Number(request.headers.get('content-length'));
    if (isMultipart && Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024) {
      return errorResponse('O envio de evidências excede o limite permitido.', 413);
    }
    const formData = isMultipart ? await request.formData() : null;
    const body = formData ? {
      content_type: formData.get('content_type'),
      content_id: formData.get('content_id'),
      reason: formData.get('reason'),
      details: formData.get('details'),
      evidence_urls: formData.get('evidence_urls'),
    } : await request.json();

    const fileEntries = formData?.getAll('evidence_files') || [];
    if (fileEntries.some((item) => !(item instanceof File))) {
      return errorResponse('Há um arquivo de evidência inválido.', 400);
    }
    const evidenceFiles = fileEntries as File[];
    let evidenceUrls: unknown = body?.evidence_urls;
    if (typeof evidenceUrls === 'string') {
      try { evidenceUrls = JSON.parse(evidenceUrls); }
      catch { return errorResponse('Os links de evidência estão inválidos.', 400); }
    }
    if (evidenceUrls === undefined || evidenceUrls === null || evidenceUrls === '') evidenceUrls = [];
    const normalizedEvidenceUrls = Array.isArray(evidenceUrls)
      ? evidenceUrls.map((value: unknown) => typeof value === 'string' ? value.trim() : value)
      : evidenceUrls;

    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !['profile', 'post', 'story', 'chapter', 'comment', 'review', 'review_comment'].includes(body.content_type) ||
        typeof body.content_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.content_id) ||
        !allowedReasons.has(body.reason) ||
        (body.details != null && typeof body.details !== 'string') ||
        (body.details || '').trim().length > 3000 ||
        !Array.isArray(normalizedEvidenceUrls) || normalizedEvidenceUrls.length + evidenceFiles.length > maxEvidenceCount ||
        !normalizedEvidenceUrls.every((value: unknown) => {
          if (typeof value !== 'string' || value.length > 2000) return false;
          try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
          } catch { return false; }
        })) {
      return errorResponse('Confira o conteúdo, o motivo e os itens de evidência. São aceitos até três links ou imagens.', 400);
    }

    let totalFileSize = 0;
    const validatedFiles: Array<{ file: File; buffer: Buffer; mime: EvidenceImageType }> = [];
    for (const file of evidenceFiles) {
      if (file.size <= 0 || file.size > maxEvidenceFileSize) {
        return errorResponse('Cada imagem de evidência deve ter até 1 MB.', 400);
      }
      totalFileSize += file.size;
      const buffer = Buffer.from(await file.arrayBuffer());
      const detectedMime = detectEvidenceImageType(buffer);
      if (!detectedMime || detectedMime !== file.type) {
        return errorResponse('Use imagens JPG, PNG ou WEBP válidas.', 400);
      }
      validatedFiles.push({ file, buffer, mime: detectedMime });
    }
    if (totalFileSize > maxEvidenceTotalSize) return errorResponse('As imagens de evidência somadas devem ter até 3 MB.', 400);

    for (const item of validatedFiles) {
      const path = `${user.userId}/${randomUUID()}.${extensions[item.mime]}`;
      const { error: uploadError } = await supabase.storage.from('moderation-evidence').upload(path, item.buffer, {
        contentType: item.mime,
        cacheControl: '60',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
    }

    const { data, error } = await supabase.rpc('submit_moderation_report', {
      p_session_token_hash: user.sessionTokenHash,
      p_content_type: body.content_type,
      p_content_id: body.content_id,
      p_reason: body.reason,
      p_details: (body.details || '').trim(),
      p_evidence_urls: normalizedEvidenceUrls,
      p_evidence_paths: uploadedPaths,
    });
    if (error) {
      await removeUploadedEvidence();
      if (error.code === '23505') return errorResponse('Você já tem uma denúncia aberta para este conteúdo.', 409);
      if (error.code === '22023') return errorResponse(error.message.includes('own content') ? 'Não é possível denunciar o próprio conteúdo.' : 'Confira os dados da denúncia.', 400);
      if (error.code === 'P0002') return errorResponse('O conteúdo não está disponível.', 404);
      console.error('POST /api/reports:', error);
      return errorResponse('Não foi possível enviar a denúncia.', 500);
    }
    uploadedPaths.length = 0;
    return NextResponse.json({ report_id: data, message: 'Denúncia enviada para a equipe de moderação.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await removeUploadedEvidence();
    console.error('POST /api/reports:', error);
    return errorResponse('Não foi possível enviar a denúncia.', 500);
  }
}
