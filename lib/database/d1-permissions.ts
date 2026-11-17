import type { NooklieD1 } from './d1';

// Authoritative checks resolve the session every time; never trust a cached
// isPlatformAdmin flag, username, verification badge or caller-supplied user ID.
export function d1Permissions(db: NooklieD1) {
  return {
    async hasPermission(tokenHash: string, permission: string, departmentId: string | null = null) {
      if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('Invalid session hash');
      const row=await db.prepare(`SELECT EXISTS (
        SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id
        WHERE s.token_hash=?1 AND a.account_status='active' AND julianday(s.expires_at)>julianday('now')
          AND (EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=a.id)
            OR EXISTS(SELECT 1 FROM team_memberships m
              JOIN team_roles r ON r.id=m.role_id AND r.department_id=m.department_id AND r.status='active'
              JOIN departments d ON d.id=m.department_id AND d.status='active'
              JOIN team_role_permissions rp ON rp.role_id=r.id
              JOIN permissions p ON p.code=rp.permission_code AND p.scope='department'
              WHERE m.user_id=a.id AND m.status='active' AND p.code=?2
                AND (?3 IS NULL OR m.department_id=?3)))
        ) AS allowed`).bind(tokenHash,permission,departmentId).first<{allowed: number}>();
      return row?.allowed===1;
    },
  };
}
