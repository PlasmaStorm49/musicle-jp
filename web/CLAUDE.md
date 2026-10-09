# web (TypeScript + Vite + Preact)

Complementa o `CLAUDE.md` da raiz. Os comandos estão lá e rodam da raiz com `--prefix web`.

## Mapa

| Caminho | Papel |
|---|---|
| `src/core/` | Lógica pura do jogo: tipos, catálogo, normalização, PRNG, datas, regras, reducer |
| `src/core/generated/` | Tipos gerados de `shared/schema` por `npm run types`. **Nunca à mão** (negado no `settings.json`) |
| `src/data/` | Carrega catálogo e agenda e escolhe o dia. Sem DOM e sem `import.meta.env`: recebe `fetch` e a URL base |
| `src/audio/` | Contrato `AudioEngine` e o motor Web Audio |
| `src/i18n/` | Todos os textos de tela (`pt-BR.ts`) e `t()` tipado por chave |
| `src/ui/` | Componentes Preact: `App` (carga), `Game` (reducer), `Player`, `Options`, `Reveal`, `Summary` |
| `scripts/` | `gen-types.ts` e `dump-normalize.ts` (ponte do teste cruzado com o Python) |
| `test/` | Ajudantes de teste que usam o Node (`fs`): vetores e fixtures |

## Regras

1. **`src/core` é puro:** sem DOM, sem Preact, sem `node:*`. Três travas garantem isso: o `tsconfig.node.json` (sem DOM), o `tsconfig.json` (sem tipos do Node) e o Biome (`noRestrictedImports` para `preact*`).
2. **Imports com extensão `.ts`** e só sintaxe "apagável" (`erasableSyntaxOnly`): nada de `enum`, `namespace` nem parameter properties. É o que permite ao Node 24 rodar o núcleo direto, no teste cruzado.
3. **Normalização e PRNG mudam junto com o Python** (`pipeline/src/musicle_pipeline/normalize.py` e `prng.py`) e com os vetores de `shared/vectors/`. O teste cruzado compara todo o plano básico do Unicode.
4. **Schema mudou?** Rode `npm run types --prefix web`. O teste `scripts/gen-types.test.ts` falha até isso.
5. **Reducer:** evento inválido devolve **o mesmo objeto**. Modo novo entra em `MODE_RULES` (`rules.ts`), não como `if` no reducer.
6. **Testes rodam com `TZ=Asia/Tokyo`** de propósito: código que use a hora local por engano falha aqui.
7. **Dependências:** versão exata, com 14 dias ou mais de publicada (`.npmrc`, também nas indiretas). Exceção só para patch de segurança com aviso publicado, registrada em `docs/PLANO.md` (P28, P29).
8. **Textos de tela só via `t()`** (regra inviolável 2).
9. **Áudio:** `engine.unlock()` (ou `play()`, que o chama) só **dentro de um clique**, antes de qualquer `await`. Contexto criado antes de interação nasce suspenso e suja o console. Falha de áudio despacha `VOID { round: atual }`; falha no pré-carregamento é silenciosa.
10. **Só em desenvolvimento** (`npm run dev`): `?date=AAAA-MM-DD` troca o dia; `?failAudio=<id da faixa>` simula falha de áudio; `window.__musicleAudioLog` registra pedido × tocado de cada reprodução.
11. **Pré-visualização no navegador do Claude:** servidor `web` do `.claude/launch.json`. Para testar áudio, use **clique real** no botão (não `el.click()` por script, que não conta como gesto). Se as capturas de tela expirarem, a janela do Claude está atrás de outra: confira pelo texto da página ou pelo DOM.
