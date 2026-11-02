'use client';
import { useEffect, useState } from 'react';

export default function ReadingProgressTracker({ chapterId, storyId }: { chapterId: string; storyId: string }) {
  const [status,setStatus]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    let account='';let enabled=false;let restoring=true;let alive=true;let last=Date.now();let visibleSeconds=0;let wasVisible=document.visibilityState==='visible';let latestPosition=0;
    let queue=Promise.resolve();let timer:ReturnType<typeof setTimeout>|undefined;
    const element=document.querySelector<HTMLElement>('.chapter-content');
    function position(){if(!element?.isConnected)return latestPosition;const rect=element.getBoundingClientRect();const distance=Math.max(1,element.offsetHeight-window.innerHeight+100);latestPosition=Math.min(1,Math.max(0,(100-rect.top)/distance));return latestPosition;}
    function updateTime(){const now=Date.now();if(wasVisible)visibleSeconds+=Math.min(10,(now-last)/1000);last=now;wasVisible=document.visibilityState==='visible';}
    function save(){
      updateTime();if(!enabled||restoring||!account)return;
      const percent=position()*100;
      const body=JSON.stringify({chapter_id:chapterId,story_id:storyId,percent:Math.round(percent*100)/100,position:Math.round(percent*100),read_seconds:Math.floor(visibleSeconds)});
      queue=queue.catch(()=>undefined).then(async()=>{try{const response=await fetch('/api/reading-progress',{method:'PUT',headers:{'Content-Type':'application/json','X-Discovery-Account':account},body,keepalive:true});if(!response.ok)throw new Error();if(alive)setStatus('Posição salva na sua conta.');}catch{if(alive)setStatus('Não foi possível sincronizar a posição. Tentaremos novamente.');}});
    }
    async function restore(){try{
      const response=await fetch(`/api/reading-progress?chapter=${encodeURIComponent(chapterId)}`,{cache:'no-store',signal:controller.signal});
      if(response.status===401){if(alive)setStatus('Entre para salvar seu progresso de leitura.');return;}
      if(!response.ok)throw new Error();const data=await response.json();if(controller.signal.aborted)return;account=data.account_id;enabled=true;
      if(data.progress?.position>0){
        await document.fonts.ready;
        if(controller.signal.aborted)return;
        const el=element;if(el){latestPosition=Math.min(1,data.progress.position/10000);const top=el.getBoundingClientRect().top+window.scrollY;const distance=Math.max(1,el.offsetHeight-window.innerHeight+100);window.scrollTo({top:top-100+distance*latestPosition,behavior:'instant'});}
      }
      if(alive)setStatus(data.progress?'Leitura retomada. Seu progresso será salvo.':'Seu progresso será salvo nesta conta.');
    }catch{if(!controller.signal.aborted&&alive)setStatus('Sincronização indisponível. Reabra o capítulo para tentar novamente.');}finally{restoring=false;}}
    void restore();
    function scroll(){if(!restoring)position();if(timer)clearTimeout(timer);timer=setTimeout(save,2500);}
    function visibility(){updateTime();if(document.visibilityState==='hidden')save();}
    const interval=setInterval(()=>{updateTime();if(document.visibilityState==='visible')save();},10000);
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',visibility);
    return()=>{alive=false;controller.abort();if(timer)clearTimeout(timer);clearInterval(interval);save();window.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',visibility);};
  },[chapterId,storyId]);
  return <p role="status" className="my-4 text-xs leading-6 text-white/50">{status}</p>;
}
