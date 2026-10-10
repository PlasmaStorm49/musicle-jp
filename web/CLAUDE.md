# web (TypeScript + Vite + Preact)

Complementa o `CLAUDE.md` da raiz. Os comandos estão lá e rodam da raiz com `--prefix web`.

## Mapa

| Caminho | Papel |
|---|---|
| `src/core/` | Lógica pura do jogo: tipos, catálogo, normalização, PRNG, datas, regras, reducer (`createRounds`), save (`records`), estatísticas, compartilhar, busca do autocompletar por alvo (`search`, `kana`), Treino (`practice`), rotas das abas (`routes`) |
| `src/core/generated/` | Tipos gerados de `shared/schema` por `npm run types`. **Nunca à mão** (negado no `settings.json`) |
| `src/data/` | Carrega catálogo e agenda e escolhe o dia. Sem DOM e sem `import.meta.env`: recebe `fetch` e a URL base |
| `src/audio/` | Contrato `AudioEngine`, o motor Web Audio e o motor falso (`fake.ts`, só em DEV, dos testes de ponta a ponta) |
| `src/storage/` | Save no localStorage (`save.ts`, com o `sessionStore` da sessão) e migrações. Sem DOM: recebe um `KeyValueStore` |
| `src/i18n/` | Todos os textos de tela (`pt-BR.ts`), `t()` tipado por chave e `tn()` para plural |
| `src/ui/` | Componentes Preact: `App` (carga, save vivo, abas), `Game` (um diário por alvo), `Practice` (Treino), `RoundView` (uma rodada, do diário ou do Treino), `ModePicker`, `Player`, `Options` (4 opções, com `Cover` no Álbum), `GuessInput` e `Attempts` (digitação), `Reveal`, `Summary` com `Stats`, `ShareButton` e `Countdown`; ganchos em `hooks.ts`. Testes de componente em `*.test.tsx` |
| `scripts/` | `gen-types.ts` e `dump-normalize.ts` (ponte do teste cruzado com o Python) |
| `test/` | Ajudantes de teste que usam o Node (`fs`): vetores e fixtures |
| `e2e/` | Testes de ponta a ponta (Playwright) e `helpers.ts`; tipos no `tsconfig.e2e.json` |

## Regras

