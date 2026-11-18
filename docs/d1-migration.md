# Migração D1: contas, leitura, comunidade e chat

Estado em 17/11/2026: banco `nooklie-migration` criado na conta Cloudflare do
Nooklie, UUID `fcea4d88-3c18-4c21-a6c1-af13c72caa00`, região ENAM.
É um destino isolado para migração, sem dados de usuários e sem troca de produção.
O projeto Supabase de produção continua sendo `fwwgoyburkdybbqmvljk`.

## Implementado e aplicado

`d1/migrations/0001_auth_foundation.sql` cria as três tabelas iniciais:
`auth_accounts`, `auth_sessions`, `auth_rate_limits`. UUIDs e hashes continuam
como texto, sem gerar novos IDs ou recalcular hashes existentes. Datas novas
usam UTC ISO 8601; datas do PostgreSQL devem ser normalizadas para ISO 8601 na
futura importação (SQLite não entende todos os formatos de fuso do PostgreSQL).
Há chave estrangeira de sessão para conta e índices por conta e expiração.

`lib/database/d1-auth.ts` implementa consultas parametrizadas para localizar a
conta, verificar sessão ativa e não expirada, criar/revogar sessão, consumir
limite de tentativas e recuperar a conta. A comparação de senha/chave com bcrypt
continua sendo responsabilidade do servidor antes dessas operações internas.
Não existe endpoint público que permita executar SQL ou passar um user_id como
prova de identidade.

O limite usa um único UPSERT, evitando uma janela de concorrência entre leitura
e incremento. A recuperação compara o hash esperado e troca a chave uma única
vez; um trigger revoga as sessões na mesma operação. A confirmação usa
`UPDATE ... RETURNING`, pois `meta.changes` do D1 pode contar alterações dos
triggers. Suspender a conta também revoga as sessões e impede novas sessões.

`cloudflare/database-binding.ts` e o alias Vite preparam o acesso pelo binding
`NOOKLIE_DB`. O helper de deploy só o anexa quando
`NOOKLIE_D1_MIGRATION=1`, e rejeita essa opção em produção. Nenhuma rota existente
foi trocada para o novo repositório: não misturar sessões D1 com o banco Supabase
enquanto contas, perfis e autorização não tiverem sido migrados em conjunto.

## Validação

- Quatro testes de integração SQLite executam o SQL e o repositório reais,
  cobrindo expiração, suspensão, injeção SQL, recuperação de uso único,
  revogação isolada por conta, rollback de falha no trigger e limites de tentativas.
- Dez verificações no D1 remoto executaram os mesmos métodos do repositório:
  sessão válida, injeção rejeitada, limite permitido/bloqueado, chave incorreta,
  recuperação válida, revogação, chave reutilizada rejeitada, suspensão e criação
  de sessão suspensa rejeitada. Os registros sintéticos foram removidos.
- `npx tsc --noEmit` passou.
- `npm run build:cloudflare-preview` concluiu com sucesso.
- A suíte geral ainda apresenta falhas em testes antigos de mídia, cujos mocks
  não reconhecem `@/lib/media/storage`. As 11 falhas nos testes de fotos de
  grupos/capas também foram reproduzidas no commit de origem `102acd8`, sem
  as mudanças D1. Elas não representam validação concluída do restante do site.

## Próximas fases e condições para troca

O inventário `d1/source-inventory.json` registra as 72 tabelas e 86 assinaturas
de funções encontradas no banco de origem. As três tabelas de autenticação e as
11 da segunda fase, 13 da terceira, sete da quarta, 13 da quinta e seis do chat estão estruturadas no D1. Isso ainda não significa que todos
os fluxos que as usam tenham sido migrados. Não copiar SQL PostgreSQL diretamente
para o D1 (SQLite).

1. Concluir a integração de perfis, bloqueios, seguidores, cargos e permissões.
   D1 não reproduz as políticas RLS da Supabase: cada operação de servidor deve
   validar a sessão, o proprietário e as permissões explicitamente. Um selo
   visual nunca pode conceder privilégio administrativo.
