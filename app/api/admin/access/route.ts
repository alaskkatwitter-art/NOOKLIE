import { NextResponse } from 'next/server';
import {
  getStaffContext,
  hasStaffPermission,
} from '@/lib/admin/authorization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const staff = await getStaffContext();
    if (!staff) return NextResponse.json({ allowed: false }, { headers: { 'Cache-Control': 'no-store' } });
    const allowed = await hasStaffPermission(staff, 'admin.view');
    return NextResponse.json({ allowed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/admin/access:', error);
    return NextResponse.json({ allowed: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
