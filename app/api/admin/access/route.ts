import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { d1Permissions } from '@/lib/database/d1-permissions';
import { NextResponse } from 'next/server';
import {
  getStaffContext,
  hasStaffPermission,
} from '@/lib/admin/authorization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const hash = await getSessionTokenHash();
      const headers = { 'Cache-Control': 'no-store' };
      if (!hash) return NextResponse.json({ allowed: false }, { headers });
      const { hasPermission } = d1Permissions(db);
      const [allowed, view, manage] = await Promise.all(
        ['admin.view', 'moderation.view', 'moderation.manage'].map(permission => hasPermission(hash, permission)),
      );
      return NextResponse.json({ allowed, moderation_allowed: view || manage }, { headers });
    }
    const staff = await getStaffContext();
    if (!staff) return NextResponse.json({ allowed: false }, { headers: { 'Cache-Control': 'no-store' } });
    const allowed = await hasStaffPermission(staff, 'admin.view');
    const moderation_allowed=await hasStaffPermission(staff,'moderation.view')||await hasStaffPermission(staff,'moderation.manage');
    return NextResponse.json({ allowed, moderation_allowed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/admin/access:', error);
    return NextResponse.json({ allowed: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
