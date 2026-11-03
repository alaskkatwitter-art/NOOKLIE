import Link from 'next/link';
import PolicyDocumentBody from '@/app/components/PolicyDocumentBody';
import { publicRules } from '@/lib/policies/public-rules';

export const metadata = { title: 'Políticas do Nooklie', description: 'Regras da comunidade, autoria, privacidade e identificação de inteligência artificial.' };

export default function PublicPoliciesPage() {
  return <main className="info-page min-h-screen px-4 py-8 text-white sm:px-6 sm:py-12"><article className="mx-auto max-w-3xl">

    <div className="info-hero"><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[#ff9aca]">Nossa comunidade</p>
    <h1 className="mt-3 break-words text-3xl font-black sm:text-4xl">Políticas do Nooklie</h1>
    <p className="mt-4 text-sm leading-7 text-white/75">Liberdade criativa, respeito e cuidado com a autoria. Conheça as regras gerais de publicação e convivência, incluindo a identificação do uso de inteligência artificial.</p>
    <p className="mt-3 text-xs text-white/65">Versão 1.0 · Publicada em 2 de novembro de 2026</p>
    </div><div className="mt-8 border-t border-white/10 pt-5"><PolicyDocumentBody content={publicRules} /></div>
  </article></main>;
}