2. Integrar e concluir os fluxos de edição, leitura, listas, progresso, votos e comentários;
   preservar chaves, relações, regras de publicação e operações atômicas.
3. Adaptar feed, eventos, notificações, moderação e chat; conservar os textos
   cifrados e a chave `CHAT_ENCRYPTION_KEY_V2`, sem expô-la ou recriá-la.
4. Adaptar autorização de mídias R2 e eliminar dependências/fallbacks de Storage
   somente após validar permissões para conteúdos públicos e privados.
5. Substituir o cron PostgreSQL de publicação por uma tarefa no Cloudflare,
   garantindo que uma publicação não gere notificações duplicadas.
6. Fazer exportação consistente e importação normalizada, comparar contagens,
   relações e integridade; testar login, recuperação, leitura, edição, upload,
   chat e administração em ambiente isolado. Repetir sincronização final com
   gravações controladas antes da virada para evitar perda de alterações recentes.
7. Trocar o banco somente quando os fluxos estiverem prontos e verificados;
   manter backup e caminho de recuperação antes de excluir a origem.

Nenhum usuário real foi importado, nenhuma chave foi alterada, nenhum dado da
Supabase foi excluído e o site publicado não foi modificado nesta fase.

## Segunda fase: regras de perfis, relações e acesso administrativo

`0002_profiles_social_permissions.sql` foi criada a partir das 78 colunas e
48 constraints consultadas no banco de origem em 17/11/2026. Estrutura:
`profiles`, `follows`, `follow_requests`, `chat_blocks`, `profile_mutes`,
`platform_admins`, `departments`, `permissions`, `team_roles`,
`team_role_permissions` e `team_memberships`.

Booleanos são inteiros 0/1 com CHECK, JSON é texto validado quando a origem
exigia objeto, e IDs são texto preservado (novos UUIDs serão gerados pelo app).
Foram conservados os índices únicos de username normalizado, user_id e hash
de recuperação dos perfis, além de um cargo ativo por conta/cargo. A nova FK de
perfil para conta e a validação cargo/departamento foram precedidas por
consultas na origem: não há perfis órfãos, user_ids duplicados ou cargos em
departamentos divergentes.

**Dependência resolvida na terceira fase:** a FK de `profiles.pinned_story_id`
para `stories` foi instalada com `ON DELETE SET NULL`. A tabela de perfis foi
reconstruída enquanto o banco isolado continuava vazio, com guardas que abortam
se já houver contas/perfis importados. Todos os índices e o view de atores
foram recriados e os cenários da segunda fase foram repetidos.

`d1-social.ts` permite consultar conteúdo de perfil respeitando conta ativa,
moderação, privacidade, seguidores aceitos e bloqueios nos dois sentidos.
A projeção pública nunca seleciona hashes de senha ou recuperação. A edição
de nome/bio resolve a identidade pela sessão dentro do próprio UPDATE.

Seguir perfil público, pedir para seguir privado, aceitar/recusar, deixar de
seguir, bloquear/desbloquear e silenciar/dessilenciar também derivam o autor da
sessão atual dentro do SQL. Triggers tornam atômica a aceitação e o bloqueio
remove follows/solicitações nos dois sentidos. Desbloquear não restaura vínculos.
Silenciamentos só são consultados pela sessão proprietária.

`d1-permissions.ts` verifica sessão válida, conta ativa, administração principal
e os vínculos atuais de equipe. Cargos de equipe só recebem permissões de âmbito
departamental, no departamento certo, com departamento/cargo/vínculo ativos.
Sem departamento informado, a consulta pode detectar acesso em algum departamento;
qualquer futura escrita deve exigir o departamento concreto da operação e
revalidar autorização dentro da transação. Username, selos e flags de perfil
nunca concedem administração. Não há API de atribuição de cargos nesta etapa.

