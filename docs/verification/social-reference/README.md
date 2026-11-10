# Referências sociais — novembro de 2026

Aplicação das quatro referências fornecidas pela responsável do Nooklie: informações do grupo, conversas, Feed e perfil público.

## Validação

- Build de produção Next.js com webpack e build Cloudflare/Vinext.
- 101 testes aprovados. O novo teste verifica que Seguindo inclui publicações e republicações de autores seguidos antes da paginação, sem vazar a linha do tempo para visitantes sem sessão.
- Navegador Chromium, com dados simulados, em 360 × 800 e 1440 × 1000: alternância Feed/Seguindo; seis conversas visíveis; abertura e fechamento das informações do grupo; participantes; cinco abas do perfil; ausência de rolagem horizontal e de erros de execução.
- Os screenshots desta pasta usam nomes e textos de demonstração e avatares/capas vetoriais de teste. Eles não são imagens do banco de produção.
- TypeScript aprovado. ESLint dos arquivos alterados: nenhum erro; avisos de imagens e padrões preexistentes.

## Comportamento

O Feed passa a ter fundo preto, divisórias e ações rosa. Calendário, busca, respostas salvas e Stories permanecem acessíveis em um menu compacto. No computador, o calendário continua na coluna lateral. Criar publicação usa um botão flutuante.

Foto, participantes e convites do grupo ficam nas informações, sem ocupar o espaço das mensagens. Busca, mídias e links nessa tela consultam somente as mensagens já carregadas; a interface informa esse limite. Somente o criador recebe as ferramentas de foto e convites. A política de acesso dos endpoints continua sendo a existente.

O perfil abre em Publicações e mantém Obras, Mural, Listas e Sobre. Republicados continua acessível em Mural. A biografia fica em Sobre. A capa continua no fundo da página, respeitando cores do tema público e posição do avatar. O leitor e as demais etapas do planejamento não foram alterados.

Chamadas de áudio/vídeo e mensagens fixadas não foram implementadas: as referências orientam esta alteração visual, sem acrescentar controles sem suporte funcional.
