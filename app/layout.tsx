import './globals.css';
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
<html lang="pt-BR" className={`${nooklieBody.variable} ${nooklieHeading.variable}`}>
<body><SiteNavigation />{children}<footer className="border-t border-white/10 bg-[#100b12] px-4 py-5 text-center text-sm text-white/70"><Link href="/politicas" className="inline-block min-h-11 rounded-lg px-3 py-3 text-[#ff9aca] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff78b9]">Políticas do Nooklie</Link>{[["/sobre", "Sobre"], ["/termos", "Termos"], ["/privacidade", "Privacidade"]].map(([href,label]) => <Link key={href} href={href} className="inline-block min-h-11 px-3 py-3 hover:text-[#ff9aca]">{label}</Link>)}</footer></body>
</html>
);
}
