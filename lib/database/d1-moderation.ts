import type { NooklieD1 } from './d1';

// Privileged mutations and audit writes share one trigger transaction.
export function d1Moderation(db:NooklieD1){
 function session(hash:string){if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');}
 function id(value:string){if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new Error('Invalid identifier');}
 function text(value:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new Error('Invalid text');}
 async function command(hash:string,eventId:string,operation:string,target:string,data:object){session(hash);id(eventId);id(target);
  const r=await db.prepare('INSERT INTO d1_mod_commands(id,token_hash,operation,target_id,data) VALUES(?,?,?,?,?)').bind(eventId,hash,operation,target,JSON.stringify(data)).run();
  if(!r.success)throw new Error('Administrative action failed');return{id:eventId};}
 const actor='SELECT user_id FROM d1_mod_actor WHERE token_hash=?1';
 function scoped(department:string,manage=false){return `(EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=?1 AND is_root=1) OR EXISTS(SELECT 1 FROM d1_mod_grants WHERE token_hash=?1 AND department_id=${department} AND code IN(${manage?"'moderation.manage'":"'moderation.view','moderation.manage'"})))`;}
 return {
  async report(hash:string,reportId:string,kind:'profile'|'post'|'story',contentId:string,reason:string,details=''){session(hash);id(reportId);id(contentId);text(details,0,3000);
   if(!['profile','post','story'].includes(kind)||!['harassment','spam','inappropriate','copyright','safety','other'].includes(reason))throw new Error('Invalid report');
   return db.prepare(`INSERT INTO moderation_reports(id,reporter_id,target_user_id,department_id,content_type,content_id,reason,details)
    SELECT ?2,a.user_id,c.user_id,d.id,c.kind,c.id,?5,?6 FROM d1_mod_actor a JOIN d1_mod_content c ON c.kind=?3 AND c.id=?4
    JOIN departments d ON d.slug='moderacao' AND d.status='active' WHERE a.token_hash=?1 AND a.user_id<>c.user_id
    AND(SELECT count(*) FROM moderation_reports r WHERE r.reporter_id=a.user_id AND r.status IN('pending','in_review'))<10
    ON CONFLICT DO NOTHING RETURNING id`).bind(hash,reportId,kind,contentId,reason,details.trim()).first<{id:string}>();},
  async reports(hash:string){session(hash);const r=await db.prepare(`SELECT r.* FROM moderation_reports r WHERE ${scoped('r.department_id')} ORDER BY r.created_at DESC,r.id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Reports unavailable');return r.results;},
  async reviewReport(hash:string,eventId:string,reportId:string,status:string,notes='',action='none'){text(notes,0,8000);
   if(!['in_review','resolved','dismissed'].includes(status)||!['none','hide','restore'].includes(action)||(status==='in_review'&&action!=='none'))throw new Error('Invalid moderation decision');
   return command(hash,eventId,'review_report',reportId,{status,notes:notes.trim(),action});},
  async warn(hash:string,eventId:string,kind:string,sourceId:string,reason:string){text(reason,10,2000);if(!['report','support','chat'].includes(kind))throw new Error('Invalid warning source');return command(hash,eventId,'warn',sourceId,{source:kind,reason:reason.trim()});},
  async setAccountStatus(hash:string,eventId:string,userId:string,status:string,reason=''){text(reason,0,1000);if(!['active','suspended'].includes(status))throw new Error('Invalid status');return command(hash,eventId,'account_status',userId,{status,reason:reason.trim()});},
  async submitTicket(hash:string,ticketId:string,category:string,subject:string,details:string,targetUsername:string|null=null){session(hash);id(ticketId);text(subject,3,120);text(details,10,5000);
   if(!['help','feedback','safety','appeal'].includes(category)||(targetUsername!==null&&!/^[a-z0-9_]{3,30}$/.test(targetUsername)))throw new Error('Invalid support ticket');
   return db.prepare(`INSERT INTO support_tickets(id,reporter_id,target_user_id,department_id,category,subject,details)
    SELECT ?2,a.user_id,p.user_id,d.id,?3,?4,?5 FROM d1_mod_actor a JOIN departments d ON d.slug='moderacao' AND d.status='active'
    LEFT JOIN profiles p ON p.username=?6 WHERE a.token_hash=?1 AND(?6 IS NULL OR p.user_id IS NOT NULL)
    AND(SELECT count(*) FROM support_tickets t WHERE t.reporter_id=a.user_id AND julianday(t.created_at)>julianday('now','-1 hour'))<10 RETURNING id`)
    .bind(hash,ticketId,category,subject.trim(),details.trim(),targetUsername).first<{id:string}>();},
  async myTickets(hash:string){session(hash);const r=await db.prepare(`SELECT id,category,subject,details,status,response,created_at,updated_at FROM support_tickets WHERE reporter_id=(${actor}) ORDER BY created_at DESC,id LIMIT 50`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Support unavailable');return r.results;},
  async tickets(hash:string){session(hash);const r=await db.prepare(`SELECT t.* FROM support_tickets t WHERE ${scoped('t.department_id')} ORDER BY t.created_at DESC,t.id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Support unavailable');return r.results;},
  async reviewTicket(hash:string,eventId:string,ticketId:string,status:string,notes='',response=''){text(notes,0,8000);text(response,0,3000);if(!['in_review','resolved','dismissed'].includes(status))throw new Error('Invalid decision');return command(hash,eventId,'support_review',ticketId,{status,notes,response});},
  async assignRole(hash:string,eventId:string,userId:string,roleId:string){id(userId);return command(hash,eventId,'assign_role',roleId,{user:userId});},
  async removeRole(hash:string,eventId:string,membershipId:string,reason=''){text(reason,0,1000);return command(hash,eventId,'remove_role',membershipId,{reason:reason.trim()});},
  async audit(hash:string){session(hash);const r=await db.prepare(`SELECT * FROM admin_audit_log WHERE EXISTS(SELECT 1 FROM d1_mod_actor WHERE token_hash=?1 AND is_root=1) ORDER BY created_at DESC,id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Audit unavailable');return r.results;},
  async readChatEvidence(hash:string,eventId:string,reportIds:string[]){session(hash);id(eventId);
   if(!Array.isArray(reportIds)||reportIds.length<1||reportIds.length>100||new Set(reportIds).size!==reportIds.length)throw new Error('Invalid evidence selection');reportIds.forEach(id);
   const json=JSON.stringify(reportIds);
   const r=await db.batch([
    db.prepare('INSERT INTO d1_mod_commands(id,token_hash,operation,target_id,data) VALUES(?,?,?,?,?)').bind(eventId,hash,'read_evidence',eventId,JSON.stringify({ids:reportIds})),
    db.prepare(`SELECT id,reporter_id,thread_id,message_id,reason,status,message_snapshot FROM chat_reports
     WHERE id IN(SELECT value FROM json_each(?3)) AND EXISTS(SELECT 1 FROM chat_audit_access WHERE id=?2 AND admin_user_id=(${actor}))
     AND EXISTS(SELECT 1 FROM departments d WHERE d.slug='moderacao' AND d.status='active' AND ${scoped('d.id')}) ORDER BY id`).bind(hash,eventId,json),
   ]);
   if(r.some(x=>!x.success))throw new Error('Evidence unavailable');
   return (r[1] as typeof r[number]&{results?:Record<string,unknown>[]}).results??[];
  },
 };
}
