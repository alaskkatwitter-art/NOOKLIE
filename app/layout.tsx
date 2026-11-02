import './globals.css';
import { ReactNode } from 'react';
import Link from 'next/link';
import PolicyAcceptanceNotice from './components/PolicyAcceptanceNotice';

export const metadata = {
title: 'Nooklie — seu cantinho de histórias',
description: 'Um cantinho para histórias que nunca aconteceram.',
};

export default function RootLayout({
children,
}: {
children: ReactNode;
}) {
return (
<html lang="pt-BR">
<body>
  {children}
  <footer className="border-t border-white/10 bg-[#100b12] px-4 py-5 text-center text-xs text-white/50">
    <Link href="/politicas" className="hover:text-[#ff9aca]">Políticas do Nooklie</Link>
  </footer>
  <PolicyAcceptanceNotice />
</body>
</html>
);
}
