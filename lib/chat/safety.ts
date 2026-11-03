export function needsSupport(text:string){const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /\b(suicid\w*|matar|me\s+machucar|tirar\s+(?:a\s+)?(?:minha\s+)?vida|atentado|assassin\w*)\b/.test(normalized);}
export const chatSafetyNotice='O Nooklie preza pelo respeito, segurança e paz. Não há ligações de voz nem de vídeo neste chat, para proteger a comunidade e especialmente os menores de idade. Não compartilhe dados pessoais ou imagens íntimas. Você pode bloquear e denunciar.';
export const cvvPhone='tel:+55188?oai_link_source=model_response_hotline';
export const cvvSite='https://www.cvv.org.br/?oai_link_source=model_response_hotline';

export function detectedMedia(bytes:Uint8Array):string|null{
 const b=Buffer.from(bytes);if(b.length<12)return null;
 if(/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return 'image/gif';
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE')return 'audio/wav';
 if(b.toString('ascii',0,4)==='OggS')return 'audio/ogg';
 if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'audio/webm';
 if(b.toString('ascii',0,3)==='ID3'||(b[0]===0xff&&(b[1]&0xe0)===0xe0))return 'audio/mpeg';
 if(b.toString('ascii',4,8)==='ftyp'&&/^(M4A |M4B |isom|mp42)/.test(b.toString('ascii',8,12)))return 'audio/mp4';
 return null;
}
