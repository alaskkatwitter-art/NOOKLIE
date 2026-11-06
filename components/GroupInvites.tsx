'use client';
import { useState } from 'react';
export default function GroupInvites({threadId,onInvited}:{threadId:string;onInvited:()=>void}) {
  const [people,setPeople]=useState(''),[link,setLink]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function manage(method:'PATCH'|'POST'|'DELETE') {
    setBusy(true);setError('');setNotice('');
    try {
      const usernames=people.split(/[\s,;]+/).map(name=>name.replace(/^@/,'').toLowerCase()).filter(Boolean);
      const response=await fetch('/api/chat/groups/invitations',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({thread_id:threadId,...(method==='PATCH'?{usernames}:{})})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível atualizar os convites.');
      if(method==='PATCH'){setPeople('');setNotice('Convites enviados. Cada pessoa decide se quer entrar.');onInvited();}
      else if(method==='POST'){setLink(data.url);setNotice('Link criado. Qualquer link anterior deixou de funcionar.');}
      else {setLink('');setNotice('Link revogado.');}
    } catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar os convites.');}finally{setBusy(false);}
  }
  return <details className="border-b border-white/10 p-4"><summary className="cursor-pointer text-sm font-semibold text-pink-200">Convidar pessoas para o grupo</summary><div className="mt-4 space-y-4"><form onSubmit={event=>{event.preventDefault();void manage('PATCH');}} className="space-y-3"><label className="block text-sm">Usernames<textarea required aria-label="Pessoas para convidar" maxLength={450} value={people} onChange={event=>setPeople(event.target.value)} placeholder="@username, @outrapessoa" rows={2} className="nook-input mt-2 w-full" /></label><button disabled={busy} className="nook-primary">Enviar convites</button></form><p className="text-xs leading-6 text-white/60">Até 15 pessoas, incluindo convites pendentes. O link vale por 7 dias; a entrada depende de uma vaga e respeita os bloqueios.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void manage('POST')} className="nook-secondary">{link?'Gerar novo link':'Gerar link de convite'}</button><button type="button" disabled={busy} onClick={()=>void manage('DELETE')} className="nook-secondary">Revogar link</button></div>{link&&<div className="space-y-2"><label className="block text-sm">Link de convite<input readOnly value={link} onFocus={event=>event.target.select()} className="nook-input mt-2 w-full" /></label><button type="button" className="text-sm text-pink-200 underline" onClick={async()=>{try{await navigator.clipboard.writeText(link);setNotice('Link copiado.');}catch{setNotice('Selecione o link acima para copiar.');}}}>Copiar link</button></div>}{error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}{notice&&<p role="status" className="text-sm text-pink-100">{notice}</p>}</div></details>;
}
