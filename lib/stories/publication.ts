export type StoryPublication = 'published' | 'draft' | 'scheduled' | 'unpublished';

export function storyPublication(releaseAt: string | null, hasPublishedChapter: boolean): StoryPublication {
  if (releaseAt === 'infinity') return 'unpublished';
  if (releaseAt && Date.parse(releaseAt) > Date.now()) return 'scheduled';
  return hasPublishedChapter ? 'published' : 'draft';
}
