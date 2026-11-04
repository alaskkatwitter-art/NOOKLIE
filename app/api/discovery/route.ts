import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders } from '@/lib/discovery/server';
import type { DiscoveryHome, DiscoveryStory } from '@/lib/discovery/types';

const shelves = ['for_you', 'weekly', 'most_viewed', 'most_read', 'new_fandom', 'new_voices'] as const;

export async function GET() {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para acessar seu início.' }, { status: 401, headers: privateHeaders });
    const { data, error } = await discoveryDb.rpc('discovery_home', { p_account: reader.accountId });
    if (error) throw error;

    const home = data as Omit<DiscoveryHome, 'user'>;
    const stories = [...shelves.flatMap(key => home[key]), ...home.events.flatMap(event => event.stories)];
    const authorIds = [...new Set(stories.map(story => story.author_id))];
    const authors = authorIds.length
      ? await discoveryDb.from('profiles').select('id, verified, is_official').in('id', authorIds)
      : { data: [], error: null };
    const badges = new Map((authors.data ?? []).map(author => [author.id, author]));

    function addBadge(story: DiscoveryStory) {
      const author = badges.get(story.author_id);
      return author ? { ...story, verified: author.verified, is_official: author.is_official } : story;
    }

    return NextResponse.json({
      ...home,
      ...Object.fromEntries(shelves.map(key => [key, home[key].map(addBadge)])),
      events: home.events.map(event => ({ ...event, stories: event.stories.map(addBadge) })),
      user: reader.profile,
    }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar suas leituras. Tente novamente.' }, { status: 503, headers: privateHeaders });
  }
}
