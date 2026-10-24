#!/usr/bin/env bash
# Tarefa anime-generate do update-catalog.yml, quando a busca nova do Anime quebrou o acervo ou a
# agenda (build-anime, schedule-anime ou validate-anime): o robô não pode travar a agenda do Anime.
# Volta o catálogo e as agendas reais do Anime e das Misturadas ao da main, tira o snapshot da
# busca de agora (só ele, e só se não estiver na main) e gera só os dias novos das duas agendas,
# com o acervo de antes (a das Misturadas depois da do Anime: cada dia lê o do Anime, P25). O
# molde do catalog-reserve.sh. Sem token. Testado em pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): TODAY, NOW (o nome do snapshot), ANIME_DAYS, ANIME_SNAPSHOTS, ANIME_CATALOG,
# ANIME_SCHEDULE, ANIME_MIXED (relativos à raiz, que é a pasta atual), RUNNER_TEMP e
# GITHUB_OUTPUT; PYTHON (opcional, padrão python: os testes trocam).
# Saída: dropped=true no GITHUB_OUTPUT quando o snapshot de agora saiu, e o log da agenda nova em
# $RUNNER_TEMP/anime.log (os avisos da tentativa que quebrou não valem mais).
set -euo pipefail

[[ "$NOW" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || { echo "::error::hora inválida: $NOW"; exit 1; }
[[ "$ANIME_DAYS" =~ ^[0-9]+$ ]] || { echo "::error::ANIME_DAYS inválido: $ANIME_DAYS"; exit 1; }
python="${PYTHON:-python}"
git checkout -- "$ANIME_CATALOG" "$ANIME_SCHEDULE" "$ANIME_MIXED"
snapshot="$ANIME_SNAPSHOTS/${NOW//:/}.json"
if [ -f "$snapshot" ] && ! git ls-files --error-unmatch -- "$snapshot" > /dev/null 2>&1; then
  rm -- "$snapshot"
  echo "dropped=true" >> "$GITHUB_OUTPUT"
  echo "::warning::a busca do Anime de hoje quebrou o acervo ou a agenda (veja o passo anterior); o PR traz só a agenda do Anime"
else
  echo "::warning::o Anime quebrou sem busca nova (veja o passo anterior; erro no código?); o PR traz só a agenda do Anime"
fi
: > "$RUNNER_TEMP/anime.log"
"$python" -m musicle_pipeline schedule-anime --provider apple --today "$TODAY" --days "$ANIME_DAYS" 2>&1 \
  | tee -a "$RUNNER_TEMP/anime.log"
"$python" -m musicle_pipeline schedule-mixed --provider apple --today "$TODAY" --days "$ANIME_DAYS" 2>&1 \
  | tee -a "$RUNNER_TEMP/anime.log"
