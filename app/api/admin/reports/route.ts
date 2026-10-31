import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffContext, hasStaffPermission, staffPermissionErrorResponse } from '@/lib/admin/authorization';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

async function moderationDepartments(staff: NonNullable<Awaited<ReturnType<typeof getStaffContext>>>) {
  if (staff.isPlatformAdmin) return [];
  const ids = new Set<string>();
  for (const membership of staff.memberships) {
    if (await hasStaffPermission(staff, 'moderation.view', membership.department_id) ||
        await hasStaffPermission(staff, 'moderation.manage', membership.department_id)) {
      ids.add(membership.department_id);
    }
  }
  return [...ids];
}

export async function GET() {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    if (!staff.isPlatformAdmin && !(await hasStaffPermission(staff, 'moderation.view')) &&
        !(await hasStaffPermission(staff, 'moderation.manage'))) return staffPermissionErrorResponse(403);
    const departmentIds = await moderationDepartments(staff);
    if (!staff.isPlatformAdmin && !departmentIds.length) return NextResponse.json({ reports: [] }, { headers: noStore });
    let query = supabase.from('moderation_reports')
      .select('id, reporter_id, target_user_id, department_id, content_type, content_id, reason, details, evidence_urls, evidence_paths, status, internal_notes, reviewer_id, reviewed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!staff.isPlatformAdmin) query = query.in('department_id', departmentIds);
    const { data: reports, error } = await query;
    if (error) throw error;
    const userIds = Array.from(new Set((reports || []).flatMap((item) => [item.reporter_id, item.target_user_id])));
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from('profiles').select('user_id, username, display_name, avatar_url, moderation_hidden_at').in('user_id', userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const storyIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'story').map((item) => item.content_id)));
    const postIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'post').map((item) => item.content_id)));
    const chapterIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'chapter').map((item) => item.content_id)));
    const commentIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'comment').map((item) => item.content_id)));
    const reviewIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'review').map((item) => item.content_id)));
    const reviewCommentIds = Array.from(new Set((reports || []).filter((item) => item.content_type === 'review_comment').map((item) => item.content_id)));
    const [storiesResult, postsResult, chaptersResult, commentsResult, reviewsResult, reviewCommentsResult] = await Promise.all([
      storyIds.length ? supabase.from('stories').select('id, title, moderation_hidden_at').in('id', storyIds) : Promise.resolve({ data: [], error: null }),
      postIds.length ? supabase.from('nook_posts').select('id, body, moderation_hidden_at').in('id', postIds) : Promise.resolve({ data: [], error: null }),
      chapterIds.length ? supabase.from('chapters').select('id, title, body, moderation_hidden_at').in('id', chapterIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? supabase.from('comments').select('id, body, moderation_hidden_at').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
      reviewIds.length ? supabase.from('story_reviews').select('id, body, rating, contains_spoilers, moderation_hidden_at').in('id', reviewIds) : Promise.resolve({ data: [], error: null }),
      reviewCommentIds.length ? supabase.from('review_comments').select('id, body, moderation_hidden_at').in('id', reviewCommentIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [storiesResult, postsResult, chaptersResult, commentsResult, reviewsResult, reviewCommentsResult]) if (result.error) throw result.error;
    return NextResponse.json({
      reports: (reports || []).map((report) => ({
        ...report,
        reporter: (profiles || []).find((profile) => profile.user_id === report.reporter_id) || null,
        target: (profiles || []).find((profile) => profile.user_id === report.target_user_id) || null,
        content_hidden: report.content_type === 'profile'
          ? Boolean((profiles || []).find((profile) => profile.user_id === report.target_user_id)?.moderation_hidden_at)
          : report.content_type === 'story'
            ? Boolean((storiesResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at)
            : report.content_type === 'post'
              ? Boolean((postsResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at)
              : report.content_type === 'chapter'
                ? Boolean((chaptersResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at)
                : report.content_type === 'comment'
                  ? Boolean((commentsResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at)
                  : report.content_type === 'review'
                    ? Boolean((reviewsResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at)
                    : Boolean((reviewCommentsResult.data || []).find((item) => item.id === report.content_id)?.moderation_hidden_at),
        content: report.content_type === 'story'
          ? (storiesResult.data || []).find((item) => item.id === report.content_id) || null
          : report.content_type === 'post'
            ? (postsResult.data || []).find((item) => item.id === report.content_id) || null
            : report.content_type === 'chapter'
              ? (chaptersResult.data || []).find((item) => item.id === report.content_id) || null
              : report.content_type === 'comment'
                ? (commentsResult.data || []).find((item) => item.id === report.content_id) || null
                : report.content_type === 'review'
                  ? (reviewsResult.data || []).find((item) => item.id === report.content_id) || null
                  : report.content_type === 'review_comment'
                    ? (reviewCommentsResult.data || []).find((item) => item.id === report.content_id) || null
                    : null,
      })),
    }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/reports:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as denúncias.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.id !== 'string' || !['in_review', 'resolved', 'dismissed'].includes(body.status) ||
        !['none', 'hide', 'restore'].includes(body.content_action ?? 'none') ||
        (body.content_action && body.status !== 'resolved')) {
      return NextResponse.json({ error: 'Ação de moderação inválida.' }, { status: 400, headers: noStore });
    }
    if (body.status !== 'in_review' && body.confirm !== true) {
      return NextResponse.json({ error: 'Confirme a decisão final.' }, { status: 400, headers: noStore });
    }
    const { data: report, error: reportError } = await supabase.from('moderation_reports')
      .select('id, department_id').eq('id', body.id).maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: 'Denúncia não encontrada.' }, { status: 404, headers: noStore });
    if (!(await hasStaffPermission(staff, 'moderation.manage', report.department_id))) return staffPermissionErrorResponse(403);
    const notes = typeof body.internal_notes === 'string' ? body.internal_notes.trim() : '';
    if (notes.length > 8000) return NextResponse.json({ error: 'As observações podem ter até 8.000 caracteres.' }, { status: 400, headers: noStore });
    const { error } = await supabase.rpc('admin_review_moderation_report', {
      p_session_token_hash: staff.sessionTokenHash,
      p_report_id: body.id,
      p_status: body.status,
      p_internal_notes: notes,
      p_content_action: body.content_action || 'none',
    });
    if (error) {
      if (error.code === '42501') return staffPermissionErrorResponse(403);
      if (error.code === 'P0002') return NextResponse.json({ error: 'Denúncia já finalizada ou indisponível.' }, { status: 409, headers: noStore });
      if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Confira o status e as observações.' }, { status: 400, headers: noStore });
      console.error('PATCH /api/admin/reports:', error);
      return NextResponse.json({ error: 'Não foi possível salvar a decisão.' }, { status: 500, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/admin/reports:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a decisão.' }, { status: 500, headers: noStore });
  }
}
