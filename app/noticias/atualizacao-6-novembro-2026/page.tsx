import Link from 'next/link';
import ShareNews from '@/components/ShareNews';
import NewsComments from '@/components/NewsComments';

export const metadata = {
  title:'Vocês testaram, nós ouvimos | Jornal Nooklie',
  description:'Novas cores e recortes para o perfil, correções nos capítulos, respostas aos comentários e mais formas de convidar pessoas para grupos.',
};
const updates = [
  {title:'Seu perfil, no tom que você quiser',body:'O vermelho chegou à paleta! Em Editar perfil, você também pode abrir o seletor de cor e ajustar o tom ou informar um código hexadecimal, como #e53935. Essa escolha continua sendo uma personalização privada, visível apenas para você.'},
  {title:'Foto e capa com o enquadramento certo',body:'Agora dá para ajustar o zoom e a posição da foto de perfil e da capa antes de salvar. Você pode arrastar a imagem ou usar os controles para encontrar o recorte que prefere. Em Editar perfil, escolha Alterar foto de perfil ou Alterar capa para enviar uma imagem nova, ou Ajustar foto atual e Ajustar capa atual para trabalhar com as que já estão no perfil. Confira a prévia e toque em Salvar enquadramento.'},
  {title:'Publicação com confirmação e editor corrigido',body:'Depois que um capítulo é publicado com sucesso, o site abre a tela de confirmação. Assim, fica mais claro que a publicação aconteceu. Também corrigimos o carregamento que podia deixar o editor em branco ao abrir um capítulo ou voltar da prévia: o texto e as imagens salvos voltam a aparecer para continuar a edição.'},
  {title:'Respostas nos comentários das histórias',body:'Os comentários dos capítulos agora têm a opção Responder. A resposta fica identificada com o comentário original, e quem o escreveu recebe uma notificação. A ferramenta está disponível para a comunidade: autores e leitores podem continuar a conversa sobre a história.'},
  {title:'Mais formas de reunir seu grupo',body:'Quem administra um grupo pode convidar novas pessoas depois de criá-lo. Dentro da conversa, abra Convidar pessoas para o grupo e informe os usernames ou gere um link para compartilhar. Os convites por username precisam ser aceitos; pelo link, a pessoa escolhe Entrar no grupo. Cada link vale por 7 dias e pode ser revogado ou substituído. O limite continua sendo de 15 pessoas, contando os convites pendentes, e os bloqueios entre perfis continuam sendo respeitados.'},
  {title:'Navegação mais leve',body:'Também reduzimos consultas repetidas durante a navegação e deixamos os cartões de histórias mais leves, para que a troca de páginas faça menos trabalho desnecessário. Vamos continuar acompanhando o desempenho conforme mais pessoas chegarem.'},
  {title:'O Jornal agora também tem conversa',body:'As notícias ganharam uma seção de comentários, inclusive o guia de boas-vindas e a matéria sobre obras originais. Entre na sua conta para contar o que achou, fazer uma pergunta ou responder a outro comentário. A conversa fica vinculada à notícia em que foi publicada.'},
];
const latestUpdates = [
  { title: 'Salve a obra pelo resumo', body: 'Abra os três pontinhos no resumo da história para adicioná-la à Biblioteca ou a uma lista de leitura. Você também pode criar uma lista nesse mesmo menu ou pela aba Listas de leitura da Biblioteca.' },
  { title: 'Publicação da obra e dos capítulos', body: 'Em Editar obra, veja se sua história está publicada, agendada, em rascunho ou fora do ar. Você pode publicar, agendar ou retirar a obra do ar. Os leitores só têm acesso quando há um capítulo publicado. Ao publicar um capítulo, você recebe uma confirmação com o atalho Compartilhar no feed. Também corrigimos o salvamento das informações da obra e das tags.' },
  { title: 'Mais espaço para conversar no feed', body: 'Toque em uma publicação para abrir a conversa e rolar pelas respostas. Você pode curtir, nooklar, salvar e responder com uma imagem. As respostas que você salva aparecem em Respostas salvas no feed.' },
  { title: 'Vídeos e hashtags no feed', body: 'Agora você pode anexar vídeos em MP4 ou WebM. Os arquivos de um post podem somar até 4 MB. Use Copiar link do vídeo e cole o endereço em outro post para reproduzir o mesmo arquivo. Digite uma hashtag no texto, como #Leitura, ou use a busca do feed para encontrar publicações sobre um assunto.' },
  { title: 'Capas inteiras e fandoms no Explorar', body: 'No celular, as capas aparecem inteiras e as sinopses ficam mais curtas nos cartões. O fandom salvo na obra aparece nos detalhes e na busca, e o editor sugere fandoms já cadastrados pela comunidade.' },
  { title: 'Personagens favoritos e wiki', body: 'Em Meus universos, abra Personagens favoritos para guardar seus personagens e contribuir com a wiki. Para cadastrar uma página ou sugerir uma edição, inclua uma fonte que a equipe possa conferir antes de aprovar.' },
  { title: 'Conheça a equipe do Nooklie', body: 'A nova página Equipe do Nooklie mostra quem atua em cada área, com o cargo e o link para o perfil. O diretório acompanha as nomeações ativas do painel.' },
];

