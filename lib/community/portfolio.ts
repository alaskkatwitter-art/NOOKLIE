export const portfolioImageTypes: Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export const portfolioImageMaxBytes = 3 * 1024 * 1024;
export const portfolioUploadMaxBytes = 12 * 1024 * 1024;
export function portfolioMediaPath(value:unknown,profile:string) {
 if(typeof value!=='string')return null;
 const prefix='/api/services/media/'+profile+'/';
 if(!value.startsWith(prefix))return null;
 const file=value.slice(prefix.length);
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(file)?'service-portfolios/'+profile+'/'+file:null;
}
