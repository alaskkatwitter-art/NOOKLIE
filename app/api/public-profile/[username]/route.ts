import { NextRequest, NextResponse } from "next/server";
import { parseProfileTheme } from '@/lib/profile/themes';
import { createClient } from "@supabase/supabase-js";
import { getPublicStaffBadges } from "@/lib/admin/public-badges";
import { getPublicProfileIds, isAccountVisible, currentViewerProfileId, isPublicProfileVisible } from '@/lib/moderation/content-visibility';

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

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select(
          `
          id,
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

    if (!(await isAccountVisible(supabase, profile.id))) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    }

    const viewerId=await currentViewerProfileId(supabase);
    if(!(await isPublicProfileVisible(supabase,profile.id,viewerId))){return NextResponse.json({user:{id:profile.id,username:profile.username,display_name:profile.display_name,bio:profile.bio,avatar_url:profile.avatar_url,cover_url:profile.cover_url,header_layout:profile.header_layout,avatar_position:profile.avatar_position,is_private:profile.is_private,verified:profile.verified,is_official:profile.is_official},restricted:true,stories:[],posts:[],reading_lists:[],fic_clubs:[]},{headers:{'Cache-Control':'no-store, private',Vary:'Cookie'}});}
    const { data: accountIdentity, error: identityError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", profile.id)
      .maybeSingle();

    if (identityError || !accountIdentity?.user_id) {
      console.error("Erro ao buscar identidade do perfil:", identityError);
      return NextResponse.json({ error: "Erro ao buscar perfil." }, { status: 500 });
    }

    const [staffBadges, publicTheme] = await Promise.all([
      getPublicStaffBadges(supabase, accountIdentity.user_id),
      supabase.from('profile_themes').select('active').eq('user_id', accountIdentity.user_id).maybeSingle(),
    ]);

    // =========================================================
    // 2. HISTÓRIAS
    // =========================================================

    const { data: stories, error: storiesError } =
      await supabase
        .from("released_stories")
        .select("*")
        .eq("author_id", profile.id)
        .is("moderation_hidden_at", null)
        .order("updated_at", {
          ascending: false,
        });

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

    const { data: posts, error: postsError } =
      await supabase
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
        });

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

        return NextResponse.json(
          {
            error:
              "Erro ao buscar mídias dos posts.",
          },
          { status: 500 }
        );
      }

      media = mediaData || [];
    }

    const postsWithMedia = (posts || []).map(
      (post) => {
        const postMedia = media
          .filter(
            (item) =>
              item.post_id === post.id
          )
          .slice(0, 4);

        return {
          ...post,
          media: postMedia,
        };
      }
    );

    // =========================================================
    // 5. LISTAS DE LEITURA
    //
    // IMPORTANTE:
    // Só retornamos listas públicas.
    // Mesmo que alguém tente manipular a requisição,
    // o filtro acontece no servidor.
    // =========================================================

    const {
      data: readingLists,
      error: readingListsError,
    } = await supabase
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
      });

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

        return NextResponse.json(
          {
            error:
              "Erro ao buscar histórias das listas.",
          },
          { status: 500 }
        );
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
          (storiesData || []).map((story) => story.author_id)
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

    // =========================================================
    // 6. CLUBES DAS FIC
    //
    // Primeiro encontramos os clubes vinculados
    // às histórias do perfil.
    // Depois descobrimos em quais deles o usuário
    // realmente participa.
    // =========================================================

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
              profile.id
          )
          .map(
            (member) =>
              member.club_id
          )
      );

    const clubStoryIds = Array.from(
      new Set(
        clubRows.map(
          (club) => club.story_id
        )
      )
    );

    let clubStories: any[] = [];

    if (clubStoryIds.length > 0) {
      const {
        data: clubStoriesData,
        error: clubStoriesError,
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
        .in("id", clubStoryIds)
        .is("moderation_hidden_at", null);

      if (!clubStoriesError) {
        const visibleAuthorIds = await getPublicProfileIds(
          supabase,
          (clubStoriesData || []).map((story) => story.author_id)
        );
        clubStories = (clubStoriesData || [])
          .filter((story) => visibleAuthorIds.has(story.author_id))
          .map(({ author_id, ...story }) => story);
      }
    }

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
            clubStories.find(
              (story) =>
                story.id ===
                club.story_id
            ) || null,
        }));

    // =========================================================
    // 7. RESPOSTA
    // =========================================================

    const pinnedStory = profile.pinned_story_id && stories?.find(story => story.id === profile.pinned_story_id);
    const pinnedChapter = pinnedStory
      ? await supabase.from('chapters').select('id').eq('story_id', pinnedStory.id).eq('published', true).limit(1).maybeSingle()
      : null;

    return NextResponse.json({
      restricted:false,
      user: { ...profile, pinned_story_id: pinnedChapter?.data && pinnedStory ? pinnedStory.id : null, staff_badges: staffBadges },
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
