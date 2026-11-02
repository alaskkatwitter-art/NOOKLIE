# Verificação visual — 02/11/2026

Status: **bloqueada; não validada em desktop nem Android/celular**.

## Tentativas e evidências

1. `sites-preview start` foi executado no checkout. O daemon chamou `next dev --host 0.0.0.0 --port 4173 --strictPort`. Next.js rejeitou `--host`, pois essas opções pertencem a outro servidor. `sites-preview status` confirmou a prévia parada. Não foi alterado o código da aplicação para contornar a infraestrutura.
2. A prévia existente da branch, `toriland-8ce3hxai9-toriland.vercel.app`, estava READY no commit `23bce96`. O navegador abriu `/politicas` e foi redirecionado para a página de login da Vercel, antes de atingir o Nooklie.
3. A revisão automática recusou criar um link temporário de 10 minutos, por ampliar acesso a uma prévia protegida sem autorização específica para essa mudança. Nenhum link foi criado; a proteção não foi alterada.

A página de login da Vercel não é evidência visual do Nooklie. Build, TypeScript e testes HTTP não substituem inspeção visual, teste de toque ou Android real.

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
