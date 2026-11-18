import type { NooklieD1 } from './d1';

export function d1Wiki(db:NooklieD1){
 function session(hash:string){if(!/^[0-9a-f]{64}$/.test(hash))throw Error('Invalid session hash');}
 function id(value:string){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw Error('Invalid identifier');}
 function text(value:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw Error('Invalid text');return value.trim();}
 return {
  async list(query='',characterId:string|null=null){text(query,0,100);if(characterId!==null)id(characterId);
   return(await db.prepare(`SELECT id,name,universe,biography,source_url,approved_at FROM wiki_characters WHERE approved_at IS NOT NULL AND (?1 IS NULL OR id=?1) AND instr(lower(name),lower(?2))>0 ORDER BY name,id LIMIT 60`).bind(characterId,query.trim()).all()).results;},
  async favorites(hash:string){session(hash);return(await db.prepare(`SELECT c.id,c.name,c.universe,c.approved_at FROM wiki_character_favorites f JOIN wiki_characters c ON c.id=f.character_id JOIN d1_social_actors a ON a.profile_id=f.profile_id WHERE a.token_hash=? ORDER BY c.name,c.id LIMIT 1000`).bind(hash).all()).results;},
  async favorite(hash:string,characterId:string,enabled:boolean){session(hash);id(characterId);if(typeof enabled!=='boolean')throw Error('Invalid favorite');
   const sql=enabled?`INSERT INTO wiki_character_favorites(profile_id,character_id) SELECT a.profile_id,c.id FROM d1_social_actors a JOIN wiki_characters c ON c.id=?2 AND c.approved_at IS NOT NULL WHERE a.token_hash=?1 ON CONFLICT DO NOTHING`:`DELETE FROM wiki_character_favorites WHERE character_id=?2 AND profile_id IN(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)`;
   return db.prepare(sql).bind(hash,characterId).run();},
  async submit(hash:string,editId:string,input:{characterId?:string|null;name?:string;universe?:string;biography:string;source:string}){
   session(hash);id(editId);const character=input.characterId??null;if(character!==null)id(character);
   const name=character===null?text(input.name??'',2,100).replace(/\s+/g,' '):null;
   const universe=character===null?text(input.universe??'',2,160).replace(/\s+/g,' '):null;
   const biography=text(input.biography,20,5000);const source=new URL(text(input.source,9,1500));
   if(source.protocol!=='https:'||source.username||source.password||source.href.length>1500)throw Error('Source must use HTTPS without credentials');
   const r=await db.prepare(`INSERT INTO d1_wiki_commands(token_hash,id,character_id,operation,name,universe,biography,source_url) VALUES(?,?,?,'submit',?,?,?,?)`).bind(hash,editId,character,name,universe,biography,source.href).run();
   if(!r.success)throw Error('Contribution failed');return {characterId:character??editId};},
  async pending(hash:string){session(hash);return(await db.prepare(`SELECT e.id,e.character_id,e.biography,e.source_url,c.name,c.universe FROM wiki_character_edits e JOIN wiki_characters c ON c.id=e.character_id WHERE e.decision IS NULL AND EXISTS(SELECT 1 FROM d1_wiki_reviewers WHERE token_hash=?) ORDER BY e.created_at,e.id LIMIT 60`).bind(hash).all()).results;},
  async review(hash:string,auditId:string,editId:string,decision:'approved'|'rejected'){
   session(hash);id(auditId);id(editId);if(!['approved','rejected'].includes(decision))throw Error('Invalid decision');
   const r=await db.prepare(`INSERT INTO d1_wiki_commands(token_hash,id,character_id,operation,decision) VALUES(?,?,?,'review',?)`).bind(hash,auditId,editId,decision).run();if(!r.success)throw Error('Review failed');return {id:editId};}
 };
}
