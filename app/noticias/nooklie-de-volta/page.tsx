import Link from 'next/link';
import type { Metadata } from 'next';
import NewsComments from '@/components/NewsComments';
import ShareNews from '@/components/ShareNews';
import { newsArticles } from '@/lib/news/articles';

const slug = 'nooklie-de-volta';
const { title, description } = newsArticles[slug];

export const metadata: Metadata = { title: title + ' | Jornal Nooklie', description };

export default function NooklieDeVoltaPage() {
  return (
    <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/noticias" className="inline-flex min-h-11 items-center text-sm font-semibold text-pink-200 hover:underline">
          Voltar ao Jornal Nooklie
        </Link>
        <article className="mt-6 rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-[#38192e] via-[#21131e] to-[#171018] p-6 sm:p-10">
          <header>
            <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Jornal Nooklie · Atualizações da comunidade</p>
            <p className="mt-3 text-sm text-white/65"><time dateTime="2026-11-14">14 de novembro de 2026</time> · Equipe Nooklie</p>
            <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
            <p className="mt-6 text-lg leading-8 text-pink-100">Depois de cerca de uma semana fora do ar, o Nooklie voltou em um novo endereço. Você já pode entrar com sua conta, retomar suas leituras e voltar a escrever.</p>
          </header>

          <div className="mt-9 space-y-8 leading-8 text-white/80">
            <section>
              <h2 className="text-2xl font-bold text-pink-100">Por que o Nooklie saiu do ar?</h2>
              <p className="mt-3">A Vercel, onde o site ficava hospedado, tem uma franquia de dados no plano gratuito. Cada vez que o site prepara uma página ou envia uma imagem, parte desses dados passa pelos servidores da hospedagem. O Nooklie atingiu o limite de 10 GB dessa transferência, que a Vercel chama de <em>Fast Origin Transfer</em>, e o endereço antigo ficou indisponível.</p>
              <p className="mt-3">Durante a pausa, migramos a hospedagem para a Cloudflare e conferimos o funcionamento do cadastro, do login, da biblioteca e do chat no novo endereço. As páginas e o login agora usam HTTPS, que protege a conexão entre seu navegador e o site.</p>
              <p className="mt-3 text-sm"><a href="https://vercel.com/docs/manage-cdn-usage#fast-origin-transfer" className="font-semibold text-pink-200 underline">Como a Vercel calcula esse limite</a></p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-pink-100">O que mudou na volta</h2>
              <ul className="mt-4 list-disc space-y-4 pl-5 marker:text-pink-300">
                <li><strong>Início, Explorar e Biblioteca.</strong> A página inicial e a vitrine de histórias foram renovadas. Na Biblioteca, a estante ficou mais compacta e você pode organizar suas obras em <em>Quero ler</em>, <em>Lendo</em> e <em>Já li</em>. O calendário reúne as próximas atualizações em um só lugar.</li>
                <li><strong>Perfil, mural, feed e chat.</strong> As telas ficaram mais compactas, com temas escuro e claro e detalhes em rosa. Em <em>Editar perfil</em>, você pode ajustar a capa, o avatar e o tema, além de usar GIFs no avatar e na capa dentro dos limites de upload. Publicações no mural podem avisar seus seguidores. Publicações feitas diretamente no feed aparecem lá sem disparar esse aviso.</li>
                <li><strong>Música no perfil, nas obras e nos capítulos.</strong> Você pode adicionar links do Spotify ou do YouTube. No perfil, também dá para indicar o nome da música e os artistas.</li>
                <li><strong>Importação de capítulos.</strong> No editor, o botão <em>Importar .docx ou PDF</em> traz o conteúdo para revisão antes de salvar. O Word preserva formatação básica e imagens compatíveis. O PDF traz texto selecionável, tenta preservar os parágrafos e os trechos em destaque, e pode precisar de revisão.</li>
                <li><strong>Download de obras com autorização do autor.</strong> Se o autor liberar, a página da obra oferece PDF e EPUB com crédito de autoria. A opção pode ser ativada na edição da obra.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-pink-100">Por onde entrar agora</h2>
              <p className="mt-3">Se você tinha o endereço antigo salvo nos favoritos ou em um atalho, salve o novo link. Use o mesmo nome de usuário e senha da sua conta.</p>
              <Link href="/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-pink-200 underline">nooklie.nooklie-the-app.workers.dev</Link>
            </section>
          </div>

          <footer className="mt-9 border-t border-pink-200/20 pt-6 leading-8 text-white/80">
            <p>Obrigada pela paciência durante a pausa. Se alguma coisa travar na volta, conte pra gente pela <Link href="/ouvidoria" className="font-semibold text-pink-200 underline">Ouvidoria</Link> ou nos comentários abaixo.</p>
            <p className="mt-4 font-bold text-pink-200">Equipe Nooklie</p>
          </footer>
        </article>
        <ShareNews slug={slug} />
        <NewsComments article={slug} />
      </div>
    </main>
  );
}
