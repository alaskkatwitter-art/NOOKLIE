import {normalizeImportRow,importTableOrder,orderImportRows,insertStatement} from './d1-import-plan.mjs';

// Adapter-driven importer; source credentials and records must never be logged.
// readPage(name,{offset,limit,primaryKey}) returns source objects.
// query({batch:[{sql,params}]}) returns D1's result array. Its batch MUST be atomic.
// Use a fresh, isolated target; this does not implement a production delta sync.
export async function copyD1Snapshot({target,schema,sourceColumns,readPage,query,runId,onProgress=()=>{}}){
 if(target.database_id!=='fcea4d88-3c18-4c21-a6c1-af13c72caa00'||target.production_cutover!==false||schema.tables.length!==72)throw Error('Isolated migration target required');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(runId))throw Error('Invalid import run ID');
 const tables=schema.tables,order=importTableOrder(tables),names=new Set(order);
 const side=schema.triggers.filter(t=>names.has(t.tbl_name)&&/AFTER INSERT/i.test(t.sql));
 const pause={sql:side.map(t=>'DROP TRIGGER "'+t.name+'";').join('\n')};
 const restore={sql:side.map(t=>t.sql+';').join('\n')};
 for(const table of tables){const r=await query({batch:[{sql:'SELECT count(*) AS n FROM "'+table.name+'"'}]});if(r[0].results[0].n!==0)throw Error('Import target is not empty: '+table.name);}
 await query({batch:[{sql:"INSERT INTO d1_import_runs(id,source_project,state,manifest) VALUES(?,'fwwgoyburkdybbqmvljk','copying','{}')",params:[runId]}]});
 let verifiedRows=0;const counts={},pins=[];
 try{
  for(const name of order){const t=tables.find(t=>t.name===name),columns=t.columns.map(c=>c.name),pk=t.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);let rows=[];
   const size=name==='chapters'?1:40;
   for(let offset=0;;offset+=size){const page=await readPage(name,{offset,limit:size,primaryKey:pk});rows.push(...page.map(r=>normalizeImportRow(name,r,sourceColumns,t.columns)));if(page.length<size)break;}
   if(name==='profiles')for(const row of rows){if(row.pinned_story_id)pins.push({id:row.id,story:row.pinned_story_id});row.pinned_story_id=null;}
   rows=orderImportRows(t,rows);counts[name]=rows.length;
   for(let offset=0;offset<rows.length;){const chunk=[];let bytes=0;while(offset+chunk.length<rows.length&&chunk.length<Math.floor(80/pk.length)){const row=rows[offset+chunk.length],n=JSON.stringify(row).length;if(chunk.length&&bytes+n>130000)break;chunk.push(row);bytes+=n;}
    const where=chunk.map(()=>'('+pk.map(k=>'"'+k+'"=?').join(' AND ')+')').join(' OR ');
    const statements=[pause,...chunk.map(r=>insertStatement(name,r)),restore,{sql:'SELECT * FROM "'+name+'" WHERE '+where,params:chunk.flatMap(r=>pk.map(k=>r[k]))}];
    const result=await query({batch:statements});const actual=result.at(-1).results,key=r=>JSON.stringify(pk.map(k=>r[k])),byKey=new Map(actual.map(r=>[key(r),r]));
    if(actual.length!==chunk.length||chunk.some(r=>{const a=byKey.get(key(r));return!a||columns.some(k=>r[k]!==a[k]);}))throw Error('Copied row mismatch: '+name);
    verifiedRows+=chunk.length;offset+=chunk.length;
    await query({batch:[{sql:"UPDATE d1_import_runs SET manifest=? WHERE id=?",params:[JSON.stringify({kind:'staged-live-copy',counts,verifiedRows,lastTable:name,lastOffset:offset}),runId]}]});
   }
   onProgress({table:name,rows:rows.length,verifiedRows});
  }
  if(pins.length)await query({batch:pins.map(p=>({sql:'UPDATE profiles SET pinned_story_id=? WHERE id=?',params:[p.story,p.id]}))});
  const fk=await query({batch:[{sql:'PRAGMA foreign_key_check'}]});if(fk[0].results.length)throw Error('Imported foreign key violation');
  const triggers=await query({batch:[{sql:"SELECT name FROM sqlite_master WHERE type='trigger'"}]});const actualTriggers=new Set(triggers[0].results.map(t=>t.name));if(schema.triggers.some(t=>!actualTriggers.has(t.name)))throw Error('Missing trigger after import');
  const manifest={kind:'staged-live-copy',counts,verifiedRows,consistentSnapshot:false,productionCutover:false};
  await query({batch:[{sql:"UPDATE d1_import_runs SET state='verified',verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),manifest=? WHERE id=?",params:[JSON.stringify(manifest),runId]}]});return manifest;
 }catch(error){await query({batch:[{sql:"UPDATE d1_import_runs SET state='failed' WHERE id=?",params:[runId]}]});throw error;}
}
