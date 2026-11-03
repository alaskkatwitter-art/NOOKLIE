import { getAuthenticatedUserContext } from "@/lib/auth/session";
import { discoveryDb, privateHeaders, uuid } from "@/lib/discovery/server";
export { discoveryDb as chatDb, privateHeaders, uuid };
export async function chatActor() {
  const auth = await getAuthenticatedUserContext();
  if (!auth) return null;
  const { data, error } = await discoveryDb.rpc("social_actor", {
    p_session: auth.sessionTokenHash,
  });
  if (error) throw error;
  if (!data) return null;
  return { ...auth, profileId: data as string };
}
export async function allowedThread(actorId: string, threadId: string) {
  if (!uuid.test(threadId)) return null;
  const { data, error } = await discoveryDb
    .from("chat_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.kind === "group") {
    const member = await discoveryDb
      .from("chat_group_members")
      .select("status")
      .eq("thread_id", threadId)
      .eq("profile_id", actorId)
      .maybeSingle();
    if (member.error) throw member.error;
    if (!member.data) return null;
    const [roster, blocks] = await Promise.all([
      discoveryDb
        .from("chat_group_members")
        .select("profile_id")
        .eq("thread_id", threadId)
        .eq("status", "accepted"),
      discoveryDb
        .from("chat_blocks")
        .select("blocker_id,blocked_id")
        .or(`blocker_id.eq.${actorId},blocked_id.eq.${actorId}`),
    ]);
    if (roster.error || blocks.error) throw roster.error || blocks.error;
    const peers = new Set((roster.data || []).map((m) => m.profile_id));
    const relevant = (blocks.data || []).filter((b) =>
      peers.has(b.blocker_id === actorId ? b.blocked_id : b.blocker_id),
    );
    return {
      ...data,
      status: member.data.status,
      blocked: relevant.length > 0,
      blocked_by_me: relevant.some((b) => b.blocker_id === actorId),
    };
  }
  if (data.initiator_id !== actorId && data.recipient_id !== actorId)
    return null;
  const peer =
    data.initiator_id === actorId ? data.recipient_id : data.initiator_id;
  const blocks = await discoveryDb
    .from("chat_blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${actorId},blocked_id.eq.${peer}),and(blocker_id.eq.${peer},blocked_id.eq.${actorId})`,
    );
  if (blocks.error) throw blocks.error;
  return {
    ...data,
    blocked: Boolean(blocks.data?.length),
    blocked_by_me: blocks.data?.some((b) => b.blocker_id === actorId) ?? false,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
