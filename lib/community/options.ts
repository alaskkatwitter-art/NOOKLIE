export const readingStates = {want:'Quero ler',reading:'Lendo',read:'Já li',paused:'Em pausa',dropped:'Abandonei'} as const;
export const serviceCategories = {cover:'Capas',beta:'Beta reader',aesthetic:'Aesthetics',proofreading:'Revisão',illustration:'Ilustração',translation:'Tradução',other:'Outros serviços'} as const;
export const serviceStates = {free:'Aceita pedidos gratuitos',closed:'Pedidos fechados',external:'Pedidos pagos fora do site'} as const;
export function httpsUrl(value: unknown, optional = true): string {
 if (optional && (value === '' || value == null)) return '';
 if(typeof value!=='string'||value.length>1000) throw Error('Informe um link HTTPS válido.');
 try {const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error();return url.href;}catch{throw Error('Informe um link HTTPS válido.');}
}
export function shortText(value:unknown,min:number,max:number):string {
 if(typeof value!=='string'||value.trim().length<min||value.length>max)throw Error(`Informe um texto entre ${min} e ${max} caracteres.`);
 return value.trim();
}
