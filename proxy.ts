import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PRODUCTION_HOST = 'toriland.vercel.app';

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || '';

  // Já está no domínio oficial.
  if (hostname === PRODUCTION_HOST) {
    return NextResponse.next();
  }

  // Em desenvolvimento local, não redireciona.
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  ) {
    return NextResponse.next();
  }

  // Qualquer outro domínio do Vercel que esteja
  // servindo o projeto será enviado para o domínio oficial.
  if (hostname.endsWith('.vercel.app')) {
    const url = request.nextUrl.clone();

    url.protocol = 'https:';
    url.hostname = PRODUCTION_HOST;
    url.port = '';

    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
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
