import AuthorInvitation from '@/components/AuthorInvitation';
export const metadata = { title: 'Convite para o Nooklie', robots: { index: false, follow: false } };
export default async function InvitationPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <main className="min-h-screen bg-black px-5 py-12 text-white"><section className="mx-auto max-w-lg"><p className="mb-6 text-sm font-bold tracking-widest text-pink-300">NOOKLIE · AUTORES E LEITORES</p><AuthorInvitation username={username} /></section></main>;
}
