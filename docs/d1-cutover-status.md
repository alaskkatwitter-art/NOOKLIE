# Estado da virada do Nooklie para D1

**Sem data de virada confirmada.** O site de produção ainda grava no Supabase.
O banco D1 de migração tem uma cópia preliminar. Os testes HTTP publicados usam
um terceiro banco, isolado, com dados fictícios.

## Inventário inicial das 44 rotas

- [x] Adaptar ao D1 na prévia `app/api/profile/privacy/route.ts`
- [x] Adaptar ao D1 na prévia `app/api/profile/pinned-story/route.ts`

**44 de 44 rotas do inventário integradas no código da prévia.**
A validação dessas rotas usa testes locais com SQLite e dados fictícios.
A versão foi publicada no Worker isolado e passou por 20 verificações HTTP.

### Histórias e capítulos

- [x] `app/api/comments/route.ts`
- [x] `app/api/stories/[id]/publication/route.ts`
- [x] `app/api/chapters/[id]/banner/route.ts`
- [x] `app/api/stories/route.ts`
- [x] `app/api/stories/create/route.ts`
- [x] `app/api/stories/[id]/book/route.ts`
- [x] `app/api/my-stories/route.ts`
- [x] `app/api/stories/author/[id]/route.ts`
- [x] `app/api/stories/[id]/like/route.ts`
- [x] `app/api/stories/[id]/route.ts`

### Perfis, comunidade e feed

- [x] `app/api/profile/update/route.ts`
- [x] `app/api/profile/control/route.ts`
- [x] `app/api/profile/stories/route.ts`
- [x] `app/api/follows/list/route.ts`
- [x] `app/api/follows/route.ts`
- [x] `app/api/follows/requests/route.ts`
- [x] `app/api/nook-posts/media/route.ts`
- [x] `app/api/stickers/route.ts`
- [x] `app/api/nook-posts/reposts/route.ts`
- [x] `app/api/public-profile/[username]/route.ts`

### Descoberta e catálogo

- [x] `app/api/tags/[slug]/route.ts`
- [x] `app/api/tags/route.ts`
- [x] `app/api/discovery/preferences/route.ts`
- [x] `app/api/discovery/route.ts`
- [x] `app/api/discovery/activity/route.ts`
- [x] `app/api/upcoming-updates/route.ts`
- [x] `app/api/explore/route.ts`

### Eventos e leitura beta

- [x] `app/api/beta-reading/route.ts`
- [x] `app/api/events/route.ts`

### Chat

- [x] `app/api/chat/people/route.ts`
- [x] `app/api/chat/reports/route.ts`

### Administração, moderação, suporte e vagas

- [x] `app/api/moderation/inbox/route.ts`
- [x] `app/api/moderation/warnings/route.ts`
- [x] `app/api/opportunities/route.ts`
- [x] `app/api/support/route.ts`
- [x] `app/api/admin/applications/route.ts`
- [x] `app/api/admin/manage/route.ts`
- [x] `app/api/admin/reports/route.ts`
- [x] `app/api/admin/overview/route.ts`
- [x] `app/api/applications/mine/route.ts`
- [x] `app/api/applications/cancel/route.ts`
- [x] `app/api/reports/route.ts`

[Auditoria da prévia, das dependências e dos dados](d1-preview-audit.md)

## Validação adicional em 19 de novembro de 2026

- A prévia isolada `5f774fdb-d6a4-4aa6-98ad-15a6c8f704a3` recebeu os caminhos D1 para acesso administrativo, detalhe de post, avatar e capa, mídias legadas, equipe, sitemap, vídeo e metadados de histórias. O código de compatibilidade com Supabase permanece disponível para produção.
- No Worker publicado, uma história ficou inacessível antes do horário e abriu após o cron. O teste confirmou a notificação de publicação. Os uploads de avatar e capa retornaram imagens do R2. A capa pública histórica testada retornou 200 e um pedido de 16 bytes retornou 206. No chat, o remetente abriu o arquivo, a sessão anônima recebeu 401 e o convite ainda pendente recebeu 404.
- Com os dados reais da cópia D1, três execuções da consulta principal de Explorar leram 1.873 linhas por execução (3,32 a 52,38 ms). A consulta principal de Descoberta, com uma sessão ativa selecionada dentro do banco, leu 6.328 linhas (6,55 a 11,90 ms). Esses tempos são do SQL, sem rede e renderização.
- A contagem atual bateu nas 72 tabelas (14.316 linhas em cada banco). Foi uma leitura com as gravações abertas, sem a comparação final por chave e campo.
- O Worker de produção estava na versão `43d63ea3-fd4d-403c-b525-946320a228a3`. O D1 de migração retornou o marcador Time Travel `00000018-00000000-00005128-0a14571f8a74b5cd35d8ae49aefd4ae1`. Os identificadores foram registrados. Ainda faltam o ensaio de recuperação e um caminho de sincronização final testado.
- O seletor e o script de publicação ainda recusam ativação do D1 em produção. A rotina de cópia disponível exige um destino vazio e não reconcilia uma base já preenchida. A produção continuou com as gravações abertas no Supabase.

