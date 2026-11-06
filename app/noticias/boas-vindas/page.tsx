import NewsComments from '@/components/NewsComments';
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const title = "Bem-vindo ao Nooklie 1.0";
const description = "Seu guia ilustrado para descobrir histórias, personalizar a leitura, conversar com a comunidade e publicar seus capítulos.";

export const metadata: Metadata = { title: title + " | Jornal Nooklie", description };

const sections = [
  {
    id: "inicio",
    title: "1. Comece pelo Início",
    body: "Crie sua conta com um nome de usuário e uma senha. Na aba Início, use a busca para encontrar uma obra, um autor, uma tag ou um fandom. Em Meus fandoms favoritos, escolha os universos que você quer acompanhar. Depois da primeira leitura, o bloco Continuar lendo ajuda você a voltar ao capítulo e ao ponto em que parou.",
    alt: "Tela Início do Nooklie com o campo de busca circulado.",
    caption: "A busca fica no topo do Início.",
    href: "/inicio",
    label: "Ir para o Início",
  },
  {
    id: "explorar",
    title: "2. Encontre sua próxima história",
    body: "Em Explorar, procure pelo nome da obra ou filtre por gênero, fandom e tags. Por exemplo, tente combinar Fantasia com um dos seus universos favoritos. Abra a capa de uma história para ler a sinopse, conferir a classificação e os avisos e ver os capítulos publicados. O menu também oferece Meus universos para explorar por fandom.",
    alt: "Tela Explorar com a área de filtros circulada.",
    caption: "Combine os filtros para afunilar a busca.",
    href: "/explorar",
    label: "Explorar histórias",
  },
  {
    id: "leitor",
    title: "3. Leia do seu jeito",
    body: "Na página da obra, toque em Começar a ler ou escolha um capítulo. Dentro do leitor, abra Sumário para trocar de capítulo e Personalizar leitura para ajustar fonte, tamanho, espaçamento, margens e tema. Na área de comentários, você pode comentar o capítulo inteiro ou selecionar um trecho para comentar sobre ele.",
    alt: "Tela do leitor com os botões Sumário e Personalizar leitura circulados.",
    caption: "O Sumário e a personalização ficam no topo do capítulo.",
    href: "/explorar",
    label: "Escolher uma história para ler",
  },
  {
    id: "biblioteca",
    title: "4. Guarde suas leituras na Biblioteca",
    body: "Use a opção de salvar de uma obra para encontrá-la de novo na aba Biblioteca. Ali você acompanha seu progresso nas histórias guardadas. Para retomar a leitura que já começou, também pode usar Continuar lendo no Início.",
    alt: "Tela Minha biblioteca com a seção de histórias salvas circulada.",
    caption: "As obras que você guarda aparecem em Sua biblioteca.",
    href: "/biblioteca",
    label: "Abrir a Biblioteca",
  },
  {
    id: "feed",
    title: "5. Converse no Feed e veja o calendário",
    body: "No Feed, toque em O que você quer compartilhar? para escrever uma Nooklada. Use Seu Story para criar um story e a lupa para encontrar pessoas. Nas publicações, use as opções disponíveis para curtir, responder ou compartilhar. Para ver os próximos capítulos agendados, procure o calendário Próximas ATTs na lateral do computador. No celular, o botão do calendário fica no topo do Feed, acima dos stories.",
    alt: "Feed com o campo de publicação e o calendário Próximas ATTs circulados.",
    caption: "No computador, o calendário fica à direita das publicações.",
    href: "/feed",
    label: "Abrir o Feed",
  },
  {
    id: "criar",
    title: "6. Crie sua história e publique capítulos",
    body: "Em Escrever, toque em Criar nova história. Preencha Sua história com título e sinopse. Em Capa e descoberta, adicione a capa e organize as informações que ajudam outras pessoas a encontrar a obra. Revise a classificação, os avisos e as permissões na última etapa. Depois, abra Minhas histórias para editar a obra, preparar capítulos e escolher entre publicar na hora ou agendar para mais tarde.",
    alt: "Formulário de criação com as três etapas circuladas.",
    caption: "A criação da obra tem três etapas. Você adiciona os capítulos depois.",
    href: "/escrever",
    label: "Começar a escrever",
  },
  {
    id: "menu",
    title: "7. Encontre mensagens, perfil, eventos e ajuda",
    body: "Abra o menu no canto superior da tela. Em Mensagens, você encontra conversas privadas e em grupo. Em Meu perfil, personalize seu espaço. Use Solicitações de seguidores e Configurações para cuidar da sua privacidade. Eventos literários reúne atividades da comunidade, e Faça parte da equipe mostra as oportunidades disponíveis. Para pedir ajuda, abra Ouvidoria e ajuda. O sino no topo leva às notificações.",
    alt: "Menu do Nooklie com os atalhos de mensagens, eventos, perfil e ajuda circulados.",
    caption: "O menu reúne os atalhos que ficam fora da barra principal.",
    href: "/ouvidoria",
    label: "Abrir a Ouvidoria",
  },
] as const;