1. **`src/core` e `src/storage` são puros:** sem DOM, sem Preact, sem `node:*`. Três travas garantem isso: o `tsconfig.node.json` (sem DOM), o `tsconfig.json` (sem tipos do Node) e o Biome (`noRestrictedImports` para `preact*`). O `storage` recebe o armazenamento por parâmetro (`KeyValueStore`).
2. **Imports com extensão `.ts`** e só sintaxe "apagável" (`erasableSyntaxOnly`): nada de `enum`, `namespace` nem parameter properties. É o que permite ao Node 24 rodar o núcleo direto, no teste cruzado.
3. **Normalização e PRNG mudam junto com o Python** (`pipeline/src/musicle_pipeline/normalize.py` e `prng.py`) e com os vetores de `shared/vectors/`. O teste cruzado compara todo o plano básico do Unicode.
4. **Schema mudou?** Rode `npm run types --prefix web`. O teste `scripts/gen-types.test.ts` falha até isso.
5. **Reducer:** evento inválido devolve **o mesmo objeto**. Modo novo entra em `MODE_RULES` (`rules.ts`), não como `if` no reducer.
6. **Testes rodam com `TZ=Asia/Tokyo`** de propósito: código que use a hora local por engano falha aqui.
7. **Dependências:** versão exata, com 14 dias ou mais de publicada (`.npmrc`, também nas indiretas). Exceção só para patch de segurança com aviso publicado, registrada em `docs/PLANO.md` (P28, P29).
8. **Textos de tela só via `t()`** (regra inviolável 2).
9. **Áudio:** `engine.unlock()` (ou `play()`, que o chama) só **dentro de um clique**, antes de qualquer `await`. Contexto criado antes de interação nasce suspenso e suja o console. Falha de áudio despacha `VOID { round: atual }`; falha no pré-carregamento é silenciosa.
10. **Só em desenvolvimento** (`npm run dev`): `?date=AAAA-MM-DD` troca o dia; `?failAudio=<id da faixa>` simula falha de áudio; `?fakeAudio=1` troca o Web Audio pelo motor falso (`audio/fake.ts`, dos testes de ponta a ponta); `window.__musicleAudioLog` registra pedido × tocado de cada reprodução. Código que precisa **sair do build** (o motor falso) confere o literal `import.meta.env.DEV` no ponto da chamada (`import.meta.env.DEV && ...`). Recebido como parâmetro (`dev`, caso do `?date` e do `?failAudio`), o código fica no pacote, inofensivo porque `dev` vale `false`.
11. **Testes de ponta a ponta** (`e2e/`, Playwright): relógio fixo com `page.clock.setFixedTime` antes do `goto` (sem `?date=`), motor falso, fuso do navegador em Tóquio; a resposta certa sai do `__musicleAudioLog` cruzado com o catálogo (`e2e/helpers.ts`). Todo teste falha com erro no console. Tipos no `tsconfig.e2e.json` (DOM e Node), à parte das travas do núcleo e da aplicação.
12. **Save:** grave só por `updateSave` (relê, mescla e grava, por causa de duas abas) e nunca guarde nada derivado: pontos, máximo e estatísticas saem do `FinishedGame`. O andamento é a lista de eventos aceitos, não o `GameState`. Mudou o formato? Ajuste os guards de `save.ts` e, como desde o M10 o jogo está no ar (há saves de verdade), suba `SAVE_SCHEMA_VERSION` com a migração e um teste.
13. **"Hoje" é a data do jogo** (`gameDate`), não o relógio: estatísticas, sequência e contagem usam essa data.
14. **Teste de componente** (`src/ui/*.test.tsx`): `// @vitest-environment happy-dom` na 1ª linha e `afterEach(cleanup)` (sem globais, a Testing Library não limpa sozinha). Dados no próprio arquivo, **nunca** `test/*.ts` (importa `node:fs` e quebraria o `tsconfig.json` do app, que não tem tipos do Node). Atualização de estado fora de evento (timer) vai dentro de `act()`.
15. **Busca e IME:** a busca (`core/search.ts`) segue as chaves do catálogo; o `kana.ts` segue o romaji do catálogo (cutlet), não o Hepburn de livro (`を` = "wo"). Eventos de composição do IME por `addEventListener`: o `onCompositionEnd` do Preact não dispara no Chrome.
16. **Foco:** cada tela nova leva o foco ao seu elemento principal (o Player ao "Tocar", a revelação e o resumo ao título). Botão que some não pode deixar o foco no `body`.
17. **Abas e endereço** (M8): a aba é o fragmento (`#musica`, `#album`, `#treino`, em `core/routes.ts`); nenhum elemento pode ter `id` igual a uma rota (o navegador rolaria até ele). Trocar só o fragmento não recarrega a página: por isso o "Jogar o novo desafio" usa `todayHref` e recarrega quando o endereço não muda.
18. **Diário e Treino usam o mesmo `RoundView`:** mudança na rodada vale para os dois. O Treino não grava nada (P50), e a sua sessão fica no `App`. Todo componente com rodada chama `usePreload` (senão o cache de áudio cresce sem limite).
19. **Pré-visualização no navegador do Claude:** servidor `web` do `.claude/launch.json`. Para testar áudio, use **clique real** no botão (não `el.click()` por script, que não conta como gesto). Se as capturas de tela expirarem, a janela do Claude está atrás de outra: confira pelo texto da página ou pelo DOM. O save é gravado num `useEffect`, que roda depois da pintura: espere uns 300 ms antes de ler o `localStorage` após um clique. Para testar o compartilhar, troque `navigator.clipboard` por um objeto que guarde o texto. Para digitar no campo por script, mude `value` e despache `input`; o IME se simula com `CompositionEvent` (`compositionstart`/`compositionend`). Use uma aba só sua (`tabs_create`): outra frente pode estar usando a aba padrão. Depois de muitas edições (ou de um merge com conflito), abra uma aba nova antes de concluir algo: a aba antiga pode estar com módulos meio atualizados pelo HMR e mostrar erros que não estão no código. Limpe o `localStorage` ao terminar.
20. **Base do site** (M10): o GitHub Pages publica em `/musicle-jp/`. O Vite usa essa base só no build e no preview (`vite.config.ts`); o desenvolvimento, o e2e e o Vitest ficam na raiz. Toda URL é relativa e resolvida contra o `BASE_URL` (os JSON em `loadGameData`, áudio e capas por `assetUrl` e `resolveUrl`, o compartilhar por `shareUrl`): nada de caminho absoluto começando com `/`. A CI confere a base no `dist/index.html`, mas não pega um `fetch("/...")` no código (ME15).
