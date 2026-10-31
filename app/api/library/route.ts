import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getPublicProfileIds, isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function getCurrentProfileId() {
  try {
    const cookieStore = await cookies();
    const sessionToken =
      cookieStore.get('toriland_session')?.value;

    if (!sessionToken) {
      return null;
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { data: session, error } =
      await supabase
        .from('auth_sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

    if (error || !session) {
      return null;
    }

    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() <=
        Date.now()
    ) {
      return null;
    }

    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', session.user_id)
        .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    return profile.id;
  } catch {
    return null;
  }
}

/*
 * GET
 *
 * Carrega as histórias salvas na Biblioteca.
 */
export async function GET() {
  try {
    const profileId =
      await getCurrentProfileId();

    if (!profileId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado para acessar sua biblioteca.',
        },
        { status: 401 }
      );
    }

    const { data: lists, error: listsError } =
      await supabase
        .from('reading_lists')
        .select('id, name, description, is_public, created_at')
        .eq('user_id', profileId)
        .order('created_at', {
          ascending: true,
        });

    if (listsError) {
      console.error(
        'ERRO AO BUSCAR LISTAS:',
        listsError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar sua biblioteca.',
        },
        { status: 500 }
      );
    }

    if (!lists?.length) {
      return NextResponse.json({
        items: [],
      });
    }

    const listIds = lists.map(
      (list) => list.id
    );

    const { data: items, error: itemsError } =
      await supabase
        .from('reading_list_items')
        .select(
          'id, list_id, story_id, added_at'
        )
        .in('list_id', listIds)
        .order('added_at', {
          ascending: false,
        });

    if (itemsError) {
      console.error(
        'ERRO AO BUSCAR ITENS DA BIBLIOTECA:',
        itemsError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os itens da biblioteca.',
        },
        { status: 500 }
      );
    }

    const storyIds = Array.from(
      new Set(
        (items || [])
          .map((item) => item.story_id)
          .filter(Boolean)
      )
    );

    if (!storyIds.length) {
      return NextResponse.json({
        items: [],
      });
    }

    const { data: stories, error: storiesError } =
      await supabase
        .from('stories')
        .select(
          'id, author_id, title, description, cover_url, status, rating, created_at, updated_at'
        )
        .in('id', storyIds)
        .is('moderation_hidden_at', null);

    if (storiesError) {
      console.error(
        'ERRO AO BUSCAR HISTÓRIAS DA BIBLIOTECA:',
        storiesError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar as histórias da biblioteca.',
        },
        { status: 500 }
      );
    }

    const visibleProfileIds = await getPublicProfileIds(
      supabase,
      (stories || []).map((story) => story.author_id)
    );
    const visibleStories = (stories || []).filter((story) =>
      visibleProfileIds.has(story.author_id)
    );

    const authorIds = Array.from(
      new Set(
        visibleStories
          .map((story) => story.author_id)
          .filter(Boolean)
      )
    );

    let authors: any[] = [];

    if (authorIds.length) {
      const { data: authorRows } =
        await supabase
          .from('profiles')
          .select(
            'id, username, display_name, avatar_url, verified'
          )
          .in('id', authorIds);

      authors = authorRows || [];
    }

    const authorMap = new Map(
      authors.map((author) => [
        author.id,
        author,
      ])
    );

    const storyMap = new Map(
      visibleStories.map((story) => [
        story.id,
        story,
      ])
    );

    const listMap = new Map(
      lists.map((list) => [
        list.id,
        list,
      ])
    );

    /*
     * Uma história pode estar em mais de uma
     * lista. Para a Biblioteca principal,
     * mantemos apenas a primeira ocorrência.
     */
    const seenStories = new Set<string>();

    const normalizedItems = [];

    for (const item of items || []) {
      if (seenStories.has(item.story_id)) {
        continue;
      }

      const story = storyMap.get(
        item.story_id
      );

      if (!story) {
        continue;
      }

      seenStories.add(item.story_id);

      const list = listMap.get(
        item.list_id
      );

      normalizedItems.push({
        id: item.id,
        list_id: item.list_id,
        list_name:
          list?.name || 'Biblioteca',
        story_id: story.id,
        story_title: story.title,
        title: story.title,
        description: story.description,
        cover_url: story.cover_url,
        story_cover_url: story.cover_url,
        status: story.status,
        rating: story.rating,
        author:
          authorMap.get(
            story.author_id
          ) || null,
        author_username:
          authorMap.get(
            story.author_id
          )?.username || null,
        author_display_name:
          authorMap.get(
            story.author_id
          )?.display_name || null,
        added_at: item.added_at,
        created_at: story.created_at,
        updated_at: story.updated_at,
      });
    }

    return NextResponse.json({
      items: normalizedItems,
    });
  } catch (error) {
    console.error(
      'GET /api/library:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao carregar a biblioteca.',
      },
      { status: 500 }
    );
  }
}

