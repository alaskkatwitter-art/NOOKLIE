# Aparência mobile, perfis, moderação e grupos

A navegação global concentra os acessos principais. O menu lateral remove os destinos já presentes na barra inferior e mostra identidade da conta, bio, degradê e acessos complementares. Botões genéricos de voltar foram removidos; navegação entre capítulos, edição e lista de conversas continuam disponíveis quando são parte da tarefa.

Feed e mural usam publicações compactas, mídia com altura limitada, controles vetoriais e uma única curtida em nuvem. A chave histórica da curtida permanece intacta no banco. Reações antigas não são apagadas. O próprio mural também passa a consultar um resumo de curtidas/comentários válido, corrigindo o antigo GET ausente e o envio da propriedade errada ao reagir.

O perfil tem conversa em ícone ao lado de Seguir e um menu inferior de três pontos. Denunciar, bloquear e silenciar possuem página própria. Bloqueios impedem acesso ao conteúdo enquanto as pessoas estão conectadas, mensagens e novas solicitações de seguir; também removem conexões de seguidores. Conteúdo público continua público para visitantes desconectados. Silenciar oculta publicações/stories e novas notificações da pessoa, sem desfazer o seguimento. Desbloquear e deixar de silenciar estão nas mesmas páginas.

A criação de histórias é dividida em três etapas, com campos preservados ao trocar de etapa e barra de formatação compacta. A fonte e as preferências independentes do leitor, o texto das obras e os SVGs originais da marca são preservados.

## Conversas

O chat usa balões com largura natural, cores vinho/rosa, barra de mensagem compacta, ícones para galeria e figurinhas e um reprodutor próprio sem botão de download. Isso remove o controle de download da interface; não constitui proteção contra cópia do áudio recebido.

No toque, segurar o microfone inicia a gravação e soltar finaliza e envia. No computador, clicar inicia e outro clique finaliza e envia. Gravações podem ser descartadas e mantêm o limite de dois minutos/3 MB. O envio de arquivos de áudio continua disponível nas opções da conversa. A reprodução usa a rota autenticada existente e suporte a Range. GIFs e WEBPs de figurinhas mantêm seus bytes e animação; imagens comuns continuam sendo redimensionadas.

Grupos aceitam de 2 a 15 pessoas, incluindo quem cria e os convites pendentes. Pessoas convidadas precisam aceitar antes de ler mensagens ou abrir anexos. É possível recusar e sair. O limite é imposto por trigger com bloqueio da linha do grupo, além das validações de entrada. As mensagens mantêm a criptografia autenticada no armazenamento e o limite de envio existentes. Grupos não alegam confirmação individual de leitura. Threads vazias são retidas para preservar evidências de denúncias e deixam de ser acessíveis aos antigos membros.

## Ouvidoria e moderação

`/ouvidoria` recebe relatos sem exigir e-mail ou nome real e mostra apenas os próprios pedidos e respostas públicas ao solicitante. `/moderacao` reúne denúncias, ouvidoria e chat. Relatos são recolhíveis e denúncias podem ser filtradas por situação.

O acesso acompanha os cargos e permissões existentes: `moderation.view` para leitura e `moderation.manage` para decisões no departamento de moderação. Administradores mantêm acesso. Alterações de cargos continuam no painel existente; nenhum usuário é promovido por esta entrega. As advertências exigem orientação explícita, vinculam uma ocorrência a uma conta elegível, impedem duplicação, notificam a conta e geram registro de auditoria em uma transação. Relatos da ouvidoria também podem receber resposta pela central. Denúncias de chat continuam expondo apenas a mensagem escolhida pelo denunciante, com acesso auditado.

## Banco e publicação

A migração `20261103004139_mobile_community_groups_moderation.sql` é aditiva para os fluxos existentes: inclui tipos de thread, convites de grupo, figurinhas, silenciamentos, tickets e advertências, com RLS e acesso apenas por service_role. Atualiza RPCs para impedir que caminhos antigos de conversa direta sejam usados para grupos. Aplicar antes de publicar o novo servidor. Nenhuma chave nova de ambiente é necessária.

A branch de trabalho tem deploy automático desativado; a branch main mantém a integração de produção. O esquema é compatível com o servidor anterior para conversas diretas. Em uma reversão emergencial, reverter o frontend/servidor e manter as estruturas novas privadas evita apagar histórico ou evidências.

## Verificação

- Build de produção e TypeScript aprovados; 45 testes aprovados, incluindo testes da aplicação Next.js com backend simulado e SQL real em PostgreSQL descartável/PGlite.
- Os testes novos exercitam 15 membros, recusa do 16º, convites, recusa de invasores, saída, bloqueios, silenciamentos, permissões por departamento, auditoria/notificação de advertência, respostas da ouvidoria e negação de acesso direto pelos papéis de navegador.
- A migração foi exercitada com o papel service_role e RLS habilitada. Os papéis anon/authenticated não podem acessar as tabelas novas nem executar os RPCs novos.
- Conferência visual em desktop e iframe de 375 px com os componentes reais, CSS/fontes da build e respostas sintéticas. A largura interna útil pode ser 360 px quando há scrollbar. Publicação preservou o título ao avançar e retornar; reprodução de áudio, menu lateral, menu de perfil, formulário de grupo e abertura de advertência foram conferidos.
- Capturas em `docs/verification/mobile-redesign/` usam pessoas, mensagens e ocorrências fictícias. Elas não mostram conversas de usuários reais.
- Limites: nenhum telefone físico/Safari foi usado; gravação com microfone real e gesto de segurar em hardware físico não foram certificados. A inspeção visual usou API simulada, não uma sessão real de produção.
- O advisor de segurança anterior à publicação apresentou somente informações sobre tabelas internas com RLS e sem políticas públicas, conforme o modelo de sessão próprio. Esse mesmo padrão é intencional nas tabelas novas: [referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Conferência após publicação

A API de produção passou por um teste completo com três contas temporárias privadas: criação do grupo, convite sem acesso a mensagens, recusa de envio antes da aceitação, aceitação, envio criptografado e leitura por outra conta, recusa de acesso/envio de não participante, silenciar/restaurar preferências e perda de acesso ao sair. Todas as contas, sessões, mensagens, grupos e notificações sintéticas foram removidos depois. A confirmação de advertências identifica o username envolvido; no chat ele vem exclusivamente do autor da mensagem selecionada no relato.
