import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Auth } from '@/lib/database/d1-auth';
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
    const db = getD1PreviewDatabase('auth');
    const hash = db ? await getSessionTokenHash() : null;
    const row = db && hash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(hash).first<{profile_id:string}>() : null;
    const actor = db ? row && {profileId:row.profile_id} : await chatActor();
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    const params = new URL(request.url).searchParams,
      q = (params.get('q') || '').trim().replace(/^@/, '').toLowerCase(),
      threadId = params.get('thread');
    if (!/^[a-z0-9_]{1,30}$/.test(q))
      return NextResponse.json({ people: [] }, { headers: privateHeaders });
    if (db && hash) {
      const rate = await d1Auth(db).consumeRateLimit(rateLimitKey('chat-people',actor.profileId),120,60);
      if (!rate) return new NextResponse(null,{status:429,headers:privateHeaders});
      if (threadId) {
        if (!uuid.test(threadId)) return new NextResponse(null,{status:400,headers:privateHeaders});
        const allowed = await db.prepare(`SELECT id FROM d1_chat_access WHERE token_hash=? AND id=? AND kind='group'
          AND member_status='accepted' AND blocked=0 AND initiator_id=actor_id`).bind(hash,threadId).first();
        if (!allowed) return new NextResponse(null,{status:403,headers:privateHeaders});
      }
      const result = await db.prepare(`SELECT p.id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official
        FROM profiles p JOIN auth_accounts a ON a.id=p.user_id
        JOIN d1_social_actors v ON v.token_hash=?1
        WHERE p.id<>v.profile_id AND a.account_status='active' AND p.moderation_hidden_at IS NULL
          AND instr(lower(p.username),?2)>0
          AND NOT EXISTS(SELECT 1 FROM chat_group_members m WHERE m.thread_id=?3 AND m.profile_id=p.id)
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=v.profile_id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.profile_id))
          AND (?3 IS NULL OR EXISTS(SELECT 1 FROM d1_chat_access t WHERE t.token_hash=?1 AND t.id=?3
            AND t.kind='group' AND t.member_status='accepted' AND t.blocked=0 AND t.initiator_id=t.actor_id))
        ORDER BY CASE WHEN instr(lower(p.username),?2)=1 THEN 0 ELSE 1 END,p.username LIMIT 10`)
        .bind(hash,q,threadId).all<{verified:number;is_official:number}>();
      if (!result.success) throw Error('Unable to search chat profiles');
      return NextResponse.json({people:result.results.map(person=>({
        ...person,verified:Boolean(person.verified),is_official:Boolean(person.is_official),
      }))},{headers:privateHeaders});
    }
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