As rotas de produção ainda usam os serviços atuais. Integração das notificações
de follows, filtros de mute no feed/notificações, permissões de anexos e bloqueio
no envio de chat dependem das respectivas próximas fases. O módulo não substitui
esses serviços parcialmente no site publicado.

Os testes compartilhados em `tests/fixtures/d1-social-scenarios.mjs` executam os
mesmos métodos em SQLite e no D1 isolado. `tests/d1-social.test.mjs` também testa
integridade de cargo/departamento, identidade única, JSON e bloqueio de si mesmo.
`d1/target.json` registra os SQLs já aplicados via API; não reaplicá-los cegamente.

Resultado desta etapa: seis testes de integração locais passaram (os quatro
anteriores e os dois novos), assim como `npx tsc --noEmit`. As 41 verificações
compartilhadas passaram também no D1 remoto. Os registros sintéticos foram
removidos e a verificação de chaves estrangeiras terminou sem inconsistências.

## Terceira fase: histórias, capítulos, biblioteca e listas

`0003_books_reading.sql` adapta 91 colunas das tabelas `stories`, `chapters`,
`chapter_media`, `chapter_likes`, `chapter_favorites`, `story_likes`,
`reading_lists`, `reading_list_items`, `reading_progress`, `scheduled_chapters`,
`tags`, `tag_categories` e `story_tags`. Mantém classificação, avisos de conteúdo,
permissão de download, marcações de IA, séries, músicas, tipos de capítulo,
imagem da lista e demais campos existentes, além dos índices e relações.

Há 27 tabelas de origem estruturadas e uma tabela interna `d1_book_commands`.
Essa tabela interna fica vazia após cada operação; seu trigger aplica
reordenação/exclusão com validação e alterações dentro da mesma transação.
Ela não é um endpoint público nem uma fila de tarefas.

As consultas na origem confirmaram que não havia números de capítulo não
positivos, progresso fora de faixa, progresso apontando capítulo de outra obra
ou múltiplas Bibliotecas para uma mesma pessoa. O esquema D1 acrescenta a relação
composta capítulo/obra para o progresso e um índice único da Biblioteca principal.

`d1-books.ts` deriva autoria e propriedade da sessão dentro do SQL. Implementa:

- Criação/edição básica da obra, criação/edição do texto de capítulos e
  publicação/retirada manual. Novas obras e capítulos começam sem publicação.
- Consulta da obra/sumário/capítulo, com prévia de rascunho restrita ao autor,
  capítulos publicados para leitores e respeito a privacidade, bloqueios,
  suspensão, moderação e data de liberação.
- Reordenação completa e exclusão permanente de capítulo. A lista de IDs é
  validada no banco; uma ordem incompleta, duplicada, desatualizada ou contendo
  capítulo de outra obra aborta. A numeração restante é compactada atomicamente.
- Fixação da própria obra, com FK real e limpeza da referência quando removida.
- Criação de listas privadas, visibilidade explícita, conteúdo filtrado para
  cada leitor, inclusão/remoção de obras e reordenação pelo proprietário.
- Biblioteca principal única e privada, remoção de obras e estados quero ler,
  lendo e já li. Progresso e posição só podem ser gravados/restaurados pela sessão
  do leitor e para um capítulo da obra indicada.

O repositório exige que o servidor forneça o sanitizador existente
`safeChapterHtml`; não há fallback que salve HTML sem sanitização. O teste local
usa esse sanitizador real. A verificação SQL remota aceita apenas texto simples,
para testar as regras de dados sem substituir a dependência de sanitização.

`'infinity'` de `release_at` continua significando obra retirada. É conservado
como texto e não passa pela condição de data do view `released_stories`.
`expires_at` é preservado; o view original não o usa para expirar obras, e esta
migração também não altera esse comportamento. Datas finitas serão normalizadas
para UTC ISO na importação. Votos/favoritos, metadados de mídias, agendamentos e
progresso ligados a um capítulo são removidos por cascata ao excluir o capítulo.

