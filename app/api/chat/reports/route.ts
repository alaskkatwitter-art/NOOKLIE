import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Auth } from '@/lib/database/d1-auth';
import { d1Chat } from '@/lib/database/d1-chat';
import { d1Permissions } from '@/lib/database/d1-permissions';
import { d1Moderation } from '@/lib/database/d1-moderation';
import type { NooklieD1 } from '@/lib/database/d1';
import { NextResponse } from "next/server";
import { rateLimitKey } from "@/lib/security/rate-key";
import {
  chatActor,
  chatDb,
  allowedThread,
  privateHeaders,
  uuid,
  sameOrigin,
} from "@/lib/chat/server";
import { moderationStaff } from "@/lib/moderation/staff";
import { chatCipherVersion, decodeChatBody, decryptChat } from "@/lib/chat/crypto";
async function d1ChatModerator(db:NooklieD1, manage=false) {
  const actor = await d1FollowActor(db);
  if (!actor) return null;
  const department = await db.prepare("SELECT id FROM departments WHERE slug='moderacao' AND status='active'")
    .first<{id:string}>();
  if (!department) return null;
  const permissions = d1Permissions(db);
  const allowed = await permissions.hasPermission(actor.hash,'moderation.manage',department.id) ||
    (!manage && await permissions.hasPermission(actor.hash,'moderation.view',department.id));
  return allowed ? actor : null;
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const db = getD1PreviewDatabase('auth');
    const preview = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!actor && !preview) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 4000) return new NextResponse(null, { status: 400 });
    const b = JSON.parse(raw);
    if (
      !uuid.test(b.thread_id || "") ||
      (b.message_id && !uuid.test(b.message_id)) ||
      typeof b.reason !== "string" ||
      b.reason.trim().length < 3 ||
      b.reason.length > 2000
    )
      return new NextResponse(null, { status: 400 });
    if (db && preview) {
      const chat = d1Chat(db,chatCipherVersion());
      const threadId = b.thread_id.toLowerCase();
      const messageId = b.message_id ? b.message_id.toLowerCase() : null;
      const thread = await chat.thread(preview.hash,threadId);
      if (!thread || (messageId && thread.kind==='group' && thread.member_status!=='accepted')) {
        return new NextResponse(null,{status:404});
      }
      if (messageId && !await db.prepare(`SELECT id FROM chat_messages WHERE id=? AND thread_id=?
        AND cipher_version=? AND revoked_at IS NULL`).bind(messageId,threadId,chatCipherVersion()).first()) {
        return new NextResponse(null,{status:404});
      }
      if (!await d1Auth(db).consumeRateLimit(rateLimitKey('chat-report',preview.id),10,3600)) {
        return new NextResponse(null,{status:429});
      }
      const saved = await chat.report(preview.hash,crypto.randomUUID(),threadId,messageId,b.reason);
      return saved ? NextResponse.json({reported:true},{status:201,headers:privateHeaders})
        : new NextResponse(null,{status:404});
    }
    if (!actor) return new NextResponse(null,{status:401});
    const thread = await allowedThread(actor.profileId, b.thread_id);
    if (
      !thread ||
      (b.message_id && thread.kind === "group" && thread.status !== "accepted")
    )
      return new NextResponse(null, { status: 404 });
    if (b.message_id) {
      const m = await chatDb
        .from("chat_messages")
        .select("id")
        .eq("id", b.message_id)
        .is("revoked_at", null)
        .eq("thread_id", b.thread_id)
        .eq("cipher_version", chatCipherVersion())
        .maybeSingle();
      if (m.error) throw m.error;
      if (!m.data) return new NextResponse(null, { status: 404 });
    }
    const rate = await chatDb.rpc("consume_auth_rate_limit", {
      p_key_hash: rateLimitKey("chat-report", actor.profileId),
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (rate.error || !rate.data)
      return new NextResponse(null, { status: 429 });
    const result = await chatDb
      .from("chat_reports")
      .insert({
        reporter_id: actor.profileId,
        thread_id: b.thread_id,
        message_id: b.message_id || null,
        reason: b.reason.trim(),
      });
    if (result.error) throw result.error;
    return NextResponse.json(
      { reported: true },
      { status: 201, headers: privateHeaders },
    );
  } catch {
    return new NextResponse(null, { status: 503, headers: privateHeaders });
  }
}
export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const staff = await d1ChatModerator(db);
      if (!staff) return new NextResponse(null,{status:403,headers:privateHeaders});
      const selected = await db.prepare('SELECT id,created_at FROM chat_reports ORDER BY julianday(created_at) DESC,id LIMIT 100')
        .all<{id:string;created_at:string}>();
      if (!selected.success) throw Error('Chat reports unavailable');
      if (!selected.results.length) return NextResponse.json({reports:[]},{headers:privateHeaders});
      const evidenceRows = await d1Moderation(db).readChatEvidence(staff.hash,crypto.randomUUID(),selected.results.map(r=>r.id));
      type Snapshot = {id:string;sender_id:string;body_cipher:string;thread_id:string;created_at:string;media_type:string|null;cipher_version:number};
      const rows = new Map(evidenceRows.map(row=>[row.id,row]));
      const reports = selected.results.flatMap(({id,created_at})=>{
        const row = rows.get(id);
        if (!row) return [];
        const {message_snapshot,...report} = row;
        const snapshot = typeof message_snapshot==='string' ? JSON.parse(message_snapshot) as Snapshot : null;
        const evidence = snapshot?.cipher_version===chatCipherVersion() ? {
          id:snapshot.id,sender_id:snapshot.sender_id,
          body:decryptChat(decodeChatBody(snapshot.body_cipher),`${snapshot.thread_id}:${snapshot.id}:body`).toString('utf8'),
          has_attachment:Boolean(snapshot.media_type),created_at:snapshot.created_at,
        } : null;
        return [{...report,id,reporter_id:String(report.reporter_id),created_at,evidence}];
      });
      const ids = [...new Set(evidenceRows.map(r=>r.reporter_id)
        .concat(reports.map(r=>r.evidence?.sender_id)).filter(id=>typeof id==='string'))];
      const identities = await db.prepare('SELECT id,username,display_name FROM profiles WHERE id IN(SELECT value FROM json_each(?))')
        .bind(JSON.stringify(ids)).all<{id:string;username:string;display_name:string|null}>();
      if (!identities.success) throw Error('Chat report identities unavailable');
      const profiles = new Map(identities.results.map(p=>[p.id,p]));
      return NextResponse.json({reports:reports.map(r=>({...r,
        reporter:profiles.get(r.reporter_id) ?? null,
        target:r.evidence ? profiles.get(r.evidence.sender_id) ?? null : null,
      }))},{headers:privateHeaders});
    }
    const actor = await chatActor(),
      staff = await moderationStaff();
    if (!actor || !staff)
      return new NextResponse(null, { status: 403, headers: privateHeaders });
    const reports = await chatDb
      .from("chat_reports")
      .select("id,reporter_id,thread_id,message_id,reason,created_at,status,message_snapshot")
      .order("created_at", { ascending: false })
      .limit(100);
    if (reports.error) throw reports.error;
    // Only the message explicitly selected by its participant is shared. No conversation export.
    const result = [];
    for (const { message_snapshot: snapshot, ...report } of reports.data || []) {
      const evidence = snapshot?.cipher_version === chatCipherVersion() ? {
        id: snapshot.id,
        sender_id: snapshot.sender_id,
        body: decryptChat(
          decodeChatBody(snapshot.body_cipher),
          `${snapshot.thread_id}:${snapshot.id}:body`,
        ).toString("utf8"),
        has_attachment: Boolean(snapshot.media_type),
        created_at: snapshot.created_at,
      } : null;
      result.push({ ...report, evidence });
    }
    const profileIds = [
      ...new Set(
        result
          .flatMap((r) => [r.reporter_id, r.evidence?.sender_id])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const identities = profileIds.length
      ? await chatDb
          .from("profiles")
          .select("id,username,display_name")
          .in("id", profileIds)
      : { data: [], error: null };
    if (identities.error) throw identities.error;
    const identified = result.map((r) => ({
      ...r,
      reporter: identities.data?.find((p) => p.id === r.reporter_id) || null,
      target: r.evidence
        ? identities.data?.find((p) => p.id === r.evidence?.sender_id) || null
        : null,
    }));
    const audit = await chatDb
      .from("chat_audit_access")
      .insert({
        admin_user_id: staff.userId,
        report_ids: result.map((r) => r.id),
      });
    if (audit.error) throw audit.error;
    return NextResponse.json(
      { reports: identified },
      { headers: privateHeaders },
    );
  } catch {
    return new NextResponse(null, { status: 503, headers: privateHeaders });
  }
}
export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const db = getD1PreviewDatabase('auth');
    const preview = db ? await d1ChatModerator(db,true) : null;
    if (db ? !preview : !(await chatActor()) || !(await moderationStaff('moderation.manage'))) {
      return new NextResponse(null,{status:403});
    }
    const raw = await request.text();
    if (raw.length > 100) return new NextResponse(null, { status: 400 });
    const b = JSON.parse(raw);
    if (!uuid.test(b.id || "")) return new NextResponse(null, { status: 400 });
    if (db && preview) {
      const result = await db.prepare(`UPDATE chat_reports SET status='reviewed' WHERE id=?2 AND EXISTS(
        SELECT 1 FROM d1_mod_actor a JOIN departments d ON d.slug='moderacao' AND d.status='active'
        WHERE a.token_hash=?1 AND (a.is_root OR EXISTS(SELECT 1 FROM d1_mod_grants g
          WHERE g.token_hash=a.token_hash AND g.department_id=d.id AND g.code='moderation.manage')))`)
        .bind(preview.hash,b.id.toLowerCase()).run();
      if (!result.success) throw Error('Chat report update failed');
      return NextResponse.json({reviewed:true},{headers:privateHeaders});
    }
    const r = await chatDb
      .from("chat_reports")
      .update({ status: "reviewed" })
      .eq("id", b.id);
    if (r.error) throw r.error;
    return NextResponse.json({ reviewed: true }, { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