export default function CommunityUpdatePage(){
  return <main className="min-h-screen bg-[#100b12] px-5 py-10 text-white sm:py-16"><div className="mx-auto max-w-3xl">
    <Link href="/noticias" className="inline-flex min-h-11 items-center text-sm font-semibold text-pink-200 hover:underline">Voltar ao Jornal Nooklie</Link>
    <article className="mt-6 overflow-hidden rounded-[2rem] border border-pink-300/20 bg-gradient-to-br from-[#38192e] via-[#21131e] to-[#171018] p-6 sm:p-10">
      <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Jornal Nooklie · Atualizações da comunidade</p>
      <p className="mt-3 text-sm text-white/50"><time dateTime="2026-11-06">6 de novembro de 2026</time> · Equipe Nooklie</p>
      <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">Vocês testaram, nós ouvimos.</h1>
      <p className="mt-6 text-lg leading-8 text-pink-100">Novas opções para o perfil, correções na escrita e mais espaço para conversar.</p>
      <p className="mt-5 leading-8 text-white/80">Os primeiros testes do Nooklie trouxeram sugestões, dúvidas e relatos de erros que nos ajudaram a enxergar o que precisava melhorar. Obrigada a cada pessoa que explorou a plataforma e compartilhou sua experiência. As mudanças abaixo já estão disponíveis.</p>
      <div className="mt-9 space-y-9">{updates.map(update=><section key={update.title}><h2 className="text-xl font-bold text-pink-100 sm:text-2xl">{update.title}</h2><p className="mt-3 leading-8 text-white/80">{update.body}</p></section>)}</div>
      <section className="mt-10 border-t border-pink-200/20 pt-7" aria-labelledby="novidades-7-novembro">
        <p className="text-sm text-pink-200"><time dateTime="2026-11-07">Atualizado em 7 de novembro de 2026</time></p>
        <h2 id="novidades-7-novembro" className="mt-2 text-2xl font-bold">Mais mudanças pedidas pela comunidade</h2>
        <div className="mt-6 space-y-7">{latestUpdates.map(update => <section key={update.title}>
          <h3 className="text-xl font-bold text-pink-100">{update.title}</h3>
          <p className="mt-2 leading-8 text-white/80">{update.body}</p>
        </section>)}</div>
      </section>
      <footer className="mt-10 border-t border-pink-200/15 pt-6 leading-8 text-white/75"><p>Somos uma equipe reduzida e voluntária, e os relatos da comunidade ajudam a orientar os próximos passos. Se encontrar um erro, conte o que aconteceu na <Link href="/ouvidoria" className="font-semibold text-pink-200 underline">Ouvidoria</Link>. Para conversar sobre esta atualização, use os comentários logo abaixo.</p><p className="mt-4 font-bold text-pink-200">Equipe Nooklie</p></footer>
    </article>
    <ShareNews slug="atualizacao-6-novembro-2026"/><NewsComments article="atualizacao-6-novembro-2026" />
  </div></main>;
}
