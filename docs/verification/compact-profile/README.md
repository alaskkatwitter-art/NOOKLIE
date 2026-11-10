# Perfil compacto e temas do aplicativo

## Mudanças

- Editar perfil leva diretamente a /configuracoes/perfil: Fotos e capa, Temas e Dados. Zoom/enquadramento reutilizam o recorte existente e os endpoints autenticados. /perfil agora encaminha à página pública atual da própria conta.
- Quatro abas no perfil: Obras, Mural, Listas e Sobre. Mural mostra publicações e permite escrever; republicados ficam numa seção secundária em Sobre. Ferramentas anteriores de gerenciamento continuam disponíveis em /configuracoes/conteudo, sem o cabeçalho antigo.
- Nome próximo ao @usuário, Seguidores no centro, cabeçalho menor e cartões de histórias/mural com cantos mais retos.
- Preto e rosa é o padrão do aplicativo; branco e rosa é opcional no menu, em Configurações e na edição do perfil. A escolha fica neste navegador, aplica antes da pintura e sincroniza entre abas. Não exige dados adicionais da conta.
- Temas públicos explícitos dos perfis e as preferências de leitura continuam independentes do tema geral.

## Verificação

103 testes existentes aprovados. Build Next.js e checagem TypeScript dos fontes aprovados; ESLint dos arquivos alterados sem erros. O build Cloudflare contém os estilos e controles novos.

Navegador a 360 × 800 e 1440 × 1000: Editar perfil abre a edição diretamente; foto/capa carregam; recorte e upload de enquadramento funcionam; salvar dados usa o endpoint existente; Mural mostra publicações, não republicados; quatro abas, contagens e cartões compactos; troca/persistência dos dois temas entre Feed, chat, explorar, biblioteca, configurações e perfil; tema público Forest Tales e leitor sépia preservados. APIs de escrita são simuladas nesses testes: nenhuma foto ou dado real foi alterado.

Os screenshots usam a capa/avatar públicos da responsável e conteúdo/contagens de demonstração. Não representam uma sessão real autenticada.
