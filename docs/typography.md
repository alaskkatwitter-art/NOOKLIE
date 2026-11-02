# Tipografia do Nooklie

Implementação preparada em 02/11/2026, a partir de main a82a1f1. Sem deploy e sem alterações no banco de produção.

## Inspeção e preservação

A interface herdava `ui-rounded, "Trebuchet MS", system-ui, sans-serif`. O logotipo combina SVG inline e texto HTML. Os SVGs em início, login e feed continuam byte a byte idênticos, verificados por hashes; os cinco nomes da marca agora recebem explicitamente a mesma pilha de fontes anterior. Símbolo, cores, tamanhos, espaçamentos e proporções não foram editados.

O leitor utilizado pelos links das histórias é `app/capitulo/[id]/page.tsx`. Tinha texto de 18px/32px, fonte serifada do navegador e comentários vinculados a seleções; não tinha seletor de fontes nem armazenamento de preferências. A inspeção não encontrou gravação de progresso nesse componente; nenhuma API de progresso foi alterada. `/ler/[id]` é um exemplo estático antigo e permanece intacto.

A alteração envolve somente tipografia e suas preferências. O renderizador do corpo, o HTML armazenado, as seleções de texto, offsets dos comentários, navegação, figurinhas e curtidas permanecem intactos. Os padrões do leitor preservam fonte serifada anterior, tamanho 18px, entrelinha 32px e tema escuro.

## Interface e carregamento

`lib/fonts/interface.ts` usa `next/font/google` da versão instalada, com variáveis `--font-nooklie-body` (DM Sans) e `--font-nooklie-heading` (Outfit). Latin e latin-ext atendem ao português. DM Sans tem normal/itálico; Outfit normal; ambas usam arquivos variáveis e display swap, sem imports CSS externos duplicados.

O layout aplica as variáveis e `globals.css` define DM Sans para a interface e Outfit para h1–h6 e a classe reutilizável `.font-heading`. A classe da marca conserva sua fonte anterior. A superfície do capítulo tem variáveis próprias e prioridade sobre títulos/estilos globais e inline, mantendo tamanho, fonte, entrelinhas, margens e tema escolhidos.

As outras onze famílias do leitor são WOFF2 oficiais, sem modificações nos binários, baixadas de fonts.gstatic.com. CSS com unicode-range, normal/itálico e pesos 400–700 quando disponíveis; Atkinson Hyperlegible usa seus pesos estáticos disponíveis. O CSS só entra no layout do leitor. O navegador solicita as faces usadas; abrir o painel monta as prévias reais e pode solicitar as demais famílias. DM Sans reutiliza a instância da interface. Não há preload de todas as fontes de leitura nem consultas Google no navegador. Os 46 arquivos somam aproximadamente 2,2MB para a coleção completa; apenas os necessários são solicitados em cada uso. Nomes com hash recebem cache imutável por um ano.

Todas as 13 famílias são SIL Open Font License 1.1: Lora, Merriweather, Literata, Newsreader, EB Garamond, Source Serif 4, Libre Baskerville, Nunito, DM Sans, Lexend, Atkinson Hyperlegible, Open Sans e Outfit. Os avisos originais de copyright e licenças estão em `public/fonts/licenses/` e no arquivo combinado `public/fonts/LICENSES.txt`, acessível pelo painel. `manifest.json` registra fontes oficiais, hashes e tamanhos. `scripts/sync-font-assets.py` reproduz a coleta. Essa licença permite uso comercial conforme seus termos.

Referências oficiais: https://nextjs.org/docs/app/api-reference/components/font e https://github.com/google/fonts/tree/main/ofl . Cada família possui seu URL exato de METADATA.pb e OFL.txt no manifesto.

## Preferências e segurança

O painel oferece as doze fontes solicitadas e a fonte original do navegador, prévia com acentos, tamanho, entrelinhas, margens, quatro temas e restauração de padrões. Controles por teclado, rótulos acessíveis, foco e áreas de toque foram preservados/adicionados. O tema do dispositivo respeita prefers-color-scheme; forced-colors utiliza cores do sistema; zoom não é desativado. Unidades rem para tamanho/margens acompanham a base do navegador. Margens são limitadas pela largura de tela para evitar esmagar o texto.

