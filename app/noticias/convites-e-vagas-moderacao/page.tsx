import Link from 'next/link';
import type { Metadata } from 'next';
import NewsComments from '@/components/NewsComments';
import ShareNews from '@/components/ShareNews';
import { newsArticles } from '@/lib/news/articles';
const slug = 'convites-e-vagas-moderacao';
const { title, description } = newsArticles[slug];
export const metadata: Metadata = { title: title + ' | Jornal Nooklie', description };
export default function InvitesAndModerationNews() {
  return <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white sm:py-16"><div className="mx-auto max-w-3xl">
    <Link href="/noticias" className="inline-flex min-h-11 items-center text-sm font-semibold text-pink-200 hover:underline">Voltar ao Jornal Nooklie</Link>
    <article className="mt-6 rounded-2xl border border-pink-300/20 bg-gradient-to-br from-[#38192e] via-[#21131e] to-[#171018] p-6 sm:p-10">
      <header><p className="text-sm font-bold uppercase tracking-widest text-pink-300">Jornal Nooklie · Comunidade</p>
        <p className="mt-3 text-sm text-white/65"><time dateTime="2026-11-20">20 de novembro de 2026</time> · Equipe Nooklie</p>
        <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-pink-100">Histórias ganham vida quando encontram quem quer lê-las. Estamos abrindo uma nova etapa de testes para aproximar autores e leitores, ouvir suas experiências e construir um Nooklie cada vez mais acolhedor. Também estamos com inscrições abertas para ampliar a equipe de moderação.</p>
      </header>
      <div className="mt-9 space-y-9 text-base leading-8 text-white/80">
        <section><h2 className="text-2xl font-bold text-pink-100">Como participar dos convites</h2>
          <p className="mt-3">Se você escreve no Nooklie e quer trazer seus leitores para conhecer a plataforma, abra o menu lateral e entre em <Link href="/convites" className="font-semibold text-pink-200 underline">Convites</Link>. Entre na sua conta, leia as orientações e toque em <strong>Quero participar</strong>. Depois, use <strong>Convidar leitores</strong> para copiar seu link personalizado. Esse botão também fica no seu próprio perfil.</p>
          <p className="mt-3">Nesta rodada, pedimos que cada autor convide até <strong>10 pessoas</strong>. Você não precisa preencher todas as vagas: pode começar com um grupo menor. Esse número é uma orientação para acompanharmos os testes com cuidado; o link ainda não bloqueia automaticamente a entrada depois de dez pessoas. Por isso, compartilhe diretamente com os leitores escolhidos e evite divulgar o convite de forma indiscriminada.</p>
          <p className="mt-3">Seu perfil precisa estar público para que o convite possa apresentar você e suas histórias. Se ele estiver privado, ajuste a privacidade nas configurações antes de convidar os leitores.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">O que o leitor encontra ao abrir o link?</h2>
          <p className="mt-3">Quem abrir seu convite verá uma mensagem de boas-vindas com seu @, uma apresentação do Nooklie e um botão para conhecer seu perfil e suas histórias. Se ainda não tiver conta, poderá se cadastrar com nome de usuário e senha. Se já tiver, poderá entrar normalmente.</p>
          <p className="mt-3">Seguir o autor é uma escolha do leitor, feita no perfil: o convite não segue ninguém automaticamente. Também não existe obrigação de comentar, elogiar ou cumprir uma meta de leitura. A ideia é ler no próprio ritmo, experimentar os recursos e participar como se sentir à vontade.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">Quando o autor recebe uma notificação?</h2>
          <p className="mt-3">Quando alguém <strong>conclui a criação de uma nova conta pelo seu convite</strong>, registramos essa chegada na sua área de Convites e enviamos uma notificação dentro do Nooklie, conforme suas preferências de notificações sociais. Assim, você pode saber quem chegou e dar as boas-vindas.</p>
          <p className="mt-3">Apenas abrir o link não gera aviso. Entrar em uma conta que já existia também não conta como um novo cadastro pelo convite. A área de Convites mostra o total de cadastros vinculados ao seu link e até 50 chegadas recentes disponíveis.</p>
          <p className="mt-3">O leitor é informado, antes do cadastro, de que seu @ será mostrado ao autor. Senha e chave de recuperação continuam particulares. Os links já compartilhados seguem válidos, mas o acompanhamento começou com esta atualização: entradas anteriores não serão recuperadas.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">O que experimentar nesta fase?</h2>
          <p className="mt-3">Leitores podem acompanhar uma história, organizar a biblioteca, comentar os capítulos e conversar com o autor no mural. Autores podem observar como é receber essas interações e ouvir o que facilita ou atrapalha a leitura. Se algo não funcionar ou ficar confuso, conte para a equipe pela <Link href="/ouvidoria" className="font-semibold text-pink-200 underline">Ouvidoria</Link>, explicando o que tentou fazer e em qual página aconteceu. Nunca envie sua senha ou chave de recuperação.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">Seleção para moderadores de plataforma</h2>
          <p className="mt-3">Estão abertas as inscrições para <strong>10 vagas de moderadores</strong>, para ampliar a equipe que ajuda a cuidar da comunidade. O período vai de <strong>hoje, 20 de novembro, até 12 de dezembro de 2026, às 23h59, no horário de Brasília</strong>.</p>
          <p className="mt-3">Para se candidatar agora, entre em <Link href="/oportunidades" className="font-semibold text-pink-200 underline">Faça parte da equipe</Link>, no menu lateral, procure a vaga <strong>Moderador</strong> e preencha o formulário com sua conta conectada. Cada conta pode enviar uma candidatura por vaga. Consulte essa área para conferir o período e as condições atualizadas.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">Avisos de vagas e eventos para toda a comunidade</h2>
          <p className="mt-3">Quando uma oportunidade estiver aberta para inscrições, todas as contas ativas receberão uma notificação dentro do Nooklie, com acesso à Central de oportunidades. Se a abertura estiver agendada, o aviso será enviado quando o período começar.</p>
          <p className="mt-3">Eventos literários publicados também geram um aviso para todas as contas ativas, com um link para conhecer o evento. Esses comunicados da comunidade não dependem de seguir um autor nem da preferência de notificações sociais. Editar uma vaga ou um evento não dispara o mesmo aviso de novo para quem já recebeu.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">O que fazem os moderadores?</h2>
          <p className="mt-3">Moderadores ajudam a manter um ambiente seguro, respeitoso e acolhedor para quem lê, escreve e conversa no Nooklie. O trabalho inclui analisar denúncias de conteúdo ou comportamento, conferir o contexto e aplicar as diretrizes com imparcialidade.</p>
          <p className="mt-3">Também orientam leitores e autores sobre as regras e o funcionamento da plataforma, acompanham dúvidas e encaminham à administração situações que precisam de outra análise. Conforme as permissões do cargo, podem registrar advertências, tratar denúncias e ocultar conteúdo que viole as regras. Suspensões de contas e outras medidas restritas dependem da administração; entrar para a moderação não concede todos os poderes do site.</p>
          <p className="mt-3">As decisões precisam de responsabilidade e registro. Informações internas e denúncias devem ser tratadas com discrição, sem exposição de envolvidos nem favorecimento de amizades. Moderação não é escolher quem pode gostar de uma história: é cuidar da convivência e aplicar as regras com respeito.</p>
        </section>
        <section><h2 className="text-2xl font-bold text-pink-100">Quem pode se candidatar?</h2>
          <p className="mt-3">A vaga exige <strong>ser maior de idade</strong>, conhecer os termos, as regras e as políticas do Nooklie, comunicar-se com clareza e respeito e ter imparcialidade, empatia e bom senso. Também é necessário ter discrição para lidar com informações internas e algum tempo disponível na semana para acompanhar denúncias e mensagens de suporte. A candidatura será analisada pela equipe; enviar o formulário não significa aprovação automática.</p>
          <p className="mt-3">Antes de se candidatar, conheça nossas <Link href="/politicas" className="font-semibold text-pink-200 underline">políticas da comunidade</Link> e os <Link href="/termos" className="font-semibold text-pink-200 underline">termos de uso</Link>.</p>
        </section>
      </div>
      <footer className="mt-9 border-t border-pink-200/20 pt-6 text-base leading-8 text-white/80"><p>Seja trazendo seus leitores, contando sua experiência nos testes ou se candidatando à equipe até 12 de dezembro, você ajuda a construir esse cantinho de histórias.</p><p className="mt-4 font-bold text-pink-200">Equipe Nooklie</p></footer>
    </article>
    <ShareNews slug={slug}/><NewsComments article={slug}/>
  </div></main>;
}
