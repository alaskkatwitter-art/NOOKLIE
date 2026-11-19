// Pure import planner. No credentials, HTTP endpoint or raw record logging.
export function normalizeImportRow(table,row,sourceColumns,targetColumns){
 const source=new Map(sourceColumns.filter(c=>c.table_name===table).map(c=>[c.column_name,c]));
 const columns=targetColumns.map(c=>c.name);if(columns.some(c=>!source.has(c))||source.size!==columns.length)throw Error('Source/target column mismatch: '+table);
 const out={};for(const name of columns){const c=source.get(name),v=row[name];if(v===undefined)throw Error('Missing field: '+table+'.'+name);
 if(v===null)out[name]=null;
 else if(c.data_type==='boolean')out[name]=v?1:0;
 else if(c.data_type==='jsonb'||c.data_type==='json'||c.data_type==='ARRAY')out[name]=JSON.stringify(v);
 else if(c.data_type==='timestamp with time zone'){if(v==='infinity'){out[name]=v;continue;}const d=new Date(v);if(!Number.isFinite(d.getTime()))throw Error('Invalid timestamp: '+table+'.'+name);out[name]=d.toISOString();}
 else if(['integer','smallint','bigint','numeric','real','double precision'].includes(c.data_type)){const n=Number(v);if(!Number.isFinite(n))throw Error('Invalid number: '+table+'.'+name);out[name]=n;}
 else out[name]=v;
 }return out;
}
export function importTableOrder(tables){
 const result=[],remaining=new Map(tables.map(t=>[t.name,t]));
 while(remaining.size){let progress=false;for(const [name,t]of remaining){const deps=t.foreignKeys.filter(f=>f.table!==name&&!(name==='profiles'&&f.from==='pinned_story_id')).map(f=>f.table);if(deps.every(n=>!remaining.has(n))){result.push(name);remaining.delete(name);progress=true;}}if(!progress)throw Error('Unexpected cross-table foreign key cycle: '+[...remaining.keys()].join(','));}return result;
}
export function orderImportRows(table,rows){
 const self=table.foreignKeys.filter(f=>f.table===table.name&&f.to==='id');if(!self.length)return rows;
 // All source self-references currently point to single-column IDs.
 if(self.some(f=>f.to!=='id'))throw Error('Unsupported self reference: '+table.name);
 const done=new Set(),todo=new Map(rows.map(r=>[r.id,r])),ordered=[];
 while(todo.size){let progress=false;for(const[id,row]of todo){if(self.every(f=>row[f.from]===null||done.has(row[f.from]))){ordered.push(row);done.add(id);todo.delete(id);progress=true;}}if(!progress)throw Error('Cyclic or missing self reference: '+table.name);}return ordered;
}
export function insertStatement(table,row){
 if(!/^[a-z_]+$/.test(table)||Object.keys(row).some(k=>!/^[a-z_]+$/.test(k)))throw Error('Invalid SQL identifier');
 const keys=Object.keys(row);return{sql:'INSERT INTO "'+table+'"('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')',params:keys.map(k=>row[k])};
}
