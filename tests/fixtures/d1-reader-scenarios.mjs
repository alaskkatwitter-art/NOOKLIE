export async function verifyD1Reader(db, readerFactory, betaFactory, preferencesValidator, betaSanitizer) {
  const reader=readerFactory(db,preferencesValidator),beta=betaFactory(db,betaSanitizer),checks=[];
  const tokens={author:'a'.repeat(64),alice:'b'.repeat(64),bob:'c'.repeat(64),other:'d'.repeat(64)};
  const run=(sql,...params)=>db.prepare(sql).bind(...params).run();
  const first=(sql,...params)=>db.prepare(sql).bind(...params).first();
  const valid={fontId:'lora',fontSize:20,lineHeight:1.6,margin:16,theme:'sepia'};
  function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
  async function rejects(action,label){let failed=false;try{await action();}catch{failed=true;}check(failed,label);}
  try {
    for(const [name,token] of Object.entries(tokens)){
      await run('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)',
        'r4_'+name,'r4_'+name,'synthetic-password','synthetic-key-'+name);
      await run('INSERT INTO profiles(id,user_id,username) VALUES(?,?,?)','r4p_'+name,'r4_'+name,'r4_'+name);
      await run('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)',
        'r4session_'+name,'r4_'+name,token,new Date(Date.now()+3600000).toISOString());
    }
    await run("INSERT INTO stories(id,author_id,title,story_kind) VALUES('r4_story','r4p_author','Original','original')");
    await run("INSERT INTO chapters(id,story_id,chapter_number,title,body,published,publication_status) VALUES('r4_public','r4_story',1,'Public','Public body',1,'published'),('r4_draft','r4_story',2,'Draft','Secret draft',0,'draft'),('r4_second','r4_story',3,'Second','Second body',1,'published')");
    check(await reader.postComment('f'.repeat(64),{id:'r4_forged',chapterId:'r4_public',body:'Forged'})===null,'forged session cannot comment');
    check(await reader.postComment(tokens.alice,{id:'r4_wrong_draft',chapterId:'r4_draft',body:'Draft'})===null,'draft chapters cannot receive public comments');
    await reader.postComment(tokens.alice,{id:'r4_comment',chapterId:'r4_public',body:'Comment',selectedText:'Public',startOffset:0,endOffset:6});
    check((await reader.comments(null,'r4_public')).length===1,'published chapter comments visible to readers');
    check((await reader.notifications(tokens.author)).length===1,'chapter author receives comment notification');
    await reader.postComment(tokens.bob,{id:'r4_reply',chapterId:'r4_public',body:'Reply',parentId:'r4_comment'});
    check((await reader.notifications(tokens.alice)).filter(n=>n.notification_type==='comment_reply').length===1,'reply notifies original commenter exactly once');
    check(await reader.postComment(tokens.bob,{id:'r4_cross',chapterId:'r4_second',body:'Wrong chapter',parentId:'r4_comment'})===null,'reply cannot target another chapters comment');
    const page=await reader.comments(null,'r4_public',1);
    const next=await reader.comments(null,'r4_public',1,{createdAt:page[0].created_at,id:page[0].id});
    check(next.length===1&&next[0].id!==page[0].id,'comment pagination advances without repeating first page');
    await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('r4p_alice','r4p_bob')");
    check(!(await reader.comments(tokens.alice,'r4_public')).some(c=>c.id==='r4_reply'),'blocked commenter is filtered from chapter discussion');
    check(await reader.postComment(tokens.bob,{id:'r4_reply_blocked',chapterId:'r4_public',body:'Blocked reply',parentId:'r4_comment'})===null,'reply cannot bypass a block between commenters');
    await run("DELETE FROM chat_blocks WHERE blocker_id='r4p_alice' AND blocked_id='r4p_bob'");
    await reader.likeComment(tokens.bob,'r4_comment');await reader.likeComment(tokens.bob,'r4_comment');
    check((await first("SELECT count(*) n FROM comment_likes WHERE comment_id='r4_comment'")).n===1,'comment likes are idempotent');
    check((await reader.notifications(tokens.alice)).filter(n=>n.notification_type==='comment_likes').length===1,'duplicate likes do not repeat notifications');
    check(await reader.unlikeComment(tokens.other,'r4_comment')===null,'another account cannot remove comment like');
    check(await reader.unlikeComment(tokens.bob,'r4_comment')!==null,'liker can remove own like');
    const ownNotification=(await reader.notifications(tokens.alice))[0];
    await reader.markNotificationRead(tokens.other,ownNotification.id);
    check((await reader.notifications(tokens.alice)).find(n=>n.id===ownNotification.id).read_at===null,'another account cannot mark notification read');
    await reader.markNotificationRead(tokens.alice,ownNotification.id);
    check((await reader.notifications(tokens.alice)).find(n=>n.id===ownNotification.id).read_at!==null,'notification owner can mark it read');
    await run("INSERT INTO profile_mutes(user_id,target_id) VALUES('r4p_alice','r4p_bob')");
    const beforeMute=(await reader.notifications(tokens.alice)).length;
    await reader.postComment(tokens.bob,{id:'r4_muted',chapterId:'r4_public',body:'Muted reply',parentId:'r4_comment'});
    check((await reader.notifications(tokens.alice)).length===beforeMute,'muted actor does not generate reply notification');
    const beforeSelf=(await reader.notifications(tokens.author)).length;
    await reader.postComment(tokens.author,{id:'r4_self',chapterId:'r4_public',body:'Self'});
    check((await reader.notifications(tokens.author)).length===beforeSelf,'own comment does not notify its author');
    await run("UPDATE profiles SET social_notifications=0 WHERE id='r4p_alice'");
    await reader.postComment(tokens.other,{id:'r4_optout',chapterId:'r4_public',body:'Optout',parentId:'r4_comment'});
    check((await reader.notifications(tokens.alice)).length===beforeMute,'notification preference is respected');
    await run("UPDATE profiles SET social_notifications=1 WHERE id='r4p_alice'");
    await run("INSERT INTO user_stickers(id,user_id,image_url) VALUES('r4_sticker','r4p_alice','/managed-sticker')");
    check((await reader.stickers(tokens.bob)).length===0,'sticker library remains private to owner');
    check(await reader.postComment(tokens.bob,{id:'r4_foreign_sticker',chapterId:'r4_public',body:'',stickerId:'r4_sticker'})===null,'another persons sticker cannot be used');
    await reader.postComment(tokens.alice,{id:'r4_sticker_comment',chapterId:'r4_public',body:'',stickerId:'r4_sticker'});
    check((await first("SELECT last_used_at FROM user_stickers WHERE id='r4_sticker'")).last_used_at!==null,'own sticker can be posted and usage updated');
    check(await reader.deleteSticker(tokens.bob,'r4_sticker')===null,'another account cannot delete sticker');
    await reader.deleteSticker(tokens.alice,'r4_sticker');
    check((await first("SELECT sticker_id FROM comments WHERE id='r4_sticker_comment'")).sticker_id===null,'deleting sticker preserves its comment');
    await reader.savePreferences(tokens.alice,valid);
    check((await reader.preferences(tokens.alice)).fontId==='lora','reader preferences persist for their account');
    check(await reader.preferences(tokens.bob)===null,'another account cannot read saved reader preferences');
    await rejects(()=>reader.savePreferences(tokens.alice,{...valid,fontSize:100}),'out-of-range font size rejected');
    await rejects(()=>reader.savePreferences(tokens.alice,{...valid,user_id:'r4_bob'}),'preference payload cannot select another account');
    check(await reader.savePreferences('f'.repeat(64),valid)===null,'forged session cannot save preferences');
    await run("UPDATE profiles SET is_private=1 WHERE id='r4p_author'");
    check((await reader.comments(tokens.alice,'r4_public')).length===0,'private author comments require accepted follower');
    await run("INSERT INTO follows(follower_id,following_id) VALUES('r4p_alice','r4p_author')");
    check((await reader.comments(tokens.alice,'r4_public')).length>0,'accepted follower sees private authors chapter comments');
    await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('r4p_author','r4p_alice')");
    check(await reader.postComment(tokens.alice,{id:'r4_blocked',chapterId:'r4_public',body:'Blocked'})===null,'blocked reader cannot comment');
    await run("DELETE FROM chat_blocks WHERE blocker_id='r4p_author' AND blocked_id='r4p_alice'");
    await run("UPDATE profiles SET is_private=0 WHERE id='r4p_author'");
    check(await beta.invite(tokens.bob,'r4_forbidden_invite','r4_draft','r4_alice')===null,'outsider cannot invite beta readers to another authors draft');
    check(await beta.invite(tokens.author,'r4_published_invite','r4_public','r4_alice')===null,'published chapter cannot be invited for beta reading');
    await run("UPDATE stories SET story_kind='fanfic' WHERE id='r4_story'");
    check(await beta.invite(tokens.author,'r4_fanfic_invite','r4_draft','r4_alice')===null,'beta invitation restricted to original works');
    await run("UPDATE stories SET story_kind='original' WHERE id='r4_story'");
    await beta.invite(tokens.author,'r4_invite','r4_draft','r4_alice');
    check((await reader.notifications(tokens.alice)).filter(n=>n.notification_type==='beta_reading_invite').length===1,'beta reader receives invitation notification');
    check(await beta.read(tokens.alice,'r4_invite')===null,'unaccepted invite grants no draft access');
    check((await beta.invites(tokens.other)).length===0,'outsider cannot enumerate private beta invitations');
    check(!Object.hasOwn((await beta.invites(tokens.alice))[0],'body'),'invitation list does not leak draft body');
    check(await beta.accept(tokens.other,'r4_invite')===null,'only invited reader may accept');
    check(await beta.note(tokens.alice,'r4_note_early','r4_invite','','Too early')===null,'notes require accepted invitation');
    await beta.accept(tokens.alice,'r4_invite');
    check((await beta.read(tokens.alice,'r4_invite')).body==='Secret draft','accepted invited reader can read private draft');
    check(await beta.read(tokens.other,'r4_invite')===null,'outsider cannot read accepted draft');
    await beta.note(tokens.alice,'r4_note','r4_invite','Secret','Useful note');
    check((await beta.read(tokens.author,'r4_invite')).notes.length===1,'author can read invited readers notes');
    check(await beta.note(tokens.author,'r4_author_note','r4_invite','','Unauthorized role')===null,'author does not impersonate invited reader to write notes');
    await rejects(()=>beta.note(tokens.alice,'r4_long_note','r4_invite','','x'.repeat(2001)),'oversized beta note rejected');
    await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('r4p_author','r4p_alice')");
    check(await beta.read(tokens.alice,'r4_invite')===null,'block immediately revokes beta draft access');
    check(await beta.revoke(tokens.other,'r4_invite')===null,'outsider cannot revoke invitation');
    check(await beta.revoke(tokens.author,'r4_invite')!==null,'author may revoke even after blocking');
    check((await first("SELECT count(*) n FROM beta_reading_notes WHERE id='r4_note'")).n===0,'revocation removes associated private notes');
    await run("DELETE FROM chat_blocks WHERE blocker_id='r4p_author' AND blocked_id='r4p_alice'");
    await beta.invite(tokens.author,'r4_invite_again','r4_draft','r4_alice');await beta.accept(tokens.alice,'r4_invite_again');
    await run("UPDATE chapters SET published=1,publication_status='published' WHERE id='r4_draft'");
    check(await beta.read(tokens.alice,'r4_invite_again')===null,'publication closes private beta access');
    await run("UPDATE auth_accounts SET account_status='suspended' WHERE id='r4_bob'");
    check(await reader.postComment(tokens.bob,{id:'r4_suspended',chapterId:'r4_public',body:'Forbidden'})===null,'suspended account cannot comment');
    check((await reader.notifications(tokens.bob)).length===0,'suspended account cannot read notifications');
    check(await reader.savePreferences(tokens.bob,valid)===null,'suspended account cannot change reader preferences');
    return {passed:checks.length,checks};
  }finally{
    for(const name of Object.keys(tokens)){
      await run('DELETE FROM profiles WHERE id=?','r4p_'+name);
      await run('DELETE FROM auth_accounts WHERE id=?','r4_'+name);
    }
  }
}
