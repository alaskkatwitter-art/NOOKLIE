// Synthetic ciphertext envelopes test SQL authorization only. A separate test
// exercises the real AES-GCM codec with a temporary test key.
export async function verifyD1Chat(db,factory){
 const chat=factory(db,2),tokens={alice:'a'.repeat(64),bob:'b'.repeat(64),carol:'c'.repeat(64),outsider:'d'.repeat(64)},checks=[];
 const cipher='v2:'+'A'.repeat(40),edited='v2:'+'B'.repeat(40);
 const run=(sql,...params)=>db.prepare(sql).bind(...params).run(),one=(sql,...params)=>db.prepare(sql).bind(...params).first();
 function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 async function fails(action,label){let failed=false;try{await action();}catch{failed=true;}check(failed,label);}
 try{
  const seed=[];
  for(const[name,token]of Object.entries(tokens)){
   seed.push(db.prepare('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)').bind('c7_'+name,'c7_'+name,'password','key-'+name));
   seed.push(db.prepare('INSERT INTO profiles(id,user_id,username,avatar_url) VALUES(?,?,?,?)').bind('c7p_'+name,'c7_'+name,'c7_'+name,'/avatar-'+name));
   seed.push(db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind('c7s_'+name,'c7_'+name,token,new Date(Date.now()+3600000).toISOString()));
  }
  await db.batch(seed);
  await run("INSERT INTO platform_admins(user_id) VALUES('c7_outsider')");
  check(await chat.request('f'.repeat(64),'c7_fake','c7p_bob')===null,'forged session cannot request conversation');
  await chat.request(tokens.alice,'c7_direct','c7p_bob');
  check((await chat.request(tokens.bob,'c7_duplicate','c7p_alice')).id==='c7_direct','direct conversation pair is unique regardless of direction');
  check(await chat.request(tokens.alice,'c7_self','c7p_alice')===null,'self request cannot reuse an unrelated existing conversation');
  check(await chat.thread(tokens.carol,'c7_direct')===null,'outsider cannot view conversation metadata');
  check(await chat.send(tokens.alice,'c7_early','c7_direct',cipher)===null,'pending direct request cannot send messages');
  check(await chat.acceptDirect(tokens.alice,'c7_direct')===null,'request initiator cannot accept for recipient');
  await chat.acceptDirect(tokens.bob,'c7_direct');
  await chat.send(tokens.alice,'c7_message','c7_direct',cipher);
  check((await chat.messages(tokens.bob,'c7_direct')).length===1,'accepted participant reads current cipher version');
  check((await chat.messages(tokens.outsider,'c7_direct')).length===0,'administrator has no blanket access to private conversations');
  await fails(()=>chat.send(tokens.alice,'c7_plaintext','c7_direct','plaintext'),'plaintext is not accepted as encrypted message');
  await run("INSERT INTO chat_messages(id,thread_id,sender_id,body_cipher,cipher_version) VALUES('c7_legacy','c7_direct','c7p_alice',?,1)",'A'.repeat(40));
  check((await chat.messages(tokens.bob,'c7_direct')).length===1,'legacy ciphertext is preserved but isolated from current version');
  const page=await chat.messages(tokens.bob,'c7_direct');
  check((await chat.messages(tokens.bob,'c7_direct',{date:page[0].created_at,id:page[0].id})).length===0,'message cursor does not repeat boundary row');
  await chat.request(tokens.alice,'c7_other_direct','c7p_carol');await chat.acceptDirect(tokens.carol,'c7_other_direct');
  check(await chat.send(tokens.alice,'c7_cross_reply','c7_other_direct',cipher,'c7_message')===null,'reply cannot target another conversation');
  await chat.send(tokens.alice,'c7_media','c7_direct',cipher,null,'image/png');
  check((await chat.media(tokens.bob,'c7_media')).media_path==='v2/c7_direct/c7_media.enc','attachment path is derived from conversation and message');
  check(await chat.media(tokens.carol,'c7_media')===null,'outsider cannot read attachment metadata');
  await chat.report(tokens.bob,'c7_report','c7_direct','c7_message','Evidence');
  check(await chat.report(tokens.carol,'c7_foreign_report','c7_direct','c7_message','Invalid')===null,'outsider cannot report a message from another conversation');
  const snapshot=(await one("SELECT message_snapshot FROM chat_reports WHERE id='c7_report'")).message_snapshot;
  check(JSON.parse(snapshot).body_cipher===cipher,'report captures encrypted message snapshot');
  check(await chat.change(tokens.bob,'c7_direct','c7_message',edited)===null,'recipient cannot edit senders message');
  await chat.change(tokens.alice,'c7_direct','c7_message',edited);
  check((await one("SELECT body_cipher FROM chat_messages WHERE id='c7_message'")).body_cipher===edited,'sender can edit within two hours');
  check((await one("SELECT message_snapshot FROM chat_reports WHERE id='c7_report'")).message_snapshot===snapshot,'editing preserves submitted report evidence');
  await fails(()=>run("UPDATE chat_reports SET message_snapshot='{}' WHERE id='c7_report'"),'reported evidence cannot be overwritten');
  await run("UPDATE chat_messages SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hours') WHERE id='c7_message'");
  check(await chat.change(tokens.alice,'c7_direct','c7_message',cipher)===null,'editing at two-hour boundary is rejected');
  check(await chat.change(tokens.alice,'c7_direct','c7_message',cipher,true)===null,'revocation at two-hour boundary is rejected');
  await chat.change(tokens.alice,'c7_direct','c7_media',cipher,true);
  check(await chat.media(tokens.bob,'c7_media')===null,'revoked message no longer authorizes attachment');
  check(await chat.change(tokens.alice,'c7_direct','c7_media',edited)===null,'revoked message cannot be restored by editing');
  await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('c7p_bob','c7p_alice')");
  check((await chat.messages(tokens.alice,'c7_direct')).length===0,'blocking hides conversation history');
  check(await chat.send(tokens.alice,'c7_blocked','c7_direct',cipher)===null,'blocking prevents sending');
  await run("DELETE FROM chat_blocks WHERE blocker_id='c7p_bob' AND blocked_id='c7p_alice'");
  await chat.createGroup(tokens.alice,'c7_group','Group',['c7p_bob','c7p_carol']);
  await chat.send(tokens.alice,'c7_group_message','c7_group',cipher);
  check((await chat.messages(tokens.bob,'c7_group')).length===0,'pending group invitation grants no history access');
  check((await chat.members(tokens.bob,'c7_group')).length===0,'pending invite grants no private roster access');
  check(await chat.send(tokens.bob,'c7_pending_group','c7_group',cipher)===null,'pending group member cannot send');
  check(await chat.acceptGroup(tokens.outsider,'c7_group')===null,'outsider cannot accept unreceived group invitation');
  await chat.acceptGroup(tokens.bob,'c7_group');
  check((await chat.messages(tokens.bob,'c7_group')).length===1,'accepted group member reads messages');
  check((await chat.members(tokens.bob,'c7_group')).some(p=>p.avatar_url==='/avatar-alice'),'authorized group roster includes small-profile-photo metadata');
  check(await chat.invite(tokens.bob,'c7_group','c7p_outsider')===null,'only group owner invites additional members');
  const link1='e'.repeat(64),link2='f'.repeat(64);
  check(await chat.link(tokens.bob,'c7_group',link1)===null,'non-owner cannot issue invite link');
  await chat.link(tokens.alice,'c7_group',link1);await chat.link(tokens.alice,'c7_group',link2);
  check(await chat.joinLink(tokens.outsider,link1)===null,'rotated link no longer grants access');
  check(await chat.joinLink(tokens.outsider,link2)!==null,'current unexpired link grants accepted membership');
  await chat.revokeLink(tokens.alice,'c7_group');
  check(await chat.joinLink(tokens.carol,link2)===null,'revoked link cannot be used by pending member');
  await chat.link(tokens.alice,'c7_group',link1);
  await run("UPDATE chat_group_invite_links SET expires_at='2000-01-01T00:00:00Z' WHERE thread_id='c7_group'");
  check(await chat.joinLink(tokens.carol,link1)===null,'expired group link is rejected');
  await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('c7p_carol','c7p_bob')");
  check(await chat.acceptGroup(tokens.carol,'c7_group')===null,'blocked group peer prevents accepting invite');
  await run("DELETE FROM chat_blocks WHERE blocker_id='c7p_carol' AND blocked_id='c7p_bob'");
  await chat.acceptGroup(tokens.carol,'c7_group');await chat.link(tokens.alice,'c7_group',link2);
  await chat.leaveGroup(tokens.alice,'c7_group');
  check(await chat.thread(tokens.alice,'c7_group')===null,'former member loses group access');
  check((await one("SELECT initiator_id FROM chat_threads WHERE id='c7_group'")).initiator_id!=='c7p_alice','group owner departure transfers ownership');
  check(await chat.joinLink(tokens.alice,link2)===null,'owner departure invalidates old invite link');
  await fails(()=>chat.createGroup(tokens.alice,'c7_bad_group','Bad',['c7p_bob','c7p_bob']),'duplicate group participants rejected atomically');
  await chat.createGroup(tokens.alice,'c7_full_group','Full',['c7p_bob']);
  const extraSeed=[];
  for(let i=0;i<14;i++){
   extraSeed.push(db.prepare('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)').bind('c7_extra_'+i,'c7_extra_'+i,'password','extra-key-'+i));
   extraSeed.push(db.prepare('INSERT INTO profiles(id,user_id,username) VALUES(?,?,?)').bind('c7p_extra_'+i,'c7_extra_'+i,'c7_extra_'+i));
   if(i<13)extraSeed.push(db.prepare("INSERT INTO chat_group_members(thread_id,profile_id,status) VALUES('c7_full_group',?,'pending')").bind('c7p_extra_'+i));
  }
  await db.batch(extraSeed);
  await fails(()=>chat.invite(tokens.alice,'c7_full_group','c7p_extra_13'),'group capacity includes pending invitations and caps at fifteen');
  check((await one("SELECT count(*) n FROM chat_group_members WHERE thread_id='c7_full_group'")).n===15,'failed capacity overflow preserves group membership');
  await run("UPDATE chat_messages SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 minutes') WHERE sender_id='c7p_alice'");
  await run("WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<30) INSERT INTO chat_messages(id,thread_id,sender_id,body_cipher,cipher_version) SELECT 'c7_rate_'||x,'c7_other_direct','c7p_alice',?,2 FROM n",cipher);
  check(await chat.send(tokens.alice,'c7_rate_overflow','c7_other_direct',cipher)===null,'message rate limit enforced in atomic insert');
  await run("UPDATE auth_accounts SET account_status='suspended' WHERE id='c7_bob'");
  check((await chat.messages(tokens.bob,'c7_direct')).length===0,'suspended account cannot read messages');
  check(await chat.send(tokens.bob,'c7_suspended','c7_direct',cipher)===null,'suspended account cannot send messages');
  return {passed:checks.length,checks};
 }finally{
  const cleanup=[db.prepare("DELETE FROM chat_reports WHERE id='c7_report'"),
   db.prepare("DELETE FROM chat_threads WHERE id IN('c7_direct','c7_other_direct','c7_group','c7_full_group')"),
   db.prepare("DELETE FROM platform_admins WHERE user_id='c7_outsider'")];
  for(const name of Object.keys(tokens)){cleanup.push(db.prepare('DELETE FROM profiles WHERE id=?').bind('c7p_'+name),db.prepare('DELETE FROM auth_accounts WHERE id=?').bind('c7_'+name));}
  for(let i=0;i<14;i++){cleanup.push(db.prepare('DELETE FROM profiles WHERE id=?').bind('c7p_extra_'+i),db.prepare('DELETE FROM auth_accounts WHERE id=?').bind('c7_extra_'+i));}
  await db.batch(cleanup);
 }
}