/*
 * POST
 *
 * Adiciona uma história à Biblioteca.
 *
 * Body:
 * {
 *   story_id: "..."
 * }
 */
export async function POST(
  request: Request
) {
  try {
    const profileId =
      await getCurrentProfileId();

    if (!profileId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado para salvar uma história.',
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const storyId = body?.story_id;

    if (
      typeof storyId !== 'string' ||
      !storyId.trim()
    ) {
      return NextResponse.json(
        {
          error:
            'story_id é obrigatório.',
        },
        { status: 400 }
      );
    }

    /*
     * Confirma que a história existe.
     */
    const { data: story, error: storyError } =
      await supabase
        .from('stories')
        .select('id, author_id')
        .eq('id', storyId)
        .maybeSingle();

    if (storyError) {
      console.error(
        'ERRO AO PROCURAR HISTÓRIA:',
        storyError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível encontrar a história.',
        },
        { status: 500 }
      );
    }

    if (!story || !(await isPublicStoryVisible(supabase, storyId))) {
      return NextResponse.json(
        {
          error: 'História não encontrada.',
        },
        { status: 404 }
      );
    }

    /*
     * Procura a lista principal "Biblioteca".
     */
    let { data: libraryList } =
      await supabase
        .from('reading_lists')
        .select('id, name')
        .eq('user_id', profileId)
        .eq('name', 'Biblioteca')
        .limit(1)
        .maybeSingle();

    /*
     * Se ainda não existir, cria.
     */
    if (!libraryList) {
      const { data: createdList, error: createError } =
        await supabase
          .from('reading_lists')
          .insert({
            user_id: profileId,
            name: 'Biblioteca',
            description:
              'Histórias salvas para ler.',
            is_public: false,
          })
          .select('id, name')
          .single();

      if (createError || !createdList) {
        console.error(
          'ERRO AO CRIAR BIBLIOTECA:',
          createError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível criar sua biblioteca.',
          },
          { status: 500 }
        );
      }

      libraryList = createdList;
    }

    /*
     * Verifica se já está salva.
     */
    const { data: existingItem } =
      await supabase
        .from('reading_list_items')
        .select('id')
        .eq('list_id', libraryList.id)
        .eq('story_id', storyId)
        .maybeSingle();

    if (existingItem) {
      return NextResponse.json({
        saved: true,
        already_saved: true,
        story_id: storyId,
      });
    }

    const { data: insertedItem, error: insertError } =
      await supabase
        .from('reading_list_items')
        .insert({
          list_id: libraryList.id,
          story_id: storyId,
        })
        .select('id, list_id, story_id, added_at')
        .single();

    if (insertError) {
      console.error(
        'ERRO AO SALVAR HISTÓRIA:',
        insertError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível adicionar a história à biblioteca.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      saved: true,
      already_saved: false,
      story_id: storyId,
      item: insertedItem,
    });
  } catch (error) {
    console.error(
      'POST /api/library:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao salvar a história.',
      },
      { status: 500 }
    );
  }
}

/*
 * DELETE
 *
 * Remove uma história da Biblioteca.
 *
 * Body:
 * {
 *   story_id: "..."
 * }
 */
export async function DELETE(
  request: Request
) {
  try {
    const profileId =
      await getCurrentProfileId();

    if (!profileId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado.',
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const storyId = body?.story_id;

    if (
      typeof storyId !== 'string' ||
      !storyId.trim()
    ) {
      return NextResponse.json(
        {
          error:
            'story_id é obrigatório.',
        },
        { status: 400 }
      );
    }

    const { data: lists, error: listsError } =
      await supabase
        .from('reading_lists')
        .select('id')
        .eq('user_id', profileId);

    if (listsError) {
      console.error(
        'ERRO AO BUSCAR LISTAS:',
        listsError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível remover a história.',
        },
        { status: 500 }
      );
    }

    const listIds = (lists || []).map(
      (list) => list.id
    );

    if (!listIds.length) {
      return NextResponse.json({
        saved: false,
      });
    }

    const { error: deleteError } =
      await supabase
        .from('reading_list_items')
        .delete()
        .in('list_id', listIds)
        .eq('story_id', storyId);

    if (deleteError) {
      console.error(
        'ERRO AO REMOVER DA BIBLIOTECA:',
        deleteError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível remover a história da biblioteca.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      saved: false,
      story_id: storyId,
    });
  } catch (error) {
    console.error(
      'DELETE /api/library:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao remover a história.',
      },
      { status: 500 }
    );
  }
}
