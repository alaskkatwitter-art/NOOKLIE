import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => "20000000-0000-0000-0000-" + String(n).padStart(12, "0");
const rows = async (q, p = []) => (await db.query(q, p)).rows;
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,user_id uuid,username text,display_name text,social_notifications boolean default true);
 create table stories(id uuid primary key,author_id uuid references profiles(id),title text);
 create table chapters(id uuid primary key,story_id uuid references stories(id),published boolean default false,publication_status text default 'draft',original_published_at timestamptz,republished_at timestamptz,updated_at timestamptz);
 create table scheduled_chapters(id uuid primary key default gen_random_uuid(),chapter_id uuid references chapters(id) on delete cascade,scheduled_for timestamptz);
 create table nook_posts(id uuid primary key,user_id uuid references profiles(id));
 create table user_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,notification_type text,title text,body text,href text,source_key text,unique(user_id,source_key));
 create table profile_mutes(user_id uuid,target_id uuid);create table chat_blocks(blocker_id uuid,blocked_id uuid);
 create function social_actor(token text) returns uuid language sql as $$select case token when 'author-token' then '${id(1)}'::uuid when 'reader-token' then '${id(2)}'::uuid else null end$$;
 insert into profiles values('${id(1)}','${id(101)}','author','Autora',true),('${id(2)}','${id(102)}','reader','Leitora',true);
 insert into stories values('${id(3)}','${id(1)}','Uma história');
 insert into chapters(id,story_id) values('${id(4)}','${id(3)}'),('${id(5)}','${id(3)}');
 insert into nook_posts values('${id(6)}','${id(1)}');
 `);
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261103152626_nooklar_reading_and_scheduling.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // The embedded database has no cron daemon; execute the identical application SQL.
  await db.exec(
    migration
      .replace(/create extension if not exists pg_cron;/, "")
      .replace(/select cron.schedule\([^;]+;/, ""),
  );
});
after(() => db.close());
test("reposts have a single author/post identity, actor notifications and no browser grants", async () => {
  await db.exec(
    `insert into nook_reposts(user_id,post_id,comment)values('${id(2)}','${id(6)}','Leiam esta!');`,
  );
  const [notification] = await rows(
    "select actor_id,title,body,href from user_notifications where notification_type='nook_repost'",
  );
  assert.equal(notification.actor_id, id(2));
  assert.equal(
    notification.title,
    "Leitora nooklou seu post com um comentário.",
  );
  assert.equal(notification.body, "");
  assert.equal(notification.href, "/feed?post=" + id(6));
  await assert.rejects(
    db.exec(
      `insert into nook_reposts(user_id,post_id)values('${id(2)}','${id(6)}')`,
    ),
  );
  await assert.rejects(
    db.exec(
      `insert into nook_reposts(user_id,post_id,comment)values('${id(1)}','${id(6)}',' ')`,
    ),
  );
  for (const role of ["anon", "authenticated"])
    for (const verb of ["SELECT", "INSERT", "UPDATE", "DELETE"])
      assert.equal(
        (
          await rows(
            `select has_table_privilege('${role}','nook_reposts','${verb}') ok`,
          )
        )[0].ok,
        false,
      );
});
test("scheduled transitions reject other users, forged sessions and dates in the past atomically", async () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  for (const token of ["reader-token", "forged"])
    await assert.rejects(
      rows("select set_chapter_publication($1,$2,$3,$4)", [
        token,
        id(4),
        "scheduled",
        future,
      ]),
    );
  await assert.rejects(
    rows("select set_chapter_publication($1,$2,$3,$4)", [
      "author-token",
      id(4),
      "scheduled",
      "2020-01-01",
    ]),
  );
  assert.equal(
    (await rows("select count(*)::int n from scheduled_chapters"))[0].n,
    0,
  );
  await rows("select set_chapter_publication($1,$2,$3,$4)", [
    "author-token",
    id(4),
    "scheduled",
    future,
  ]);
  assert.equal(
    (await rows("select published from chapters where id=$1", [id(4)]))[0]
      .published,
    false,
  );
  assert.equal((await rows("select publish_scheduled_chapters() n"))[0].n, 0);
  await rows("select set_chapter_publication($1,$2,$3,$4)", [
    "author-token",
    id(4),
    "scheduled",
    new Date(Date.now() + 7200000).toISOString(),
  ]);
  assert.equal(
    (await rows("select count(*)::int n from scheduled_chapters"))[0].n,
    1,
  );
});
test("only due schedules are released and publication is idempotent; cancellation removes the schedule", async () => {
  await db.exec(
    `update scheduled_chapters set scheduled_for=now()-interval '1 minute' where chapter_id='${id(4)}'`,
  );
  assert.equal((await rows("select publish_scheduled_chapters() n"))[0].n, 1);
  const [chapter] = await rows(
    "select published,publication_status,original_published_at from chapters where id=$1",
    [id(4)],
  );
  assert.equal(chapter.published, true);
  assert.equal(chapter.publication_status, "published");
  assert.ok(chapter.original_published_at);
  assert.equal((await rows("select publish_scheduled_chapters() n"))[0].n, 0);
  await rows("select set_chapter_publication($1,$2,$3,$4)", [
    "author-token",
    id(5),
    "scheduled",
    new Date(Date.now() + 3600000).toISOString(),
  ]);
  await rows("select set_chapter_publication($1,$2,$3)", [
    "author-token",
    id(5),
    "draft",
  ]);
  assert.equal(
    (await rows("select count(*)::int n from scheduled_chapters"))[0].n,
    0,
  );
  assert.equal(
    (await rows("select published from chapters where id=$1", [id(5)]))[0]
      .published,
    false,
  );
});
