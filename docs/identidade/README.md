# Identidade visual

O style guide do AteMusic, feito por um designer conhecido do usuário e entregue em 12/10/2026 (M12, Apêndice L do `docs/PLANO.md`).

| Arquivo | O que é |
|---|---|
| `style-guide.svg` | O arquivo do designer, sem alteração: a paleta, os 8 logos, os 4 selos, os ícones e o botão. Os textos estão em contorno |
| `extrair-pecas.cjs` | O script que tira do guia as peças do site e o logo sem espaço (abaixo) |
| `logo-empilhado-atemusic.svg` | O logo empilhado vermelho com o nome sem espaço (P179), para o designer conferir. Ainda não está no site |

## As peças e de onde saem

Os índices são os do `document.querySelectorAll("path")` no `style-guide.svg`. As caixas foram medidas com o `getBBox` do Chromium, em unidades do SVG (o arquivo tem 9096 × 16963), e arredondadas para fora: o `getBBox` do selo dá 1032,16 × 1024,7, e o `viewBox` vira 1033 × 1025, para nunca cortar o desenho.

| Peça | Índice | Caixa (x, y, largura × altura) | Usada em |
|---|---|---|---|
| Logo empilhado vermelho: o nome "ate music" (10 formas) | 0 | 2848, 5221, 597 × 88 | `logo-empilhado-atemusic.svg` |
| O 当 desse logo (as três partes juntas) | 1 a 3 | 2822, 4390, 650 × 773 | `logo-empilhado-atemusic.svg` |
| Selo quadrado vermelho, vazado | 37 | 4231, 11282, 1033 × 1025 | `web/public/favicon.svg` e `web/public/apple-touch-icon.png` |
| Selo redondo vermelho, vazado | 38 | 5880, 9786, 1033 × 1025 | `web/src/ui/assets/logo-selo.svg` (o topo da Início) |
| X do erro, ✓ do acerto e chevron do "próximo" | 33, 35 e 42 | 1865, 9881, 787 × 794; 1864, 11588, 975 × 719; 6099, 13241, 626 × 739 | `web/src/ui/assets/icons.ts` (as tentativas do Desafio) |

**Como extrair:** da raiz do repositório, com o `web/node_modules` instalado, `node docs/identidade/extrair-pecas.cjs`. Com uma pasta no fim, ele grava também uma captura de conferência, `pecas.png`.
- O caminho fica igual ao do guia, e só o `viewBox` muda, para a caixa da peça (no ✓, também o espelho, abaixo).
- O `web/scripts/identity.test.ts` confere depois que as peças do site são as do guia.
- O script não roda na CI: rode à mão quando o guia mudar.

**As regras das peças:**
- **O selo é vazado:** um caminho só, com os furos do 当. O círculo é vermelho nos dois temas (P177). O furo mostra o fundo da página (branco no claro, preto no escuro), sem regra nenhuma no CSS.
- **O favicon é opaco:** um retângulo branco por baixo dos furos, recuado 15% (155 unidades) para ficar dentro dos cantos arredondados. Assim, a aba clara ou escura do navegador não muda o desenho.
- **O ícone de app é opaco e sem cantos:** o iOS pinta de preto o que é transparente e arredonda os cantos sozinho.
  - Por isso, um quadrado vermelho de ponta a ponta, o branco e o selo por cima, em 180 × 180.
  - O desenho sai do Chromium do Playwright.
  - O PNG é RGB, sem canal de transparência.
- **O logo sem espaço é a exceção ao "só o `viewBox`":** o `path[0]` (o nome) vira dois caminhos, "ate" e "music", com as mesmas formas do guia.
  - As de "music" andam 33,9 unidades para a esquerda: o espaço era 43,2, e a distância média entre as letras é 9,3.
  - Depois, o nome é centralizado de novo sob o 当, com 20 unidades de margem.
- **Os ícones são a outra exceção ao arquivo SVG:** o script grava o `viewBox` e o `d` num módulo TS (`icons.ts`), e a cor sai do CSS (`currentColor`), e não do `fill` do guia, para o tema escolher.
- **O ✓ se desenha espelhado** (P386, 27/10/2026): no desenho do guia, ele aparecia invertido no site. O script grava também um `transform` (`matrix(-1 0 0 1 4703 0)`, o espelho em volta do meio do `viewBox`), e o `Icon` o aplica no caminho, que continua o do guia. O X e o chevron não mudam.

Quando o designer mandar a versão opaca oficial do selo (PD12), ela troca o favicon e o ícone de app.

**Os ícones provisórios (P218):** o sol, a lua, o alto-falante e o alto-falante mudo ainda não estão no guia (PD6). Até o designer mandar os dele, valem os desenhos do Claude, aprovados pelo usuário, em `web/src/ui/assets/provisional-icons.ts`, fora do `icons.ts` gerado. Eles saem do `provisional-icons.mjs`, nesta pasta (`node docs/identidade/provisional-icons.mjs saida.json`, da raiz), e os caminhos vão à mão para o `.ts`. Quando a peça chegar: ela entra no guia, o `extrair-pecas.cjs` a leva ao `icons.ts` (com o mesmo nome, `sun`, `moon`, `speaker` ou `speakerMuted`), e o nome sai do arquivo dos provisórios. O `identity.test.ts` confere que um nome nunca está nos dois.
