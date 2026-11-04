'use client';
import {contentMediaUrl} from '@/lib/security/content-media';
import OriginalsShelf from '@/components/OriginalsShelf';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Search, Sparkles } from 'lucide-react';
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
  return <main className="discovery-home"><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#e8a9cd]">Seu próximo capítulo começa aqui</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Olá{home ? `, ${home.user.display_name || home.user.username}` : ''}!</h1><p className="mt-2 text-white/60">Bem-vindo de volta ao seu cantinho de histórias.</p></div><Link href="/preferencias" className="discovery-secondary"><Sparkles size={17}/>Meus fandoms favoritos</Link></div>
    <form action="/explorar" className="discovery-search"><Search size={22} className="shrink-0 text-[#ffb4d9]"/><label htmlFor="home-search" className="sr-only">Buscar histórias, autores, tags ou fandoms</label><input id="home-search" name="q" maxLength={100} placeholder="Qual história você está procurando?" className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-white/45 sm:text-base"/><button type="submit" className="min-h-11 rounded-full bg-[#f5b9d7] px-4 text-sm font-bold text-[#28121f]">Buscar</button></form>
    {error && <div role="alert" className="my-8 rounded-2xl border border-rose-300/25 p-5"><p>{error}</p><button type="button" className="mt-3 min-h-11 text-[#ffc4df] underline" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>}
    {!home && !error && <p className="py-12 text-white/60" role="status">Preparando suas leituras…</p>}
    {home && <>
      <section className="discovery-section"><div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Continuar lendo</h2><p className="mt-2 text-sm text-white/60">Sua história, no capítulo e no ponto em que você parou.</p></div><Link href="/biblioteca" className="text-sm text-[#f7bedc]">Biblioteca →</Link></div>
        {home.continue_reading.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{home.continue_reading.map(entry=><Link href={`/capitulo/${entry.chapter_id}`} key={entry.id} className="continue-card group">{entry.cover_url ? <img src={contentMediaUrl(entry.cover_url)} alt="" className="h-32 w-22 shrink-0 rounded-xl object-cover"/> : <div className="flex h-32 w-22 shrink-0 items-center justify-center rounded-xl bg-[#56304d]"><BookOpen className="text-[#ffc8e2]"/></div>}<div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-widest text-[#ffb7da]">Retomar leitura</p><h3 className="mt-2 line-clamp-2 font-bold">{entry.title}</h3><p className="mt-2 truncate text-xs text-white/60">Cap. {entry.chapter_number} · {entry.chapter_title}</p><div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#f7b7d8]" style={{width:`${Math.min(100,Math.max(0,Number(entry.progress_percent)))}%`}}/></div><p className="mt-2 text-[11px] text-white/50">{Math.round(Number(entry.progress_percent))}% deste capítulo</p></div><ArrowUpRight size={18} className="self-start text-[#f4b7d5]"/></Link>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm leading-7 text-white/60">Abra um capítulo e seu progresso aparecerá aqui.<Link href="/explorar" className="ml-2 text-[#ffc4df] underline">Encontrar uma história</Link></div>}
      </section>
      <OriginalsShelf />
      <div className="fandom-banner"><div><p className="font-bold">{home.favorite_fandoms.length ? 'Indicações dos seus universos favoritos' : 'Quais universos fazem parte do seu mundo?'}</p><p className="mt-2 text-sm leading-6 text-white/65">{home.favorite_fandoms.length ? home.favorite_fandoms.join(' · ') : 'Escolha seus fandoms para receber indicações só dos universos que você gosta.'}</p></div><Link href="/preferencias" className="discovery-secondary shrink-0">{home.favorite_fandoms.length?'Editar escolhas':'Escolher fandoms'}</Link></div>
      <DiscoveryShelf title="Dos gêneros que você lê" description="Sugestões a partir dos gêneros das suas leituras, respeitando seus fandoms favoritos." stories={home.for_you} empty="Quando você começar a ler histórias com tags de gênero, encontrará novas indicações aqui."/>
      <DiscoveryShelf title="Histórias da semana" description="Em destaque nos últimos 7 dias, considerando acessos e leituras registrados." stories={home.weekly} metric="week" empty="Os destaques serão formados à medida que a comunidade acessar e ler as obras. Enquanto isso, descubra as novidades abaixo."/>
      <DiscoveryShelf title="Mais acessadas" description="Obras com mais acessos registrados na comunidade." stories={home.most_viewed} metric="views" empty="Os acessos estão começando a ser registrados."/>
      <DiscoveryShelf title="Mais lidas" description="Leituras com pelo menos 30 segundos de capítulo aberto em primeiro plano. Até uma por conta e obra a cada dia." stories={home.most_read} metric="reads" empty="As leituras registradas vão formar esta seleção."/>
      <DiscoveryShelf title={home.favorite_fandoms.length?'Novas histórias dos seus fandoms':'Novas histórias para descobrir'} description="Obras ordenadas pela estreia do primeiro capítulo publicado." stories={home.new_fandom} empty="Ainda não há histórias públicas nestes fandoms. Você pode ajustar suas escolhas ou pesquisar no Explorar."/>
      <DiscoveryShelf title="Novas vozes, novos mundos" description="Um espaço para obras com poucas leituras encontrarem seus primeiros leitores. Até duas obras de cada autor nesta vitrine." stories={home.new_voices} empty="As próximas obras com poucas leituras aparecerão aqui, dentro das suas preferências."/>
      {home.events.map(event=><DiscoveryShelf key={event.id} title={`Evento · ${event.title}`} description={event.description} stories={event.stories} empty="Ainda não há obras inscritas que correspondam aos seus fandoms favoritos."/>)}
      {home.events.length>0 && <Link href="/eventos" className="discovery-secondary">Ver eventos e participar →</Link>}
      <p className="mt-10 text-xs leading-6 text-white/40">Os indicadores contam atividade de contas conectadas, com limite diário por obra. Visitas do próprio autor não aumentam o ranking. Os registros começam a partir desta atualização.</p>
    </>}
  </div></main>;
}
