#!/usr/bin/env bash
# Tarefas anime-mal e anime-generate do update-catalog.yml: o Anime precisa de dias novos? Só
# quando a agenda do Anime da main existe e tem menos de 21 dias depois de hoje (P237). Com a
# geração de 28 dias, isso dá uma semana sim, outra não, e o MAL só é chamado nessas (P256). A
# mesma regra é conferida de novo na tarefa com token (check-anime-pr.sh, SKIP_AHEAD). Sem token.
# Testado em pipeline/tests/test_catalog_generate_scripts.py (precisa de jq).
#
# Entrada (ambiente): TODAY (hoje em Brasília), ANIME_SCHEDULE (relativo à raiz, que é a pasta
# atual), GITHUB_OUTPUT e GITHUB_STEP_SUMMARY.
# Saída: due=true|false e ahead=<dias> no GITHUB_OUTPUT.
set -euo pipefail

SKIP_AHEAD=21

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "::error::data inválida: $TODAY"; exit 1; }
if [ ! -f "$ANIME_SCHEDULE" ]; then
  echo "due=false" >> "$GITHUB_OUTPUT"
  echo "Anime: a main ainda não tem a agenda do Anime; nada a gerar." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
ahead="$(jq --arg d "$TODAY" '[.days | keys[] | select(. > $d)] | length' "$ANIME_SCHEDULE")"
[[ "$ahead" =~ ^[0-9]+$ ]] || { echo "::error::a agenda do Anime da main não deu para medir"; exit 1; }
echo "ahead=$ahead" >> "$GITHUB_OUTPUT"
if [ "$ahead" -ge "$SKIP_AHEAD" ]; then
  echo "due=false" >> "$GITHUB_OUTPUT"
  echo "Anime: a agenda da main tem $ahead dia(s) depois de hoje ($TODAY); só gera com menos de $SKIP_AHEAD." >> "$GITHUB_STEP_SUMMARY"
else
  echo "due=true" >> "$GITHUB_OUTPUT"
  echo "Anime: a agenda da main tem $ahead dia(s) depois de hoje ($TODAY); gera os dias novos." >> "$GITHUB_STEP_SUMMARY"
fi
