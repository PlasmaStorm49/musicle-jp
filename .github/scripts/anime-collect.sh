#!/usr/bin/env bash
# Tarefa anime-generate do update-catalog.yml, depois do pipeline do Anime: só a lista fechada
# do Anime pode ter mudado (o snapshot da busca de agora, novo; o catálogo e a agenda reais do
# Anime; a agenda fictícia do Anime, ME109). Copia o que mudou para o artefato, com a lista
# declarada e os avisos e afrouxamentos da agenda real, que a tarefa com token (check-anime-pr.sh)
# confere de novo. É o molde do catalog-collect.sh, num artefato à parte (anime-out/). Sem token.
# Testado em pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): NOW (a hora da busca em UTC, AAAA-MM-DDTHH:MM:SSZ: o nome do snapshot),
# ANIME_SNAPSHOTS, ANIME_CATALOG, ANIME_SCHEDULE, ANIME_FIXTURE_SCHEDULE (relativos à raiz, que é a
# pasta atual), RUNNER_TEMP (com o anime.log), GITHUB_OUTPUT e GITHUB_STEP_SUMMARY.
# Saída: changed=true|false no GITHUB_OUTPUT e, com mudança, $RUNNER_TEMP/anime-out com files/,
# changed.txt e avisos.txt.
set -euo pipefail

[[ "$NOW" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || { echo "::error::hora inválida: $NOW"; exit 1; }
status="$(git status --porcelain --untracked-files=all)"
if [ -z "$status" ]; then
  echo "changed=false" >> "$GITHUB_OUTPUT"
  echo "Anime: nada novo." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
allowed=(
  "?? $ANIME_SNAPSHOTS/${NOW//:/}.json"
  " M $ANIME_CATALOG"
  " M $ANIME_SCHEDULE"
  " M $ANIME_FIXTURE_SCHEDULE"
)
out="$RUNNER_TEMP/anime-out"
mkdir -p "$out/files"
: > "$out/changed.txt"
while IFS= read -r line; do
  ok=false
  for a in "${allowed[@]}"; do
    if [ "$line" = "$a" ]; then ok=true; fi
  done
  if [ "$ok" != true ]; then
    echo "::error::mudança fora da lista fechada do Anime: $line"
    exit 1
  fi
  path="${line:3}"
  mkdir -p "$out/files/$(dirname "$path")"
  cp "$path" "$out/files/$path"
  echo "$path" >> "$out/changed.txt"
done <<< "$status"
# Os avisos antes dos afrouxamentos, sem repetir (o schedule-anime e o validate-anime repetem o
# do acervo curto).
{
  grep '^aviso: ' "$RUNNER_TEMP/anime.log" | awk '!seen[$0]++' || true
  grep '^afrouxamento: ' "$RUNNER_TEMP/anime.log" | awk '!seen[$0]++' || true
} > "$out/avisos.txt"
echo "changed=true" >> "$GITHUB_OUTPUT"
