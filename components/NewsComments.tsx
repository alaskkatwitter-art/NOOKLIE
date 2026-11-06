'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AccountBadge from '@/components/AccountBadge';

type NewsComment = {
  id:string;body:string|null;parent_id:string|null;created_at:string;deleted:boolean;can_delete:boolean;
  author:{id:string;username:string;display_name:string|null;avatar_url:string|null;verified?:boolean;is_official?:boolean}|null;
};
type Cursor = {created_at:string;id:string};
function mergeComments(rows:NewsComment[]) { return [...new Map(rows.map(row=>[row.id,row])).values()]; }
export default function NewsComments({article}:{article:string}) {
  const [comments,setComments]=useState<NewsComment[]>([]),[cursor,setCursor]=useState<Cursor|null>(null);
  const [viewer,setViewer]=useState<string|null>(null),[moderator,setModerator]=useState(false);
  const [loading,setLoading]=useState(true),[olderLoading,setOlderLoading]=useState(false),[posting,setPosting]=useState(false),[removing,setRemoving]=useState<string|null>(null);
  const [body,setBody]=useState(''),[reply,setReply]=useState<NewsComment|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const textarea=useRef<HTMLTextAreaElement>(null),form=useRef<HTMLFormElement>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError('');
    try {
      const response=await fetch('/api/news/comments?article='+encodeURIComponent(article),{cache:'no-store',signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar os comentários.');
      if(signal?.aborted)return;
      setComments(data.comments||[]);setCursor(data.next_cursor);setViewer(data.viewer_id);setModerator(Boolean(data.can_moderate));
    }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Não foi possível carregar os comentários.');}
    finally{if(!signal?.aborted)setLoading(false);}
  },[article]);
  useEffect(()=>{const controller=new AbortController();setBody('');setReply(null);setNotice('');void load(controller.signal);return()=>controller.abort();},[load]);
  async function older(){
    if(!cursor||olderLoading)return;setOlderLoading(true);setError('');
    try{const response=await fetch('/api/news/comments?article='+encodeURIComponent(article)+'&cursor='+encodeURIComponent(JSON.stringify(cursor)),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error);setComments(current=>mergeComments([...(data.comments||[]),...current]));setCursor(data.next_cursor);}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar mais comentários.');}finally{setOlderLoading(false);}
  }
  async function remove(comment:NewsComment){
    if(removing||!window.confirm('Remover este comentário? As respostas continuarão visíveis.'))return;
    setRemoving(comment.id);setError('');setNotice('');
    try{const response=await fetch('/api/news/comments',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({article,id:comment.id})});const data=await response.json();if(!response.ok)throw Error(data.error);setComments(current=>current.map(row=>row.id===comment.id?{...row,deleted:true,body:null,author:null,can_delete:false}:row));if(reply?.id===comment.id)setReply(null);setNotice('Comentário removido.');}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível remover o comentário.');}finally{setRemoving(null);}
  }
  return <section id="comentarios" aria-labelledby="news-comments-title" className="mt-12 scroll-mt-24 rounded-3xl border border-pink-300/20 bg-[#1b121c] p-5 text-white sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-pink-300">A conversa continua aqui</p>
    <h2 id="news-comments-title" className="mt-3 text-2xl font-bold">Comentários da notícia</h2>
    <p className="mt-3 text-sm leading-6 text-white/65">Conte o que achou, tire dúvidas e responda à comunidade. Vamos manter este espaço acolhedor e respeitoso.</p>
    {loading?<p role="status" className="mt-6 text-sm text-white/60">Carregando comentários…</p>:<>
      {viewer?<form ref={form} className="mt-6 space-y-3" onSubmit={async event=>{
        event.preventDefault();if(posting||!body.trim())return;setPosting(true);setError('');setNotice('');
        try{const response=await fetch('/api/news/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article,body,parent_id:reply?.id||null})});const data=await response.json();if(!response.ok)throw Error(data.error);setComments(current=>mergeComments([...current,data.comment]));setBody('');setReply(null);setNotice('Comentário publicado.');}
        catch(e){setError(e instanceof Error?e.message:'Não foi possível publicar o comentário.');}finally{setPosting(false);}
      }}>
        {reply&&<div className="flex items-center justify-between gap-3 rounded-xl bg-pink-300/10 p-3 text-sm"><span>Respondendo a @{reply.author?.username||'leitor'}</span><button type="button" disabled={posting} onClick={()=>setReply(null)} className="min-h-11 text-pink-200 underline">Cancelar resposta</button></div>}
        <label className="block text-sm font-semibold" htmlFor={'news-comment-'+article}>Seu comentário</label>
        <textarea ref={textarea} id={'news-comment-'+article} value={body} onChange={event=>setBody(event.target.value)} maxLength={3000} rows={4} disabled={posting} placeholder="O que você achou desta notícia?" className="nook-input resize-y" />
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-white/45">{body.length}/3.000</span><button disabled={posting||!body.trim()} className="nook-primary">{posting?'Publicando…':reply?'Publicar resposta':'Publicar comentário'}</button></div>
      </form>:<p className="mt-6 rounded-2xl border border-white/10 p-4 text-sm leading-7"><Link href="/login" className="font-semibold text-pink-200 underline">Entre na sua conta</Link> para comentar ou responder. Depois, volte a esta notícia.</p>}
      {cursor&&<button type="button" disabled={olderLoading} onClick={()=>void older()} className="nook-choice mt-6">{olderLoading?'Carregando…':'Carregar comentários anteriores'}</button>}
      {!comments.length&&!error&&<p className="mt-6 text-sm text-white/50">Nenhum comentário ainda. Que tal começar a conversa?</p>}
      <div className="mt-6 space-y-4">{comments.map(comment=><article id={'comentario-'+comment.id} key={comment.id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
        {comment.deleted?<p className="text-sm italic text-white/45">Comentário removido.</p>:<>
          <div className="flex items-center gap-3">{comment.author?.avatar_url&&<img src={comment.author.avatar_url} alt="" loading="lazy" width={36} height={36} className="h-9 w-9 rounded-full object-cover"/>}<div className="min-w-0"><Link href={'/perfil/'+encodeURIComponent(comment.author?.username||'')} className="font-semibold text-pink-100">{comment.author?.display_name||comment.author?.username||'Leitor'}</Link><AccountBadge account={comment.author}/><p className="mt-1 text-xs text-white/45"><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</time></p></div></div>
          {comment.parent_id&&<p className="mt-3 text-xs text-pink-200/80">Em resposta a {comments.find(row=>row.id===comment.parent_id)?.author?.username?'@'+comments.find(row=>row.id===comment.parent_id)!.author!.username:'um comentário desta notícia'}</p>}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-white/85">{comment.body}</p>
          <div className="mt-3 flex flex-wrap gap-5">{viewer&&<button type="button" disabled={posting} onClick={()=>{setReply(comment);form.current?.scrollIntoView({behavior:'smooth',block:'center'});textarea.current?.focus({preventScroll:true});}} className="min-h-11 text-sm font-semibold text-pink-200">Responder</button>}{(comment.can_delete||moderator)&&<button type="button" disabled={Boolean(removing)} onClick={()=>void remove(comment)} className="min-h-11 text-sm text-white/50">{removing===comment.id?'Removendo…':'Remover comentário'}</button>}</div>
        </>}
      </article>)}</div>
    </>}
    {error&&<div role="alert" className="mt-5 space-y-2 text-sm text-rose-200"><p>{error}</p>{!comments.length&&!viewer&&<button type="button" className="min-h-11 underline" onClick={()=>void load()}>Tentar novamente</button>}</div>}
    {notice&&<p role="status" className="mt-4 text-sm text-pink-100">{notice}</p>}
  </section>;
}
