'use client';
import { useEffect, useRef, useState } from 'react';
import { cropRect } from '@/lib/images/crop';

export default function ImageCropDialog({ source, kind, onCancel, onSave }: {
  source: File | string; kind: 'avatar' | 'cover'; onCancel: () => void; onSave: (file: File) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{x: number; y: number; positionX: number; positionY: number} | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1), [x, setX] = useState(50), [y, setY] = useState(50);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const aspect = kind === 'avatar' ? 1 : 3;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    void (async () => {
      try {
        const file = typeof source === 'string' ? await fetch(source, {signal: controller.signal}).then(r => { if (!r.ok) throw Error(); return r.blob(); }) : source;
        if (file.size > 20 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Use uma imagem JPG, PNG ou WEBP de até 20 MB.');
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(file);
        const loaded = new Image(); loaded.src = url; await loaded.decode();
        if (loaded.naturalWidth * loaded.naturalHeight > 50000000) throw Error('Escolha uma imagem com resolução menor.');
        if (!controller.signal.aborted) setImage(loaded);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error && e.message ? e.message : 'Não foi possível abrir a imagem. Escolha o arquivo novamente.'); }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [source]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext('2d'); if (!context) return;
    const rect = cropRect(image.naturalWidth, image.naturalHeight, aspect, zoom, x, y);
    context.clearRect(0, 0, canvas.current.width, canvas.current.height);
    context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.current.width, canvas.current.height);
  }, [image, aspect, zoom, x, y]);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="crop-title" className="nook-dialog w-[min(94vw,640px)]">
    <div className="space-y-5 p-2">
      <h2 id="crop-title" className="text-xl font-bold">Ajustar {kind === 'avatar' ? 'foto de perfil' : 'capa'}</h2>
      <p className="text-sm text-white/65">Arraste a imagem ou ajuste os controles. A prévia mostra o enquadramento que será salvo.</p>
      <canvas ref={canvas} width={kind === 'avatar' ? 512 : 1500} height={kind === 'avatar' ? 512 : 500} aria-label="Prévia do enquadramento" style={{aspectRatio: String(aspect), touchAction: 'none'}} className={`w-full bg-black/30 ${kind === 'avatar' ? 'mx-auto max-w-80 rounded-full' : 'rounded-xl'}`}
        onPointerDown={event => { if (!image || busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x: event.clientX, y: event.clientY, positionX: x, positionY: y}; }}
        onPointerMove={event => { if (!drag.current || !image) return; const bounds = event.currentTarget.getBoundingClientRect(); const rect = cropRect(image.naturalWidth,image.naturalHeight,aspect,zoom,x,y); const overflowX = image.naturalWidth - rect.sw, overflowY = image.naturalHeight - rect.sh; if (overflowX > 0) setX(Math.max(0,Math.min(100,drag.current.positionX - (event.clientX-drag.current.x) / bounds.width * rect.sw / overflowX * 100))); if (overflowY > 0) setY(Math.max(0,Math.min(100,drag.current.positionY - (event.clientY-drag.current.y) / bounds.height * rect.sh / overflowY * 100))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      {[['Zoom',zoom,1,3,0.01,setZoom],['Posição horizontal',x,0,100,1,setX],['Posição vertical',y,0,100,1,setY]].map(([label,value,min,max,step,setter]) => <label key={label as string} className="block text-sm">{label as string}<input type="range" aria-label={label as string} min={min as number} max={max as number} step={step as number} value={value as number} disabled={busy || !image} onChange={event => (setter as (value:number)=>void)(Number(event.target.value))} className="mt-2 block w-full accent-pink-400" /></label>)}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={onCancel} className="nook-choice">Cancelar</button><button type="button" disabled={!image || busy} className="nook-primary" onClick={async () => {
        if (!canvas.current) return; setBusy(true); setError('');
        try { const output = await new Promise<Blob>((resolve,reject) => canvas.current!.toBlob(blob => blob ? resolve(blob) : reject(Error('Não foi possível preparar a imagem.')), 'image/webp', 0.9)); await onSave(new File([output], kind+'.webp', {type:'image/webp'})); }
        catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Salvando…' : 'Salvar enquadramento'}</button></div>
    </div>
  </dialog>;
}
