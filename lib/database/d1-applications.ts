import type { NooklieD1 } from './d1';

const permitted = (permission: string) => `(a.is_root OR EXISTS(SELECT 1 FROM d1_mod_grants g
  WHERE g.token_hash=a.token_hash AND g.department_id=o.department_id AND g.code='${permission}'))`;

export async function d1ApplicationCards(db: NooklieD1, hash: string, opportunityId: string | null) {
  const result = await db.prepare(`SELECT x.*,
    CASE WHEN p.id IS NOT NULL THEN json_object('user_id',p.user_id,'username',p.username,
      'display_name',p.display_name,'avatar_url',p.avatar_url) END AS applicant_json,
    json_object('id',o.id,'department_id',o.department_id,'title',o.title,'questions',json(o.questions)) AS opportunity_json
    FROM applications x JOIN opportunities o ON o.id=x.opportunity_id
    JOIN d1_mod_actor a ON a.token_hash=?1 LEFT JOIN profiles p ON p.user_id=x.user_id
    WHERE (?2 IS NULL OR o.id=?2) AND (${permitted('applications.view')} OR ${permitted('applications.review')})
    ORDER BY julianday(x.created_at) DESC,x.id LIMIT 300`)
    .bind(hash,opportunityId).all<Record<string,unknown> & {answers:string;applicant_json:string|null;opportunity_json:string}>();
  if (!result.success) throw Error('Applications unavailable');
  return result.results.map(({answers,applicant_json,opportunity_json,...row})=>({
    ...row,answers:JSON.parse(answers),applicant:applicant_json ? JSON.parse(applicant_json) : null,
    opportunity:JSON.parse(opportunity_json),
  }));
}

export async function d1ReviewApplication(db: NooklieD1, hash: string, id: string,
  status: 'in_review' | 'approved' | 'rejected', notes: string, roleId: string | null) {
  const event = crypto.randomUUID();
  const membership = crypto.randomUUID();
  const audit = db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details)
    SELECT ?6,a.user_id,CASE ?3 WHEN 'in_review' THEN 'application.review_started'
      WHEN 'approved' THEN 'application.approved' ELSE 'application.rejected' END,'application',x.id,
      json_object('opportunity_id',o.id,'user_id',x.user_id,'from_status',x.status,'to_status',?3,
        'role_id',?5,'membership_id',CASE WHEN ?3='approved' AND NOT EXISTS(SELECT 1 FROM team_memberships m
          WHERE m.user_id=x.user_id AND m.role_id=?5 AND m.status='active') THEN ?7 END,
        'notes_changed',json(CASE WHEN x.internal_notes IS NOT ?4 THEN 'true' ELSE 'false' END))
    FROM applications x JOIN opportunities o ON o.id=x.opportunity_id JOIN d1_mod_actor a ON a.token_hash=?1
    WHERE x.id=?2 AND x.status IN('submitted','in_review') AND ${permitted('applications.review')}
      AND (?3<>'approved' OR (a.user_id<>x.user_id AND ${permitted('members.manage')} AND EXISTS(
        SELECT 1 FROM team_roles r WHERE r.id=?5 AND r.department_id=o.department_id AND r.status='active')))`)
    .bind(hash,id,status,notes,roleId,event,membership);
  const update = db.prepare(`UPDATE applications SET status=?3,internal_notes=?4,
    reviewer_id=(SELECT actor_user_id FROM admin_audit_log WHERE id=?2),
    reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=?1 AND EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?2)`).bind(id,event,status,notes);
  const appointment = db.prepare(`INSERT INTO team_memberships(id,user_id,department_id,role_id,assigned_by,status)
    SELECT ?3,x.user_id,o.department_id,?4,x.reviewer_id,'active' FROM applications x
    JOIN opportunities o ON o.id=x.opportunity_id JOIN admin_audit_log b ON b.id=?2
    WHERE x.id=?1 AND x.status='approved' AND json_extract(b.details,'$.membership_id')=?3`).bind(id,event,membership,roleId);
  const notify = db.prepare(`INSERT INTO user_notifications(id,user_id,notification_type,title,body,href)
    SELECT ?3,x.user_id,CASE x.status WHEN 'approved' THEN 'team_appointment' ELSE 'application_rejected' END,
      CASE x.status WHEN 'approved' THEN 'Você entrou para a equipe do Nooklie' ELSE 'Atualização da sua candidatura' END,
      CASE x.status WHEN 'approved' THEN 'Você foi aprovada para '||r.name||' no departamento '||d.name||'.'
        ELSE 'Sua candidatura para '||o.title||' não foi aprovada desta vez.' END,
      CASE x.status WHEN 'approved' THEN '/perfil' ELSE '/oportunidades' END
    FROM applications x JOIN opportunities o ON o.id=x.opportunity_id JOIN departments d ON d.id=o.department_id
    LEFT JOIN team_roles r ON r.id=?4 WHERE x.id=?1 AND x.status IN('approved','rejected')
      AND EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?2)
      AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'`)
    .bind(id,event,crypto.randomUUID(),roleId);
  const result = await db.batch([audit,update,appointment,notify]);
  if (result.some(row=>!row.success)) throw Error('Application review failed');
  return Boolean(result[1].meta.changes);
}