As rotas existentes continuam no banco atual. Ainda faltam integrar os editores
e uploads às novas operações, preservar validações completas de classificação,
tags e políticas no fluxo de edição, adaptar filtros de descoberta/contagens,
comentários, leitura beta, geração de downloads, notificações de publicação e o
cron. A exclusão física de arquivos R2 deve ser integrada ao fluxo de limpeza;
esta etapa valida a exclusão dos registros, sem apagar arquivos reais.

Os novos testes verificam também que uma falha de exclusão faz rollback sem
alterar a numeração, que a reconstrução de perfis recusa um banco preenchido e
que os 41 cenários anteriores continuam passando após a terceira migração.

Resultado: dez testes de integração locais passaram, assim como TypeScript.
As 58 verificações de histórias/leitura passaram no D1 remoto usando os mesmos
métodos do repositório. A limpeza confirmou zero contas, perfis, histórias,
capítulos, itens de lista ou comandos de teste restantes. A verificação de FKs
terminou sem inconsistências e a FK de história fixada foi conferida no D1 real.

## Quarta fase: comentários, preferências e leitura beta

`0004_comments_reader_beta.sql` adapta as 41 colunas de `comments`,
`comment_likes`, `user_stickers`, `reader_preferences`, `beta_reading_invites`,
`beta_reading_notes` e `user_notifications`, com índices e relações originais.
São 34 tabelas de origem estruturadas e uma tabela interna de comandos.
Uma consulta na origem confirmou zero respostas ligadas a outro capítulo;
o D1 reforça isso com uma FK composta comentário/capítulo.

`d1-reader.ts` inclui consulta paginada e publicação de comentários, respostas,
comentários por trecho e figurinhas pertencentes ao autor. Apenas capítulos
publicados de obras liberadas podem receber comentários. Perfil privado,
bloqueios, moderação e suspensão são conferidos no SQL. Curtidas são idempotentes
e sua remoção exige a sessão da pessoa que curtiu. A biblioteca de figurinhas
é privada; excluir a figurinha conserva o comentário com referência nula.
Uploads e limpeza física de figurinhas ainda dependem da integração R2.

Preferências são vinculadas ao ID da conta obtido pela sessão, com o validador
existente `isReaderPreferences` obrigatório. O CHECK SQLite e os triggers exigem
exatamente as cinco chaves esperadas, tipos e faixas corretos, fontes e temas
permitidos, recusando chaves extras, ausentes ou duplicadas. Não é aceito um
user_id fornecido no payload para escolher qual conta alterar.

`d1-beta.ts` inclui convite, listagem sem corpo do rascunho, aceite, leitura,
anotações e revogação. O autor só convida outra conta ativa para um capítulo
não publicado de obra original. Apenas o convidado aceita; antes do aceite não
há leitura nem anotações pelo convidado. Autor e convidado aceito podem ler,
mas somente o leitor convidado escreve as notas. Publicar, bloquear, suspender
ou ocultar o conteúdo impede o acesso. Participantes podem encerrar o convite,
inclusive após bloqueio, e a revogação remove as notas relacionadas.

A prévia beta exige um sanitizador dedicado (`safeBetaHtml`) que conserva
formatação básica e remove imagens, links e conteúdo executável. O teste local
confere esse sanitizador real tanto isoladamente quanto no fluxo de leitura.
O runner remoto aceita somente texto simples para verificar as regras SQL.

Comentários, respostas, curtidas e convites beta geram notificações no mesmo
INSERT por triggers. O view interno `d1_notification_events` respeita conta
ativa, moderação, bloqueios, silenciamentos, opção de notificações e ausência
de autonotificação. Chaves de origem impedem duplicação; quando o autor da obra
é também o destinatário da resposta, não é criado um segundo aviso para ele.
Listagem e marcação de leitura usam exclusivamente a conta da sessão.
Notificações de outros recursos (feed, eventos, follows, publicação etc.)
ainda serão adaptadas com os respectivos fluxos.

Nenhuma rota publicada foi trocada. Os editores, as rotas HTTP e os componentes
do leitor ainda precisam ser ligados aos repositórios D1 depois da adaptação dos
demais recursos. O banco permanece sem importação de contas reais.

