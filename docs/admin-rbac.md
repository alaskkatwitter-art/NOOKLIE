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

## Oportunidades e candidaturas

A Central pública fica em `/oportunidades` e lista somente vagas abertas dentro do período de inscrição. O formulário exige sessão. Cada conta pode enviar uma candidatura por vaga; respostas, observações internas e decisões não são expostas publicamente.

A equipe consulta candidaturas em `/admin`. O escopo de departamento é aplicado na API e novamente pelas funções SQL. Aprovar exige um cargo ativo do mesmo departamento e a permissão `members.manage`; a aprovação cria o vínculo, a notificação e o registro de auditoria na mesma transação. Não é possível nomear a própria conta por candidatura.

## Migrações e validação

As migrações em `supabase/migrations` devem ser aplicadas e mantidas junto ao código. `supabase/verification/rls_access.sql` contém verificações gerais e `supabase/verification/admin_access.sql` verifica RLS, privilégios das funções e os IDs das duas contas principais. A correção de validação de permissões usa aliases explícitos ao consultar arrays PostgreSQL, evitando referências SQL ambíguas.

## Diretório de usuários e moderação

A seção Usuários do painel exige `users.view` e retorna apenas nome, avatar e data de cadastro. Nunca selecione hashes de senha, códigos ou hashes de recuperação, nem tokens de sessão para a interface administrativa.

Denúncias de perfis, publicações e histórias ficam em `moderation_reports`. O envio usa a sessão de autenticação própria, bloqueia auto denúncia e duplicatas em aberto, e limita denúncias pendentes por conta. RLS é habilitado e acesso direto de clientes é revogado; apenas rotas de servidor com permissão validada podem consultar ou alterar os registros.

A fila de moderação é filtrada por departamento e pelas permissões `moderation.view`/`moderation.manage`. Decisões finais pedem confirmação, atualizam a denúncia e gravam uma entrada append-only no histórico administrativo. O painel registra a análise; a ocultação ou remoção do conteúdo deve ser tratada como uma ação separada com regras próprias.

`supabase/verification/moderation_workflows.sql` testa envio, duplicata, auto denúncia, revisão, auditoria, rollback e privilégios/RLS.
