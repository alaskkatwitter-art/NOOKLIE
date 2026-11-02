import{createHash}from'node:crypto';
export function rateLimitKey(scope:string,actor:string){return createHash('sha256').update(scope+':'+actor).digest('hex');}
