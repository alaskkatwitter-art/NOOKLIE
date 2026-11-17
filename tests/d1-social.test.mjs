import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Social } from '../lib/database/d1-social.ts';
import { d1Permissions } from '../lib/database/d1-permissions.ts';
import { verifyD1Social } from './fixtures/d1-social-scenarios.mjs';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql']) {
    sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
  }
  const adapter={
    prepare(sql){let params=[];return {
      bind(...values){params=values;return this;},
      async first(){return sqlite.prepare(sql).get(...params)??null;},
      async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
    };},
    async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
  };
  return {sqlite,adapter};
}

test('D1 social privacy, ownership, follow lifecycle and staff permissions',async()=>{
  const {sqlite,adapter}=fixture();
  try {
    const result=await verifyD1Social(adapter,d1Social,d1Permissions);
    assert.ok(result.passed>=40);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_accounts').get().n,0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});

test('D1 schema rejects mixed-department roles, invalid JSON, self-blocks and duplicate identity',()=>{
  const {sqlite}=fixture();
  try {
    sqlite.exec(`INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('account','tester','p','r');
      INSERT INTO profiles(id,user_id,username) VALUES('profile','account','tester');
      INSERT INTO departments(id,name,slug) VALUES('one','One','one'),('two','Two','two');
      INSERT INTO team_roles(id,department_id,name) VALUES('role','one','Role');`);
    assert.throws(()=>sqlite.exec("INSERT INTO team_memberships(id,user_id,department_id,role_id) VALUES('member','account','two','role')"),/another department/);
    assert.throws(()=>sqlite.exec("INSERT INTO profiles(id,user_id,username) VALUES('other','account','another')"),/UNIQUE/);
    assert.throws(()=>sqlite.exec("UPDATE profiles SET avatar_animation='[]'"),/CHECK/);
    assert.throws(()=>sqlite.exec("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES('profile','profile')"),/CHECK/);
    sqlite.exec("INSERT INTO team_memberships(id,user_id,department_id,role_id) VALUES('member','account','one','role')");
    assert.throws(()=>sqlite.exec("UPDATE team_roles SET department_id='two' WHERE id='role'"),/memberships/);
  }finally{sqlite.close();}
});
