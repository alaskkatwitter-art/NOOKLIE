import { chatActor, chatDb } from "@/lib/chat/server";
export async function hiddenFeedProfiles() {
  const actor = await chatActor();
  if (!actor) return new Set<string>();
  const [mutes, blocks] = await Promise.all([
    chatDb
      .from("profile_mutes")
      .select("target_id")
      .eq("user_id", actor.profileId),
    chatDb
      .from("chat_blocks")
      .select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${actor.profileId},blocked_id.eq.${actor.profileId}`),
  ]);
  if (mutes.error || blocks.error) throw mutes.error || blocks.error;
  return new Set([
    ...(mutes.data || []).map((m) => m.target_id),
    ...(blocks.data || []).map((b) =>
      b.blocker_id === actor.profileId ? b.blocked_id : b.blocker_id,
    ),
  ]);
}
