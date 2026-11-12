import { NextRequest, NextResponse } from "next/server";
import { parseProfileTheme } from '@/lib/profile/themes';
import { createClient } from "@supabase/supabase-js";
import { getPublicStaffBadges } from "@/lib/admin/public-badges";
import { getPublicProfileIds, currentViewerProfileId, isLoadedProfileVisible, canViewerAccessLoadedProfile } from '@/lib/moderation/content-visibility';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Variáveis do Supabase não configuradas.");
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: "Username não informado." },
        { status: 400 }
      );
    }

    const decodedUsername = decodeURIComponent(
      username
    ).trim();

    if (!decodedUsername) {
      return NextResponse.json(
        { error: "Username inválido." },
        { status: 400 }
      );
    }

    // =========================================================
    // 1. PERFIL
    // =========================================================

    const profileQuery = supabase
        .from("profiles")
        .select(
          `
          id,
          user_id,
          username,
          display_name,
          bio,
          avatar_url,
          cover_url,
          avatar_animation,
          cover_animation,
          header_layout,
          avatar_position,
          verified,
          is_official,
          is_private,
          pinned_story_id,
          moderation_hidden_at
          `
        )
        .eq("username", decodedUsername)
        .maybeSingle();
    const [{ data: profile, error: profileError }, viewerId] = await Promise.all([
      profileQuery,
      currentViewerProfileId(supabase),
    ]);

    if (profileError) {
      console.error(
        "Erro ao buscar perfil:",
        profileError
      );

      return NextResponse.json(
        { error: "Erro ao buscar perfil." },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }

    const { user_id: accountId, ...publicProfile } = profile;
    if (!(await isLoadedProfileVisible(supabase, profile, null, true))) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    }

    if (!(await canViewerAccessLoadedProfile(supabase, profile, viewerId))) {
      return NextResponse.json({
        user: { id: profile.id, username: profile.username, display_name: profile.display_name,
          bio: profile.bio, avatar_url: profile.avatar_url, cover_url: profile.cover_url,
          header_layout: profile.header_layout, avatar_position: profile.avatar_position,
          is_private: profile.is_private, verified: profile.verified, is_official: profile.is_official },
        is_self: viewerId === profile.id, restricted: true, stories: [], posts: [], reading_lists: [], fic_clubs: [],
      }, { headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' } });
    }

    const [
      staffBadges, publicTheme,
      { data: stories, error: storiesError },
      { data: posts, error: postsError },
      { data: readingLists, error: readingListsError },
    ] = await Promise.all([
      getPublicStaffBadges(supabase, accountId),
      supabase.from('profile_themes').select('active').eq('user_id', accountId).maybeSingle(),
      supabase
        .from("released_stories")
        .select("*")
        .eq("author_id", profile.id)
        .is("moderation_hidden_at", null)
        .order("updated_at", {
          ascending: false,
        }),
      supabase
        .from("nook_posts")
        .select(
          `
          id,
          user_id,
          body,
          image_url,
          story_id,news_slug,
          pinned,
          created_at,
          updated_at
          `
        )
        .eq("user_id", profile.id)
        .is("moderation_hidden_at", null)
        .order("pinned", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        }),
      supabase
      .from("reading_lists")
      .select(
        `
        id,
        user_id,
        name,
        description,
        is_public,
        created_at
        `
      )
      .eq("user_id", profile.id)
      .eq("is_public", true)
      .order("created_at", {
        ascending: false,
      }),
    ]);

    // =========================================================
    // 2. HISTÓRIAS
    // =========================================================


    if (storiesError) {
      console.error(
        "Erro ao buscar histórias:",
        storiesError
      );

      return NextResponse.json(
        { error: "Erro ao buscar histórias." },
        { status: 500 }
      );
    }

    // =========================================================
    // 3. MURAL
    // =========================================================


    if (postsError) {
      console.error(
        "Erro ao buscar posts:",
        postsError
      );

      return NextResponse.json(
        { error: "Erro ao buscar posts." },
        { status: 500 }
      );
    }

    // =========================================================
    // 4. MÍDIAS DO MURAL
    // =========================================================

    const pinnedStory = profile.pinned_story_id && stories?.find(story => story.id === profile.pinned_story_id);
    const pinnedChapterQuery = pinnedStory
      ? supabase.from('chapters').select('id').eq('story_id', pinnedStory.id).eq('published', true).limit(1).maybeSingle()
      : null;

    if (readingListsError) {
      console.error(
        "Erro ao buscar listas:",
        readingListsError
      );

      return NextResponse.json(
        { error: "Erro ao buscar listas de leitura." },
        { status: 500 }
      );
    }

    async function loadPostMedia() {
      const postIds = (posts || []).map(
        (post) => post.id
      );

      let media: any[] = [];

      if (postIds.length > 0) {
        const {
          data: mediaData,
          error: mediaError,
        } = await supabase
          .from("nook_post_media")
          .select("*")
          .in("post_id", postIds)
          .order("position", {
            ascending: true,
          });

        if (mediaError) {
          console.error(
            "Erro ao buscar mídias:",
            mediaError
          );

          throw new Error("Erro ao buscar mídias dos posts.");
        }

        media = mediaData || [];
      }

      const mediaByPost = new Map<string, typeof media>();
      for (const item of media) {
        const group = mediaByPost.get(item.post_id);
        if (group) group.push(item);
        else mediaByPost.set(item.post_id, [item]);
      }

      const postsWithMedia = (posts || []).map(
        (post) => {
          const postMedia = mediaByPost
            .get(post.id)?.slice(0, 4) ?? [];

          return {
            ...post,
            media: postMedia,
          };
        }
      );

      return postsWithMedia;
    }

    async function loadListStories() {
      const listIds = (readingLists || []).map(
        (list) => list.id
      );

      let readingListItems: any[] = [];

      if (listIds.length > 0) {
        const {
          data: items,
          error: itemsError,
        } = await supabase
          .from("reading_list_items")
          .select(
            `
            id,
            list_id,
            story_id,
            added_at
            `
          )
          .in("list_id", listIds)
          .order("added_at", {
            ascending: false,
          });

        if (itemsError) {
          console.error(
            "Erro ao buscar itens das listas:",
            itemsError
          );

          throw new Error("Erro ao buscar histórias das listas.");
        }

        readingListItems = items || [];
      }

      const listStoryIds = Array.from(
        new Set(
          readingListItems.map(
            (item) => item.story_id
          )
        )
      );

      let listStories: any[] = [];

      if (listStoryIds.length > 0) {
        const {
          data: storiesData,
          error: listStoriesError,
        } = await supabase
          .from("released_stories")
          .select(
            `
            id,
            author_id,
            title,
            description,
            cover_url,
            status,
            rating,
            created_at,
            updated_at
            `
          )
          .in("id", listStoryIds)
          .is("moderation_hidden_at", null);

        if (listStoriesError) {
          console.error(
            "Erro ao buscar histórias das listas:",
            listStoriesError
          );
        } else {
          const visibleAuthorIds = await getPublicProfileIds(
            supabase,
            (storiesData || []).map((story) => story.author_id),
            viewerId,
          );
          listStories = (storiesData || [])
            .filter((story) => visibleAuthorIds.has(story.author_id))
            .map(({ author_id, ...story }) => story);
        }
      }

      const readingListsWithItems =
        (readingLists || []).map((list) => ({
          ...list,
          items: readingListItems
            .filter(
              (item) =>
                item.list_id === list.id
            )
            .map((item) => ({
              ...item,
              story:
                listStories.find(
                  (story) =>
                    story.id ===
                    item.story_id
                ) || null,
            })),
        }));

      return readingListsWithItems;
    }

    async function loadClubs() {
      const {
        data: clubs,
        error: clubsError,
      } = await supabase
        .from("fic_clubs")
        .select(
          `
          id,
          story_id,
          creator_id,
          name,
          description,
          created_at
          `
        )
        .in(
          "story_id",
          (stories || []).map(
            (story) => story.id
          )
        )
        .order("created_at", {
          ascending: false,
        });

      if (clubsError) {
        console.error(
          "Erro ao buscar clubes:",
          clubsError
        );
      }

      const clubRows = clubs || [];

      const clubIds = clubRows.map(
        (club) => club.id
      );

      let memberships: any[] = [];

      if (clubIds.length > 0) {
        const {
          data: members,
          error: membersError,
        } = await supabase
          .from("fic_club_members")
          .select(
            `
            id,
            club_id,
            user_id,
            joined_at
            `
          )
          .in("club_id", clubIds);

        if (membersError) {
          console.error(
            "Erro ao buscar membros dos clubes:",
            membersError
          );
        } else {
          memberships = members || [];
        }
      }

      const participatingClubIds =
        new Set(
          memberships
            .filter(
              (member) =>
                member.user_id ===
                publicProfile.id
            )
            .map(
              (member) =>
                member.club_id
            )
        );

      const clubStories = new Map((stories || []).map(story => [story.id, {
        id: story.id, title: story.title, description: story.description, cover_url: story.cover_url,
        status: story.status, rating: story.rating, created_at: story.created_at, updated_at: story.updated_at,
      }]));

      const ficClubs =
        clubRows
          .filter((club) =>
            participatingClubIds.has(
              club.id
            )
          )
          .map((club) => ({
            ...club,
            member_count:
              memberships.filter(
                (member) =>
                  member.club_id ===
                  club.id
              ).length,
            story:
              clubStories.get(club.story_id) || null,
          }));

      return ficClubs;
    }

    const [postsWithMedia, readingListsWithItems, ficClubs, pinnedChapter] = await Promise.all([
      loadPostMedia(),
      loadListStories(),
      loadClubs(),
      pinnedChapterQuery,
    ]);

    return NextResponse.json({
      restricted: false,
      is_self: viewerId === profile.id,
      user: { ...publicProfile, pinned_story_id: pinnedChapter?.data && pinnedStory ? pinnedStory.id : null, staff_badges: staffBadges },
      theme: parseProfileTheme(publicTheme.data?.active),
      stories: stories || [],
      posts: postsWithMedia,
      reading_lists:
        readingListsWithItems,
      fic_clubs: ficClubs,
    },{headers:{'Cache-Control':'no-store, private',Vary:'Cookie'}});
  } catch (error) {
    console.error(
      "Erro inesperado no perfil público:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno do servidor.",
      },
      { status: 500 }
    );
  }
}
