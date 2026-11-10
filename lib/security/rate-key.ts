import{createHash}from'node:crypto';
export function rateLimitKey(scope:string,actor:string){return createHash('sha256').update(scope+':'+actor).digest('hex');}

export function clientIpForAuth(request: Request) {
  const header = process.env.NOOKLIE_CLOUDFLARE_RUNTIME === '1'
    ? 'cf-connecting-ip'
    : 'x-vercel-forwarded-for';
  return request.headers.get(header)?.split(',')[0]?.trim() || 'unknown';
}
