import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { d1Feed } from '@/lib/database/d1-feed';
import Link from 'next/link';
import FeedVideo from '@/components/FeedVideo';
import { notFound } from 'next/navigation';
import { chatDb, uuid } from '@/lib/chat/server';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';

export default async function FeedVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const db = getD1PreviewDatabase('auth');
  let postId: string;
  if (db) {
    const media = await db.prepare("SELECT post_id FROM nook_post_media WHERE id=? AND media_type='video'")
      .bind(id).first<{ post_id: string }>();
    if (!media || !await d1Feed(db).post(await getSessionTokenHash(), media.post_id)) notFound();
    postId = media.post_id;
  } else {
    const { data, error } = await chatDb.from('nook_post_media').select('post_id').eq('id', id).eq('media_type', 'video').maybeSingle();
    if (error) throw error;
    if (!data || !(await isPublicPostVisible(chatDb, data.post_id))) notFound();
    postId = data.post_id;
  }
  return <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-5 text-white">
    <Link href={'/feed?post=' + postId} className="text-pink-200">← Ver publicação original</Link>
    <h1 className="text-2xl font-bold">Vídeo do Nooklie</h1>
    <FeedVideo id={id} standalone />
  </main>;
}
