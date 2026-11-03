# Comunidade, perfis e leitura

A revisão acrescenta nookladas simples ou com comentário, leitura ampliada dos posts e uma aba de republicados independente do mural. As referências apontam para a publicação original; bloqueios, perfis privados e ocultação de conteúdo são reavaliados a cada consulta. A preferência de republicados privados se aplica à aba, ao feed e à lista de quem nooklou.

O perfil reúne a troca de foto, capa, nome, bio e cor em Editar perfil. As contagens de histórias e conexões têm uma faixa centralizada, e seguidores/seguindo abrem listas com paginação. O rodapé tem contato por mailto e TikTok em vetor rosa. Sobre preserva integralmente o texto enviado e destaca a equipe pequena e voluntária.

Notificações sociais identificam a pessoa por nome/avatar e usam frases diretas. Listas privadas não expõem o nome da lista em notificações novas. A leitura ganhou cabeçalho, banner, sumário em degradê rosa e controles discretos; as preferências existentes continuam preservadas.

A edição de capítulos oferece banner separado da capa da obra e agendamento por data/hora local, enviado ao servidor como UTC. A transição de publicação é atômica. Uma tarefa pg_cron consulta capítulos vencidos a cada minuto e os publica uma única vez. O acesso à história também chama a mesma função como recuperação. Imagens no texto são preservadas no ponto escolhido e passam pela rota que verifica o acesso à mídia.

A exclusão de histórias requer sessão ativa, autoria, senha válida e limite de tentativas no servidor. Os capítulos e registros dependentes são excluídos por cascatas já existentes.

## Validação

- Compilação de produção e TypeScript.
- Suíte automatizada, incluindo transições de agendamento, prevenção de publicação antecipada, cancelamento, idempotência, permissões, identidade nas notificações e preservação/segurança de imagens inline.
- O preview gerenciado não aceitou os argumentos de inicialização do Next.js (`--host`/`--strictPort`). A inspeção visual de navegador deste ambiente não foi certificada.
- A migração `nooklar_reading_and_scheduling` deve estar aplicada antes da publicação do código. Ela adiciona campos e tabela, atualiza funções de notificação e registra o job de publicação; não exclui histórias nem contas existentes.
