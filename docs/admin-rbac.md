# Fundação administrativa do Nooklie

## Identidade e acesso

O sistema continua usando as contas de `auth_accounts` e as sessões verificadas em `auth_sessions`. As permissões são derivadas do ID associado à sessão; o servidor não confia em username, flags de perfil ou dados enviados pelo navegador.

As contas principais da plataforma ficam em `platform_admins`. Essa tabela não tem rotas de criação/edição no painel e não concede acesso por `profiles.verified` ou `profiles.is_official`. A lista inicial foi inserida no Supabase depois de confirmar a ligação entre cada perfil e sua conta de autenticação.

Em uma nova instalação, confirme as contas e os IDs no banco antes de inserir qualquer principal em `platform_admins`. Não use apenas usernames em uma checagem de acesso e não exponha a tabela ao navegador.

## RLS e chave do servidor

As tabelas administrativas têm RLS habilitado, sem permissões de leitura/escrita para `anon` ou `authenticated`, e uma política restritiva que nega acesso direto. As rotas do Next.js usam a chave privada do Supabase somente no servidor, depois de verificar sessão e permissão.

A chave privada ignora RLS; portanto, cada rota administrativa precisa chamar `getStaffContext` e `hasStaffPermission` antes de consultar ou alterar dados. Não importar `lib/admin/authorization` em componentes cliente.

## Dados e histórico

Departamentos e cargos são configuráveis pelo banco e preparados para edição pela interface. Vínculos de equipe são encerrados com status e data de remoção, preservando o histórico. Selos públicos serão derivados de cargos ativos, sem alterar os selos de conta já existentes. O histórico administrativo é append-only.

## Permissões

O catálogo `permissions` representa capacidades que as rotas precisam verificar. Administradores podem associar essas capacidades a cargos; adicionar uma nova capacidade ainda requer uma rota que a verifique. Permissões com escopo `platform` ficam reservadas aos administradores principais.
