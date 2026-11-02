import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffContext, hasStaffPermission, staffPermissionErrorResponse } from '@/lib/admin/authorization';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-site' };

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; index: string }> }) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const { id, index: rawIndex } = await context.params;
    const index = Number(rawIndex);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(index) || index < 0 || index > 2) {
      return NextResponse.json({ error: 'Evidência indisponível.' }, { status: 404, headers: noStore });
    }
    const { data: report, error } = await supabase.from('moderation_reports')
      .select('department_id, evidence_paths').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!report || !report.evidence_paths?.[index]) {
      return NextResponse.json({ error: 'Evidência indisponível.' }, { status: 404, headers: noStore });
    }
    if (!staff.isPlatformAdmin &&
        !(await hasStaffPermission(staff, 'moderation.view', report.department_id)) &&
        !(await hasStaffPermission(staff, 'moderation.manage', report.department_id))) {
      return staffPermissionErrorResponse(403);
    }
    const path = report.evidence_paths[index] as string;
    const mime = path.endsWith('.jpg') ? 'image/jpeg' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : null;
    if (!mime) return NextResponse.json({ error: 'Evidência indisponível.' }, { status: 404, headers: noStore });
    const { data: file, error: downloadError } = await supabase.storage.from('moderation-evidence').download(path);
    if (downloadError || !file) return NextResponse.json({ error: 'Evidência indisponível.' }, { status: 404, headers: noStore });
    return new NextResponse(await file.arrayBuffer(), { status: 200, headers: { ...noStore, 'Content-Type': mime, 'Content-Disposition': 'inline' } });
  } catch (error) {
    console.error('GET /api/admin/reports/[id]/evidence/[index]:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a evidência.' }, { status: 500, headers: noStore });
  }
}