O hook restaura e salva localmente com chaves separadas para visitante e cada conta. A API usa a sessão existente do Nooklie; nunca aceita user_id fornecido pelo cliente. Validação estrita limita fontes, valores e temas. Cache privado/no-store, debounce de 500ms, fila ordenada e gravação pendente na saída reduzem requisições e perda de alterações. Falhas exibem estado de sincronização indisponível, sem alegar gravação na conta. Alterações locais pendentes são reenviadas ao retornar.

A migração `supabase/migrations/20261102160115_reader_typography_preferences.sql` cria tabela isolada, FK para auth_accounts, validação JSON, RLS e acesso apenas pelo backend service_role. **Foi testada em PostgreSQL descartável (PGlite), mas não foi aplicada em produção.** A persistência entre dispositivos dependerá da aplicação dessa migração na futura publicação autorizada. Sem tabela disponível, a leitura continua com cache local e aviso de sincronização indisponível. Nenhum conteúdo ou preferência de usuários reais foi modificado.

## Validação

- `npm run build`: passou.
- `npm run lint`: zero erros; 89 avisos existentes sobre imagens, hooks e padrões já presentes no projeto.
- `npm test`: 14 testes passaram. Incluem autenticação e rotas existentes, round-trip das preferências na API com backend simulado, rejeição de outra conta e valores inválidos, isolamento de cache, integridade WOFF2/hashes/licenças, hashes dos SVGs e migração real em PGlite (restrições, permissões/RLS, gravação e exclusão em cascata).
- Prévia interna: bundle do componente real de capítulo, hook e controles, com capítulo sintético e respostas de API simuladas. CSS/arquivos da build real. Nenhum deploy de Vercel foi criado.
- Navegador: DM Sans computada no body, Outfit no título, serifada original antes de escolher; Lora aplicada imediatamente e restaurada após reload com tamanho 15, entrelinha 2,5, margens 64 e sépia. Texto idêntico antes/depois. Controles por teclado responderam. Login da build estática mostrou o SVG original e a pilha antiga no nome da marca.
- Larguras: desktop 1363px sem overflow; iframe de 375px com o componente real, coluna única de prévias, largura de documento 360px, sem overflow horizontal. Capturas em `docs/verification/`. O iframe verifica CSS responsivo, não emula um aparelho físico.
- Limites: sem teste em celulares físicos/Safari, sem confirmação de zoom real (atalho não alterou a viewport neste navegador), sem fluxo de comentários autenticado em banco real e sem sincronização em produção. Uma tentativa adicional de verificar cmap com fontTools não prosseguiu por ausência de Brotli; amostras acentuadas foram inspecionadas visualmente e Latin/Latin-ext estão presentes.

## Arquivos

- Interface e marca: `app/layout.tsx`, `app/globals.css`, `lib/fonts/interface.ts`, `app/page.tsx`, `app/login/page.tsx`, `app/feed/page.tsx`.
- Leitor: `app/capitulo/layout.tsx`, `app/capitulo/[id]/page.tsx`, `app/components/ReaderSettings.tsx`, `lib/reader/preferences.ts`, `lib/reader/use-reader-preferences.ts`.
- Persistência: `app/api/reader/preferences/route.ts` e a migração acima.
- Fontes: `lib/fonts/reader.css`, `public/fonts/`, `scripts/sync-font-assets.py`, `next.config.ts`.
- Verificação: `tests/smoke.test.mjs`, `tests/typography.test.mjs`, `tests/fixtures/logo-hashes.json`, `package.json`/lock (PGlite apenas dev), esta documentação e capturas.
- `vercel.json` desativa deploy automático exclusivamente para a branch `feature/reader-fonts-and-site-typography`; outras branches mantêm a configuração existente. `.gitignore` ignora cache local da CLI Supabase.

A entrega deve permanecer em branch/PR, sem merge, aplicação de migração ou deploy, até autorização.