Resultado: 15 testes de integração locais e TypeScript passaram. Os 53 cenários
compartilhados desta fase passaram no D1 remoto, com os métodos reais e o
validador existente de preferências. A limpeza confirmou zero contas, comentários,
convites, notas, preferências, notificações ou figurinhas de teste restantes.
A verificação de chaves estrangeiras terminou sem inconsistências. Os cenários
da fase anterior foram repetidos localmente com o novo esquema, incluindo uma
exclusão de capítulo com comentários, respostas, curtidas e notas beta reais de
teste para validar as cascatas.

## Quinta fase: feed, mural, eventos e estrutura de enquetes

`0005_feed_events.sql` adapta 13 tabelas: `nook_posts`, `nook_post_media`,
`nook_post_reactions`, `nook_comments`, `nook_comment_reactions`, `nook_reposts`,
`nook_saved_posts`, `nook_saved_replies`, `story_events`, `story_event_entries`,
`polls`, `poll_options` e `poll_votes`. Agora são 47 tabelas de origem e duas
tabelas internas. Os campos de imagens/vídeos, notícia/obra vinculada, hashtags,
origem da publicação e detalhes/regras dos eventos são preservados.

Arrays PostgreSQL (`hashtags`) passam a JSON TEXT validado como array. O índice
GIN original não é compatível com SQLite e não foi copiado: busca/indexação de
hashtags ainda precisa ser adaptada na fase de descoberta. Os demais índices
btree são conservados. Consultas na origem confirmaram zero respostas apontando
para outro post e zero votos apontando para opção de outra enquete; FKs compostas
reforçam essas relações no D1.

`d1-feed.ts` implementa publicação de texto com origem feed/mural, edição e
exclusão pelo autor, leitura direta, feed paginado por data/ID, comentários e
respostas, reações permitidas, republicação e posts salvos privados. O SQL
reavalia sessão, privacidade, bloqueios, suspensão e moderação. Silenciamentos
retiram o autor do feed, sem impedir uma abertura direta voluntária. Posts salvos
não contornam bloqueios e edições conservam vínculos de notícia/obra existentes.

Os triggers notificam seguidores somente quando a origem é `mural`, respeitando
as regras do view de notificações da fase anterior. Posts da origem `feed` não
enviam esse aviso. Comentários, respostas, reações e republicações têm avisos
deduplicados para seus destinatários, com as mesmas restrições de bloqueio,
silenciamento e preferências. Alterar texto não reenvia o aviso do mural.

`d1-events.ts` implementa criação/edição básica e ativação por administração
principal autenticada. A edição usa comparação da revisão para recusar um
editor desatualizado. Os campos ricos `details` são conservados ao editar os
campos básicos. Datas são verificadas com `julianday`, evitando comparar strings
em fusos/formatações diferentes.

Publicar/ativar um evento vigente gera aviso oficial uma única vez por conta
ativa, conforme a política atual (não depende da preferência de avisos sociais).
Reativar não duplica avisos já existentes. Inscrição exige obra própria liberada,
evento ativo, início já alcançado e prazo aberto. Não há limite de obras por
autor. A lista pública de participantes aplica a privacidade de cada obra.
Retirada exige autoria. A operação de voto valida opção pertencente à enquete,
capítulo publicado/obra visível e uma linha de voto por pessoa/enquete.

Ainda não são fluxos completos do site: anexos/figurinhas/imagens em replies,
criação atômica de posts com upload, edição rica dos detalhes de eventos,
menções/extração e busca de hashtags, timeline de republicados com sua
privacidade própria, salvos de replies, contagens/enriquecimento e paginação
completa de comentários precisam ser integrados/concluídos antes da virada.
As rotas atuais e os dados reais continuam na Supabase.

