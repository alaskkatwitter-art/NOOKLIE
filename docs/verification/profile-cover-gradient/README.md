# Fundo do perfil baseado nas cores da capa

Correção solicitada: a foto deve aparecer somente no cabeçalho. O restante do perfil usa base preta e duas manchas suaves de cor, que desaparecem antes do fim da página. Não há imagem de fundo repetida ou ampliada.

A paleta é extraída no navegador de uma amostra 32 × 32 da capa, sem dependências adicionais. Pixels transparentes, pretos profundos e brilhos brancos não dominam a amostra. Uma capa ausente ou sem permissão CORS deixa o fundo preto; a imagem original continua aparecendo normalmente no cabeçalho. Trocar de perfil não mantém as cores da capa anterior. Temas públicos explícitos continuam podendo definir sua cor de base.

Validação: build Next.js/TypeScript e dois testes de paleta aprovados. Navegador em 360 e 1440 px verificou fundo preto, ausência de imagem em pseudo-elementos, cores derivadas da capa real, capas azuis e vermelhas, ausência de capa e ausência de rolagem horizontal/erros de execução. Os screenshots usam a capa e avatar públicos de astriddy, mas o conteúdo e as contagens são dados simulados de teste.
