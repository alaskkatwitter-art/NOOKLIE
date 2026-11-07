import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chatDb, uuid } from '@/lib/chat/server';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';

export default async function FeedVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { data, error } = await chatDb.from('nook_post_media').select('post_id').eq('id', id).eq('media_type', 'video').maybeSingle();
  if (error) throw error;
  if (!data || !(await isPublicPostVisible(chatDb, data.post_id))) notFound();
  return <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-5 text-white">
    <Link href={'/feed?post=' + data.post_id} className="text-pink-200">← Ver publicação original</Link>
    <h1 className="text-2xl font-bold">Vídeo do Nooklie</h1>
    <video src={'/api/nook-posts/video/' + id} controls playsInline preload="metadata" className="max-h-[70dvh] w-full rounded-2xl bg-black" />
  </main>;
}
