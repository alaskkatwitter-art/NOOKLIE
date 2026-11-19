import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Moderation } from '@/lib/database/d1-moderation';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Auth } from '@/lib/database/d1-auth';
import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  privateHeaders,
  sameOrigin,
} from "@/lib/chat/server";
import { rateLimitKey } from "@/lib/security/rate-key";
export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const actor = await d1FollowActor(db);
      if (!actor) return new NextResponse(null, { status: 401 });
      return NextResponse.json({ tickets: await d1Moderation(db).myTickets(actor.hash) }, { headers: privateHeaders });
    }
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const r = await chatDb
      .from("support_tickets")
      .select(
        "id,category,subject,details,status,response,created_at,updated_at",
      )
      .eq("reporter_id", actor.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (r.error) throw r.error;
    return NextResponse.json({ tickets: r.data }, { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!d1Actor && !actor) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 7000) return new NextResponse(null, { status: 400 });
    const b = JSON.parse(raw);
    if (
      !["help", "feedback", "safety", "appeal"].includes(b.category) ||
      typeof b.subject !== "string" ||
      b.subject.trim().length < 3 ||
      b.subject.length > 120 ||
      typeof b.details !== "string" ||
      b.details.trim().length < 10 ||
      b.details.length > 5000 ||
      (b.target_username && !/^[a-z0-9_]{3,30}$/.test(b.target_username))
    )
      return NextResponse.json(
        { error: "Confira o assunto, o relato e o username informado." },
        { status: 400 },
      );
    if (db && d1Actor) {
      const account = await db.prepare('SELECT user_id FROM d1_social_actors WHERE token_hash=?')
        .bind(d1Actor.hash).first<{ user_id: string }>();
      if (!account) return new NextResponse(null, { status: 401 });
      if (!await d1Auth(db).consumeRateLimit(rateLimitKey('support', account.user_id), 10, 3600)) {
        return new NextResponse(null, { status: 429 });
      }
      if (b.target_username && !await db.prepare('SELECT user_id FROM profiles WHERE username=?')
        .bind(b.target_username).first()) {
        return NextResponse.json({ error: 'Esse username não foi encontrado.' }, { status: 400 });
      }
      const ticket = await d1Moderation(db).submitTicket(d1Actor.hash, crypto.randomUUID(),
        b.category, b.subject, b.details, b.target_username || null);
      if (!ticket) throw new Error('Support ticket unavailable');
      return NextResponse.json(ticket, { status: 201, headers: privateHeaders });
    }
    if (!actor) return new NextResponse(null, { status: 401 });
    const rate = await chatDb.rpc("consume_auth_rate_limit", {
      p_key_hash: rateLimitKey("support", actor.userId),
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (rate.error) throw rate.error;
    if (!rate.data) return new NextResponse(null, { status: 429 });
    let target: string | null = null;
    if (b.target_username) {
      const r = await chatDb
        .from("profiles")
        .select("user_id")
        .eq("username", b.target_username)
        .maybeSingle();
      if (r.error) throw r.error;
      if (!r.data)
        return NextResponse.json(
          { error: "Esse username não foi encontrado." },
          { status: 400 },
        );
      target = r.data.user_id;
    }
    const dept = await chatDb
      .from("departments")
      .select("id")
      .eq("slug", "moderacao")
      .eq("status", "active")
      .single();
    if (dept.error) throw dept.error;
    const result = await chatDb
      .from("support_tickets")
      .insert({
        reporter_id: actor.userId,
        target_user_id: target,
        department_id: dept.data.id,
        category: b.category,
        subject: b.subject.trim(),
        details: b.details.trim(),
      })
      .select("id")
      .single();
    if (result.error) throw result.error;
    return NextResponse.json(
      { id: result.data.id },
      { status: 201, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível enviar seu relato." },
      { status: 503, headers: privateHeaders },
    );
  }
}
