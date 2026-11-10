import './globals.css';
import './social-visual.css';
import './platform-theme.css';
import SiteNavigation from '@/components/SiteNavigation';
import { ReactNode } from 'react';
import Link from 'next/link';
import { nooklieBody, nooklieHeading } from '@/lib/fonts/interface';

export const metadata = {
title: 'Nooklie — seu cantinho de histórias',
icons: { icon: '/icon.svg' },
description: 'Um cantinho para histórias que nunca aconteceram.',
};

export default function RootLayout({
children,
}: {
children: ReactNode;
}) {
return (
<html lang="pt-BR" data-ui-theme="dark" suppressHydrationWarning className={`${nooklieBody.variable} ${nooklieHeading.variable}`}>
<head><script id="nooklie-ui-theme" dangerouslySetInnerHTML={{ __html: `(function(){var t='dark';try{if(localStorage.getItem('nooklie:ui-theme')==='light')t='light'}catch(e){}document.documentElement.dataset.uiTheme=t;document.documentElement.style.colorScheme=t==='light'?'light':'dark'})()` }}/></head>
<body><SiteNavigation />{children}<footer className="border-t border-white/10 bg-[#100b12] px-4 py-5 text-center text-sm text-white/70"><Link href="/politicas" className="inline-block min-h-11 rounded-lg px-3 py-3 text-[#ff9aca] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff78b9]">Políticas do Nooklie</Link>{[["/sobre", "Sobre"], ["/doacoes", "Doação voluntária"], ["/termos", "Termos"], ["/privacidade", "Privacidade"]].map(([href,label]) => <Link key={href} href={href} className="inline-block min-h-11 px-3 py-3 hover:text-[#ff9aca]">{label}</Link>)}<a href="mailto:appnookie@gmail.com" className="inline-block min-h-11 px-3 py-3 text-[#ff9aca] hover:underline">Fale conosco</a><a href="https://www.tiktok.com/@nooklie.com" target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 px-3 py-3 text-[#ff9aca] hover:underline" title="TikTok do Nooklie" aria-label="TikTok do Nooklie"><svg viewBox="0 0 24 24" fill="currentColor" className="inline-block h-5 w-5 align-middle" aria-hidden="true"><path d="M16.6 2c.3 2.3 1.6 3.8 4 4.2v3.4a9.4 9.4 0 0 1-4-1.2v7.2a6.1 6.1 0 1 1-5.2-6V13a2.7 2.7 0 1 0 1.8 2.6V2h3.4Z"/></svg><span className="sr-only">TikTok</span></a></footer></body>
</html>
);
}
