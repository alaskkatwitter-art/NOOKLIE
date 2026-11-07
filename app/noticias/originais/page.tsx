import ShareNews from '@/components/ShareNews';
import NewsComments from '@/components/NewsComments';
import Link from 'next/link';
import OriginalsShelf from '@/components/OriginalsShelf';

export const metadata = {
  title: 'Conheça os originais do Nooklie',
  description: 'Descubra livros, contos, coletâneas e poesia da comunidade.',
};

export default function OriginalsNewsPage() {
  return (
    <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/noticias" className="inline-flex min-h-11 items-center text-sm font-bold text-pink-200 hover:underline">Voltar ao Jornal Nooklie</Link>
        <article className="my-6 rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-[#38192e] via-[#21131e] to-[#171018] p-6 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Jornal Nooklie · Obras da comunidade</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Conheça os originais do Nooklie</h1>
          <div className="mt-6 max-w-prose space-y-4 leading-7 text-white/75">
            <p>Tem histórias que começam com uma cidade inventada, outras com uma conversa ou uma imagem que ficou na cabeça. No Nooklie, esses começos agora têm uma prateleira própria. Você pode descobrir um conto para ler de uma vez ou acompanhar um livro desde a estreia.</p>
            <p>Em Explorar, selecione Originais e combine formato, tags e status para encontrar a próxima leitura. Se você escreve, escolha Obra original ao criar sua história e conte ao leitor o que ele vai encontrar na capa, na sinopse e no sumário.</p>
          </div>
          <Link href="/escrever" className="nook-primary mt-6 inline-flex">Publicar minha história</Link>
        </article>
        <OriginalsShelf />
        <ShareNews slug="originais"/><NewsComments article="originais" />
      </div>
    </main>
  );
}
