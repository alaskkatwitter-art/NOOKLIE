# Migração D1: autenticação, perfis e permissões

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
11 da segunda fase estão estruturadas no D1. Isso ainda não significa que todos
os fluxos que as usam tenham sido migrados. Não copiar SQL PostgreSQL diretamente
para o D1 (SQLite).

1. Adaptar perfis, bloqueios, seguidores, cargos e verificações de permissão.
   D1 não reproduz as políticas RLS da Supabase: cada operação de servidor deve
   validar a sessão, o proprietário e as permissões explicitamente. Um selo
   visual nunca pode conceder privilégio administrativo.
2. Adaptar histórias, capítulos, listas, progresso, votos e comentários;
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

**Dependência pendente:** a coluna `profiles.pinned_story_id` está preservada,
mas sua FK para `stories` não está instalada porque a tabela de histórias ainda
não foi criada no D1. Ela deve ser adicionada/reconstruída e validada na próxima
fase, antes de qualquer importação real ou troca de produção. O editor D1 desta
etapa não escreve essa coluna.

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
