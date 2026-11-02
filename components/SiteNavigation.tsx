'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function SiteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  return <nav aria-label="Navegação principal" className="site-navigation">
    <button type="button" onClick={() => window.history.length > 1 ? router.back() : router.push('/')} aria-label="Voltar para a página anterior">← Voltar</button>
    {([['/', 'Início'], ['/feed', 'Feed'], ['/explorar', 'Explorar'], ['/escrever', 'Escrever']] as const).map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
