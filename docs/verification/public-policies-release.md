# Publicação das regras — 02/11/2026

A proprietária autorizou publicar a página geral e a seção de IA. A PR #2 foi mesclada em main no commit `a82a1f1ece62ec6c7ca3a15296ee9c82834c80c4` e a Vercel confirmou READY para a implantação de produção `dpl_BMgcctReiTdLqugMmgZedTTxGyYn`.

URL pública verificada no navegador: https://toriland.vercel.app/politicas . O link dentro do cartão de login foi clicado e abriu a página completa sem login, sem erro de banco e com os títulos separados dos parágrafos. O rodapé também contém o link. A página inclui identificação separada de IA em histórias/capas, advertência após confirmação da omissão e proteção de autoria contra treinamento.

O endpoint público /robots.txt respondeu com as recusas para GPTBot, ClaudeBot e Google-Extended. Esses sinais dependem do cumprimento pelos rastreadores e não são garantia contra toda cópia de conteúdo público. Não há detector de IA ou advertências automáticas.

A publicação foi limitada a esses conteúdos e controles. A PR #1 continua em rascunho e suas três migrações não foram aplicadas. Nenhuma escrita foi realizada no banco para essa publicação. A política de privacidade detalhada e documentos com campos operacionais pendentes não foram publicados como completos.

Checagens: nove testes, build e lint da versão de publicação passaram no CI; inspeção em desktop confirmou o fluxo login → políticas; nenhum erro/fatal apareceu na consulta inicial de logs da implantação. Android continua sem verificação direta.

[Captura da página publicada](screenshots/policies-published.jpg)

Ao integrar a PR #1 futuramente, preservar esta página geral funcional e o link interno do login; conciliar seu catálogo versionado para evitar reintroduzir a dependência de tabelas ainda indisponíveis. As informações anteriores sobre ausência de deploy referem-se à PR #1, não a esta publicação limitada.
