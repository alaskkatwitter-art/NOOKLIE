import type { NooklieD1 } from './d1';

// Apply both participants' privacy, moderation and blocking on every read and mutation.
const viewer = `WITH v AS (SELECT (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AS id)`;
const participant = (p:string) => `${p}.moderation_hidden_at IS NULL
 AND EXISTS(SELECT 1 FROM auth_accounts a WHERE a.id=${p}.user_id AND a.account_status='active')
 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=v.id AND b.blocked_id=${p}.id) OR (b.blocked_id=v.id AND b.blocker_id=${p}.id))`;
const visible = (p:string) => `${participant(p)} AND (${p}.is_private=0 OR ${p}.id=v.id OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=v.id AND f.following_id=${p}.id))`;
const entriesFrom = `FROM nookview_entries e JOIN released_stories s ON s.id=e.story_id
 JOIN profiles author ON author.id=s.author_id JOIN profiles p ON p.id=e.profile_id CROSS JOIN v
 WHERE ${visible('p')} AND ${visible('author')} AND (e.is_public=1 OR e.profile_id=v.id)`;
const providersFrom = `FROM service_profiles sp JOIN profiles p ON p.id=sp.profile_id CROSS JOIN v WHERE ${visible('p')}`;
export function d1Community(db:NooklieD1) {
 async function all<T=Record<string,unknown>>(sql:string,...params:(string|number|null)[]){const r=await db.prepare(sql).bind(...params).all<T>();if(!r.success)throw Error('Leitura indisponível.');return r.results;}
 async function run(sql:string,...params:(string|number|null)[]){const r=await db.prepare(sql).bind(...params).run();if(!r.success)throw Error('Não foi possível salvar.');return (r.meta.changes??0)>0;}
 return {
  async actor(hash:string|null){return db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?').bind(hash).first<{profile_id:string}>();},
  async entries(hash:string|null,scope:string,story:string|null,page:number){
   return all(viewer+` SELECT e.*,s.title,s.cover_url,s.story_kind,p.username,p.display_name,p.avatar_url,
    (SELECT count(*) FROM nookview_likes WHERE entry_id=e.id) AS likes,
    EXISTS(SELECT 1 FROM nookview_likes WHERE entry_id=e.id AND profile_id=v.id) AS liked,
    coalesce(e.profile_id=v.id,0) AS own ${entriesFrom}
    AND (?2 IS NULL OR e.story_id=?2) AND (?3<>'mine' OR e.profile_id=v.id)
    AND (?3<>'favorites' OR (e.profile_id=v.id AND e.favorite=1))
    AND (?3<>'following' OR EXISTS(SELECT 1 FROM follows WHERE follower_id=v.id AND following_id=e.profile_id))
    ORDER BY CASE WHEN ?3='mine' THEN coalesce(e.read_on,e.updated_at) ELSE e.updated_at END DESC,e.id LIMIT 25 OFFSET ?4`,hash,story,scope,page*25);
  },
  async entry(hash:string|null,id:string){return db.prepare(viewer+` SELECT e.id,e.profile_id,e.is_public ${entriesFrom} AND e.id=?2`).bind(hash,id).first<{id:string;profile_id:string;is_public:number}>();},
  async stats(hash:string|null){return db.prepare(viewer+` SELECT count(*) AS total,
   coalesce(sum(reading_status='read'),0) AS finished,coalesce(sum(favorite),0) AS favorites,
   coalesce(sum(body<>''),0) AS reviews,round(avg(stars),1) AS average
   FROM nookview_entries CROSS JOIN v WHERE profile_id=v.id`).bind(hash).first();},
  async saveEntry(hash:string,id:string,data:{story:string;body:string;stars:number|null;status:string;favorite:boolean;spoiler:boolean;readOn:string|null;public:boolean}){
   return run(viewer+` INSERT INTO nookview_entries(id,profile_id,story_id,body,stars,reading_status,favorite,spoiler,read_on,is_public)
    SELECT ?2,v.id,s.id,?4,?5,?6,?7,?8,?9,?10 FROM released_stories s JOIN profiles p ON p.id=s.author_id CROSS JOIN v
    WHERE v.id IS NOT NULL AND s.id=?3 AND ${visible('p')}
    ON CONFLICT(profile_id,story_id) DO UPDATE SET body=excluded.body,stars=excluded.stars,reading_status=excluded.reading_status,
     favorite=excluded.favorite,spoiler=excluded.spoiler,read_on=excluded.read_on,is_public=excluded.is_public,
     updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,hash,id,data.story,data.body,data.stars,data.status,Number(data.favorite),Number(data.spoiler),data.readOn,Number(data.public));
  },
  async deleteEntry(hash:string,id:string){return run(`DELETE FROM nookview_entries WHERE id=?2 AND profile_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)`,hash,id);},
  async likeEntry(hash:string,id:string,like:boolean){
   if(like)return run(viewer+` INSERT INTO nookview_likes(entry_id,profile_id) SELECT e.id,v.id ${entriesFrom}
    AND e.id=?2 AND e.is_public=1 AND v.id IS NOT NULL ON CONFLICT DO NOTHING`,hash,id);
   return run(`DELETE FROM nookview_likes WHERE entry_id=?2 AND profile_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)`,hash,id);
  },
  async providers(hash:string|null){
   const rows=await all<{categories:string;portfolio:string}>(viewer+` SELECT sp.*,p.username,p.display_name,p.avatar_url ${providersFrom}
    ORDER BY CASE sp.availability WHEN 'free' THEN 0 WHEN 'external' THEN 1 ELSE 2 END,sp.updated_at DESC,p.username LIMIT 200`,hash);
   return rows.map(p=>({...p,categories:JSON.parse(p.categories),portfolio:JSON.parse(p.portfolio)}));
  },
  async myProvider(hash:string){const p=await db.prepare(`SELECT * FROM service_profiles WHERE profile_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?)`).bind(hash).first<{categories:string;portfolio:string}>();return p?{...p,categories:JSON.parse(p.categories),portfolio:JSON.parse(p.portfolio)}:null;},
  async saveProvider(hash:string,data:{headline:string;bio:string;categories:string[];availability:string;contact:string;portfolio:object[]}){
   return run(`INSERT INTO service_profiles(profile_id,headline,bio,categories,availability,contact_url,portfolio)
    SELECT profile_id,?2,?3,?4,?5,?6,?7 FROM d1_social_actors WHERE token_hash=?1
    ON CONFLICT(profile_id) DO UPDATE SET headline=excluded.headline,bio=excluded.bio,categories=excluded.categories,
    availability=excluded.availability,contact_url=excluded.contact_url,portfolio=excluded.portfolio,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,hash,data.headline,data.bio,JSON.stringify(data.categories),data.availability,data.contact,JSON.stringify(data.portfolio));
  },
  async requests(hash:string){return all(viewer+` SELECT r.*,provider.username AS provider_username,requester.username AS requester_username,
    coalesce(r.provider_id=v.id,0) AS incoming FROM service_requests r JOIN profiles provider ON provider.id=r.provider_id
    JOIN profiles requester ON requester.id=r.requester_id CROSS JOIN v
    WHERE v.id IN(r.provider_id,r.requester_id) AND ${participant('provider')} AND ${participant('requester')}
    ORDER BY r.updated_at DESC,r.id LIMIT 100`,hash);},
  async createRequest(hash:string,id:string,data:{provider:string;category:string;title:string;brief:string}){
   return run(viewer+` INSERT INTO service_requests(id,provider_id,requester_id,category,title,brief)
    SELECT ?2,sp.profile_id,v.id,?4,?5,?6 ${providersFrom} AND sp.profile_id=?3 AND sp.profile_id<>v.id
    AND v.id IS NOT NULL AND sp.availability='free'
    AND EXISTS(SELECT 1 FROM json_each(sp.categories) WHERE value=?4)
    AND (SELECT count(*) FROM service_requests WHERE requester_id=v.id AND status='pending')<10
    ON CONFLICT DO NOTHING`,hash,id,data.provider,data.category,data.title,data.brief);
  },
  async updateRequest(hash:string,id:string,status:string){
   return run(viewer+` UPDATE service_requests AS r SET status=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM v
    WHERE r.id=?2 AND ((r.provider_id=v.id AND ((r.status='pending' AND ?3 IN('accepted','declined')) OR (r.status='accepted' AND ?3='completed')))
      OR (r.requester_id=v.id AND r.status IN('pending','accepted') AND ?3='cancelled'))
    AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=CASE WHEN r.provider_id=v.id THEN r.requester_id ELSE r.provider_id END AND ${participant('p')})`,hash,id,status);
  },
 };
}
