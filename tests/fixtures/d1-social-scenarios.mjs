// Shared by native SQLite tests and direct verification against the isolated D1.
// No production user data, API credentials, or dependencies on the browser.
export async function verifyD1Social(db, socialFactory, permissionsFactory) {
  const social=socialFactory(db), permissions=permissionsFactory(db);
  const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64),eve:'c'.repeat(64),mallory:'d'.repeat(64)};
  const names=Object.keys(tokens), checks=[];
  const execute=(sql,...params)=>db.prepare(sql).bind(...params).run();
  const one=(sql,...params)=>db.prepare(sql).bind(...params).first();
  function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
  try {
    for(const name of names) {
      await execute(`INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash)
        VALUES (?,?,?,?)`,'d1p2_'+name,'d1p2_'+name,'synthetic-password','synthetic-recovery-'+name);
      await execute(`INSERT INTO profiles(id,user_id,username,is_private,verified,is_official)
        VALUES (?,?,?,?,?,?)`,'d1p2_profile_'+name,'d1p2_'+name,'d1p2_'+name,name==='bob'?1:0,name==='eve'?1:0,name==='eve'?1:0);
      await execute(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)`,
        'd1p2_session_'+name,'d1p2_'+name,tokens[name],new Date(Date.now()+3600000).toISOString());
    }
    await execute("INSERT INTO platform_admins(user_id) VALUES ('d1p2_alice')");
    await execute("INSERT INTO departments(id,name,slug) VALUES ('d1p2_news','News','d1p2_news'),('d1p2_other','Other','d1p2_other')");
    await execute("INSERT INTO permissions(code,name,scope) VALUES ('d1p2_edit','Edit','department'),('d1p2_root','Root','platform')");
    await execute("INSERT INTO team_roles(id,department_id,name) VALUES ('d1p2_editor','d1p2_news','Editor')");
    await execute("INSERT INTO team_role_permissions(role_id,permission_code) VALUES ('d1p2_editor','d1p2_edit'),('d1p2_editor','d1p2_root')");
    await execute("INSERT INTO team_memberships(id,user_id,department_id,role_id) VALUES ('d1p2_member','d1p2_bob','d1p2_news','d1p2_editor')");

    check(await social.visibleProfile('d1p2_profile_bob')===null,'private content denies anonymous visitor');
    const publicProfile=await social.visibleProfile('d1p2_profile_eve');
    check(publicProfile?.username==='d1p2_eve','public content allows anonymous visitor');
    check(!('recovery_key_hash' in publicProfile)&&!('password_hash' in publicProfile),'public fields exclude credential hashes');
    check(await social.visibleProfile('d1p2_profile_bob',tokens.bob)!==null,'private owner can read own content');
    await social.follow(tokens.eve,'d1p2_profile_bob');
    check((await one("SELECT count(*) n FROM follow_requests WHERE requester_id='d1p2_profile_eve' AND target_id='d1p2_profile_bob'")).n===1,'private follows create request');
    check(await social.visibleProfile('d1p2_profile_bob',tokens.eve)===null,'pending request grants no access');
    check(await social.acceptFollow(tokens.mallory,'d1p2_profile_eve')===null,'outsider cannot accept another persons request');
    check(await social.acceptFollow(tokens.bob,'d1p2_profile_eve')!==null,'recipient can accept request');
    check(await social.visibleProfile('d1p2_profile_bob',tokens.eve)!==null,'accepted follower reads private content');
    check((await one('SELECT count(*) n FROM follow_requests')).n===0,'acceptance consumes pending request atomically');
    await social.follow(tokens.bob,'d1p2_profile_eve');
    check((await one('SELECT count(*) n FROM follows')).n===2,'public follow works without approval');
    await social.block(tokens.eve,'d1p2_profile_bob');
    check((await one('SELECT count(*) n FROM follows')).n===0,'blocking removes follows in both directions');
    check(await social.visibleProfile('d1p2_profile_eve',tokens.bob)===null,'block denies access from blocked account');
    check(await social.follow(tokens.bob,'d1p2_profile_eve')===null,'blocked account cannot bypass block with follow');
    check(await social.unblock(tokens.mallory,'d1p2_profile_bob')===null,'outsider cannot remove another persons block');
    await social.unblock(tokens.eve,'d1p2_profile_bob');
    check(await social.visibleProfile('d1p2_profile_bob',tokens.eve)===null,'unblocking does not restore follows');
    await social.follow(tokens.eve,'d1p2_profile_bob');
    await social.block(tokens.bob,'d1p2_profile_eve');
    check((await one('SELECT count(*) n FROM follow_requests')).n===0,'blocking also removes pending requests');
    await social.unblock(tokens.bob,'d1p2_profile_eve');
    await social.follow(tokens.eve,'d1p2_profile_bob');
    check(await social.denyFollow(tokens.mallory,'d1p2_profile_eve')===null,'outsider cannot deny another persons request');
    await social.denyFollow(tokens.bob,'d1p2_profile_eve');
    check((await one('SELECT count(*) n FROM follow_requests')).n===0,'recipient can deny request');
    await social.follow(tokens.eve,'d1p2_profile_bob');
    await social.unfollow(tokens.eve,'d1p2_profile_bob');
    check((await one('SELECT count(*) n FROM follow_requests')).n===0,'unfollow cancels pending request');
    await social.follow(tokens.eve,'d1p2_profile_mallory');
    await social.unfollow(tokens.eve,'d1p2_profile_mallory');
    check((await one('SELECT count(*) n FROM follows')).n===0,'unfollow removes own public follow');
    await social.mute(tokens.eve,'d1p2_profile_bob');
    check(await social.isMuted(tokens.eve,'d1p2_profile_bob'),'mute is visible to its owner');
    check(!await social.isMuted(tokens.mallory,'d1p2_profile_bob'),'mute is private to other accounts');
    await social.unmute(tokens.mallory,'d1p2_profile_bob');
    check(await social.isMuted(tokens.eve,'d1p2_profile_bob'),'outsider cannot remove mute');
    await social.unmute(tokens.eve,'d1p2_profile_bob');
    check(!await social.isMuted(tokens.eve,'d1p2_profile_bob'),'owner can remove mute');
    const unknown='f'.repeat(64);
    check(await social.updateAbout(unknown,'forged','forged')===null,'forged session cannot edit profile');
    await social.updateAbout(tokens.eve,'New name','New bio');
    check((await social.visibleProfile('d1p2_profile_eve')).bio==='New bio','authenticated owner edits own bio');
    check((await social.visibleProfile('d1p2_profile_bob',tokens.bob)).bio===null,'editing cannot target another profile');
    check(!await permissions.hasPermission(tokens.eve,'d1p2_root'),'verification and official badge confer no admin permission');
    check(await permissions.hasPermission(tokens.bob,'d1p2_edit','d1p2_news'),'active role grants department permission');
    check(!await permissions.hasPermission(tokens.bob,'d1p2_edit','d1p2_other'),'department role cannot access another department');
    check(!await permissions.hasPermission(tokens.bob,'d1p2_root','d1p2_news'),'team role cannot grant platform permission');
    check(await permissions.hasPermission(tokens.alice,'d1p2_root'),'platform admin derives from protected admin table');
    await execute("UPDATE team_roles SET status='archived' WHERE id='d1p2_editor'");
    check(!await permissions.hasPermission(tokens.bob,'d1p2_edit'),'archived role revokes permission');
    await execute("UPDATE team_roles SET status='active' WHERE id='d1p2_editor'");
    await execute("UPDATE departments SET status='archived' WHERE id='d1p2_news'");
    check(!await permissions.hasPermission(tokens.bob,'d1p2_edit'),'archived department revokes permission');
    await execute("UPDATE departments SET status='active' WHERE id='d1p2_news'");
    await execute("UPDATE team_memberships SET status='removed',removed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='d1p2_member'");
    check(!await permissions.hasPermission(tokens.bob,'d1p2_edit'),'removed membership revokes permission');
    await execute("UPDATE team_memberships SET status='active',removed_at=NULL WHERE id='d1p2_member'");
    await execute("UPDATE profiles SET moderation_hidden_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='d1p2_profile_eve'");
    check(await social.visibleProfile('d1p2_profile_eve')===null,'moderated profile content is hidden');
    check(await social.follow(tokens.eve,'d1p2_profile_bob')===null,'moderated profile cannot perform social actions');
    await execute("UPDATE auth_accounts SET account_status='suspended' WHERE id='d1p2_bob'");
    check(!await permissions.hasPermission(tokens.bob,'d1p2_edit'),'suspended account has no staff permission');
    check(await social.visibleProfile('d1p2_profile_bob',tokens.bob)===null,'suspended account content is hidden');
    await execute("UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00Z' WHERE user_id='d1p2_alice'");
    check(!await permissions.hasPermission(tokens.alice,'d1p2_root'),'expired admin session has no authority');
    return {passed:checks.length,checks};
  } finally {
    // Exact synthetic IDs only; safe even if verification failed halfway through.
    await execute("DELETE FROM team_memberships WHERE id='d1p2_member'");
    await execute("DELETE FROM team_role_permissions WHERE role_id='d1p2_editor'");
    await execute("DELETE FROM team_roles WHERE id='d1p2_editor'");
    await execute("DELETE FROM departments WHERE id IN ('d1p2_news','d1p2_other')");
    await execute("DELETE FROM permissions WHERE code IN ('d1p2_edit','d1p2_root')");
    await execute("DELETE FROM platform_admins WHERE user_id='d1p2_alice'");
    for(const name of names) {
      await execute('DELETE FROM profiles WHERE id=?','d1p2_profile_'+name);
      await execute('DELETE FROM auth_accounts WHERE id=?','d1p2_'+name);
    }
  }
}
