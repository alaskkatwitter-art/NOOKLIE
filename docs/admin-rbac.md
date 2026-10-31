# Administração e RBAC do Nooklie

## Identidade e acesso

O sistema mantém as contas em `auth_accounts` e valida sessões de `auth_sessions`. Permissões derivam do ID associado à sessão; o servidor não confia em username, flags visuais do perfil ou dados enviados pelo navegador.

As contas principais ficam em `platform_admins`. Essa tabela não tem operações de criação ou edição no painel e não concede acesso por `profiles.verified` ou `profiles.is_official`. As contas iniciais foram vinculadas a IDs confirmados no banco.

Em outra instalação, confirme primeiro a relação entre perfil e conta de autenticação e só então cadastre os IDs principais. Nunca use apenas username para conceder acesso.

## RLS e chave do servidor

As tabelas administrativas têm RLS habilitado, acesso direto revogado para `anon` e `authenticated` e política restritiva que nega consultas diretas. As rotas do Next.js usam a chave privada do Supabase apenas no servidor, depois de validar sessão e permissão.

A chave privada ignora RLS. Cada rota administrativa deve validar `getStaffContext` e `hasStaffPermission`; operações de departamento, cargo e nomeação também revalidam o hash da sessão e a permissão dentro de funções SQL com execução limitada a `service_role`. Nunca importe `lib/admin/authorization` em componentes cliente ou retorne o hash da sessão ao navegador.

## Painel atual

A rota `/admin` exige sessão e a permissão `admin.view`. A interface oferece visão geral, departamentos, cargos/permissões, integrantes e histórico. Ações de alto impacto pedem confirmação.

A API `/api/admin/manage` limita consultas ao escopo de departamento do integrante. Departamentos, catálogo de permissões e edição de cargos exigem permissões de plataforma, reservadas às contas principais. Integrantes só podem nomear ou remover pessoas nos departamentos em que possuem `members.manage`; o banco também impede auto nomeação.

## Dados e histórico

Departamentos e cargos são dinâmicos. Vínculos encerrados permanecem em `team_memberships`, com autor, data e motivo de remoção. Nomeações e remoções são transacionais com notificação e registro append-only em `admin_audit_log`. Selos públicos devem ser derivados de cargos ativos; nunca devem ser concedidos por edição comum do perfil.

## Permissões

O catálogo `permissions` representa capacidades verificadas por rota. Associar uma capacidade a um cargo não cria automaticamente uma operação: a rota correspondente ainda precisa validar a permissão. Escopos `platform` são exclusivos das contas principais; cargos só podem receber permissões de escopo `department`.

## Migrações e validação

As migrações em `supabase/migrations` devem ser aplicadas e mantidas junto ao código. `supabase/verification/rls_access.sql` contém verificações de acesso direto. A correção de validação de permissões usa aliases explícitos ao consultar arrays PostgreSQL, evitando referências SQL ambíguas.
