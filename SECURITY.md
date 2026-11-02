# Segurança do Nooklie

Relate vulnerabilidades de forma privada para appnookie@gmail.com. Não publique senhas, tokens, mensagens privadas ou dados de outras pessoas em issues públicas. Informe a página afetada, os passos para reproduzir e o impacto observado, com dados fictícios sempre que possível.

O chat exige sessão válida e participação na conversa, aprovação do destinatário e ausência de bloqueios. Mensagens e anexos são cifrados no servidor com AES-256-GCM; os anexos ficam em um bucket privado. Essa proteção não constitui criptografia de ponta a ponta. Apenas a mensagem escolhida por um participante em uma denúncia pode ser examinada no painel administrativo; o acesso é registrado.

A chave CHAT_ENCRYPTION_KEY é um segredo apenas do servidor. Não a altere sem um processo de migração dos conteúdos cifrados e recuperação verificada. Não inclua segredos em NEXT_PUBLIC_*, repositórios, logs ou exemplos.

Não há ligações de voz ou vídeo. O compartilhamento de imagens e áudios depende da aceitação da conversa. Alertas de apoio são exibidos localmente e não enviam denúncias automáticas nem constituem diagnóstico.
