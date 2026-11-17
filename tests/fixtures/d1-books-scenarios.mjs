// Shared SQL/authorization scenarios for native SQLite and the isolated D1.
// The remote runner supplies a plain-text-only sanitizer, never an HTML bypass.
export async function verifyD1Books(db, factory, sanitizer) {
  const books=factory(db,sanitizer),checks=[];
  const tokens={author:'a'.repeat(64),reader:'b'.repeat(64),other:'c'.repeat(64)};
  const run=(sql,...params)=>db.prepare(sql).bind(...params).run();
  const first=(sql,...params)=>db.prepare(sql).bind(...params).first();
  function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
  async function rejects(action,label){let rejected=false;try{await action();}catch{rejected=true;}check(rejected,label);}
  try {
    for(const [name,token] of Object.entries(tokens)){
      await run('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)',
        'b3_'+name,'b3_'+name,'synthetic-password','synthetic-key-'+name);
      await run('INSERT INTO profiles(id,user_id,username) VALUES(?,?,?)','b3p_'+name,'b3_'+name,'b3_'+name);
      await run('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)',
        'b3session_'+name,'b3_'+name,token,new Date(Date.now()+3600000).toISOString());
    }
    check(await books.createStory(tokens.author,'b3_story','Story')!==null,'author creates story with session-derived authorship');
    check(await books.createStory('f'.repeat(64),'b3_forged','Forged')===null,'forged session cannot create story');
    check(await books.story(null,'b3_story')===null,'new unpublished story hidden from anonymous readers');
    check(await books.story(tokens.author,'b3_story')!==null,'author can preview own draft story');
    check(await books.setStoryPublished(tokens.author,'b3_story',true)===null,'empty story cannot publish');
    for(let i=1;i<=3;i++)await books.appendChapter(tokens.author,'b3_story','b3c'+i,'Chapter '+i,'Body '+i);
    check((await books.chapters(tokens.author,'b3_story')).length===3,'author can see all own draft chapters');
    check(await books.chapter(tokens.reader,'b3c1')===null,'reader cannot view draft chapter');
    check(await books.appendChapter(tokens.reader,'b3_story','b3_foreign','Foreign','Body')===null,'outsider cannot append chapter');
    check(await books.editChapter(tokens.reader,'b3c1','Hacked','Body')===null,'outsider cannot edit chapter');
    check(await books.editStory(tokens.reader,'b3_story','Hacked','Body')===null,'outsider cannot edit story');
    check(await books.setChapterPublished(tokens.reader,'b3c1',true)===null,'outsider cannot publish chapter');
    await books.setChapterPublished(tokens.author,'b3c1',true);
    await books.setChapterPublished(tokens.author,'b3c2',true);
    await books.setStoryPublished(tokens.author,'b3_story',true);
    check(await books.story(null,'b3_story')!==null,'released story visible to anonymous reader');
    check((await books.chapters(null,'b3_story')).length===2,'public table of contents excludes drafts');
    check(await books.chapter(null,'b3c3')===null,'draft body remains hidden in released story');
    await books.reorderChapters(tokens.author,'b3_story',['b3c3','b3c1','b3c2']);
    check((await books.chapters(tokens.author,'b3_story')).map(x=>x.id).join(',')==='b3c3,b3c1,b3c2','author can reorder all chapters');
    await rejects(()=>books.reorderChapters(tokens.reader,'b3_story',['b3c1','b3c2','b3c3']),'outsider cannot reorder chapters');
    await rejects(()=>books.reorderChapters(tokens.author,'b3_story',['b3c1','b3c1','b3c2']),'duplicate chapter order rejected');
    await rejects(()=>books.reorderChapters(tokens.author,'b3_story',['b3c1','b3c2']),'incomplete chapter order rejected');
    check((await books.chapters(tokens.author,'b3_story'))[0].id==='b3c3','failed reorder preserves original order');
    await books.createStory(tokens.author,'b3_second','Second');
    await books.appendChapter(tokens.author,'b3_second','b3_second_chapter','Second chapter','Body');
    await books.setChapterPublished(tokens.author,'b3_second_chapter',true);
    await books.setStoryPublished(tokens.author,'b3_second',true);
    await rejects(()=>books.reorderChapters(tokens.author,'b3_story',['b3c1','b3c2','b3_second_chapter']),'chapter from another story cannot enter order');
    check(await books.saveProgress(tokens.reader,'b3_story','b3_second_chapter',50,100)===null,'progress rejects chapter from different story');
    check(await books.saveProgress(tokens.reader,'b3_story','b3c1',50,100)!==null,'reader saves progress for visible chapter');
    check((await books.progress(tokens.reader,'b3_story')).position===100,'reader can restore own saved position');
    check(await books.progress(tokens.other,'b3_story')===null,'another reader cannot read saved progress');
    await rejects(()=>books.saveProgress(tokens.reader,'b3_story','b3c1',101,0),'invalid progress percentage rejected');
    check(await books.pinStory(tokens.reader,'b3_story')===null,'reader cannot pin another authors story');
    await books.pinStory(tokens.author,'b3_story');
    check((await first("SELECT pinned_story_id FROM profiles WHERE id='b3p_author'")).pinned_story_id==='b3_story','author pins own story');
    await books.createList(tokens.reader,'b3_list','My list');
    check(await books.list(null,'b3_list')===null,'new reading list is private');
    check(await books.addToList(tokens.other,'b3_list','b3_story','b3_wrong_item')===null,'outsider cannot add to another list');
    await books.addToList(tokens.reader,'b3_list','b3_story','b3_item1');
    await books.addToList(tokens.reader,'b3_list','b3_second','b3_item2');
    check((await books.listItems(tokens.reader,'b3_list')).length===2,'list owner reads saved stories');
    check((await books.listItems(tokens.other,'b3_list')).length===0,'other readers cannot enumerate private list');
    await books.setListPublic(tokens.reader,'b3_list',true);
    check((await books.listItems(null,'b3_list')).length===2,'explicitly public list becomes visible');
    await books.reorderList(tokens.reader,'b3_list',['b3_second','b3_story']);
    check((await books.listItems(null,'b3_list'))[0].id==='b3_second','list reordering preserves chosen order');
    await rejects(()=>books.reorderList(tokens.other,'b3_list',['b3_story','b3_second']),'outsider cannot reorder list');
    await rejects(()=>books.reorderList(tokens.reader,'b3_list',['b3_story']),'stale list order rejected atomically');
    check(await books.removeFromList(tokens.other,'b3_list','b3_story')===null,'outsider cannot remove list item');
    await books.removeFromList(tokens.reader,'b3_list','b3_story');
    check((await books.listItems(null,'b3_list')).length===1,'owner removes story from custom list');
    const library=await books.library(tokens.reader,'b3_library');
    check((await books.library(tokens.reader,'b3_library_duplicate')).id===library.id,'main library is unique and reused');
    await books.addToList(tokens.reader,library.id,'b3_story','b3_library_item');
    await books.setReadingStatus(tokens.reader,library.id,'b3_story','completed');
    check((await books.listItems(tokens.reader,library.id))[0].reading_status==='completed','library reading status can be saved');
    check(await books.setReadingStatus(tokens.other,library.id,'b3_story','unread')===null,'outsider cannot change reading status');
    check(await books.setListPublic(tokens.reader,library.id,true)===null,'main library cannot be made public');
    await books.removeFromList(tokens.reader,library.id,'b3_story');
    check((await books.listItems(tokens.reader,library.id)).length===0,'owner removes story from main library');
    await run("UPDATE profiles SET is_private=1 WHERE id='b3p_author'");
    check(await books.story(tokens.reader,'b3_story')===null,'private author requires accepted follower');
    check((await books.listItems(null,'b3_list')).length===0,'public list cannot leak private authors story');
    await run("INSERT INTO follows(follower_id,following_id) VALUES('b3p_reader','b3p_author')");
    check(await books.story(tokens.reader,'b3_story')!==null,'accepted follower sees released story');
    await run("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('b3p_author','b3p_reader')");
    check(await books.chapter(tokens.reader,'b3c1')===null,'blocking revokes chapter access');
    check(await books.addToList(tokens.reader,'b3_list','b3_story','b3_blocked_item')===null,'blocked story cannot be added to list');
    await run("DELETE FROM chat_blocks WHERE blocker_id='b3p_author' AND blocked_id='b3p_reader'");
    await run("UPDATE profiles SET is_private=0 WHERE id='b3p_author'");
    await run("UPDATE stories SET release_at=? WHERE id='b3_second'",new Date(Date.now()+3600000).toISOString());
    check(await books.story(null,'b3_second')===null,'future release stays hidden');
    await run("UPDATE stories SET moderation_hidden_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='b3_second'");
    check(await books.story(tokens.author,'b3_second')===null,'moderated story unavailable even to author repository');
    await run("INSERT INTO chapter_media(id,chapter_id,media_url,media_type,position) VALUES('b3_media','b3c1','/safe-image','image',0)");
    await run("INSERT INTO chapter_likes(chapter_id,user_id) VALUES('b3c1','b3p_reader')");
    await run("INSERT INTO chapter_favorites(chapter_id,user_id) VALUES('b3c1','b3p_reader')");
    await run("INSERT INTO scheduled_chapters(id,chapter_id,scheduled_for) VALUES('b3_schedule','b3c1',?)",new Date(Date.now()+3600000).toISOString());
    await rejects(()=>books.deleteChapter(tokens.reader,'b3_story','b3c1'),'outsider cannot delete chapter');
    await rejects(()=>books.deleteChapter(tokens.author,'b3_story','b3_second_chapter'),'deletion cannot cross story boundaries');
    await books.deleteChapter(tokens.author,'b3_story','b3c1');
    check(await books.chapter(tokens.author,'b3c1')===null,'authorized chapter is permanently deleted');
    check((await books.chapters(tokens.author,'b3_story')).map(c=>c.chapter_number).join(',')==='1,2','remaining chapters are renumbered contiguously');
    check((await first("SELECT (SELECT count(*) FROM chapter_media WHERE chapter_id='b3c1')+(SELECT count(*) FROM chapter_likes WHERE chapter_id='b3c1')+(SELECT count(*) FROM chapter_favorites WHERE chapter_id='b3c1')+(SELECT count(*) FROM scheduled_chapters WHERE chapter_id='b3c1') AS n")).n===0,'chapter deletion cascades to media metadata, votes, favorites and schedules');
    check(await books.progress(tokens.reader,'b3_story')===null,'deleted chapter also clears its saved progress');
    check((await first('SELECT count(*) n FROM d1_book_commands')).n===0,'internal command rows do not persist after success or rejection');
    await books.setStoryPublished(tokens.author,'b3_story',false);
    check(await books.story(null,'b3_story')===null,'unpublishing hides released story');
    await run("UPDATE auth_accounts SET account_status='suspended' WHERE id='b3_author'");
    check(await books.editStory(tokens.author,'b3_story','Forbidden','Body')===null,'suspended author cannot edit');
    return {passed:checks.length,checks};
  } finally {
    // Exact synthetic identities. The real user database is never touched.
    for(const name of Object.keys(tokens)) {
      await run('DELETE FROM profiles WHERE id=?','b3p_'+name);
      await run('DELETE FROM auth_accounts WHERE id=?','b3_'+name);
    }
  }
}
