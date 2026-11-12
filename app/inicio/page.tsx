'use client';
import AccountBadge from '@/components/AccountBadge';
import {contentMediaUrl} from '@/lib/security/content-media';
import OriginalsShelf from '@/components/OriginalsShelf';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Search, SlidersHorizontal } from 'lucide-react';
import DiscoveryShelf from '@/components/DiscoveryShelf';
import type { DiscoveryHome } from '@/lib/discovery/types';

export default function ReaderHome() {
  const router = useRouter();
  const [home, setHome] = useState<DiscoveryHome | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){try{
      const response=await fetch('/api/discovery',{cache:'no-store',signal:controller.signal});
      if(response.status===401){router.replace('/login');return;}
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(!controller.signal.aborted){setHome(data);setError('');}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível carregar o início.');}}
    void load();return()=>controller.abort();
  },[router,revision]);
  return <main className="discovery-home nook-reader-home"><div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-8 sm:pt-12">
    <header className="home-heading">
      <div>
        <p className="home-kicker">Início</p>
        <h1>Olá{home ? `, ${home.user.display_name || home.user.username}` : ''}!<AccountBadge account={home?.user} size="normal" /></h1>
      </div>
      <Link href="/preferencias" className="home-text-link"><SlidersHorizontal size={16} aria-hidden="true" /> Meus fandoms</Link>
    </header>
    <form action="/explorar" className="home-search">
      <Search size={20} className="shrink-0" aria-hidden="true" />
      <label htmlFor="home-search" className="sr-only">Buscar histórias, autores, tags ou fandoms</label>
      <input id="home-search" name="q" maxLength={100} placeholder="Buscar histórias, autores ou fandoms" />
      <button type="submit">Buscar</button>
    </form>
    {error && <div role="alert" className="my-8 rounded-2xl border border-rose-300/25 p-5"><p>{error}</p><button type="button" className="mt-3 min-h-11 text-[#ffc4df] underline" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>}
    {!home && !error && <p className="py-12 text-white/60" role="status">Preparando suas leituras…</p>}
    {home && <>
      <section className="discovery-section"><div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Continuar lendo</h2></div><Link href="/biblioteca" className="home-text-link">Biblioteca →</Link></div>
        {home.continue_reading.length ? <div className="home-resume-list">{home.continue_reading.map(entry=><Link href={`/capitulo/${entry.chapter_id}`} key={entry.id} className="continue-card group">{entry.cover_url ? <img src={contentMediaUrl(entry.cover_url)} alt="" className="h-18 w-12 shrink-0 rounded-sm object-cover"/> : <div className="flex h-18 w-12 shrink-0 items-center justify-center rounded-sm bg-[#56304d]"><BookOpen className="text-[#ffc8e2]"/></div>}<div className="min-w-0 flex-1"><h3 className="line-clamp-2 font-bold">{entry.title}</h3><p className="mt-1 truncate text-xs text-[var(--ui-muted)]">Cap. {entry.chapter_number} · {entry.chapter_title}</p><div className="mt-2 h-1 overflow-hidden rounded-sm bg-[var(--ui-border)]"><div className="h-full bg-[#f7b7d8]" style={{width:`${Math.min(100,Math.max(0,Number(entry.progress_percent)))}%`}}/></div><p className="mt-1 text-[11px] text-[var(--ui-muted)]">{Math.round(Number(entry.progress_percent))}% deste capítulo</p></div><ArrowUpRight size={18} className="self-start text-[#f4b7d5]"/></Link>)}</div> : <div className="home-empty">Abra um capítulo e seu progresso aparecerá aqui.<Link href="/explorar" className="ml-2 text-[var(--ui-accent)] underline">Encontrar uma história</Link></div>}
      </section>
      <OriginalsShelf />
      <div className="fandom-banner"><div><p className="font-bold">{home.favorite_fandoms.length ? 'Indicações dos seus universos favoritos' : 'Quais universos fazem parte do seu mundo?'}</p><p className="mt-2 text-sm leading-6 text-white/65">{home.favorite_fandoms.length ? home.favorite_fandoms.join(' · ') : 'Escolha seus fandoms para receber indicações só dos universos que você gosta.'}</p></div><Link href="/preferencias" className="home-text-link shrink-0">{home.favorite_fandoms.length?'Editar escolhas':'Escolher fandoms'}</Link></div>
      <DiscoveryShelf title="Dos gêneros que você lê" description="Sugestões a partir dos gêneros das suas leituras, respeitando seus fandoms favoritos." stories={home.for_you} empty="Quando você começar a ler histórias com tags de gênero, encontrará novas indicações aqui."/>
      <DiscoveryShelf title="Histórias da semana" description="Em destaque nos últimos 7 dias, considerando acessos e leituras registrados." stories={home.weekly} metric="week" empty="Os destaques serão formados à medida que a comunidade acessar e ler as obras. Enquanto isso, descubra as novidades abaixo."/>
      <DiscoveryShelf title="Mais acessadas" description="Obras com mais acessos registrados na comunidade." stories={home.most_viewed} metric="views" empty="Os acessos estão começando a ser registrados."/>
      <DiscoveryShelf title="Mais lidas" description="Leituras com pelo menos 30 segundos de capítulo aberto em primeiro plano. Até uma por conta e obra a cada dia." stories={home.most_read} metric="reads" empty="As leituras registradas vão formar esta seleção."/>
      <DiscoveryShelf title={home.favorite_fandoms.length?'Novas histórias dos seus fandoms':'Novas histórias para descobrir'} description="Obras ordenadas pela estreia do primeiro capítulo publicado." stories={home.new_fandom} empty="Ainda não há histórias públicas nestes fandoms. Você pode ajustar suas escolhas ou pesquisar no Explorar."/>
      <DiscoveryShelf title="Novas vozes, novos mundos" description="Um espaço para obras com poucas leituras encontrarem seus primeiros leitores. Até duas obras de cada autor nesta vitrine." stories={home.new_voices} empty="As próximas obras com poucas leituras aparecerão aqui, dentro das suas preferências."/>
      {home.events.map(event=><DiscoveryShelf key={event.id} title={`Evento · ${event.title}`} description={event.description} stories={event.stories} empty="Ainda não há obras inscritas que correspondam aos seus fandoms favoritos."/>)}
      {home.events.length>0 && <Link href="/eventos" className="home-text-link">Ver eventos e participar →</Link>}
      <p className="mt-10 text-xs leading-6 text-[var(--ui-muted)]">Os indicadores contam atividade de contas conectadas, com limite diário por obra. Visitas do próprio autor não aumentam o ranking. Os registros começam a partir desta atualização.</p>
    </>}
  </div></main>;
}
