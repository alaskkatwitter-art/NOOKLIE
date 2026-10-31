import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffContext, hasStaffPermission, staffPermissionErrorResponse } from '@/lib/admin/authorization';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };
const allowedSlugs = new Set(['terms', 'privacy', 'community', 'content-rating', 'copyright', 'collaboration', 'moderation']);

async function staffOrResponse() {
  const staff = await getStaffContext();
  if (!staff) return { staff: null, response: staffPermissionErrorResponse(401) };
  if (!(await hasStaffPermission(staff, 'policies.manage'))) return { staff: null, response: staffPermissionErrorResponse(403) };
  return { staff, response: null };
}

function dbError(error: { code?: string }) {
  if (error.code === '23505') return NextResponse.json({ error: 'Essa versão já existe.' }, { status: 409, headers: noStore });
  if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Confira os dados do documento.' }, { status: 400, headers: noStore });
  return NextResponse.json({ error: 'Não foi possível atualizar os documentos.' }, { status: 500, headers: noStore });
}

export async function GET() {
  try {
    const { staff, response } = await staffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse();
    const { data, error } = await supabase.from('policy_documents')
      .select('id, slug, version, title, content_md, status, requires_reacceptance, published_at, created_at, created_by')
      .order('created_at', { ascending: false }).limit(300);
    if (error) return dbError(error);
    return NextResponse.json({ policies: data || [] }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/policies:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os documentos.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { staff, response } = await staffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse();
    const body = await request.json();
    const action = body?.action;
    if (action === 'create_draft') {
      const slug = typeof body.slug === 'string' ? body.slug : '';
      const version = typeof body.version === 'string' ? body.version.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content_md === 'string' ? body.content_md.trim() : '';
      if (!allowedSlugs.has(slug) || !/^\d+\.\d+(\.\d+)?$/.test(version) || !title || title.length > 120 || !content || content.length > 50000) {
        return NextResponse.json({ error: 'Confira o tipo, a versão, o título e o conteúdo do documento.' }, { status: 400, headers: noStore });
      }
      const { data, error } = await supabase.from('policy_documents').insert({
        slug, version, title, content_md: content, status: 'draft',
        requires_reacceptance: body.requires_reacceptance === true,
        created_by: staff.userId,
      }).select('id, slug, version, title, status, created_at').single();
      if (error) return dbError(error);
      await supabase.from('admin_audit_log').insert({ actor_user_id: staff.userId, action: 'policy.draft_created', subject_type: 'policy_document', subject_id: data.id, details: { slug, version } });
      return NextResponse.json({ policy: data }, { status: 201, headers: noStore });
    }

    if (action === 'update_draft') {
      const id = typeof body.policy_id === 'string' ? body.policy_id : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.content_md === 'string' ? body.content_md.trim() : '';
      if (!id || !title || title.length > 120 || !content || content.length > 50000) {
        return NextResponse.json({ error: 'Confira o título e o conteúdo da minuta.' }, { status: 400, headers: noStore });
      }
      const { data, error } = await supabase.from('policy_documents').update({
        title, content_md: content, requires_reacceptance: body.requires_reacceptance === true,
      }).eq('id', id).eq('status', 'draft').select('id, slug, version, title, status, created_at').maybeSingle();
      if (error) return dbError(error);
      if (!data) return NextResponse.json({ error: 'Somente minutas podem ser editadas.' }, { status: 409, headers: noStore });
      await supabase.from('admin_audit_log').insert({ actor_user_id: staff.userId, action: 'policy.draft_updated', subject_type: 'policy_document', subject_id: id, details: {} });
      return NextResponse.json({ policy: data }, { headers: noStore });
    }

    if (action === 'publish' || action === 'archive') {
      const id = typeof body.policy_id === 'string' ? body.policy_id : '';
      if (!id) return NextResponse.json({ error: 'Documento não informado.' }, { status: 400, headers: noStore });
      const { data: policy, error: findError } = await supabase.from('policy_documents').select('id, slug, version, status').eq('id', id).maybeSingle();
      if (findError) return dbError(findError);
      if (!policy) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404, headers: noStore });
      if (action === 'publish') {
        if (policy.status !== 'draft') return NextResponse.json({ error: 'Somente minutas podem ser publicadas como nova versão.' }, { status: 409, headers: noStore });
        const now = new Date().toISOString();
        const { error } = await supabase.from('policy_documents').update({ status: 'published', published_at: now }).eq('id', id).eq('status', 'draft');
        if (error) return dbError(error);
        const { error: archiveError } = await supabase.from('policy_documents').update({ status: 'archived' }).eq('slug', policy.slug).eq('status', 'published').neq('id', id);
        if (archiveError) console.error('Policy version archived with an additional older published version:', archiveError);
        await supabase.from('admin_audit_log').insert({ actor_user_id: staff.userId, action: 'policy.published', subject_type: 'policy_document', subject_id: id, details: { slug: policy.slug, version: policy.version } });
        return NextResponse.json({ published: true, id }, { headers: noStore });
      }
      const { error } = await supabase.from('policy_documents').update({ status: 'archived' }).eq('id', id).neq('status', 'archived');
      if (error) return dbError(error);
      await supabase.from('admin_audit_log').insert({ actor_user_id: staff.userId, action: 'policy.archived', subject_type: 'policy_document', subject_id: id, details: { slug: policy.slug, version: policy.version } });
      return NextResponse.json({ archived: true, id }, { headers: noStore });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: noStore });
  } catch (error) {
    console.error('POST /api/admin/policies:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a operação.' }, { status: 500, headers: noStore });
  }
}
