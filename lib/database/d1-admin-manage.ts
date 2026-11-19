import type { D1Value, NooklieD1 } from './d1';
import { d1Moderation } from './d1-moderation';
import { d1Permissions } from './d1-permissions';

const allowed = (permission:string, department?:string) => `(a.is_root OR EXISTS(
  SELECT 1 FROM d1_mod_grants g WHERE g.token_hash=a.token_hash AND g.code='${permission}'
  ${department ? 'AND g.department_id='+department : ''}))`;
const scoped = (permissions:string[], department:string) => '(' + permissions.map(p=>allowed(p,department)).join(' OR ') + ')';
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const actorSql = 'd1_mod_actor a WHERE a.token_hash=?1';

export async function d1AdminResource(db:NooklieD1, hash:string, resource:string|null, params:URLSearchParams) {
  const permissions = d1Permissions(db);
  const authorized = async (...codes:string[]) => (await Promise.all(codes.map(code=>permissions.hasPermission(hash,code)))).some(Boolean);
  const rows = async (sql:string, ...values:D1Value[]) => {
    const result = await db.prepare(sql).bind(...values).all<Record<string,unknown>>();
    if (!result.success) throw Error('Administration data unavailable');
    return result.results;
  };
  const profile = `CASE WHEN p.id IS NOT NULL THEN json_object('user_id',p.user_id,'username',p.username,
    'display_name',p.display_name,'avatar_url',p.avatar_url) END`;
  if (resource==='departments') {
    const codes=['departments.manage','members.view','opportunities.view','opportunities.manage','applications.view','applications.review'];
    if (!await authorized(...codes)) return null;
    return {departments:await rows(`SELECT d.id,d.name,d.slug,d.description,d.sort_order,d.status,d.created_at,d.updated_at,d.archived_at
      FROM departments d CROSS JOIN ${actorSql} AND ${scoped(codes,'d.id')} ORDER BY d.sort_order,d.name,d.id`,hash)};
  }
  if (resource==='roles') {
    const codes=['members.view','members.manage','applications.view','applications.review','opportunities.manage'];
    if (!await authorized('roles.manage',...codes)) return null;
    const [roles, grants] = await Promise.all([
      rows(`SELECT r.id,r.department_id,r.name,r.description,r.badge_title,r.badge_description,r.status,r.created_at,r.updated_at,
        (SELECT json_group_array(permission_code) FROM team_role_permissions WHERE role_id=r.id) AS codes
        FROM team_roles r CROSS JOIN ${actorSql} AND ${scoped(codes,'r.department_id')} ORDER BY r.name,r.id`,hash),
      rows(`SELECT p.code,p.name,p.description FROM permissions p CROSS JOIN ${actorSql}
        AND a.is_root=1 AND p.scope='department' ORDER BY p.name,p.code`,hash),
    ]);
    return {roles:roles.map(({codes,...role})=>({...role,permission_codes:JSON.parse(String(codes))})),permissions:grants};
  }
  if (resource==='members') {
    if (!await authorized('members.view')) return null;
    const status=params.get('status');
    const members=await rows(`SELECT m.*,${profile} AS profile_json,
      json_object('id',r.id,'name',r.name,'badge_title',r.badge_title,'badge_description',r.badge_description) AS role_json,
      json_object('id',d.id,'name',d.name) AS department_json
      FROM team_memberships m JOIN team_roles r ON r.id=m.role_id JOIN departments d ON d.id=m.department_id
      LEFT JOIN profiles p ON p.user_id=m.user_id CROSS JOIN ${actorSql}
      AND ${allowed('members.view','m.department_id')} AND (?2 IS NULL OR m.status=?2)
      ORDER BY julianday(m.assigned_at) DESC,m.id LIMIT 250`,hash,status==='active'||status==='removed'?status:null);
    return {members:members.map(({profile_json,role_json,department_json,...m})=>({...m,
      profile:profile_json ? JSON.parse(String(profile_json)) : null,role:JSON.parse(String(role_json)),
      department:JSON.parse(String(department_json))}))};
  }
  if (resource==='opportunities') {
    const codes=['opportunities.view','opportunities.manage'];
    if (!await authorized(...codes)) return null;
    const result=await rows(`SELECT o.id,o.department_id,o.title,o.description,o.requirements,o.openings,o.questions,
      o.opens_at,o.closes_at,o.status,o.created_at,o.updated_at,d.name AS department_name
      FROM opportunities o JOIN departments d ON d.id=o.department_id CROSS JOIN ${actorSql}
      AND ${scoped(codes,'o.department_id')} ORDER BY julianday(o.created_at) DESC,o.id`,hash);
    return {opportunities:result.map(({questions,department_name,...o})=>({...o,questions:JSON.parse(String(questions)),
      department:{id:o.department_id,name:department_name}}))};
  }
  if (resource==='users' || resource==='candidates') {
    const users=resource==='users';
    if (!await authorized(users?'users.view':'members.manage')) return null;
    const term=(params.get('q')||'').trim().replace(/[^a-zA-Z0-9À-ÿ _.-]/g,'').slice(0,40);
    if (term.length<2) return {[resource]:[]};
    return {[resource]:await rows(`SELECT p.user_id,p.username,p.display_name,p.avatar_url
      ${users?',p.created_at,u.account_status':''} FROM profiles p JOIN auth_accounts u ON u.id=p.user_id
      CROSS JOIN ${actorSql} AND ${allowed(users?'users.view':'members.manage')}
      AND (p.username LIKE ?2 OR p.display_name LIKE ?2)
      ORDER BY ${users?'julianday(p.created_at) DESC':'p.username'},p.id LIMIT ${users?50:20}`,hash,'%'+term+'%')};
  }
  if (resource==='audit') {
    if (!await authorized('audit.view')) return null;
    const entries=await rows(`SELECT b.*,CASE WHEN p.id IS NOT NULL THEN json_object(
      'user_id',p.user_id,'username',p.username,'display_name',p.display_name) END AS actor_json
      FROM admin_audit_log b LEFT JOIN profiles p ON p.user_id=b.actor_user_id CROSS JOIN ${actorSql}
      AND ${allowed('audit.view')} ORDER BY julianday(b.created_at) DESC,b.id LIMIT 100`,hash);
    return {entries:entries.map(({details,actor_json,...row})=>({...row,details:JSON.parse(String(details)),
      actor:actor_json?JSON.parse(String(actor_json)):null}))};
  }
  return undefined;
}

