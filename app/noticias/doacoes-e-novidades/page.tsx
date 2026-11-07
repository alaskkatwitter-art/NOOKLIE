import Link from 'next/link';
import type { Metadata } from 'next';
import NewsComments from '@/components/NewsComments';
import ShareNews from '@/components/ShareNews';
import { newsArticles } from '@/lib/news/articles';

const slug = 'doacoes-e-novidades';
const { title, description } = newsArticles[slug];

export const metadata: Metadata = { title: title + ' | Jornal Nooklie', description };

export default function DonationsAndUpdatesPage() {
  return (
    <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/noticias" className="inline-flex min-h-11 items-center text-sm font-semibold text-pink-200 hover:underline">
          Voltar ao Jornal Nooklie
        </Link>
        <article className="mt-6 rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-[#38192e] via-[#21131e] to-[#171018] p-6 sm:p-10">
          <header>
            <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Jornal Nooklie · Atualizações da comunidade</p>
            <p className="mt-3 text-sm text-white/65"><time dateTime="2026-11-07">7 de novembro de 2026</time> · Equipe Nooklie</p>
            <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
            <p className="mt-6 text-lg leading-8 text-pink-100">Os relatos da Ouvidoria ajudaram a corrigir problemas que apareciam principalmente no celular. Também abrimos um espaço para quem quiser contribuir com os custos do site.</p>
          </header>

          <div className="mt-9 space-y-8 leading-8 text-white/80">
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Uma meta para manter o Nooklie no ar</h2>
              <p className="mt-3">A página de Doação voluntária tem uma meta de <strong>R$ 160 por mês</strong> para ajudar a manter o Nooklie gratuito e sem anúncios. Contribuir é opcional, e o acesso à leitura, à escrita e às outras funções continua gratuito. O botão de contribuição ficará disponível assim que o link de recebimento for configurado.</p>
              <Link href="/doacoes" className="mt-3 inline-flex min-h-11 items-center font-semibold text-pink-200 underline">Conhecer o painel de doações</Link>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Menções no feed e retorno às notificações</h2>
              <p className="mt-3">Ao escrever um post, digite <strong>@</strong> e as primeiras letras do nome de usuário para ver sugestões. A menção leva ao perfil da pessoa e pode gerar um aviso, de acordo com as preferências dela. Quando você abre uma notificação, ela já é marcada como lida. Você pode voltar à lista e continuar usando a opção de marcar todas como lidas.</p>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Da publicação à página da obra</h2>
              <p className="mt-3">Ao confirmar a publicação, quem escreve vai direto para a página da obra. Os avisos de novos capítulos também levam os leitores a essa página, onde ficam a sinopse, as informações da história e o sumário.</p>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Mais espaço para escrever e ler no celular</h2>
              <p className="mt-3">Ajustamos o espaçamento de <strong>Que tipo de história você vai publicar?</strong> e <strong>Sua obra, suas escolhas</strong>. Na edição de capítulos, a barra de formatação acompanha a rolagem e o menu inferior fica oculto. Durante a leitura, o menu deixa de cobrir as respostas aos comentários de parágrafo.</p>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Vídeo no banner do capítulo</h2>
              <p className="mt-3">No editor de capítulos, você pode colar um link do YouTube ou enviar um vídeo da galeria em MP4 ou WebM de até 4 MB.</p>
            </section>
          </div>

          <footer className="mt-9 border-t border-pink-200/20 pt-6 leading-8 text-white/80">
            <p>Obrigada a quem escreveu para a <Link href="/ouvidoria" className="font-semibold text-pink-200 underline">Ouvidoria</Link> e contou como usa o Nooklie no dia a dia. A conversa sobre esta edição continua nos comentários abaixo.</p>
            <p className="mt-4 font-bold text-pink-200">Equipe Nooklie</p>
          </footer>
        </article>
        <ShareNews slug={slug} />
        <NewsComments article={slug} />
      </div>
    </main>
  );
}
