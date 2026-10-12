#!/usr/bin/env bash
# Tarefa catalog-generate do update-catalog.yml, quando a parada nova quebrou o pipeline (romaji,
# catálogo ou agenda): o robô não pode travar a agenda toda semana enquanto a faixa estiver na
# parada. Volta o romaji, o catálogo e a agenda ao da main, tira o snapshot novo (só ele: um que
# já está na main fica) e gera só os dias novos da agenda, com o catálogo de antes. Sem token.
# Testado em pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): TODAY, SNAPSHOTS, ROMAJI, CATALOG, SCHEDULE (relativos à raiz, que é a
# pasta atual), RUNNER_TEMP e GITHUB_OUTPUT; PYTHON (opcional, padrão python: os testes trocam).
# Saída: dropped=true no GITHUB_OUTPUT quando o snapshot de hoje saiu, e o log da agenda nova em
# $RUNNER_TEMP/pipeline.log (os avisos da tentativa que quebrou não valem mais).
set -euo pipefail

python="${PYTHON:-python}"
git checkout -- "$ROMAJI" "$CATALOG" "$SCHEDULE"
snapshot="$SNAPSHOTS/$TODAY.json"
if [ -f "$snapshot" ] && ! git ls-files --error-unmatch -- "$snapshot" > /dev/null 2>&1; then
  rm -- "$snapshot"
  echo "dropped=true" >> "$GITHUB_OUTPUT"
  echo "::warning::a parada de hoje quebrou o pipeline (veja o passo anterior); o PR traz só a agenda"
else
  echo "::warning::o pipeline quebrou sem parada nova (veja o passo anterior; erro no código?); o PR traz só a agenda"
fi
: > "$RUNNER_TEMP/pipeline.log"
"$python" -m musicle_pipeline schedule --catalog "$CATALOG" --out "$SCHEDULE" --today "$TODAY" 2>&1 \
  | tee -a "$RUNNER_TEMP/pipeline.log"
