"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthorInviteLink from '@/components/AuthorInviteLink';
type Dashboard = { username:string;is_private:boolean;participating:boolean;registrations:number;readers:{username:string;created_at:string}[] };
export default function AuthorInvitesPage() {
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [needsLogin,setNeedsLogin]=useState(false);
  const [error,setError]=useState('');
  async function load(join=false,signal?:AbortSignal) {
    setError('');
    if(join)setBusy(true);else setLoading(true);
    try {
      const response=await fetch('/api/author-invites',{method:join?'POST':'GET',cache:'no-store',signal});
      if(response.status===401){setNeedsLogin(true);setData(null);return;}
      const result=await response.json();
      if(!response.ok)throw Error(result.error);
      if(!signal?.aborted){setData(result);setNeedsLogin(false);}
    } catch(cause) {if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Não foi possível carregar seus convites.');}
    finally{if(!signal?.aborted){setLoading(false);setBusy(false);}}
  }
  useEffect(()=>{const controller=new AbortController();void load(false,controller.signal);return()=>controller.abort();},[]);
  return <main className="min-h-screen bg-black px-5 py-10 text-white"><div className="mx-auto max-w-2xl">
    <p className="text-sm font-bold tracking-widest text-pink-300">AUTORES E LEITORES</p>
    <h1 className="mt-3 text-3xl font-bold">Convites</h1>
    <p className="mt-4 text-base leading-7 text-white/75">Traga seus leitores para construir o Nooklie com a gente. Compartilhe seu convite com até 10 pessoas nesta rodada de testes, acompanhe as novas chegadas e converse sobre suas histórias.</p>
    <p className="mt-3 text-sm leading-6 text-white/60">Os dez convites são uma orientação para esta rodada. O link não bloqueia novas entradas automaticamente.</p>
    {loading&&<p role="status" className="mt-8">Carregando seus convites…</p>}
    {error&&<div role="alert" className="mt-6 rounded-xl border border-pink-300/20 p-5"><p>{error}</p><button className="mt-3 text-pink-300 underline" onClick={()=>void load()}>Tentar novamente</button></div>}
    {!loading&&needsLogin&&<section className="mt-8 rounded-2xl border border-pink-300/20 p-6"><h2 className="text-xl font-bold">Entre para participar</h2><p className="mt-3 leading-7 text-white/70">Seu link e o acompanhamento dos convites ficam na sua conta.</p><Link className="mt-5 inline-block rounded-xl bg-pink-300 px-5 py-3 font-bold text-black" href="/login">Entrar na minha conta</Link></section>}
    {!loading&&data&&<>
      <section className="mt-8 rounded-2xl border border-pink-300/20 bg-pink-300/5 p-6">
        <h2 className="text-xl font-bold">{data.participating?'Você está participando!':'Participe como autor'}</h2>
        <p className="mt-3 text-base leading-7 text-white/75">Quem abrir seu link verá as boas-vindas com seu @ e poderá conhecer suas histórias. Quando uma nova conta for criada pelo seu convite, a chegada aparecerá aqui e você receberá uma notificação, conforme suas preferências de notificações sociais.</p>
        {data.is_private?<p className="mt-4 text-pink-200">Seu perfil precisa ser público para receber leitores. Você pode ajustar isso nas <Link className="underline" href="/configuracoes/perfil">configurações do perfil</Link>.</p>:<>
          {!data.participating&&<button disabled={busy} onClick={()=>void load(true)} className="mt-5 rounded-xl bg-pink-300 px-5 py-3 font-bold text-black disabled:opacity-50">{busy?'Participando…':'Quero participar'}</button>}
          {data.participating&&<div className="mt-5"><AuthorInviteLink username={data.username}/><Link className="mt-3 inline-block text-pink-200 underline" href={`/convite/${data.username}`}>Ver minhas boas-vindas</Link></div>}
        </>}
      </section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-bold">Chegadas pelo seu convite: {data.registrations}</h2><button className="min-h-11 text-pink-300 underline" onClick={()=>void load()} disabled={busy}>Atualizar</button></div>
      <p className="mt-3 text-sm leading-6 text-white/60">O acompanhamento começou com esta atualização. Acessos ao link e entradas de quem já tinha conta não geram aviso. Mostramos até 50 cadastros recentes disponíveis.</p>
      {!data.readers.length?<p className="mt-5 text-white/70">Nenhum novo leitor para mostrar por enquanto.</p>:<ul className="mt-5 divide-y divide-white/10">{data.readers.map(reader=><li key={reader.username} className="flex flex-wrap justify-between gap-3 py-4"><Link href={`/perfil/${reader.username}`} className="font-semibold text-pink-200">@{reader.username}</Link><time className="text-sm text-white/60" dateTime={reader.created_at}>{new Date(reader.created_at).toLocaleDateString('pt-BR')}</time></li>)}</ul>}
      </section>
    </>}
  </div></main>;
}