`0006_notification_import_guard.sql` acrescenta `d1_runtime_flags` e a chave
interna `suppress_notifications`. Antes de copiar dados históricos, definir
essa chave para `'1'`: o view de avisos sociais e os avisos oficiais de eventos
deixam de emitir notificações automáticas. Os registros originais de
`user_notifications` ainda podem ser importados normalmente. Somente restaurar
`'0'` depois de concluir a cópia dessas notificações e suas chaves de origem.
Não existe endpoint de navegador para alterar esse controle. Os testes verificam
supressão de avisos de mural, comentários e eventos, e retomada da entrega normal.

Esse modo suprime emissões de notificações, não todos os efeitos dos triggers:
o importador ainda precisa conservar/restaurar metadados derivados, como
`user_stickers.last_used_at`, e conferir relações/campos após a cópia. Não
interpretar a flag como autorização para copiar tabelas em qualquer ordem.

Resultado: 17 testes locais e TypeScript passaram. As 51 verificações finais da
comunidade/eventos (incluindo modo de importação) passaram no D1 remoto. Os 53
cenários da fase anterior foram repetidos localmente com o novo esquema.
A limpeza confirmou zero contas, posts, eventos, votos ou notificações de teste,
com o modo de supressão restaurado a `'0'`, e a verificação de FKs não encontrou
inconsistências. Nenhuma notificação foi enviada a usuários reais.

## Etapa do chat: migração 0007

`0007_chat.sql` adapta 42 colunas de `chat_threads`, `chat_messages`,
`chat_group_members`, `chat_group_invite_links`, `chat_reports` e
`chat_audit_access`. `chat_blocks` já estava na etapa de perfis. Agora são 53
tabelas de origem e duas internas; o comando de criação de grupos é um view,
sem linhas persistidas. Consultas na origem confirmaram zero respostas de outra
conversa, zero grupos com mais de 15 pessoas e zero versões cifradas fora de 1/2.

As expressões PostgreSQL de par único, validação de hash, avatar e caminho de
anexo foram convertidas para SQLite. IDs são conservados e os arrays de IDs
de relatórios de auditoria passam a JSON TEXT. Histórico de versões antigas é
conservado, mas cada operação de mensagem/anexo seleciona a versão definida
pelo servidor. Nunca selecionar a versão a partir de um parâmetro do navegador.

`d1-chat.ts` só persiste ciphertext; não cria/chama chaves novas, não recebe
texto simples como mensagem cifrada e não substitui `lib/chat/crypto.ts`.
Encriptação/desencriptação continuam com o AES-256-GCM existente, incluindo AAD
`thread:message:body` ou `thread:message:media`, prefixo de versão e caminho
`v2/thread/message.enc`. A chave real deve permanecer no segredo do Worker.
O teste de criptografia usa uma chave descartável exclusivamente no processo
local, confere round-trip e rejeita outro contexto de mensagem.

O view interno `d1_chat_access` resolve o ator pela sessão e pelas relações
atuais. Administração principal não concede leitura geral de conversas. Em
grupos, somente membros aceitos leem mensagens/anexos ou roster com fotos de
perfil; convidados pendentes veem apenas metadados da própria solicitação.
Participantes diretos mantêm a leitura de histórico não bloqueado conforme a
regra anterior; envio exige solicitação aceita. Bloqueios são verificados nos
dois sentidos, e no grupo são considerados os membros aceitos, como no app atual.

Solicitação direta reutiliza o par de pessoas e não aceita auto solicitação.
A criação de grupo valida, na mesma operação, proprietário, 2–15 pessoas
distintas, contas ativas, ausência de bloqueios e limite de novas solicitações.
Uma trigger de capacidade também protege convites/links contra ultrapassar 15,
contando pendentes. Apenas o proprietário aceito convida mais pessoas ou emite
links. Links guardam somente o hash, expiram em sete dias e são invalidados por
rotação/revogação/saída do dono. A saída transfere propriedade quando possível e
remove acesso do ex-membro; conversas vazias não são apagadas automaticamente.

