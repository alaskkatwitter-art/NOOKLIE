import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PRODUCTION_HOST = 'nooklie.vercel.app';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get('host') || request.nextUrl.host;
  const protocol = process.env.VERCEL === '1' ? 'https:' : request.nextUrl.protocol;
  const originForHost = protocol + '//' + host;
  const isApi = pathname.startsWith('/api/');
  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
        (origin && origin !== originForHost)) {
      return NextResponse.json(
        { error: 'Origem da requisição não permitida.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  const response = NextResponse.next();
  if (pathname.startsWith('/api/auth/')) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  // Keep previews on their own hosts for testing.
  if (process.env.VERCEL_ENV !== 'production') return response;
  const hostname = host.split(':')[0];

  // Qualquer outro domínio do Vercel que esteja
  // servindo o projeto será enviado para o domínio oficial.
  if (hostname !== PRODUCTION_HOST && hostname.endsWith('.vercel.app')) {
    const url = request.nextUrl.clone();

    url.protocol = 'https:';
    url.hostname = PRODUCTION_HOST;
    url.port = '';

    return NextResponse.redirect(url, 308);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Executa em páginas e APIs, mas ignora
     * arquivos estáticos do Next.js e arquivos públicos.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
