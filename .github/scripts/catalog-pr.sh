#!/usr/bin/env bash
# Tarefa catalog-pr do update-catalog.yml, o passo que confere e monta o PR (sem token): roda a
# conferência dos Hits (check-catalog-pr.sh) se o artefato deles veio, e a do Anime
# (check-anime-pr.sh) se o dele veio, e junta os dois no mesmo PR (P237). Só jq e coreutils, como
# os dois, e vem da main. Testado em pipeline/tests/test_anime_pr_script.py (precisa de jq).
#
# A falha de um lado não derruba o outro (P237), com uma diferença de propósito: a conferência dos
# Hits recusar o artefato deles para tudo, como sempre; a do Anime recusar o dele deixa o Anime de
# fora, com o aviso no corpo, e o PR sai com os Hits (anime_rejected=true: a tarefa fica vermelha
# depois de abrir o PR). O mesmo quando o artefato do Anime era esperado e não chegou (o download
# tem continue-on-error: uma falha passageira do serviço de artefatos não trava os Hits). Nada do
# Anime entra na árvore antes de a conferência dele passar: a cópia é daqui, depois.
#
# Entrada (ambiente): TODAY, HITS_RESULT e ANIME_RESULT (os resultados da catalog-generate e da
# anime-generate), ANIME_EXPECTED (true quando a anime-generate deu certo e mudou algo) e o que os
# dois scripts pedem; RUNNER_TEMP (com artifact/ e anime-artifact/, cada um só quando a tarefa
# dele mudou algo e o download deu certo) e GITHUB_OUTPUT.
# Saída: os arquivos na árvore, $RUNNER_TEMP/changed.txt (a lista dos dois, para o commit),
# $RUNNER_TEMP/pr-body.md e branch, title e anime_rejected no GITHUB_OUTPUT.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data inválida: $TODAY"
body="$RUNNER_TEMP/pr-body.md"
section="$RUNNER_TEMP/anime-section.md"
hits=false
anime=false
rejected=false
: > "$RUNNER_TEMP/changed.txt"

# O valor de uma chave no arquivo de saída de um dos scripts (cada linha é chave=valor).
output_of() {
  local key value
  while IFS='=' read -r key value; do
    if [ "$key" = "$2" ]; then printf '%s' "$value"; fi
  done < "$1"
}

# Os Hits: a recusa deles para o passo (set -e), como antes do Anime.
if [ -d "$RUNNER_TEMP/artifact" ]; then
  : > "$RUNNER_TEMP/hits-output"
  GITHUB_OUTPUT="$RUNNER_TEMP/hits-output" bash "$here/check-catalog-pr.sh"
  mapfile -t hits_files < "$RUNNER_TEMP/artifact/changed.txt"
  printf '%s\n' "${hits_files[@]}" >> "$RUNNER_TEMP/changed.txt"
  hits=true
fi

# O Anime: a recusa deixa o Anime de fora, e o PR segue com os Hits. Um artefato pela metade cai
# na conferência; um que não chegou, aqui.
rejected_why=""
if [ -d "$RUNNER_TEMP/anime-artifact" ]; then
  : > "$RUNNER_TEMP/anime-output"
  if GITHUB_OUTPUT="$RUNNER_TEMP/anime-output" bash "$here/check-anime-pr.sh"; then
    mapfile -t anime_files < "$RUNNER_TEMP/anime-artifact/changed.txt"
    for path in "${anime_files[@]}"; do
      mkdir -p "$(dirname "$path")"
      cp "$RUNNER_TEMP/anime-artifact/files/$path" "$path"
    done
    printf '%s\n' "${anime_files[@]}" >> "$RUNNER_TEMP/changed.txt"
    anime=true
  else
    rejected=true
    rejected_why="a conferência recusou o artefato do Anime"
    echo "::warning::a conferência recusou o artefato do Anime (veja o erro acima); ele fica de fora do PR"
  fi
elif [ "${ANIME_EXPECTED:-false}" = "true" ]; then
  rejected=true
  rejected_why="o artefato do Anime não chegou (o download falhou)"
  echo "::warning::o artefato do Anime era esperado e não chegou; ele fica de fora do PR"
fi

[ "$hits" = true ] || [ "$anime" = true ] \
  || fail "nada a pôr no PR: os Hits não vieram e o Anime ficou de fora ou não mudou"

footer() {
  echo "- Mudou só o que a lista fechada permite, conferido aqui com \`jq\` e de novo pela CI (\`validate\`, \`validate-anime\`, \`schedule-check\` e os testes)."
  echo
  echo "**Para publicar:** aprove as checagens em \"Approve workflows to run\"; com \`pipeline\`, \`web\` e \`e2e\` verdes, faça o merge (merge commit). O merge dispara o deploy."
  echo
  echo "Execução que gerou este PR: $RUN_URL"
}

# Um texto antes do "**Para publicar:**" do corpo dos Hits (ou no fim, se ele não estiver lá).
insert_before_publish() {
  local line done=false
  {
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$done" = false ] && [[ "$line" == '**Para publicar:**'* ]]; then
        cat "$1"
        echo
        done=true
      fi
      printf '%s\n' "$line"
    done < "$body"
    if [ "$done" = false ]; then
      echo
      cat "$1"
    fi
  } > "$body.new"
  mv "$body.new" "$body"
}

# O Anime fora do PR dos Hits: recusado, sem artefato, ou com a tarefa dele mal terminada (uma
# falha ou o timeout de 20 min; "skipped" e "success" sem mudança não dizem nada).
note="$RUNNER_TEMP/anime-note.md"
: > "$note"
if [ "$rejected" = true ]; then
  echo "> **Anime:** $rejected_why (veja o passo \"Conferir cada arquivo novo e montar o PR\" da execução); ele ficou de fora deste PR, e a tarefa \`catalog-pr\` fica vermelha para avisar." > "$note"
else
  case "${ANIME_RESULT:-}" in
    failure | cancelled)
      echo "> **Anime:** a tarefa \`anime-generate\` não terminou bem nesta semana (veja a execução); este PR traz só os Hits, e o Anime tenta de novo na segunda que vem." > "$note"
      ;;
  esac
fi

if [ "$hits" = true ]; then
  title="$(output_of "$RUNNER_TEMP/hits-output" title)"
  if [ "$anime" = true ]; then
    title="$title $(output_of "$RUNNER_TEMP/anime-output" suffix)"
    insert_before_publish "$section"
  elif [ -s "$note" ]; then
    insert_before_publish "$note"
  fi
else
  title="$(output_of "$RUNNER_TEMP/anime-output" title)"
  if [ "${HITS_RESULT:-success}" = "success" ]; then
    hits_line="- **Hits:** nada novo nesta execução (a parada e as agendas dos Hits já estavam em dia)."
  else
    hits_line="- **Hits:** a tarefa \`catalog-generate\` não terminou bem (veja a execução); este PR traz só o Anime."
  fi
  {
    echo "Anime de $TODAY (gerado pela Action \`update-catalog.yml\`)."
    echo
    echo "$hits_line"
    echo
    cat "$section"
    echo
    footer
  } > "$body"
fi
{
  echo "branch=catalogo/$TODAY"
  echo "title=$title"
  echo "anime_rejected=$rejected"
} >> "$GITHUB_OUTPUT"
