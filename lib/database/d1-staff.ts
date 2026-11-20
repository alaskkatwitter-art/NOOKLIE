import type { NooklieD1 } from './d1';
export async function d1StaffContext(db: NooklieD1, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid session hash');
  const actor = await db.prepare(`SELECT a.id AS userId,
    EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=a.id) AS isPlatformAdmin
    FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id
    WHERE s.token_hash=? AND a.account_status='active' AND julianday(s.expires_at)>julianday('now')`)
    .bind(hash).first<{userId:string;isPlatformAdmin:number}>();
  if (!actor) return null;
  const memberships=await db.prepare(`SELECT m.role_id,m.department_id FROM team_memberships m
    JOIN team_roles r ON r.id=m.role_id AND r.department_id=m.department_id AND r.status='active'
    JOIN departments d ON d.id=m.department_id AND d.status='active'
    WHERE m.user_id=? AND m.status='active'`).bind(actor.userId)
    .all<{role_id:string;department_id:string}>();
  if(!memberships.success)throw Error('Unable to read staff memberships');
  return {userId:actor.userId,sessionTokenHash:hash,isPlatformAdmin:Boolean(actor.isPlatformAdmin),memberships:memberships.results};
}