type Args = Record<string,unknown>;
function validQuestions(value:unknown) {
  if (!Array.isArray(value)||value.length>10) return false;
  const ids=new Set<string>();
  for (const q of value) {
    if (!q || typeof q!=='object' || Array.isArray(q) || typeof q.id!=='string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(q.id)
      || ids.has(q.id) || typeof q.prompt!=='string' || !q.prompt.trim() || q.prompt.trim().length>300
      || ('required' in q && typeof q.required!=='boolean')) return false;
    ids.add(q.id);
  }
  return true;
}

export async function d1AdminMutation(db:NooklieD1, operation:string, args:Args):Promise<{
  data:string|boolean|null; error:{code:string;message?:string}|null;
}> {
  const hash=String(args.p_session_token_hash);
  const text=(name:string)=>String(args[name] ?? '');
  const failed=(code:string,message?:string)=>({data:null,error:{code,message}});
  const success=(data:string|boolean)=>({data,error:null});
  const moderation=d1Moderation(db);
  try {
    if (operation==='admin_set_account_status') {
      await moderation.setAccountStatus(hash,crypto.randomUUID(),text('p_target_user_id'),text('p_status'),text('p_reason'));
      return success(true);
    }
    if (operation==='admin_assign_team_member') {
      if ((await db.prepare('SELECT user_id FROM d1_mod_actor WHERE token_hash=?').bind(hash)
        .first<{user_id:string}>())?.user_id===text('p_target_user_id')) return failed('42501');
      const result=await moderation.assignRole(hash,crypto.randomUUID(),text('p_target_user_id'),text('p_role_id'));
      return success(result.id);
    }
    if (operation==='admin_remove_team_member') {
      await moderation.removeRole(hash,crypto.randomUUID(),text('p_membership_id'),text('p_reason'));
      return success(true);
    }
    const creating=operation.startsWith('admin_create_');
    const type=operation.replace(/^admin_(create|update)_/,'');
    if (type!=='department' && type!=='team_role' && type!=='opportunity') return failed('22023');
    const table=type==='department'?'departments':type==='team_role'?'team_roles':'opportunities';
    const key=type==='team_role'?'p_role_id':'p_'+type+'_id';
    const id=creating ? crypto.randomUUID() : text(key);
    const department=text('p_department_id');
    const status=text('p_status') || 'active';
    const permissions=d1Permissions(db);
    const permission=type==='department'?'departments.manage':type==='team_role'?'roles.manage':'opportunities.manage';
    const previous=creating ? null : await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<Record<string,D1Value>>();
    if (!creating && !previous) return failed('P0002');
    const oldDepartment=typeof previous?.department_id==='string' ? previous.department_id : department;
    if (type==='opportunity' && (!await permissions.hasPermission(hash,permission,department) ||
        !await permissions.hasPermission(hash,permission,oldDepartment))) return failed('42501');
    const roleCodes=type==='team_role'?JSON.stringify(args.p_permission_codes):'[]';
    if (type==='team_role') {
      const invalid=await db.prepare(`SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(
        SELECT 1 FROM permissions p WHERE p.code=j.value AND p.scope='department') LIMIT 1`).bind(roleCodes).first();
      if (invalid) return failed('22023');
    }
    if (type==='opportunity' && (!validQuestions(args.p_questions) ||
        Number(args.p_openings)<1 || Number(args.p_openings)>1000)) return failed('22023');
    const requiresDepartment=type==='opportunity' || (type==='team_role' && creating);
    if (requiresDepartment && !await db.prepare("SELECT id FROM departments WHERE id=? AND status='active'").bind(department).first()) {
      return failed(type==='team_role'?'P0002':'22023');
    }
    const fields:Record<string,D1Value> = type==='department' ? {
      name:text('p_name'),slug:text('p_slug'),description:text('p_description'),sort_order:Number(args.p_sort_order),status,
    } : type==='team_role' ? {
      ...(creating && {department_id:department}),name:text('p_name'),description:text('p_description'),
      badge_title:text('p_badge_title')||null,badge_description:text('p_badge_description')||null,status,
    } : {
      department_id:department,title:text('p_title'),description:text('p_description'),requirements:text('p_requirements'),
      openings:Number(args.p_openings),questions:JSON.stringify(args.p_questions),opens_at:text('p_opens_at'),
      closes_at:text('p_closes_at'),status,
    };
    const event=crypto.randomUUID();
    const action=type+'.'+(creating?'created':type==='opportunity' && ['archived','closed'].includes(status)
      ?'closed':status==='archived'?'archived':'updated');
    const oldKeys=type==='department'?['name','slug','description','sort_order','status']
      :type==='team_role'?['name','description','badge_title','badge_description','status']
      :['department_id','title','status','opens_at','closes_at'];
    const before=`(SELECT json_object(${oldKeys.map(field=>`'${field}',x.${field}`).join(',')}) FROM ${table} x WHERE x.id=?4)`;
    const guard=type==='opportunity'
      ? `${allowed(permission,'?6')} AND ${creating?'1':allowed(permission,'(SELECT department_id FROM opportunities WHERE id=?4)')}`
      : 'a.is_root=1';
    const auditDetails = type==='team_role'
      ? {...fields,department_id:creating?department:oldDepartment,permission_codes:JSON.parse(roleCodes)}
      : type==='opportunity' ? Object.fromEntries(oldKeys.map(name=>[name,fields[name]])) : fields;
    const rightDepartment=requiresDepartment
      ? " AND EXISTS(SELECT 1 FROM departments WHERE id=?6 AND status='active')" : '';
    const audit=db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details)
      SELECT ?2,a.user_id,?3,'${type}',?4,${creating?'json(?5)':`json_object('before',json(${before}),'after',json(?5))`}
      FROM ${actorSql} AND ${guard}${rightDepartment}
      ${creating?'':`AND EXISTS(SELECT 1 FROM ${table} WHERE id=?4)`}`)
      .bind(hash,event,action,id,JSON.stringify(auditDetails),...(requiresDepartment?[department]:[]));
    const keys=Object.keys(fields);
    const values=Object.values(fields);
    const eventActor='(SELECT actor_user_id FROM admin_audit_log WHERE id=?1)';
    const creator=type==='opportunity'?['created_by','updated_by']:['created_by'];
    const assignments=keys.map((field,index)=>`${field}=?${index+3}`);
    assignments.push(`updated_at=${now}`);
    if (type==='opportunity') assignments.push(`updated_by=${eventActor}`);
    else assignments.push(`archived_at=${status==='archived'?`coalesce(archived_at,${now})`:'NULL'}`);
    const write=creating
      ? db.prepare(`INSERT INTO ${table}(id,${keys.concat(creator).join(',')})
          SELECT ?2,${keys.map((_,i)=>'?'+(i+3)).concat(creator.map(()=>eventActor)).join(',')}
          WHERE EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?1)`).bind(event,id,...values)
      : db.prepare(`UPDATE ${table} SET ${assignments.join(',')} WHERE id=?2
          AND EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?1)`).bind(event,id,...values);
    const statements=[audit,write];
    if (type==='team_role') {
      if (!creating) statements.push(db.prepare(`DELETE FROM team_role_permissions WHERE role_id=?2
        AND EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?1)`).bind(event,id));
      statements.push(db.prepare(`INSERT INTO team_role_permissions(role_id,permission_code)
        SELECT ?2,j.value FROM json_each(?3) j WHERE EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?1)`)
        .bind(event,id,roleCodes));
    }
    const result=await db.batch(statements);
    if (result.some(r=>!r.success)) throw Error('Administrative action failed');
    if (!result[1].meta.changes) return failed('42501');
    return success(creating?id:true);
  } catch (error) {
    const message=error instanceof Error?error.message:'';
    if (message.includes('UNIQUE constraint')) return failed('23505');
    if (/permission required|Primary administration required|Protected or unavailable account/.test(message)) return failed('42501');
    if (/Invalid membership decision|Invalid role or self appointment/.test(message)) return failed('P0002');
    if (/Invalid identifier|CHECK constraint/.test(message)) return failed('22023');
    return failed('internal',message);
  }
}
