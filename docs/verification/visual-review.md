# Verificação visual — 02/11/2026

Status: **verificação parcial em desktop; fluxo completo de políticas e Android/celular ainda não validados**.

## Tentativas e evidências

1. `sites-preview start` foi executado no checkout. O daemon chamou `next dev --host 0.0.0.0 --port 4173 --strictPort`. Next.js rejeitou `--host`, pois essas opções pertencem a outro servidor. `sites-preview status` confirmou a prévia parada. Não foi alterado o código da aplicação para contornar a infraestrutura.
2. A prévia existente da branch, `toriland-8ce3hxai9-toriland.vercel.app`, estava READY no commit `23bce96`. O navegador abriu `/politicas` e foi redirecionado para a página de login da Vercel, antes de atingir o Nooklie.
3. A revisão automática recusou criar um link temporário de 10 minutos, por ampliar acesso a uma prévia protegida sem autorização específica para essa mudança. Nenhum link foi criado; a proteção não foi alterada.

A página de login da Vercel não é evidência visual do Nooklie. Build, TypeScript e testes HTTP não substituem inspeção visual, teste de toque ou Android real.

## Retomada após autorização explícita

A proprietária autorizou em conversa um link temporário de 10 minutos para a prévia. O primeiro link foi criado com TTL de 600 segundos e revelou que `proxy.ts` redirecionava todo host Vercel para a produção. `/politicas` terminava em 404 na versão pública, em vez de testar a rota nova.

A correção `bc6331f` restringe o redirecionamento canônico a `VERCEL_ENV=production`. A nova prévia foi testada no navegador no mesmo host de preview, sem redirecionamento para produção. O link anterior foi revogado, e o link usado na prévia corrigida também foi revogado ao encerrar os testes. Nenhum token de acesso deve ser registrado neste arquivo.

O [CI da correção](https://github.com/alaskkatwitter-art/NOOKLIE/actions/runs/41460919679) passou: build, lint sem erros, 18 testes e verificações SQL. O novo teste envia um host `.vercel.app` a uma instância em ambiente preview e verifica que a rota nova responde 200 sem cabeçalho de redirecionamento.

### Inspeção no navegador

Prévia inspecionada: `toriland-dcix5m24u-toriland.vercel.app`, commit `bc6331fa15460e0d1e6de718fb898c84336a27b3`.

| Tela/fluxo | Resultado observado |
| --- | --- |
| `/politicas` | Layout, título, margens e estado de erro visíveis. A API não carrega os documentos; não aprovado o catálogo com dados nem o aceite. |
| `/login` | Formulário e alternância entre cadastro e entrada visíveis; destaque da aba corresponde ao modo após a transição. Não foi criada nem autenticada conta real. |
| `/conta/privacidade` sem sessão | Exibe mensagem para entrar na conta, sem controles de alteração de dados privados. |
| `/admin/politicas` sem sessão | Redireciona para o login do Nooklie, mantendo o host da prévia. |
| Celular/Android | Não verificado. O navegador não ofereceu controle documentado de viewport e os atalhos de modo de dispositivo não produziram viewport móvel. Não inferir responsividade aprovada de uma captura desktop. |

Consulta somente de leitura ao projeto conectado confirmou que `public.policy_documents` e `public.policy_acceptances` ainda não existem. As migrações continuam pendentes; nenhum SQL de escrita foi executado na produção para viabilizar testes.

Capturas sem credenciais ou dados de usuários:

- [Tela de entrada — desktop](screenshots/login-desktop.jpg).
- [Políticas — estado de erro por backend pendente](screenshots/policies-backend-pending.jpg).

Para concluir o teste visual com dados, é necessário um ambiente de teste com as migrações e contas sintéticas, além de acesso a viewport móvel/Android. Não aprovar esse fluxo apenas pela compilação e pelos testes HTTP.

## Correções preparadas a partir da revisão de código

- Leitura de políticas com títulos, parágrafos e listas em vez de Markdown bruto.
- Quebra de palavras, contraste do metadado e botão de aceite com altura mínima de 44 px.
- Aceite explícito, estado de envio, atualização do aviso após aceite e versão exata.
- Aviso no fluxo da página, sem posição fixa sobre botões ou conteúdo.
- Editor administrativo com quebra de botões, colunas com `min-w-0`, prévia de leitura e lista de campos pendentes por documento.

Essas correções ainda precisam de inspeção em navegador.

## Roteiro pendente quando houver acesso

- Desktop: 1440×900 e 1280×800. Celular: 360×800 e 390×844; completar com Android real para toque e teclado.
- Políticas: catálogo, sete documentos, cabeçalhos, rolagem, texto longo, erro/ausência de documento e estado sem políticas publicadas.
- Aceite: visitante, usuário autenticado, checkbox inicialmente desmarcado, envio repetido, atualização durante a leitura, confirmação e retirada do aviso.
- Administração: usuário sem permissão, edição de minuta, leitura, campos pendentes, novo aceite e publicação/arquivamento em ambiente de teste.
- Privacidade e moderação: exportação, solicitação de exclusão, recursos, correções de avisos e evidências privadas. Usar contas e dados sintéticos; não executar exclusões ou publicar documentos reais para testar.
- Coautoria e resenhas: convite, saída, unanimidade/recusa, spoilers e formulários responsivos.