Envio resolve ator e permissões dentro do INSERT, verifica resposta da mesma
conversa/versão não revogada e limita 30 mensagens por minuto por remetente.
Anexos só retornam metadados ao participante autorizado, com versão e revogação
conferidas. A edição/cancelamento exige autoria, participação aceita e menos de
duas horas; mensagem revogada não pode ser reativada. Cancelar apaga as referências
de anexo e resposta, conservando o registro da mensagem. A remoção física do R2
precisa ser integrada usando o caminho derivado existente.

Denúncias só podem referenciar conversa própria e mensagem da mesma conversa,
na versão atual, ainda não revogada. O snapshot cifrado é produzido no próprio
INSERT e não pode ser sobrescrito, mesmo depois de a mensagem original mudar.
O limite é dez denúncias por hora. Não existe exportação de conversa para a
administração; leitura de evidências, auditoria e revisão no painel ainda serão
adaptadas na etapa de moderação, preservando a seleção explícita de mensagens.

Avisos de solicitações, convites e mensagens usam o mecanismo transacional que
respeita bloqueios, silenciamentos, preferências e a supressão da importação.
O importador deve restaurar `chat_threads.updated_at` depois de copiar mensagens,
pois o trigger normal de mensagem atualiza essa coluna; a flag de notificações
não desativa todos os efeitos. Snapshots históricos devem ser importados sem
reconstruir ou sobrescrever a evidência.

Integração HTTP, upload/leitura/desencriptação do R2, confirmação de leitura,
polling de edições, painel de denúncias/auditoria e limites adicionais de HTTP
continuam pendentes antes da troca. As rotas antigas e as conversas reais não
foram modificadas ou importadas nesta etapa.

Resultado: 19 testes de integração locais e TypeScript passaram. As 48
verificações de chat passaram no D1 remoto com os mesmos métodos e cenários,
usando outro namespace de registros sintéticos. Preparação e limpeza foram
agrupadas em batches para caber no limite de tempo da ferramenta, sem paralelizar
operações dependentes. A limpeza confirmou zero contas, conversas, mensagens,
membros, denúncias ou notificações de teste e a verificação de FKs passou.

## Etapa 8: administração e moderação

A migração 0008 acrescenta seis tabelas de origem (65 colunas): denúncias,
advertências, suporte, auditoria, oportunidades e candidaturas. O D1 isolado
agora tem 59 tabelas de aplicação, além das duas tabelas internas. Nenhum
dado real foi importado e as rotas de produção continuam no Supabase.

O repositório d1-moderation valida sessão ativa e permissões do departamento
ativo. Moderadores somente de leitura não podem revisar denúncias. Controle
de suspensão exige administrador principal, protege administradores e a própria
conta e revoga sessões atomicamente. Reativação não restaura sessões antigas.
Advertências derivam o destinatário da denúncia, sem confundir perfil e conta.
Suporte separa respostas públicas de notas internas. Nomeações e remoções de
equipe respeitam o departamento, impedem autopromoção e registram o ator.

Mutações privilegiadas e auditoria compartilham a mesma transação. O histórico
administrativo não pode ser reescrito nem apagado; a única atualização permitida
é anonimizar a referência do ator ao excluir sua conta por FK. O importador
deve inserir os registros originais, sem sobrescrever auditorias existentes.
Leitura de evidência exige permissão de moderação e seleção explícita de
denúncias: retorna apenas snapshots cifrados, registra o acesso atomicamente
e não exporta conversas. Não foi lida nem alterada nenhuma chave de chat.

Validação: 21 testes locais, TypeScript e diff-check passaram; 48 verificações
remotas passaram num D1 descartável, com FKs consistentes. O banco descartável
foi excluído após o teste. A estrutura foi aplicada ao D1 de migração, confirmado
sem contas ou auditorias fictícias e sem violações de FK.

Integração HTTP/painel, edição de departamentos e catálogo de cargos, fluxo
completo de vagas/candidaturas, importação e troca de produção continuam
pendentes. Oportunidades e candidaturas receberam estrutura nesta fase, não
a implementação completa dos seus fluxos.
