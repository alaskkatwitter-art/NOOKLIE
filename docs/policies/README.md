# Revisão das políticas — 02/11/2026

Os sete arquivos desta pasta são a fonte legível das minutas semeadas pela migração literária ainda não aplicada. A revisão editorial e técnica está preparada; não foi realizada certificação ou revisão profissional independente. Não publicar textos que contenham `[PREENCHER ...]`. O painel apresenta as pendências por documento e o servidor rejeita publicação enquanto houver esses campos.

## Decisões implementadas

- Serviço gratuito e sem anúncios; cadastro sem exigir e-mail, telefone, nome civil ou data de nascimento.
- Licença técnica não exclusiva, sem transferência de autoria, venda de obras ou permissão genérica de treinamento de IA.
- Fanfiction não recebe garantia automática de legalidade por ser gratuita; direitos dos titulares permanecem. Traduções e imagens precisam de autorização ou outra base aplicável.
- Classificações Livre/12/14/16/18 e avisos de conteúdo; contexto narrativo distinto de incitação ou discriminação.
- Coautoria com aceite, histórico e exclusão unânime; créditos e portfólio controlados pelo colaborador.
- Denúncia privada, análise contextual, medidas proporcionais, recurso e auditoria; pedidos de ajuda não são infrações por si só.
- O aceite informa ID e versão exibidos; atualização durante a leitura exige recarregar. Repetir o aceite não duplica o registro. O aviso se atualiza e permanece no fluxo da página, sem cobrir os controles.
- Novo aceite para mudanças materiais em direitos, obrigações, licença, permissões ou medidas de moderação; ajustes editoriais sem mudança de sentido dispensam novo aceite. O painel permite registrar a escolha por versão. Aceite da política de privacidade não substitui base legal ou consentimento específico.
- Conteúdo Markdown é apresentado como títulos, parágrafos e listas, com texto escapado pelo React e sem executar HTML arbitrário.
- A política de imagens informa os limites reais: uma imagem pública exibida pelo navegador não pode ter garantia absoluta contra cópia, captura de tela ou download. Anexos privados de denúncias mantêm controle de acesso distinto de imagens públicas.

## Pendências concretas que não podem ser substituídas por texto

| Item | Situação / informação necessária |
| --- | --- |
| Controlador | Identificação pública da pessoa/entidade efetivamente responsável. Não inferir identidade jurídica a partir de nome de usuário. |
| Atendimento externo | Canal público monitorado para privacidade, direitos autorais e denúncias sem exigir conta. Não inventar e-mail ou prometer suporte inexistente. |
| Retenção e exclusão | Prazos/critério de cada classe de dado e backup, responsáveis, execução e evidência de exclusão. A aplicação registra pedidos; não implementa eliminação integral automática. |
| Fornecedores e transferências | Supabase confirmado em us-east-2; confirmar regiões, subprocessadores e instrumentos de transferência aplicáveis da Vercel/Supabase antes de publicá-los como fatos. |
| Menores e acesso adulto | O produto não verifica idade. A decisão anterior de manter acesso 18+ não foi alterada por esta revisão. Escolher e implementar um mecanismo proporcional que minimize dados ou decidir restringir a disponibilização até sua implantação. Não apresentar login ou checkbox como aferição confiável. Avaliar também salvaguardas etárias gerais/supervisão, não apenas as obras 18+. |
| Protocolo de incidentes graves | Definir responsáveis e canal de autoridades para execução dos procedimentos; o texto não cria capacidade operacional. |

Não se deve marcar essas pendências como resolvidas apenas publicando uma declaração. As minutas permanecem na branch e não foram publicadas na produção.

## Fontes oficiais consultadas

- [LGPD — Lei nº 13.709/2018, texto atualizado](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html): arts. 6º, 7º, 9º, 14, 15–19 e 33 e seguintes; minimização, transparência, direitos, retenção e transferência.
- [Direitos autorais — Lei nº 9.610/1998, texto atualizado](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html): direitos sobre obras, autorizações, adaptações/traduções e limitações legais. Não aplicar uma isenção genérica estrangeira de “fair use”.
- [ANPD — ECA Digital e cronograma](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/): Lei nº 15.211/2025, Decreto nº 12.880/2026, orientações e evolução regulatória da aferição etária.
- [ANPD — balanço de implementação, setembro/2026](https://www.gov.br/anpd/pt-br/assuntos/noticias/eca-digital-completa-um-ano-e-e-marco-na-protecao-de-criancas-e-adolescentes-na-internet): proteção por padrão, supervisão e insuficiência de autodeclaração como única barreira.

A aplicação concreta das obrigações depende da operação real do serviço. As fontes e o código não equivalem a um parecer jurídico.
