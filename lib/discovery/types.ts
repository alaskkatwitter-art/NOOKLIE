export type DiscoveryStory = {
  id: string; title: string; description: string | null; cover_url: string | null;
  author_id: string; verified?: boolean; is_official?: boolean;
  username: string; display_name: string | null; fandom: string; rating: string | null;
  views: number; reads: number; week_views: number; week_reads: number;
  work_has_ai: boolean; cover_has_ai: boolean; has_content_warnings: boolean; content_warnings: string;
};
export type ReadingEntry = { id: string; title: string; cover_url: string | null; chapter_id: string; chapter_title: string; chapter_number: number; progress_percent: number; position: number };
export type DiscoveryEvent = { id: string; title: string; description: string; ends_at: string; stories: DiscoveryStory[] };
export type DiscoveryHome = {
  user: { username: string; display_name: string | null; verified?: boolean; is_official?: boolean };
  favorite_fandoms: string[]; continue_reading: ReadingEntry[]; genres: string[];
  for_you: DiscoveryStory[]; weekly: DiscoveryStory[]; most_viewed: DiscoveryStory[];
  most_read: DiscoveryStory[]; new_fandom: DiscoveryStory[]; new_voices: DiscoveryStory[]; events: DiscoveryEvent[];
};
