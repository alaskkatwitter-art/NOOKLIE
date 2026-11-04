import { visibleReposts } from '@/lib/social/posts';
import {hiddenFeedProfiles} from '@/lib/moderation/feed-controls';
import { NextResponse } from 'next/server';
import { currentViewerProfileId } from '@/lib/moderation/content-visibility';
import { createClient } from '@supabase/supabase-js';
import { getPublicProfileIds } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const ALLOWED_REACTIONS = [
  '❤️',
  '😂',
  '😭',
  '😱',
  '👀',
  '🔥',
];


export async function GET() {
  try {
    const userId = await currentViewerProfileId(supabase);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Não autenticado.',
        },
        { status: 401 }
      );
    }

    /*
     * Busca TODOS os posts.
     *
     * O Feed é global, então não filtramos
     * pelo usuário atual.
     */
    const {
      data: rawPosts,
      error: postsError,
    } = await supabase
      .from('nook_posts')
      .select(`
        id,
        user_id,
        body,
        image_url,
        story_id,
        pinned,
        created_at,
        updated_at,
        moderation_hidden_at
      `)
      .is('moderation_hidden_at', null)
      .order('created_at', {
        ascending: false,
      });

    if (postsError) {
      console.error(
        'ERRO AO BUSCAR FEED:',
        postsError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar o Feed.',
        },
        { status: 500 }
      );
    }

    const visibleProfileIds = await getPublicProfileIds(
      supabase,
      (rawPosts || []).map((post) => post.user_id)
    );
    const hiddenProfiles=await hiddenFeedProfiles();
    const posts = (rawPosts || []).filter(
      (post) =>
        !post.moderation_hidden_at && !hiddenProfiles.has(post.user_id) &&
        visibleProfileIds.has(post.user_id)
    );

    if (!posts || posts.length === 0) {
      return NextResponse.json({
        posts: [],
      });
    }

    const postIds = posts.map(
      (post) => post.id
    );

    const authorIds = [
      ...new Set(
        posts.map(
          (post) => post.user_id
        )
      ),
    ];

    /*
     * Busca autores.
     */
    const {
      data: profiles,
      error: profilesError,
    } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, avatar_url'
      )
      .in('id', authorIds);

    if (profilesError) {
      console.error(
        'ERRO AO BUSCAR AUTORES DO FEED:',
        profilesError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar os autores.',
        },
        { status: 500 }
      );
    }

    /*
     * Busca mídias.
     */
    const {
      data: media,
      error: mediaError,
    } = await supabase
      .from('nook_post_media')
      .select(`
        id,
        post_id,
        media_url,
        media_type,
        created_at
      `)
      .in('post_id', postIds)
      .order('created_at', {
        ascending: true,
      });

    if (mediaError) {
      console.error(
        'ERRO AO BUSCAR MÍDIAS DO FEED:',
        mediaError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar as mídias.',
        },
        { status: 500 }
      );
    }

    /*
     * Busca reações.
     */
    const {
      data: reactions,
      error: reactionsError,
    } = await supabase
      .from('nook_post_reactions')
      .select(`
        id,
        post_id,
        user_id,
        emoji
      `)
      .in('post_id', postIds);

    if (reactionsError) {
      console.error(
        'ERRO AO BUSCAR REAÇÕES DO FEED:',
        reactionsError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar as reações.',
        },
        { status: 500 }
      );
    }

    /*
     * Busca comentários apenas para
     * saber a quantidade.
     */
    const {
      data: comments,
      error: commentsError,
    } = await supabase
      .from('nook_comments')
      .select('id, post_id')
      .in('post_id', postIds);

    if (commentsError) {
      console.error(
        'ERRO AO BUSCAR COMENTÁRIOS DO FEED:',
        commentsError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar os comentários.',
        },
        { status: 500 }
      );
    }

    /*
     * Busca posts salvos pelo usuário atual.
     */
    const {
      data: savedPosts,
      error: savedError,
    } = await supabase
      .from('nook_saved_posts')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds);

    if (savedError) {
      console.error(
        'ERRO AO BUSCAR POSTS SALVOS:',
        savedError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível carregar os posts salvos.',
        },
        { status: 500 }
      );
    }

    const savedPostIds = new Set(
      (savedPosts || []).map(
        (item) => item.post_id
      )
    );

    /*
     * Monta posts enriquecidos.
     */
    const enrichedPosts = posts.map(
      (post) => {
        const postReactions =
          (reactions || []).filter(
            (reaction) =>
              reaction.post_id === post.id
          );

        const postComments =
          (comments || []).filter(
            (comment) =>
              comment.post_id === post.id
          );

        const postMedia =
          (media || []).filter(
            (item) =>
              item.post_id === post.id
          );

        const reactionCounts: Record<
          string,
          number
        > = {};

        for (const emoji of ALLOWED_REACTIONS) {
          reactionCounts[emoji] =
            postReactions.filter(
              (reaction) =>
                reaction.emoji === emoji
            ).length;
        }

        const userReactions =
          postReactions
            .filter(
              (reaction) =>
                reaction.user_id === userId
            )
            .map(
              (reaction) =>
                reaction.emoji
            );

        return {
          ...post,

          author:
            (profiles || []).find(
              (profile) =>
                profile.id === post.user_id
            ) || null,

          media: postMedia,

          reaction_counts:
            reactionCounts,

          user_reactions:
            userReactions,

          comments_count:
            postComments.length,

          saved:
            savedPostIds.has(post.id),
        };
      }
    );

    const republications=await visibleReposts(undefined,undefined,userId);
    const reposts=await Promise.all(republications.map(async repost=>{
      if(hiddenProfiles.has(repost.user_id))return null;
      const original=enrichedPosts.find(p=>p.id===repost.post_id);
      if(!original||hiddenProfiles.has(original.user_id))return null;
      return {...original,repost};
    }));
    const timeline=[
      ...enrichedPosts.map(post=>({post,time:post.created_at})),
      ...reposts.filter((p):p is NonNullable<typeof p>=>p!==null).map(post=>({post,time:post.repost.created_at})),
    ].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).map(entry=>entry.post);
    return NextResponse.json({posts:timeline}, {headers:{'Cache-Control':'no-store, private'}});
  } catch (error) {
    console.error(
      'ERRO GERAL NO FEED:',
      error
    );

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      { status: 500 }
    );
  }
          }
