import { chatDb } from "@/lib/chat/server";
import { getPublicProfileIds } from "@/lib/moderation/content-visibility";
import { hiddenFeedProfiles } from "@/lib/moderation/feed-controls";

// Batch the entire selection so a profile with many republications does not
// perform a separate author, media, reaction and comment lookup for every card.
export async function visiblePosts(ids: string[], viewer: string | null) {
  if (!ids.length) return [];
  const result = await chatDb
    .from("nook_posts")
    .select("id,user_id,body,image_url,story_id,pinned,created_at,updated_at")
    .in("id", [...new Set(ids)])
    .is("moderation_hidden_at", null);
  if (result.error) throw result.error;
  const authorIds = [...new Set((result.data || []).map((p) => p.user_id))];
  const visible = await getPublicProfileIds(chatDb, authorIds);
  const posts = (result.data || []).filter((p) => visible.has(p.user_id));
  if (!posts.length) return [];
  const postIds = posts.map((p) => p.id);
  const [authors, media, reactions, comments, saved] = await Promise.all([
    chatDb
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", authorIds),
    chatDb
      .from("nook_post_media")
      .select("id,post_id,media_url,media_type,created_at")
      .in("post_id", postIds)
      .order("created_at"),
    chatDb
      .from("nook_post_reactions")
      .select("post_id,user_id,emoji")
      .in("post_id", postIds),
    chatDb.from("nook_comments").select("id,post_id").in("post_id", postIds),
    viewer
      ? chatDb
          .from("nook_saved_posts")
          .select("post_id")
          .in("post_id", postIds)
          .eq("user_id", viewer)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [authors, media, reactions, comments, saved])
    if (r.error) throw r.error;
  const authorsById = new Map((authors.data || []).map((a) => [a.id, a]));
  const savedIds = new Set((saved.data || []).map((s) => s.post_id));
  return posts.map((post) => {
    const counts: Record<string, number> = {};
    const selected = (reactions.data || []).filter(
      (r) => r.post_id === post.id,
    );
    for (const r of selected) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    return {
      ...post,
      author: authorsById.get(post.user_id) || null,
      media: (media.data || []).filter((m) => m.post_id === post.id),
      reaction_counts: counts,
      user_reactions: selected
        .filter((r) => r.user_id === viewer)
        .map((r) => r.emoji),
      comments_count: (comments.data || []).filter((c) => c.post_id === post.id)
        .length,
      saved: savedIds.has(post.id),
    };
  });
}
export async function visiblePost(id: string, viewer: string | null) {
  return (await visiblePosts([id], viewer))[0] || null;
}
export async function visibleReposts(
  postId?: string,
  profileId?: string,
  viewer?: string,
) {
  let query = chatDb
    .from("nook_reposts")
    .select("id,user_id,post_id,comment,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (postId) query = query.eq("post_id", postId);
  if (profileId) query = query.eq("user_id", profileId);
  const { data, error } = await query;
  if (error) throw error;
  const ids = [...new Set((data || []).map((r) => r.user_id))];
  if (!ids.length) return [];
  const [profiles, visible, hidden] = await Promise.all([
    chatDb
      .from("profiles")
      .select("id,username,display_name,avatar_url,reposts_private")
      .in("id", ids),
    getPublicProfileIds(chatDb, ids),
    hiddenFeedProfiles(),
  ]);
  if (profiles.error) throw profiles.error;
  const authors = new Map(
    (profiles.data || [])
      .filter(
        (p) =>
          visible.has(p.id) &&
          !hidden.has(p.id) &&
          (!p.reposts_private || p.id === viewer),
      )
      .map((p) => [p.id, p]),
  );
  return (data || [])
    .filter((r) => authors.has(r.user_id))
    .map((r) => ({ ...r, author: authors.get(r.user_id)! }));
}
