'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Plus, X } from 'lucide-react';
import { favoriteFandoms } from '@/lib/discovery/preferences';

export default function DiscoveryPreferences() {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]);
  const [catalog,setCatalog]=useState<string[]>([]);
  const [account,setAccount]=useState('');
  const [input,setInput]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();async function load(){try{
    const response=await fetch('/api/discovery/preferences',{cache:'no-store',signal:controller.signal});if(response.status===401){router.replace('/login');return;}
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    if(!controller.signal.aborted){setSelected(data.favorite_fandoms);setCatalog(data.catalog);setAccount(data.account_id);setError('');}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível carregar.');}}void load();return()=>controller.abort();},[router,retry]);
  function add(name:string){const next=favoriteFandoms([...selected,name]);setMessage('');if(!next){setError('Escolha até 30 fandoms, com até 100 caracteres cada.');return;}setSelected(next);setInput('');setError('');}
  async function save(){setSaving(true);setError('');setMessage('');try{
    const response=await fetch('/api/discovery/preferences',{method:'PUT',headers:{'Content-Type':'application/json','X-Discovery-Account':account},body:JSON.stringify({favorite_fandoms:selected})});const data=await response.json();if(!response.ok)throw new Error(data.error);setSelected(data.favorite_fandoms);setMessage('Preferências salvas na sua conta. Seu início já usará estas escolhas.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setSaving(false);}}
  return <main className="discovery-home"><div className="mx-auto max-w-3xl px-5 py-12"><Heart className="fill-[#ffb7da]/25 text-[#ffb7da]" size={34}/><h1 className="mt-4 text-3xl font-bold">Seus fandoms favoritos</h1><p className="mt-4 leading-7 text-white/65">Escolha os universos que você gosta. As indicações do início ficam restritas aos fandoms selecionados. O Explorar continua aberto para buscar qualquer história.</p>
    <div className="mt-8 rounded-3xl border border-[#f4b6d4]/20 bg-[#21141e] p-5 sm:p-8"><h2 className="text-lg font-bold">Sua seleção <span className="text-sm font-normal text-white/50">{selected.length}/30</span></h2><p className="mt-2 text-sm leading-6 text-white/55">Sem seleção, você recebe descobertas gerais. Você pode alterar suas escolhas a qualquer momento.</p>
      <div className="mt-5 flex flex-wrap gap-2">{selected.map(name=><button key={name} type="button" disabled={saving} onClick={()=>{setSelected(current=>current.filter(n=>n!==name));setMessage('');}} className="flex min-h-11 items-center gap-3 rounded-full border border-[#ffc4df]/30 bg-[#ffc4df]/10 px-4 text-sm text-[#ffd1e7]" aria-label={`Remover ${name}`}>{name}<X size={15}/></button>)}</div>
      <form className="mt-6 flex gap-2" onSubmit={e=>{e.preventDefault();if(input.trim())add(input.trim());}}><label htmlFor="fandom-choice" className="sr-only">Adicionar fandom</label><input id="fandom-choice" list="fandom-options" disabled={!account||saving} value={input} maxLength={100} onChange={e=>setInput(e.target.value)} placeholder="Busque ou escreva um fandom…" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#100b12] p-3 text-sm outline-none focus:border-[#ffb7da]"/><datalist id="fandom-options">{catalog.map(name=><option key={name} value={name}/>)}</datalist><button type="submit" aria-label="Adicionar fandom" disabled={!input.trim()||!account||saving} className="discovery-secondary disabled:opacity-40"><Plus size={20}/></button></form>
      {catalog.length>0 && <fieldset className="mt-7"><legend className="mb-3 text-sm text-white/70">Universos da comunidade</legend><div className="grid gap-2 sm:grid-cols-2">{catalog.map(name=><label key={name} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 p-3 text-sm"><input type="checkbox" checked={selected.includes(name)} disabled={saving} onChange={e=>{if(e.target.checked)add(name);else{setSelected(current=>current.filter(n=>n!==name));setMessage('');}}} className="h-5 w-5 accent-[#f5b9d7]"/>{name}</label>)}</div></fieldset>}
      {error && <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p>}{message && <p role="status" className="mt-5 text-sm leading-6 text-[#ffc4df]">{message}</p>}
      <div className="mt-7 flex flex-wrap gap-3"><button type="button" disabled={saving||!account} onClick={save} className="rounded-full bg-[#f5b9d7] px-6 py-3 text-sm font-bold text-[#28121f] disabled:opacity-40">{saving?'Salvando…':'Salvar preferências'}</button><Link href="/inicio" className="discovery-secondary">Ir para meu início</Link>{!account&&error&&<button type="button" onClick={()=>setRetry(n=>n+1)} className="discovery-secondary">Tentar carregar novamente</button>}</div>
    </div></div></main>;
}
