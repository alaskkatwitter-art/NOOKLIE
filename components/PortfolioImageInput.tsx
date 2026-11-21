'use client';
import { useEffect,useRef,useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { portfolioImageMaxBytes,portfolioImageTypes } from '@/lib/community/portfolio';

export default function PortfolioImageInput({image,file,onChange,disabled=false}:{image:string;file?:File;onChange:(image:string,file?:File)=>void;disabled?:boolean}){
 const input=useRef<HTMLInputElement>(null);const [preview,setPreview]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 return <div className="cv-form">
  <label className="cv-secondary gap-2"><ImagePlus size={18}/> Escolher foto da galeria
   <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled} onChange={e=>{
    const selected=e.target.files?.[0];if(!selected)return;
    if(!selected.size||!Object.hasOwn(portfolioImageTypes,selected.type)){setError('Escolha uma foto JPG, PNG ou WebP.');e.target.value='';return;}
    if(selected.size>portfolioImageMaxBytes){setError('Escolha uma foto de até 3 MB.');e.target.value='';return;}
    setError('');onChange('',selected);
   }}/>
  </label>
  <p className="cv-help">JPG, PNG ou WebP · até 3 MB por foto. A imagem será enviada ao salvar seu espaço.</p>
  {error&&<p role="alert" className="cv-notice">{error}</p>}
  {(preview||image)&&<div><img src={preview||image} alt="Prévia do trabalho no portfólio" className="max-h-72 w-full object-contain border border-white/15"/>{file&&<p className="cv-help break-words">{file.name}</p>}<button type="button" className="cv-secondary mt-2" disabled={disabled} onClick={()=>{onChange('');if(input.current)input.current.value='';}}>Retirar foto</button></div>}
  <details><summary className="cv-help cursor-pointer py-3">Ou usar um link de imagem</summary><label>Link direto da imagem (opcional)<input className="cv-input" type="url" pattern="https://.*" maxLength={1000} value={file?'':image} disabled={disabled} onChange={e=>{onChange(e.target.value);if(input.current)input.current.value='';}} placeholder="https://…"/></label></details>
 </div>;
}
