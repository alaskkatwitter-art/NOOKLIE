import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

export async function POST(request: Request) {
  try {
    const db = getD1PreviewDatabase('auth');
    const user = db ? await getAuthenticatedUserContext() : null;
    const reader = db ? user : await getDiscoveryReader();
    if (!reader) return new NextResponse(null, { status: 401, headers: privateHeaders });
    const raw = await request.text();
    const body = raw.length <= 300 ? JSON.parse(raw) : null;
    if (!body || typeof body.story_id !== 'string' || !uuid.test(body.story_id) || Object.keys(body).some(k => k !== 'story_id')) return new NextResponse(null, { status: 400, headers: privateHeaders });
    if (db && user) {
      const origin = request.headers.get('origin');
      if (origin && origin!==new URL(request.url).origin) return new NextResponse(null,{status:403,headers:privateHeaders});
      const visible = await db.prepare(`SELECT s.author_id,v.profile_id FROM released_stories s
        JOIN profiles p ON p.id=s.author_id AND p.moderation_hidden_at IS NULL
        JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
        JOIN d1_social_actors v ON v.token_hash=?1 WHERE s.id=?2 AND
        (p.is_private=0 OR p.id=v.profile_id OR EXISTS(SELECT 1 FROM follows WHERE follower_id=v.profile_id AND following_id=p.id))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=v.profile_id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.profile_id))`)
        .bind(user.sessionTokenHash,body.story_id).first<{author_id:string;profile_id:string}>();
      if (visible && visible.author_id!==visible.profile_id) {
        const result = await db.prepare(`INSERT INTO story_daily_engagement(story_id,reader_id,viewed)
          SELECT s.id,v.profile_id,1 FROM released_stories s
          JOIN profiles p ON p.id=s.author_id AND p.moderation_hidden_at IS NULL
          JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
          JOIN d1_social_actors v ON v.token_hash=?1
          WHERE s.id=?2 AND s.author_id<>v.profile_id
          AND (p.is_private=0 OR EXISTS(SELECT 1 FROM follows WHERE follower_id=v.profile_id AND following_id=p.id))
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=v.profile_id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.profile_id))
          ON CONFLICT(story_id,reader_id,activity_day) DO UPDATE SET viewed=1`)
          .bind(user.sessionTokenHash,body.story_id).run();
        if (!result.success) throw Error('Unable to record activity');
        return NextResponse.json({recorded:Boolean(result.meta.changes)},{headers:privateHeaders});
      }
      return NextResponse.json({recorded:Boolean(visible)},{headers:privateHeaders});
    }
    if (!('accountId' in reader)) return new NextResponse(null,{status:401,headers:privateHeaders});
    const { data, error } = await discoveryDb.rpc('record_discovery_activity', { p_account: reader.accountId, p_story: body.story_id });
    if (error) throw error;
    return NextResponse.json({ recorded: data === true }, { headers: privateHeaders });
  } catch { return new NextResponse(null, { status: 400, headers: privateHeaders }); }
}
