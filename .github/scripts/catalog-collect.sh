#!/usr/bin/env bash
# Tarefa catalog-generate do update-catalog.yml, depois do pipeline: só a lista fechada pode ter
# mudado (o snapshot de hoje, novo; o romaji da Apple, o catálogo real e as duas agendas). Copia o
# que mudou para o artefato, com a lista declarada e os avisos do pipeline, que a tarefa com
# token (check-catalog-pr.sh) confere de novo. Sem token. Testado em
# pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): TODAY, SNAPSHOTS, ROMAJI, CATALOG, SCHEDULE, FIXTURE_SCHEDULE (relativos à
# raiz, que é a pasta atual), RUNNER_TEMP (com o pipeline.log), GITHUB_OUTPUT e
# GITHUB_STEP_SUMMARY.
# Saída: changed=true|false no GITHUB_OUTPUT e, com mudança, $RUNNER_TEMP/out com files/,
# changed.txt e avisos.txt.
set -euo pipefail

status="$(git status --porcelain --untracked-files=all)"
if [ -z "$status" ]; then
  echo "changed=false" >> "$GITHUB_OUTPUT"
  echo "Nada novo: a parada é a mesma e a agenda já cobre o horizonte a partir de hoje." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
allowed=(
  "?? $SNAPSHOTS/$TODAY.json"
  " M $ROMAJI"
  " M $CATALOG"
  " M $SCHEDULE"
  " M $FIXTURE_SCHEDULE"
)
out="$RUNNER_TEMP/out"
mkdir -p "$out/files"
: > "$out/changed.txt"
while IFS= read -r line; do
  ok=false
  for a in "${allowed[@]}"; do
    if [ "$line" = "$a" ]; then ok=true; fi
  done
  if [ "$ok" != true ]; then
    echo "::error::mudança fora da lista fechada: $line"
    exit 1
  fi
  path="${line:3}"
  mkdir -p "$out/files/$(dirname "$path")"
  cp "$path" "$out/files/$path"
  echo "$path" >> "$out/changed.txt"
done <<< "$status"
grep '^aviso: ' "$RUNNER_TEMP/pipeline.log" > "$out/avisos.txt" || true
echo "changed=true" >> "$GITHUB_OUTPUT"