## Ensaio de recuperação e sincronização final

- O banco isolado `nooklie-d1-cutover-rehearsal` recebeu as 12 migrações e registros sintéticos. O lote atômico com 201 comandos verificou as 72 tabelas e reconciliou a base já preenchida. Inseriu e editou histórias, removeu uma história obsoleta e atualizou o vínculo de história fixada. O teste gerou zero notificações extras.
- O Time Travel restaurou o marcador `00000000-00000022-00005128-2ae3fe9aaeccec3dfbe76613b1e9b38c` desse banco. A nova leitura confirmou o título e vínculo anteriores, a volta da história removida, a ausência da inserção e zero violações de chave estrangeira. Um lote com falha injetada depois das alterações foi integralmente revertido pelo D1.
- O reconciliador em `scripts/d1-reconcile-snapshot.mjs` recebe uma leitura consistente do Supabase, a leitura do D1 e um adaptador de lote atômico. Ele normaliza os dados com as regras do importador e verifica todos os registros do destino por chave e campo dentro do lote. Se houver concorrência no destino, conflito de unicidade, violação de integridade ou divergência no resultado, o lote falha. O ensaio cobre diferenças sintéticas em um banco de mesmo esquema. A execução com os dados finais reais continua pendente.
- A compilação e a simulação de `--prepare-d1-production --dry-run` passaram com o D1 `nooklie-migration` e os vínculos R2 de produção. A opção `--prepare-d1-production` usa `wrangler versions upload`, que prepara uma versão sem direcionar tráfego. O cron deve ser configurado separadamente na virada. O Wrangler deste ambiente está sem sessão autenticada para enviar a versão.
- Na janela de virada, confirmar a pausa de gravações e do agendamento no Supabase, capturar uma leitura consistente das 72 tabelas e um novo marcador D1, aplicar a reconciliação, conferir o resultado e só então direcionar o tráfego. Se a verificação falhar antes de reabrir gravações, a versão anterior e o marcador D1 preservam o ponto de retorno. Um retorno depois de reabrir gravações exige reconciliar as alterações novas antes de voltar ao Supabase.

## Conferência com os dados reais em 19 de novembro de 2026

- Às 18:05:03 de Brasília, a transação PostgreSQL adquiriu bloqueios `SHARE NOWAIT` nas 72 tabelas inventariadas e calculou os resumos antes de liberar os bloqueios no commit.
- Os dois bancos tinham 14.316 registros. Os resumos SHA-256 construídos por chave primária e por campo normalizado coincidiram em todas as tabelas. A diferença a aplicar foi zero.
- O marcador Time Travel do D1 `0000001a-00000000-00005128-3d2fc36a22126dcfad186987e495ac81` permaneceu igual antes e depois da leitura. O D1 retornou zero violações de chave estrangeira.
- A pausa durou apenas a transação de conferência. O Worker de produção continuou na versão `43d63ea3-fd4d-403c-b525-946320a228a3`, com tráfego e gravações no Supabase. A conferência vale para o instante da pausa e deve ser repetida na janela de virada.

## Dependências fora dessas 44 rotas

- [ ] Revisar todos os métodos das rotas que já têm integração parcial. A
  presença do seletor D1 não prova que todos os métodos usam o D1.
- [x] Adaptar e validar as páginas e metadados que consultam Supabase diretamente,
  incluindo o vídeo, o sitemap, a página da equipe e o layout das histórias.
- [ ] Auditar módulos compartilhados e chamadas dos componentes. Conferir
  autenticação, privacidade, bloqueios, moderação, notificações, R2, anexos
  históricos, mídia privada e as rotinas agendadas com as chaves corretas.
- [ ] Configurar um Worker candidato de produção com D1, o R2 de produção
  e permissões equivalentes. A simulação de produção passou e falta enviar a versão candidata.
- [ ] Rodar testes de ponta a ponta do candidato com gravação, nova leitura,
  remoção e controle de acesso. Medir o custo e a latência de Explorar e do
  início personalizado com o catálogo real. Conferir sessão, publicação imediata e
  agendada, leitura, mídias, interação social, administração e chat.

## Dados e troca após a integração

- [x] Comparar por chave e campo as 72 tabelas na cópia preliminar. A auditoria
  encontrou 14.316 linhas em cada banco, sem divergências após normalização e
  sem violações de chave estrangeira no D1. A comparação final continua abaixo.
- [ ] Validar a reconciliação em cópia isolada, incluindo inserções, edições,
  exclusões, vínculos, objetos R2 e ausência de efeitos colaterais como
  notificações duplicadas.
- [ ] Preservar um ponto de recuperação verificável e confirmar a reversão
  da versão candidata sem perder gravações.
- [ ] Durante a janela aprovada, interromper gravações e tarefas agendadas
  nas duas pontas, confirmar a pausa, aplicar as diferenças finais no D1
  e repetir a comparação por chave e campo e a verificação de integridade.
- [ ] Ativar o candidato e testar o site principal. Reabrir as gravações e
  o agendamento somente depois de confirmar que escrevem no banco correto.
- [ ] Confirmar os fluxos em produção e preservar a origem para recuperação.
