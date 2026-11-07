import { NextResponse } from 'next/server';
import {
  chatActor,
  chatDb,
  allowedThread,
  privateHeaders,
  uuid,
} from '@/lib/chat/server';
import { rateLimitKey } from '@/lib/security/rate-key';
export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    const params = new URL(request.url).searchParams,
      q = (params.get('q') || '').trim().replace(/^@/, '').toLowerCase(),
      threadId = params.get('thread');
    if (!/^[a-z0-9_]{1,30}$/.test(q))
      return NextResponse.json({ people: [] }, { headers: privateHeaders });
    const rate = await chatDb.rpc('consume_auth_rate_limit', {
      p_key_hash: rateLimitKey('chat-people', actor.profileId),
      p_limit: 120,
      p_window_seconds: 60,
    });
    if (rate.error || !rate.data)
      return new NextResponse(null, { status: 429, headers: privateHeaders });
    const excluded = new Set([actor.profileId]);
    if (threadId) {
      if (!uuid.test(threadId))
        return new NextResponse(null, { status: 400, headers: privateHeaders });
      const thread = await allowedThread(actor.profileId, threadId);
      if (
        !thread ||
        thread.kind !== 'group' ||
        thread.status !== 'accepted' ||
        thread.blocked ||
        thread.initiator_id !== actor.profileId
      )
        return new NextResponse(null, { status: 403, headers: privateHeaders });
      const members = await chatDb
        .from('chat_group_members')
        .select('profile_id')
        .eq('thread_id', threadId);
      if (members.error) throw members.error;
      for (const member of members.data || []) excluded.add(member.profile_id);
    }
    const term = q.replaceAll('_', '\\_');
    const search = (pattern: string) =>
      chatDb
        .from('profiles')
        .select(
          'id,user_id,username,display_name,avatar_url,verified,is_official',
        )
        .is('moderation_hidden_at', null)
        .ilike('username', pattern)
        .order('username')
        .limit(30);
    const [prefix, similar, blocks] = await Promise.all([
      search(term + '%'),
      search('%' + term + '%'),
      chatDb
        .from('chat_blocks')
        .select('blocker_id,blocked_id')
        .or(
          `blocker_id.eq.${actor.profileId},blocked_id.eq.${actor.profileId}`,
        ),
    ]);
    for (const result of [prefix, similar, blocks])
      if (result.error) throw result.error;
    for (const block of blocks.data || [])
      excluded.add(
        block.blocker_id === actor.profileId
          ? block.blocked_id
          : block.blocker_id,
      );
    const people = [
      ...new Map(
        [...(prefix.data || []), ...(similar.data || [])].map((person) => [
          person.id,
          person,
        ]),
      ).values(),
    ].filter((person) => !excluded.has(person.id));
    if (!people.length)
      return NextResponse.json({ people: [] }, { headers: privateHeaders });
    const accounts = await chatDb
      .from('auth_accounts')
      .select('id,account_status')
      .in(
        'id',
        people.map((person) => person.user_id),
      );
    if (accounts.error) throw accounts.error;
    const active = new Set(
      (accounts.data || [])
        .filter((account) => account.account_status === 'active')
        .map((account) => account.id),
    );
    return NextResponse.json(
      {
        people: people
          .filter((person) => active.has(person.user_id))
          .slice(0, 10)
          .map(
            ({
              id,
              username,
              display_name,
              avatar_url,
              verified,
              is_official,
            }) => ({
              id,
              username,
              display_name,
              avatar_url,
              verified,
              is_official,
            }),
          ),
      },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível buscar pessoas.' },
      { status: 503, headers: privateHeaders },
    );
  }
}
