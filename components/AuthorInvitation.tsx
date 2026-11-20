"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
type Author = { username: string; display_name?: string | null };
export default function AuthorInvitation({ username, compact = false }: { username: string; compact?: boolean }) {
  const [author, setAuthor] = useState<Author | null>(null);
  const [status, setStatus] = useState('loading');
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setAuthor(null); setStatus('loading');
    setWelcome(new URLSearchParams(window.location.search).get('boasvindas') === '1');
    if (!/^[a-z0-9_]{3,30}$/.test(username)) { setStatus('invalid'); return; }
    fetch(`/api/public-profile/${encodeURIComponent(username)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'invalid' : 'error');
        const data = await response.json();
        if (!data.user || data.restricted) throw new Error('invalid');
        setAuthor({ username: data.user.username, display_name: data.user.display_name }); setStatus('ready');
      }).catch(error => { if (!controller.signal.aborted) setStatus(error.message === 'invalid' ? 'invalid' : 'error'); });
    return () => controller.abort();
  }, [username]);
  if (status === 'loading') return <p role="status" className="my-5 text-base text-white/70">Abrindo seu convite…</p>;
  if (!author) return compact ? null : <div><h1 className="text-2xl font-bold">{status === 'invalid' ? 'Este convite não está disponível' : 'Não conseguimos abrir o convite agora'}</h1><p className="my-5 text-white/70">Você pode continuar conhecendo o Nooklie ou tentar abrir o link novamente.</p><Link className="text-pink-300 underline" href="/login">Entrar no Nooklie</Link></div>;
  const profile = `/perfil/${encodeURIComponent(author.username)}`;
  return <div className="my-5 rounded-2xl border border-pink-300/20 bg-pink-300/5 p-5 text-left">
    <h1 className={compact ? 'text-lg font-bold text-pink-200' : 'text-3xl font-bold text-pink-200'}>{welcome ? 'Boas-vindas ao Nooklie!' : 'Uma história fica melhor com você por perto.'}</h1>
    <p className="mt-4 text-base leading-7">Você chegou pelo convite de <Link className="font-bold text-pink-200 underline" href={profile}>@{author.username}</Link>{author.display_name ? ` (${author.display_name})` : ''}. Que bom ter você aqui!</p>
    <p className="mt-3 text-base leading-7 text-white/75">Este é um espaço para descobrir histórias, acompanhar seus autores e conversar sobre cada capítulo. Nesta fase de testes, sua experiência também ajuda a construir o Nooklie. Leia no seu ritmo e participe como se sentir à vontade.</p>
    <p className="mt-3 text-sm leading-6 text-white/60">Ao criar sua conta por este convite, seu @ será informado ao autor para dar as boas-vindas. Apenas abrir o link ou entrar em uma conta existente não gera notificação.</p>
    {!compact && <><div className="mt-6 flex flex-wrap gap-3">{!welcome && <Link className="rounded-xl bg-pink-300 px-5 py-3 font-bold text-black" href={`/login?convite=${encodeURIComponent(author.username)}`}>Criar conta ou entrar</Link>}<Link className="rounded-xl border border-pink-300/30 px-5 py-3 text-pink-200" href={profile}>Conhecer o autor e suas histórias</Link></div><p className="mt-4 text-sm leading-6 text-white/60">Para acompanhar as novidades, você pode seguir o autor no perfil. Essa escolha é sua.</p>{welcome && <Link className="mt-5 inline-block text-pink-300 underline" href="/inicio">Explorar o Nooklie</Link>}</>}
  </div>;
}
