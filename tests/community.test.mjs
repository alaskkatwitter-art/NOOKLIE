import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => "10000000-0000-0000-0000-" + String(n).padStart(12, "0");
const rows = async (q, p = []) => (await db.query(q, p)).rows;
const value = async (q, p = []) => Object.values((await rows(q, p))[0])[0];
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table auth_accounts(id uuid primary key,account_status text default 'active');
 create table auth_sessions(user_id uuid,token_hash text,expires_at timestamptz);
 create table profiles(id uuid primary key,user_id uuid,username text,moderation_hidden_at timestamptz);
 create table chapters(id uuid primary key);
 create table follows(follower_id uuid,following_id uuid,primary key(follower_id,following_id));
 create table user_notifications(id uuid default gen_random_uuid(),user_id uuid,notification_type text,title text,body text,href text);
 create table departments(id uuid primary key,slug text,status text default 'active');
 create table platform_admins(user_id uuid);
 create table permissions(code text,scope text);
 create table team_roles(id uuid,department_id uuid,status text);
 create table team_memberships(user_id uuid,department_id uuid,role_id uuid,status text);
 create table team_role_permissions(role_id uuid,permission_code text);
 create table admin_audit_log(id uuid default gen_random_uuid(),actor_user_id uuid,action text,subject_type text,subject_id uuid,details jsonb);
 create table moderation_reports(id uuid primary key,target_user_id uuid,department_id uuid);
 create table support_dummy(id uuid);
 insert into departments(id,slug)values('${id(90)}','moderacao'),('${id(91)}','other');
 insert into permissions values('moderation.manage','department');
 `);
  const original = await readFile(
    new URL(
      "../supabase/migrations/20261102195927_private_chat_social_privacy.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(
    original.slice(
      0,
      original.indexOf(
        "create or replace function public.social_interaction_notification",
      ),
    ),
  );
  const admin = await readFile(
    new URL(
      "../supabase/migrations/20261031022500_admin_operations_role_permission_validation_fix.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(
    admin.slice(
      0,
      admin.indexOf(
        "CREATE OR REPLACE FUNCTION public.admin_create_department",
      ),
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261031033000_admin_active_role_permission_scope.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261103004139_mobile_community_groups_moderation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (let n = 1; n <= 20; n++)
    await db.query("insert into auth_accounts(id)values($1);", [id(n)]);
  for (let n = 1; n <= 20; n++) {
    await db.query(
      "insert into profiles(id,user_id,username)values($1,$1,$2)",
      [id(n), "person" + n],
    );
    await db.query(
      "insert into auth_sessions values($1,$2,now()+interval '1 day')",
      [id(n), "session" + n],
    );
  }
  await db.exec(`insert into platform_admins values('${id(1)}');
 insert into team_roles values('${id(95)}','${id(90)}','active');
 insert into team_role_permissions values('${id(95)}','moderation.manage');
 insert into team_memberships values('${id(2)}','${id(90)}','${id(95)}','active');
 grant select,insert,update,delete on all tables in schema public to service_role;
 set role service_role;`);
});
after(() => db.close());
test("groups require invitations and cap membership at 15, including creator", async () => {
  const members = Array.from({ length: 14 }, (_, i) => id(i + 2));
  const group = await value("select chat_group_create($1,$2,$3)", [
    "session1",
    "Grupo de leitores",
    members,
  ]);
  assert.equal(
    await value(
      "select count(*)::int from chat_group_members where thread_id=$1",
      [group],
    ),
    15,
  );
  assert.equal(
    await value(
      "select count(*)::int from chat_group_members where thread_id=$1 and status='accepted'",
      [group],
    ),
    1,
  );
  assert.equal(
    await value("select chat_group_send($1,$2,$3,$4)", [
      "session2",
      group,
      id(500),
      "cipher",
    ]),
    false,
  );
  assert.equal(
    await value("select chat_group_action('session2',$1,'accept')", [group]),
    true,
  );
  assert.equal(
    await value("select chat_group_send($1,$2,$3,$4)", [
      "session2",
      group,
      id(501),
      "cipher",
    ]),
    true,
  );
  assert.equal(
    await value("select chat_group_send($1,$2,$3,$4)", [
      "session16",
      group,
      id(502),
      "cipher",
    ]),
    false,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into chat_group_members(thread_id,profile_id) values($1,$2)",
        [group, id(16)],
      ),
    /limit is 15/,
  );
  await assert.rejects(
    () =>
      db.query("select chat_group_create($1,$2,$3)", [
        "session1",
        "Grande demais",
        Array.from({ length: 15 }, (_, i) => id(i + 2)),
      ]),
    /2 to 15/,
  );
  assert.equal(
    await value("select chat_group_action('session2',$1,'leave')", [group]),
    true,
  );
  assert.equal(
    await value("select chat_group_send($1,$2,$3,$4)", [
      "session2",
      group,
      id(503),
      "cipher",
    ]),
    false,
  );
});
test("blocking revokes follows and chat access while mute is private and reversible", async () => {
  await db.query("insert into follows values($1,$2),($2,$1)", [id(4), id(5)]);
  const thread = await value("select chat_request('session4',$1)", [id(5)]);
  assert.equal(
    await value("select chat_action('session5',$1,'accept')", [thread]),
    true,
  );
  assert.equal(
    await value("select profile_control('session4',$1,'mute')", [id(5)]),
    true,
  );
  assert.equal(
    await value(
      "select count(*)::int from profile_mutes where user_id=$1 and target_id=$2",
      [id(4), id(5)],
    ),
    1,
  );
  assert.equal(
    await value("select profile_control('session4',$1,'unmute')", [id(5)]),
    true,
  );
  assert.equal(
    await value("select profile_control('session4',$1,'block')", [id(5)]),
    true,
  );
  assert.equal(
    await value(
      "select count(*)::int from follows where follower_id=$1 or following_id=$1",
      [id(4)],
    ),
    0,
  );
  assert.equal(
    await value("select profile_content_allowed($1,$2)", [id(4), id(5)]),
    false,
  );
  assert.equal(
    await value("select chat_direct_send('session5',$1,$2,'cipher')", [
      thread,
      id(510),
    ]),
    false,
  );
  await assert.rejects(
    () =>
      db.query("select chat_group_create($1,$2,$3)", [
        "session4",
        "Bloqueado",
        [id(5)],
      ]),
    /unavailable/,
  );
  await value("select profile_control('session4',$1,'unblock')", [id(5)]);
  assert.equal(
    await value("select profile_content_allowed($1,$2)", [id(4), id(5)]),
    true,
  );
});
test("warnings are scoped to moderation permissions, audited, notified and duplicate-safe", async () => {
  await db.query("insert into moderation_reports values($1,$2,$3)", [
    id(600),
    id(8),
    id(90),
  ]);
  await db.query("insert into moderation_reports values($1,$2,$3)", [
    id(601),
    id(8),
    id(91),
  ]);
  await assert.rejects(
    () =>
      db.query(
        "select moderation_warn('session3','report',$1,'Uma orientação de convivência')",
        [id(600)],
      ),
    /lacks/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select moderation_warn('session2','report',$1,'Uma orientação de convivência')",
        [id(601)],
      ),
    /lacks/,
  );
  await value(
    "select moderation_warn('session2','report',$1,'Uma orientação de convivência')",
    [id(600)],
  );
  assert.equal(
    await value(
      "select count(*)::int from user_notifications where user_id=$1 and notification_type='moderation_warning'",
      [id(8)],
    ),
    1,
  );
  assert.equal(
    await value(
      "select count(*)::int from admin_audit_log where subject_id=$1 and action='moderation.warning'",
      [id(8)],
    ),
    1,
  );
  await assert.rejects(
    () =>
      db.query(
        "select moderation_warn('session2','report',$1,'Advertência duplicada não deve passar')",
        [id(600)],
      ),
    /unique/,
  );
  await db.query(
    "update team_memberships set status='removed' where user_id=$1",
    [id(2)],
  );
  await assert.rejects(
    () =>
      db.query(
        "select moderation_warn('session2','report',$1,'Permissão revogada não deve passar')",
        [id(601)],
      ),
    /lacks/,
  );
});
test("support reviews notify the reporter without exposing internal notes; browser roles lack access", async () => {
  const ticket = await value(
    "insert into support_tickets(reporter_id,department_id,category,subject,details) values($1,$2,'help','Minha dúvida','Detalhes do pedido de ajuda') returning id",
    [id(7), id(90)],
  );
  assert.equal(
    await value(
      "select support_review('session1',$1,'resolved','Nota privada','Respondemos ao seu pedido.')",
      [ticket],
    ),
    true,
  );
  assert.equal(
    await value("select response from support_tickets where id=$1", [ticket]),
    "Respondemos ao seu pedido.",
  );
  assert.equal(
    await value(
      "select body from user_notifications where user_id=$1 and notification_type='support_response'",
      [id(7)],
    ),
    "Respondemos ao seu pedido.",
  );
  for (const role of ["anon", "authenticated"])
    for (const table of [
      "profile_mutes",
      "chat_group_members",
      "support_tickets",
      "moderation_warnings",
    ]) {
      assert.equal(
        await value(
          `select has_table_privilege('${role}','${table}','select')`,
        ),
        false,
      );
      assert.equal(
        await value(
          `select relrowsecurity from pg_class where oid='${table}'::regclass`,
        ),
        true,
      );
    }
  await assert.rejects(
    () =>
      db.query(
        "select support_review('session3',$1,'resolved','','Não autorizado')",
        [ticket],
      ),
    /lacks/,
  );
});

test("legacy direct RPCs reject group threads and invitations cannot be accepted by outsiders", async () => {
  const group = await value("select chat_group_create($1,$2,$3)", [
    "session10",
    "Privacidade",
    [id(11)],
  ]);
  assert.equal(
    await value("select chat_action('session12',$1,'accept')", [group]),
    false,
  );
  assert.equal(
    await value("select chat_group_action('session12',$1,'accept')", [group]),
    false,
  );
  assert.equal(
    await value("select chat_send('session12',$1,$2,'cipher')", [
      group,
      id(900),
    ]),
    false,
  );
  assert.equal(
    await value("select chat_direct_send('session10',$1,$2,'cipher')", [
      group,
      id(901),
    ]),
    false,
  );
});

test("browser roles cannot invoke group, warning, or profile-control RPCs directly", async () => {
  for (const role of ["anon", "authenticated"])
    for (const signature of [
      "chat_group_create(text,text,uuid[])",
      "chat_group_action(text,uuid,text)",
      "chat_group_send(text,uuid,uuid,text,uuid,text,text,boolean)",
      "chat_direct_send(text,uuid,uuid,text,uuid,text,text,boolean)",
      "profile_control(text,uuid,text)",
      "moderation_warn(text,text,uuid,text)",
      "support_review(text,uuid,text,text,text)",
    ])
      assert.equal(
        await value(
          `select has_function_privilege('${role}','public.${signature}','EXECUTE')`,
        ),
        false,
        role + ":" + signature,
      );
});

test("blocks cannot be bypassed with follow requests and muted actors stop generating interaction notifications", async () => {
  await value("select profile_control('session18',$1,'block')", [id(19)]);
  await assert.rejects(
    () => db.query("select social_follow('session19',$1,'follow')", [id(18)]),
    /indisponível/,
  );
  await value("select profile_control('session18',$1,'unblock')", [id(19)]);
  await value("select profile_control('session18',$1,'mute')", [id(19)]);
  await db.query(
    "select social_notify($1,$2,'test','uma ação','/inicio','muted-test')",
    [id(18), id(19)],
  );
  assert.equal(
    await value(
      "select count(*)::int from user_notifications where source_key='muted-test'",
    ),
    0,
  );
  await value("select profile_control('session18',$1,'unmute')", [id(19)]);
  await db.query(
    "select social_notify($1,$2,'test','uma ação','/inicio','unmuted-test')",
    [id(18), id(19)],
  );
  assert.equal(
    await value(
      "select count(*)::int from user_notifications where source_key='unmuted-test'",
    ),
    1,
  );
});

test('group owners can invite after creation; links expire, rotate, revoke and enforce capacity and blocks', async () => {
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/20261106211236_group_invitations_and_links.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  for (let n=21;n<=42;n++) {
    await db.query('insert into auth_accounts(id)values($1)',[id(n)]);
    await db.query('insert into profiles(id,user_id,username)values($1,$1,$2)',[id(n),'person'+n]);
    await db.query("insert into auth_sessions values($1,$2,now()+interval '1 day')",[id(n),'session'+n]);
  }
  const group=await value('select chat_group_create($1,$2,$3)',['session21','Novo grupo',[id(22)]]);
  const invite=async (session,members)=>value('select chat_group_invite_members($1,$2,$3)',[session,group,members]);
  assert.equal(await invite('session22',[id(23)]),false);
  assert.equal(await invite('session24',[id(23)]),false);
  assert.equal(await invite('session21',[id(23)]),true);
  assert.equal(await value('select status from chat_group_members where thread_id=$1 and profile_id=$2',[group,id(23)]),'pending');
  assert.equal(await value("select chat_group_action('session23',$1,'accept')",[group]),true);
  const first='a'.repeat(64),second='b'.repeat(64);
  assert.equal(await value('select chat_group_link_manage($1,$2,$3)',['session23',group,first]),false);
  assert.equal(await value('select chat_group_link_manage($1,$2,$3)',['session21',group,first]),true);
  assert.deepEqual(Object.keys(await value('select chat_group_link_info($1)',[first])).sort(),['expires_at','name']);
  assert.equal(await value('select chat_group_link_join($1,$2)',['missing-session',first]),null);
  assert.equal(await value('select chat_group_link_join($1,$2)',['session24',first]),group);
  assert.equal(await value('select chat_group_link_manage($1,$2,$3)',['session21',group,second]),true);
  assert.equal(await value('select chat_group_link_join($1,$2)',['session25',first]),null);
  await value("select profile_control('session24',$1,'block')",[id(25)]);
  assert.equal(await invite('session21',[id(25)]),false);
  assert.equal(await value('select chat_group_link_join($1,$2)',['session25',second]),null);
  await value("select profile_control('session24',$1,'unblock')",[id(25)]);
  await db.query("update chat_group_invite_links set expires_at=now()-interval '1 second' where thread_id=$1",[group]);
  assert.equal(await value('select chat_group_link_info($1)',[second]),null);
  assert.equal(await value('select chat_group_link_join($1,$2)',['session25',second]),null);
  await value('select chat_group_link_manage($1,$2,$3)',['session21',group,second]);
  assert.equal(await invite('session21',Array.from({length:11},(_,i)=>id(i+25))),true);
  assert.equal(await value('select count(*)::int from chat_group_members where thread_id=$1',[group]),15);
  assert.equal(await invite('session21',[id(36)]),false);
  assert.equal(await invite('session21',[id(25)]),true,'existing invitations do not reserve another slot');
  assert.equal(await value('select chat_group_link_join($1,$2)',['session36',second]),null);
  assert.equal(await value('select chat_group_link_join($1,$2)',['session25',second]),group,'pending members can accept in a full group');
  assert.equal(await value('select chat_group_link_manage($1,$2,null,true)',['session21',group]),true);
  assert.equal(await value('select chat_group_link_info($1)',[second]),null);
  for(const role of ['anon','authenticated']){
    assert.equal(await value(`select has_table_privilege('${role}','chat_group_invite_links','SELECT')`),false);
    for(const signature of ['chat_group_invite_members(text,uuid,uuid[])','chat_group_link_manage(text,uuid,text,boolean)','chat_group_link_info(text)','chat_group_link_join(text,text)'])assert.equal(await value(`select has_function_privilege('${role}',$1,'EXECUTE')`,[signature]),false);
  }
});

test('chapter replies notify the original commenter and suppress self notifications',async()=>{
 await db.exec(`reset role; create table public.comments(id uuid primary key,chapter_id uuid,user_id uuid,parent_comment_id uuid); create trigger notify_chapter_comment_reply after insert on public.comments for each row execute function public.notify_chapter_comment_reply(); grant all on public.comments to service_role; set role service_role;`);
 await db.query('insert into comments values($1,$2,$3,null)',[id(2001),id(3001),id(21)]);
 await db.query('insert into comments values($1,$2,$3,$4)',[id(2002),id(3001),id(22),id(2001)]);
 assert.equal(await value("select count(*)::int from user_notifications where source_key=$1 and user_id=$2",['chapter-reply:'+id(2002),id(21)]),1);
 await db.query('insert into comments values($1,$2,$3,$4)',[id(2003),id(3001),id(21),id(2001)]);
 assert.equal(await value('select count(*)::int from user_notifications where source_key=$1',['chapter-reply:'+id(2003)]),0);
});
