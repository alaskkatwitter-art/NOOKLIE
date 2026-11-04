import { NextResponse } from "next/server";
import { chatActor, chatDb, uuid, privateHeaders } from "@/lib/chat/server";
import { isPublicProfileVisible } from "@/lib/moderation/content-visibility";
export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const params = new URL(request.url).searchParams,
      target = params.get("user_id") || "",
      kind = params.get("kind");
    if (!uuid.test(target) || !["followers", "following"].includes(kind || ""))
      return new NextResponse(null, { status: 400 });
    if (!(await isPublicProfileVisible(chatDb, target, actor.profileId)))
      return new NextResponse(null, { status: 404 });
    const offset = Math.max(
      0,
      Math.min(100000, Number(params.get("offset")) || 0),
    );
    const followers = kind === "followers";
    const { data, error } = await chatDb
      .from("follows")
      .select("follower_id,following_id")
      .eq(followers ? "following_id" : "follower_id", target)
      .order(followers ? "follower_id" : "following_id")
      .range(offset, offset + 49);
    if (error) throw error;
    const ids = (data || []).map((r) =>
      followers ? r.follower_id : r.following_id,
    );
    if (!ids.length)
      return NextResponse.json(
        { people: [], next: null },
        { headers: privateHeaders },
      );
    // A private account's basic identity is public; its content remains protected.
    const profiles = await chatDb
      .from("profiles")
      .select("id,user_id,username,display_name,avatar_url, verified, is_official")
      .in("id", ids)
      .is("moderation_hidden_at", null);
    if (profiles.error) throw profiles.error;
    const [accounts, blocks] = await Promise.all([
      chatDb
        .from("auth_accounts")
        .select("id,account_status")
        .in(
          "id",
          (profiles.data || []).map((p) => p.user_id),
        ),
      chatDb
        .from("chat_blocks")
        .select("blocker_id,blocked_id")
        .or(
          `blocker_id.eq.${actor.profileId},blocked_id.eq.${actor.profileId}`,
        ),
    ]);
    if (accounts.error || blocks.error) throw accounts.error || blocks.error;
    const suspended = new Set(
      (accounts.data || [])
        .filter((a) => a.account_status === "suspended")
        .map((a) => a.id),
    );
    const blocked = new Set(
      (blocks.data || []).map((b) =>
        b.blocker_id === actor.profileId ? b.blocked_id : b.blocker_id,
      ),
    );
    const people = (profiles.data || [])
      .filter((p) => !suspended.has(p.user_id) && !blocked.has(p.id))
      .map(({ user_id: _accountId, ...p }) => p);
    return NextResponse.json(
      { people, next: data?.length === 50 ? offset + 50 : null },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar a lista." },
      { status: 503, headers: privateHeaders },
    );
  }
}
