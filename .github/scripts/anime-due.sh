#!/usr/bin/env bash
# Tarefas anime-mal e anime-generate do update-catalog.yml: o Anime precisa de dias novos? Só
# quando a agenda do Anime da main existe e tem menos de 21 dias depois de hoje (P237). Com a
# geração de 28 dias, isso dá uma semana sim, outra não, e o MAL só é chamado nessas (P256). A
# mesma regra é conferida de novo na tarefa com token (check-anime-pr.sh, SKIP_AHEAD). Sem token.
# As Misturadas (M17) crescem junto: a agenda delas para no último dia da do Anime (P332), então
# a geração também roda quando a das Misturadas da main tem menos de 21 dias à frente (a do
# Anime pode estar longe, como na estreia delas). Testado em
# pipeline/tests/test_catalog_generate_scripts.py (precisa de jq).
#
# Entrada (ambiente): TODAY (hoje em Brasília), ANIME_SCHEDULE e ANIME_MIXED (relativos à raiz, que
# é a pasta atual; sem a das Misturadas na main, só a do Anime conta), GITHUB_OUTPUT e
# GITHUB_STEP_SUMMARY.
# Saída: due=true|false, ahead=<dias> (os do Anime) e, com a agenda das Misturadas, mixed=<dias>
# no GITHUB_OUTPUT.
set -euo pipefail

SKIP_AHEAD=21

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "::error::data inválida: $TODAY"; exit 1; }
if [ ! -f "$ANIME_SCHEDULE" ]; then
  echo "due=false" >> "$GITHUB_OUTPUT"
  echo "Anime: a main ainda não tem a agenda do Anime; nada a gerar." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
ahead_of() { jq --arg d "$TODAY" '[.days | keys[] | select(. > $d)] | length' "$1"; }
ahead="$(ahead_of "$ANIME_SCHEDULE")"
[[ "$ahead" =~ ^[0-9]+$ ]] || { echo "::error::a agenda do Anime da main não deu para medir"; exit 1; }
echo "ahead=$ahead" >> "$GITHUB_OUTPUT"
short=false
[ "$ahead" -ge "$SKIP_AHEAD" ] || short=true
mixed_line=""
if [ -n "${ANIME_MIXED:-}" ] && [ -f "$ANIME_MIXED" ]; then
  mixed="$(ahead_of "$ANIME_MIXED")"
  [[ "$mixed" =~ ^[0-9]+$ ]] || { echo "::error::a agenda das Misturadas da main não deu para medir"; exit 1; }
  echo "mixed=$mixed" >> "$GITHUB_OUTPUT"
  [ "$mixed" -ge "$SKIP_AHEAD" ] || short=true
  mixed_line=", e a das Misturadas, $mixed"
fi
if [ "$short" = true ]; then
  echo "due=true" >> "$GITHUB_OUTPUT"
  echo "Anime: a agenda da main tem $ahead dia(s) depois de hoje ($TODAY)$mixed_line; gera os dias novos." >> "$GITHUB_STEP_SUMMARY"
else
  echo "due=false" >> "$GITHUB_OUTPUT"
  echo "Anime: a agenda da main tem $ahead dia(s) depois de hoje ($TODAY)$mixed_line; só gera com menos de $SKIP_AHEAD." >> "$GITHUB_STEP_SUMMARY"
fi
