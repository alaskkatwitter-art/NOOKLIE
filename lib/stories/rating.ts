export const storyRatings = ['Livre', '12', '14', '16', '18'] as const;

export type StoryRating = (typeof storyRatings)[number];

export function isStoryRating(value: string): value is StoryRating {
  return storyRatings.includes(value as StoryRating);
}
