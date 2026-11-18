-- Administration and moderation foundation. No production cutover.

CREATE TABLE "admin_audit_log" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT,
  "details" TEXT NOT NULL DEFAULT '{}' CHECK(json_valid("details")),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "admin_audit_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth_accounts(id) ON DELETE SET NULL,
  CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id)
) STRICT;

CREATE TABLE "applications" (
  "id" TEXT NOT NULL,
  "opportunity_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "answers" TEXT NOT NULL DEFAULT '{}' CHECK(json_valid("answers")),
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "internal_notes" TEXT NOT NULL DEFAULT '',
  "reviewer_id" TEXT,
  "reviewed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "applications_answers_check" CHECK ((json_type(answers) = 'object')),
  CONSTRAINT "applications_status_check" CHECK ((status IN ('submitted', 'in_review', 'approved', 'rejected', 'cancelled'))),
  CONSTRAINT "applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "applications_opportunity_id_user_id_key" UNIQUE (opportunity_id, user_id),
  CONSTRAINT "applications_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT,
  CONSTRAINT "applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "applications_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "moderation_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "internal_notes" TEXT NOT NULL DEFAULT '',
  "reviewer_id" TEXT,
  "reviewed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "moderation_reports_content_type_check" CHECK ((content_type IN ('profile', 'post', 'story'))),
  CONSTRAINT "moderation_reports_reason_check" CHECK ((reason IN ('harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other'))),
  CONSTRAINT "moderation_reports_details_check" CHECK ((length(details) <= 3000)),
  CONSTRAINT "moderation_reports_status_check" CHECK ((status IN ('pending', 'in_review', 'resolved', 'dismissed'))),
  CONSTRAINT "moderation_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "moderation_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "moderation_reports_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "moderation_reports_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT "moderation_reports_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "moderation_warnings" (
  "id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "moderation_warnings_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth_accounts(id),
  CONSTRAINT "moderation_warnings_source_type_check" CHECK ((source_type IN ('report', 'support', 'chat'))),
  CONSTRAINT "moderation_warnings_reason_check" CHECK (((length(reason) >= 10) AND (length(reason) <= 2000))),
  CONSTRAINT "moderation_warnings_pkey" PRIMARY KEY (id),
  CONSTRAINT "moderation_warnings_source_type_source_id_key" UNIQUE (source_type, source_id),
  CONSTRAINT "moderation_warnings_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth_accounts(id)
) STRICT;

CREATE TABLE "opportunities" (
  "id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "requirements" TEXT NOT NULL DEFAULT '',
  "openings" INTEGER NOT NULL DEFAULT 1,
  "questions" TEXT NOT NULL DEFAULT '[]' CHECK(json_valid("questions")),
  "opens_at" TEXT NOT NULL,
  "closes_at" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "opportunities_openings_check" CHECK ((openings > 0)),
  CONSTRAINT "opportunities_questions_check" CHECK ((json_type(questions) = 'array')),
  CONSTRAINT "opportunities_status_check" CHECK ((status IN ('draft', 'open', 'closed', 'archived'))),
  CONSTRAINT "opportunities_check" CHECK(julianday(closes_at)>julianday(opens_at) AND julianday(closes_at) IS NOT NULL AND julianday(opens_at) IS NOT NULL),
  CONSTRAINT "opportunities_pkey" PRIMARY KEY (id),
  CONSTRAINT "opportunities_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT "opportunities_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL,
  CONSTRAINT "opportunities_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth_accounts(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "target_user_id" TEXT,
  "department_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "internal_notes" TEXT NOT NULL DEFAULT '',
  "response" TEXT NOT NULL DEFAULT '',
  "reviewer_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "support_tickets_category_check" CHECK ((category IN ('help', 'feedback', 'safety', 'appeal'))),
  CONSTRAINT "support_tickets_subject_check" CHECK (((length(subject) >= 3) AND (length(subject) <= 120))),
  CONSTRAINT "support_tickets_details_check" CHECK (((length(details) >= 10) AND (length(details) <= 5000))),
  CONSTRAINT "support_tickets_status_check" CHECK ((status IN ('pending', 'in_review', 'resolved', 'dismissed'))),
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_tickets_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth_accounts(id),
  CONSTRAINT "support_tickets_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth_accounts(id),
  CONSTRAINT "support_tickets_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT "support_tickets_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth_accounts(id)
) STRICT;

CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_subject_idx ON admin_audit_log (subject_type, subject_id, created_at DESC);
CREATE INDEX admin_audit_log_actor_user_id_idx ON admin_audit_log (actor_user_id);
CREATE INDEX applications_opportunity_status_idx ON applications (opportunity_id, status, created_at DESC);
CREATE INDEX applications_user_created_idx ON applications (user_id, created_at DESC);
CREATE INDEX applications_reviewer_idx ON applications (reviewer_id, reviewed_at DESC);
CREATE INDEX moderation_reports_department_status_created_idx ON moderation_reports (department_id, status, created_at DESC);
CREATE INDEX moderation_reports_target_user_created_idx ON moderation_reports (target_user_id, created_at DESC);
CREATE UNIQUE INDEX moderation_reports_one_open_reporter_content_idx ON moderation_reports (reporter_id, content_type, content_id) WHERE (status IN ('pending', 'in_review'));
CREATE INDEX moderation_reports_reviewer_id_idx ON moderation_reports (reviewer_id);
CREATE INDEX moderation_warnings_target_idx ON moderation_warnings (target_user_id, created_at DESC);
CREATE INDEX moderation_warnings_actor_idx ON moderation_warnings (actor_user_id);
CREATE INDEX opportunities_public_listing_idx ON opportunities (status, opens_at, closes_at, created_at DESC);
CREATE INDEX opportunities_department_status_idx ON opportunities (department_id, status, created_at DESC);
CREATE INDEX opportunities_created_by_idx ON opportunities (created_by);
CREATE INDEX opportunities_updated_by_idx ON opportunities (updated_by);
CREATE INDEX support_tickets_department_idx ON support_tickets (department_id, status, created_at DESC);
CREATE INDEX support_tickets_reporter_idx ON support_tickets (reporter_id, created_at DESC);
CREATE INDEX support_tickets_target_idx ON support_tickets (target_user_id);
CREATE INDEX support_tickets_reviewer_idx ON support_tickets (reviewer_id);

CREATE VIEW d1_mod_actor AS SELECT s.token_hash,s.user_id,EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=s.user_id) AS is_root
FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id WHERE a.account_status='active' AND julianday(s.expires_at)>julianday('now');
CREATE VIEW d1_mod_grants AS SELECT a.token_hash,m.department_id,p.code FROM d1_mod_actor a
JOIN team_memberships m ON m.user_id=a.user_id AND m.status='active'
JOIN team_roles r ON r.id=m.role_id AND r.department_id=m.department_id AND r.status='active'
JOIN departments d ON d.id=m.department_id AND d.status='active'
JOIN team_role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.code=rp.permission_code AND p.scope='department';
CREATE VIEW d1_mod_content AS SELECT 'profile' AS kind,id,user_id FROM profiles
UNION ALL SELECT 'story',s.id,p.user_id FROM stories s JOIN profiles p ON p.id=s.author_id
UNION ALL SELECT 'post',n.id,p.user_id FROM nook_posts n JOIN profiles p ON p.id=n.user_id;
CREATE VIEW d1_warning_sources AS SELECT 'report' AS kind,id,target_user_id,department_id FROM moderation_reports
UNION ALL SELECT 'support',id,target_user_id,department_id FROM support_tickets
UNION ALL SELECT 'chat',r.id,p.user_id,d.id FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id AND m.thread_id=r.thread_id
JOIN profiles p ON p.id=m.sender_id JOIN departments d ON d.slug='moderacao' AND d.status='active';
CREATE TRIGGER d1_audit_no_delete BEFORE DELETE ON admin_audit_log BEGIN SELECT RAISE(ABORT,'Audit records are permanent'); END;
CREATE TRIGGER d1_audit_no_rewrite BEFORE UPDATE ON admin_audit_log
WHEN NOT(NEW.actor_user_id IS NULL AND OLD.actor_user_id IS NOT NULL AND NEW.id IS OLD.id AND NEW.action IS OLD.action
 AND NEW.subject_type IS OLD.subject_type AND NEW.subject_id IS OLD.subject_id AND NEW.details IS OLD.details AND NEW.created_at IS OLD.created_at)
BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
CREATE TRIGGER d1_chat_audit_no_delete BEFORE DELETE ON chat_audit_access BEGIN SELECT RAISE(ABORT,'Audit records are permanent'); END;
CREATE TRIGGER d1_chat_audit_no_rewrite BEFORE UPDATE ON chat_audit_access BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
CREATE VIEW d1_mod_commands AS SELECT CAST(NULL AS TEXT) AS id,CAST(NULL AS TEXT) AS token_hash,
 CAST(NULL AS TEXT) AS operation,CAST(NULL AS TEXT) AS target_id,CAST(NULL AS TEXT) AS data WHERE 0;
CREATE TRIGGER d1_mod_account_status INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='account_status' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1)),0) THEN RAISE(ABORT,'Primary administration required') END;
SELECT CASE WHEN NOT coalesce((NEW.target_id<>(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND NOT EXISTS(SELECT 1 FROM platform_admins WHERE user_id=NEW.target_id) AND EXISTS(SELECT 1 FROM auth_accounts WHERE id=NEW.target_id)),0) THEN RAISE(ABORT,'Protected or unavailable account') END;
SELECT CASE WHEN NOT coalesce((json_extract(NEW.data,'$.status') IN('active','suspended') AND length(coalesce(json_extract(NEW.data,'$.reason'),''))<=1000),0) THEN RAISE(ABORT,'Invalid account decision') END;
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),CASE WHEN json_extract(NEW.data,'$.status')='suspended' THEN 'user.suspended' ELSE 'user.reactivated' END,'user',NEW.target_id,json_object('status',json_extract(NEW.data,'$.status'),'reason',json_extract(NEW.data,'$.reason'),'previous',(SELECT account_status FROM auth_accounts WHERE id=NEW.target_id)));
UPDATE auth_accounts SET account_status=json_extract(NEW.data,'$.status') WHERE id=NEW.target_id;
INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) SELECT NEW.id,NEW.target_id,CASE WHEN json_extract(NEW.data,'$.status')='suspended' THEN 'account_suspended' ELSE 'account_reactivated' END,CASE WHEN json_extract(NEW.data,'$.status')='suspended' THEN 'Conta suspensa' ELSE 'Conta reativada' END,json_extract(NEW.data,'$.reason'),'/' WHERE coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0';
END;
CREATE TRIGGER d1_mod_review_report INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='review_report' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce(((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT department_id FROM moderation_reports WHERE id=NEW.target_id) AND code='moderation.manage'))),0) THEN RAISE(ABORT,'Department moderation permission required') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM moderation_reports WHERE id=NEW.target_id AND(status IN('pending','in_review') OR(status='resolved' AND json_extract(NEW.data,'$.action')='restore'))) AND json_extract(NEW.data,'$.status') IN('in_review','resolved','dismissed') AND json_extract(NEW.data,'$.action') IN('none','hide','restore') AND NOT(json_extract(NEW.data,'$.status')='in_review' AND json_extract(NEW.data,'$.action')<>'none') AND length(json_extract(NEW.data,'$.notes'))<=8000),0) THEN RAISE(ABORT,'Invalid or closed report') END;
SELECT CASE WHEN NOT coalesce((json_extract(NEW.data,'$.action')='none' OR EXISTS(SELECT 1 FROM moderation_reports r JOIN d1_mod_content c ON c.id=r.content_id AND c.kind=r.content_type WHERE r.id=NEW.target_id)),0) THEN RAISE(ABORT,'Reported content unavailable') END;
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'moderation.report.'||json_extract(NEW.data,'$.status'),'moderation_report',NEW.target_id,json_object('content_action',json_extract(NEW.data,'$.action'),'department_id',(SELECT department_id FROM moderation_reports WHERE id=NEW.target_id)));
UPDATE profiles SET moderation_hidden_at=CASE WHEN json_extract(NEW.data,'$.action')='hide' THEN coalesce(moderation_hidden_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE json_extract(NEW.data,'$.action')<>'none' AND id=(SELECT content_id FROM moderation_reports WHERE id=NEW.target_id AND content_type='profile');
UPDATE stories SET moderation_hidden_at=CASE WHEN json_extract(NEW.data,'$.action')='hide' THEN coalesce(moderation_hidden_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE json_extract(NEW.data,'$.action')<>'none' AND id=(SELECT content_id FROM moderation_reports WHERE id=NEW.target_id AND content_type='story');
UPDATE nook_posts SET moderation_hidden_at=CASE WHEN json_extract(NEW.data,'$.action')='hide' THEN coalesce(moderation_hidden_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE json_extract(NEW.data,'$.action')<>'none' AND id=(SELECT content_id FROM moderation_reports WHERE id=NEW.target_id AND content_type='post');
UPDATE moderation_reports SET status=json_extract(NEW.data,'$.status'),internal_notes=json_extract(NEW.data,'$.notes'),reviewer_id=(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),reviewed_at=CASE WHEN json_extract(NEW.data,'$.status') IN('resolved','dismissed') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.target_id;
END;
CREATE TRIGGER d1_mod_warn INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='warn' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce(((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT department_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source')) AND code='moderation.manage'))),0) THEN RAISE(ABORT,'Department moderation permission required') END;
SELECT CASE WHEN NOT coalesce(((SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source')) IS NOT NULL AND (SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source'))<>(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND NOT EXISTS(SELECT 1 FROM platform_admins WHERE user_id=(SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source'))) AND length(trim(json_extract(NEW.data,'$.reason'))) BETWEEN 10 AND 2000),0) THEN RAISE(ABORT,'No eligible warning target') END;
INSERT INTO moderation_warnings(id,target_user_id,actor_user_id,source_type,source_id,reason) VALUES(NEW.id,(SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source')),(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),json_extract(NEW.data,'$.source'),NEW.target_id,trim(json_extract(NEW.data,'$.reason')));
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'moderation.warning','account',(SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source')),json_object('source_type',json_extract(NEW.data,'$.source'),'source_id',NEW.target_id,'reason',json_extract(NEW.data,'$.reason')));
INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) SELECT NEW.id,(SELECT target_user_id FROM d1_warning_sources WHERE id=NEW.target_id AND kind=json_extract(NEW.data,'$.source')),'moderation_warning','Advertência da moderação',json_extract(NEW.data,'$.reason'),'/notificacoes' WHERE coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0';
END;
CREATE TRIGGER d1_mod_support_review INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='support_review' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce(((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT department_id FROM support_tickets WHERE id=NEW.target_id) AND code='moderation.manage'))),0) THEN RAISE(ABORT,'Department moderation permission required') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM support_tickets WHERE id=NEW.target_id) AND json_extract(NEW.data,'$.status') IN('in_review','resolved','dismissed') AND length(json_extract(NEW.data,'$.notes'))<=8000 AND length(json_extract(NEW.data,'$.response'))<=3000),0) THEN RAISE(ABORT,'Invalid support decision') END;
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'support.review','support_ticket',NEW.target_id,json_object('status',json_extract(NEW.data,'$.status'),'notes',json_extract(NEW.data,'$.notes')));
INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) SELECT NEW.id,reporter_id,'support_response','Resposta da ouvidoria',json_extract(NEW.data,'$.response'),'/ouvidoria' FROM support_tickets WHERE id=NEW.target_id AND json_extract(NEW.data,'$.response')<>'' AND response IS NOT json_extract(NEW.data,'$.response') AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0';
UPDATE support_tickets SET status=json_extract(NEW.data,'$.status'),internal_notes=json_extract(NEW.data,'$.notes'),response=json_extract(NEW.data,'$.response'),reviewer_id=(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.target_id;
END;
CREATE TRIGGER d1_mod_assign_role INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='assign_role' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce(((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT department_id FROM team_roles WHERE id=NEW.target_id) AND code='members.manage'))),0) THEN RAISE(ABORT,'Department membership permission required') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM team_roles r JOIN departments d ON d.id=r.department_id WHERE r.id=NEW.target_id AND r.status='active' AND d.status='active') AND EXISTS(SELECT 1 FROM auth_accounts a JOIN profiles p ON p.user_id=a.id WHERE a.id=json_extract(NEW.data,'$.user')) AND json_extract(NEW.data,'$.user')<>(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash)),0) THEN RAISE(ABORT,'Invalid role or self appointment') END;
INSERT INTO team_memberships(id,user_id,department_id,role_id,assigned_by) VALUES(NEW.id,json_extract(NEW.data,'$.user'),(SELECT department_id FROM team_roles WHERE id=NEW.target_id),NEW.target_id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash));
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'team_member.appointed','team_membership',NEW.id,json_object('user_id',json_extract(NEW.data,'$.user'),'role_id',NEW.target_id,'department_id',(SELECT department_id FROM team_roles WHERE id=NEW.target_id)));
INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) SELECT NEW.id,json_extract(NEW.data,'$.user'),'team_appointment','Você entrou para a equipe do Nooklie','Seu vínculo de equipe foi atualizado.','/perfil' WHERE coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0';
END;
CREATE TRIGGER d1_mod_remove_role INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='remove_role' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce(((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT department_id FROM team_memberships WHERE id=NEW.target_id) AND code='members.manage'))),0) THEN RAISE(ABORT,'Department membership permission required') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM team_memberships WHERE id=NEW.target_id AND status='active') AND((SELECT user_id FROM team_memberships WHERE id=NEW.target_id)<>(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash) OR EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1)) AND length(json_extract(NEW.data,'$.reason'))<=1000),0) THEN RAISE(ABORT,'Invalid membership decision') END;
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'team_member.removed','team_membership',NEW.target_id,json_object('user_id',(SELECT user_id FROM team_memberships WHERE id=NEW.target_id),'reason',json_extract(NEW.data,'$.reason')));
INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) SELECT NEW.id,(SELECT user_id FROM team_memberships WHERE id=NEW.target_id),'team_removal','Atualização da sua equipe','Seu vínculo de equipe foi encerrado.','/perfil' WHERE coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0';
UPDATE team_memberships SET status='removed',removed_by=(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),removed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),removal_reason=json_extract(NEW.data,'$.reason') WHERE id=NEW.target_id;
END;
CREATE TRIGGER d1_mod_read_evidence INSTEAD OF INSERT ON d1_mod_commands WHEN NEW.operation='read_evidence' BEGIN
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash) AND json_valid(NEW.data) AND json_type(NEW.data)='object'),0) THEN RAISE(ABORT,'Invalid staff session or data') END;
SELECT CASE WHEN NOT coalesce((EXISTS(SELECT 1 FROM departments WHERE id=(SELECT id FROM departments WHERE slug='moderacao' AND status='active')) AND(EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=NEW.token_hash AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=NEW.token_hash AND department_id=(SELECT id FROM departments WHERE slug='moderacao' AND status='active') AND code IN('moderation.view','moderation.manage')))),0) THEN RAISE(ABORT,'Moderation evidence permission required') END;
SELECT CASE WHEN NOT coalesce((json_type(NEW.data,'$.ids')='array' AND json_array_length(json_extract(NEW.data,'$.ids')) BETWEEN 1 AND 100 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(NEW.data,'$.ids')) WHERE type<>'text') AND (SELECT count(*) FROM json_each(json_extract(NEW.data,'$.ids')))=(SELECT count(DISTINCT value) FROM json_each(json_extract(NEW.data,'$.ids'))) AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(NEW.data,'$.ids')) j WHERE NOT EXISTS(SELECT 1 FROM chat_reports r WHERE r.id=j.value))),0) THEN RAISE(ABORT,'Invalid evidence selection') END;
INSERT INTO chat_audit_access(id,admin_user_id,report_ids) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),json_extract(NEW.data,'$.ids'));
INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details) VALUES(NEW.id,(SELECT user_id FROM d1_mod_actor WHERE token_hash=NEW.token_hash),'chat.evidence.read','chat_report_batch',NEW.id,json_object('reports',json_extract(NEW.data,'$.ids')));
END;
