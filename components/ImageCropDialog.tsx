'use client';
import { useEffect, useRef, useState } from 'react';
import AnimatedProfileImage from './AnimatedProfileImage';
import { defaultImageFraming, validateProfileGif, type ImageFraming } from '@/lib/profile/animation';
import { exportProfilePhoto, profilePhotoError, profilePhotoType } from '@/lib/profile/photo-client';
import { cropRect } from '@/lib/images/crop';

export default function ImageCropDialog({ source, kind, allowGif = false, framing = defaultImageFraming, onCancel, onSave }: {
  source: File | string;
  kind: 'avatar' | 'cover';
  allowGif?: boolean;
  framing?: ImageFraming;
  onCancel: () => void;
  onSave: (file: File, animation?: { gif: Blob; framing: ImageFraming }) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{x: number; y: number; positionX: number; positionY: number} | null>(null);
  const [loadedImage, setLoadedImage] = useState<{ image: HTMLImageElement; gif?: Blob; url: string } | null>(null);
  const image = loadedImage?.image;
  const [zoom, setZoom] = useState(framing.zoom), [x, setX] = useState(framing.x), [y, setY] = useState(framing.y);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const aspect = kind === 'avatar' ? 1 : 3;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    void (async () => {
      try {
        const file = typeof source === 'string'
          ? await fetch(source, { signal: controller.signal }).then(response => {
              if (!response.ok) throw new Error('Não foi possível abrir a imagem atual. Tente selecionar o arquivo novamente.');
              return response.blob();
            })
          : source;
        const fileError = profilePhotoError(file, kind, allowGif);
        if (fileError) throw new Error(fileError);
        const type = profilePhotoType(file);
        const imageBlob = type === file.type ? file : file.slice(0, file.size, type);
        const gif = type === 'image/gif' ? imageBlob : undefined;
        if (gif) {
          const gifError = validateProfileGif(new Uint8Array(await gif.arrayBuffer()), kind);
          if (gifError) throw new Error(gifError);
        }
        if (controller.signal.aborted) return;

        const loaded = new Image();
        url = URL.createObjectURL(imageBlob);
        loaded.src = url;
        try {
          await loaded.decode();
        } catch {
          if (controller.signal.aborted) return;
          if (type !== 'image/heic' && type !== 'image/heif') {
            throw new Error('Não foi possível abrir a imagem. Tente selecionar outro arquivo.');
          }
          try {
            const { heicTo } = await import('heic-to/csp');
            if (controller.signal.aborted) return;
            const jpeg = await heicTo({ blob: imageBlob, type: 'image/jpeg', quality: 0.92 });
            if (controller.signal.aborted) return;
            URL.revokeObjectURL(url);
            url = URL.createObjectURL(jpeg);
            loaded.src = url;
            await loaded.decode();
          } catch {
            throw new Error('Não foi possível abrir esta foto em HEIC ou HEIF. Tente exportá-la como JPG e escolha o arquivo novamente.');
          }
        }
        if (loaded.naturalWidth * loaded.naturalHeight > 50000000) throw Error('Escolha uma imagem com resolução menor.');
        if (!controller.signal.aborted) setLoadedImage({ image: loaded, gif, url });
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error && e.message ? e.message : 'Não foi possível abrir a imagem. Escolha o arquivo novamente.'); }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [allowGif, kind, source]);
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
      <div className={`relative overflow-hidden ${kind === 'avatar' ? 'mx-auto max-w-80 rounded-full' : 'rounded-xl'}`}>
      <canvas ref={canvas} width={loadedImage?.gif ? (kind === 'avatar' ? 320 : 1200) : (kind === 'avatar' ? 512 : 1500)} height={loadedImage?.gif ? (kind === 'avatar' ? 320 : 400) : (kind === 'avatar' ? 512 : 500)} aria-label="Prévia do enquadramento" style={{aspectRatio: String(aspect), touchAction: 'none'}} className="block w-full bg-black/30"
        onPointerDown={event => { if (!image || busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x: event.clientX, y: event.clientY, positionX: x, positionY: y}; }}
        onPointerMove={event => { if (!drag.current || !image) return; const bounds = event.currentTarget.getBoundingClientRect(); const rect = cropRect(image.naturalWidth,image.naturalHeight,aspect,zoom,x,y); const overflowX = image.naturalWidth - rect.sw, overflowY = image.naturalHeight - rect.sh; if (overflowX > 0) setX(Math.max(0,Math.min(100,drag.current.positionX - (event.clientX-drag.current.x) / bounds.width * rect.sw / overflowX * 100))); if (overflowY > 0) setY(Math.max(0,Math.min(100,drag.current.positionY - (event.clientY-drag.current.y) / bounds.height * rect.sh / overflowY * 100))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
        {loadedImage?.gif && <AnimatedProfileImage animation={{ url: loadedImage.url, zoom, x, y }} kind={kind} className="profile-crop-animation" />}
      </div>
      {[['Zoom',zoom,1,3,0.01,setZoom],['Posição horizontal',x,0,100,1,setX],['Posição vertical',y,0,100,1,setY]].map(([label,value,min,max,step,setter]) => <label key={label as string} className="block text-sm">{label as string}<input type="range" aria-label={label as string} min={min as number} max={max as number} step={step as number} value={value as number} disabled={busy || !image} onChange={event => (setter as (value:number)=>void)(Number(event.target.value))} className="mt-2 block w-full accent-pink-400" /></label>)}
      {!image && !error && <p role="status" className="text-sm text-white/65">Preparando a imagem…</p>}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={onCancel} className="nook-choice">Cancelar</button><button type="button" disabled={!image || busy} className="nook-primary" onClick={async () => {
        if (!canvas.current) return; setBusy(true); setError('');
        try {
          const gif = loadedImage?.gif;
          const file = await exportProfilePhoto(canvas.current, kind, Boolean(gif));
          await onSave(file, gif ? { gif, framing: { zoom, x, y } } : undefined);
        }
        catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Salvando…' : 'Salvar enquadramento'}</button></div>
    </div>
  </dialog>;
}
