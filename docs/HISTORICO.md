# Histórico do musicle-jp

> **Nota de validação:** documento gerado por IA (Claude Code) com o que já foi conferido, tirado do `docs/PLANO.md` no checkup de 11/10/2026, para o plano guardar só decisões, regras e o que está em aberto. As decisões e as regras continuam no PLANO.

## M9: critério de pronto (09/10/2026)

- PR #1 (o M9): `pipeline`, `web` e `e2e` verdes; enquanto rodavam, o PR ficou `BLOCKED`; merge commit pela proteção;
- PR #2 (demonstração, teste quebrado de propósito no `web`): `web` vermelha e PR `BLOCKED`. O `gh pr merge` foi recusado (`the base branch policy prohibits the merge`), e o `gh pr merge --admin` também (`Repository rule violations found: Required status check "web" is failing`). Fechado sem merge.

## M10: critério de pronto (10/10/2026)

- PR #4 (o M10): três checagens verdes, merge, e o deploy `pages-build` e `pages-deploy` verde;
- URL pública no navegador do Claude:
  - abre o "Diário Música · nº 3", a data certa;
  - página, JS, CSS, JSON, WAV e SVG respondem 200 sob `/musicle-jp/`, com `Cache-Control: max-age=600`;
  - clique real em "Tocar 1 s" baixa o WAV e toca sem "Áudio indisponível";
  - console sem erros;
  - o compartilhar termina na URL pública;
  - capas do Álbum, Treino e ✓ do diário terminado funcionam;
  - `__musicleAudioLog` indefinido (o código de DEV saiu do build);
- 1ª execução manual do `update-catalog`: as duas tarefas verdes, e o PR #5 aberto por `app/github-actions`, só com o `schedule.json` (30 e 31/10). A CI dele ficou `action_required` até "Approve workflows to run"; depois, as três checagens verdes contaram para o ruleset. O merge humano disparou o deploy, e a agenda publicada passou a ir até 31/10;
- 2ª execução no mesmo dia: "0 dia(s) novo(s); sem mudanças", e `catalog-pr` pulada, sem PR;
- no Windows, o Git Bash ignora `TZ=America/Sao_Paulo` (não tem o banco de fusos) e mostra UTC. A hora de Brasília local sai do PowerShell (`TimeZoneInfo`); o runner Ubuntu calcula certo.

## M11: critério de pronto (11/10/2026)

O critério era "Diário com previews reais; reserva de áudio testada".


- PR #7 (pipeline e 1ª parada real) e PR #8 (o site com a parada real): três checagens verdes e merge; os deploys, verdes;
- URL pública no navegador do Claude, depois do deploy do PR #8:
  - abre o "Diário Música · nº 2" (o 10/10 é buraco, P44);
  - `data/catalog.json` e `data/schedule.json` respondem 200, e sai uma consulta só ao lookup, com as 6 faixas do dia, antes da escolha do modo;
  - clique real em "Tocar 1 s": a prévia vem da Apple (cerca de 440 ms para baixar), sem "Áudio indisponível";
  - selo "Ouça no Apple Music" com link para a playlist e a frase "provided courtesy of iTunes";
  - nenhum WAV, o site inteiro com 384 KB, `__musicleAudioLog` indefinido, save em v2 e console limpo;
- a reserva com `<audio>` (`?htmlAudio=1`) e o `?failLookup=1`, medidos no desenvolvimento com a parada real (Apêndice E);
- PR #9 (o robô com a Apple): os testes do script da tarefa com token (`test_catalog_pr_script.py`) rodam na CI, com `jq`;
- **1º PR real do robô** (PR #10, disparo manual em 11/10/2026, 17:01 UTC): 4 arquivos (o snapshot `2026-10-11.json` novo, o `romaji.json` com 1 entrada, グッタイム, o catálogo real com 101 faixas e a agenda das fixtures). A agenda real não mudou, porque já ia até 01/11, hoje + 21. As checagens ficaram verdes depois do "Approve workflows to run"; merge e deploy verdes. O romaji listado no corpo foi corrigido no PR #11 (P87), o passo 2 da rotina do README;
- **falta conferir:** o som de ouvido em Chrome, Firefox, Android e iPhone (este com o silencioso, P75) e a 1ª execução pelo cron (segunda, 12/10/2026, 06:17 de Brasília).

## Checkup de 11/10/2026

Entre o M11 e o M12, seis subagentes em paralelo (só leitura) conferiram o projeto inteiro. Cada um leu a fundo a sua parte, e o resumo voltou para a sessão principal.

| Frente | Resultado |
|---|---|
| `/verificar` local | Tudo verde: 333 testes no pipeline, 496 no web, 8 no e2e, build OK |
| Site publicado | Os 8 fluxos passaram: os dois diários, retomada, ✓ das abas, Treino, `?htmlAudio=1`, `?failLookup=1`, celular e console limpo |
| Operação | Ruleset, Actions, Pages e permissões batem com o PLANO; todas as execuções verdes; o publicado é idêntico à `main`; nenhum segredo |
| Dados reais | Íntegros: o build refeito sai idêntico; a agenda não viola nenhuma regra em 132 rodadas; 101 de 101 faixas com prévia, capa e loja |
| Pipeline | Determinístico (Windows e Linux iguais), sem afrouxamento em 104 semanas simuladas |
| Documentação | 32 pontos desatualizados ou repetidos (ME35) |

**Correções** (P90), em três PRs, cada um com `/verificar`, o subagente revisor e o `/code-review` (e o `/security-review` no do robô):

- **PR #12, pipeline e robô:** ME22, ME24 a ME28. Depois do merge, um disparo manual do robô terminou com `catalog-generate` e `catalog-runway` verdes e sem PR, porque o snapshot do dia já existia.
- **PR #13, jogo:** ME19 a ME21, ME23, ME31, ME32, o texto do dia sem desafio, a prévia inteira com Parar e o lote de prévias só dos diários pendentes. No navegador, com o Web Audio de verdade, o trecho do "Ouvir mais" tocou inteiro com o botão em "Parar".
- **PR #14, documentação:** ME35.

**Escala**, sem pressa: a agenda passa de 200 KB (ME3) por volta de 01/02/2027; o catálogo chega a 1 MB (ME17) com cerca de 420 faixas; o `build` cresce mais rápido que o número de faixas (cerca de 10 s com 1.000); a dificuldade sobe sozinha com o catálogo, porque a popularidade é acumulada.

## Origem

- Os critérios de pronto: as seções do `docs/PLANO.md` (Apêndice I) até 11/10/2026, conferidas nas sessões de cada marco.
- O checkup: os relatórios dos subagentes da sessão de 11/10/2026 e o `gh` (PRs #10 a #14, execuções do `update-catalog.yml`).