export default function WelcomeNewsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 text-white sm:pt-12">
      <Link href="/noticias" className="text-sm font-semibold text-[#ff9bca] hover:underline">
        ← Voltar ao Jornal Nooklie
      </Link>
      <article className="mt-6">
        <header className="rounded-3xl border border-[#ff78b9]/25 bg-[#291522] p-6 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ff9bca]">Jornal Nooklie · Edição 01</p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-white/80">{description}</p>
        </header>

        <div className="my-8 space-y-4 leading-7 text-white/85">
          <p>O Nooklie nasceu da vontade de criar um refúgio para quem ama ler e escrever. Somos uma equipe pequena de voluntários que queria construir o tipo de espaço em que também gostaria de ser acolhida. Nesta primeira edição do Jornal, a gente mostra onde encontrar cada coisa, da próxima leitura ao primeiro capítulo publicado.</p>
          <p>Os círculos rosas nas capturas indicam onde tocar ou clicar. Você pode seguir o guia na ordem ou ir direto à seção que procura.</p>
        </div>

        <nav aria-label="Nesta edição" className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <h2 className="mb-3 font-bold">Nesta edição</h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {sections.map(({ id, title }) => (
              <li key={id}><a className="text-[#ff9bca] hover:underline" href={`#${id}`}>{title}</a></li>
            ))}
          </ul>
        </nav>

        {sections.map(({ id, title, body, alt, caption, href, label }) => (
          <section key={id} id={id} className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
            <p className="mt-3 leading-7 text-white/85">{body}</p>
            <figure className="my-5">
              <a href={`/jornal/boas-vindas/${id}.jpg`} aria-label={`Ampliar captura: ${title}`}>
                <Image
                  src={`/jornal/boas-vindas/${id}.jpg`}
                  alt={alt}
                  width={1348}
                  height={926}
                  sizes="(max-width: 900px) 95vw, 856px"
                  className="h-auto w-full rounded-xl border border-white/15"
                  unoptimized
                />
              </a>
              <figcaption className="mt-2 text-sm text-white/65">{caption} Toque na imagem para ampliar.</figcaption>
            </figure>
            <Link href={href} className="font-semibold text-[#ff9bca] hover:underline">{label} →</Link>
          </section>
        ))}

        <footer className="mt-12 rounded-2xl border border-[#ff78b9]/25 bg-[#291522] p-6 leading-7">
          <p>Se você chegou para ler, esperamos que encontre uma história que dê vontade de virar a página. Se chegou para escrever, que bom ter sua voz aqui. Boas leituras e boa escrita!</p>
          <p className="mt-3 font-bold text-[#ff9bca]">Equipe Nooklie</p>
        </footer>
        <NewsComments article="boas-vindas" />
      </article>
    </main>
  );
}
