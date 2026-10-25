#!/usr/bin/env bash
# Tarefa anime-generate do update-catalog.yml, depois do Anime e das Misturadas (cada dia do quiz lê
# as respostas das duas, P378): os dias novos do quiz do dia (M18). Só quando a pasta real já existe
# na main: a agenda real nasce com a tela (PR B do M18), e o robô só a cresce. Com os dados do MAL
# do artefato da anime-mal (o quiz.json, que nunca entra no repositório, P380), as perguntas do MAL
# entram nos dias novos; se o gerador parar com eles (dados incompletos), roda de novo sem eles e
# avisa no PR. Se nem assim der, a pasta volta à da main e o passo falha sem derrubar o Anime: o
# quiz tenta de novo na próxima geração. Sem token. Testado em
# pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): TODAY, ANIME_DAYS, ANIME_QUIZ (relativo à raiz, que é a pasta atual),
# RUNNER_TEMP (com o anime.log e, se veio da anime-mal, mal/quiz.json); PYTHON (opcional, padrão
# python: os testes trocam).
# Saída: os meses novos ou crescidos na pasta, e as linhas do schedule-quiz da tentativa que valeu
# no $RUNNER_TEMP/anime.log, com a marca "quiz do dia: " (os avisos vão ao corpo do PR, depois dos
# do Anime; os de uma tentativa que quebrou, não).
set -euo pipefail

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "::error::data inválida: $TODAY"; exit 1; }
[[ "$ANIME_DAYS" =~ ^[0-9]+$ ]] || { echo "::error::ANIME_DAYS inválido: $ANIME_DAYS"; exit 1; }
python="${PYTHON:-python}"
log="$RUNNER_TEMP/anime.log"
attempt="$RUNNER_TEMP/anime-quiz.log"
if [ ! -d "$ANIME_QUIZ" ]; then
  echo "Quiz do dia: a main ainda não tem a agenda dele; nada a crescer."
  exit 0
fi

# A geração e a conferência da pasta inteira (o validate-anime confere o quiz ao lado do Anime).
# Só as linhas do schedule-quiz vão ao log da tentativa: as do validate-anime repetem as do Anime.
grow() {
  : > "$attempt"
  "$python" -m musicle_pipeline schedule-quiz --provider apple --today "$TODAY" --days "$ANIME_DAYS" "$@" 2>&1 \
    | tee -a "$attempt" \
    && "$python" -m musicle_pipeline validate-anime --provider apple 2>&1
}
# Os meses da main de volta e os novos fora (o schedule-quiz grava só no fim, mas o validate-anime
# pode recusar o que ele gravou).
restore() {
  git checkout -- "$ANIME_QUIZ"
  git clean -fq -- "$ANIME_QUIZ"
}
# As linhas da tentativa que valeu, com a marca do quiz: no corpo do PR, elas vêm depois das do
# Anime e das Misturadas (anime-collect.sh), e o teto de linhas nunca corta as deles.
keep() { sed -E 's/^(aviso|afrouxamento): /\1: quiz do dia: /' "$attempt" >> "$log"; }
note() { echo "aviso: quiz do dia: $1" >> "$log"; }

mal="$RUNNER_TEMP/mal/quiz.json"
if [ -f "$mal" ]; then
  if grow --mal-file "$mal"; then
    keep
    exit 0
  fi
  restore
  # O aviso só depois de a 2ª tentativa dar certo: com as duas quebradas, ele desmentiria o outro.
  if grow; then
    keep
    note "o gerador parou com os dados do MAL (vieram incompletos?): os dias novos saíram sem as perguntas do MAL"
    echo "::warning::o quiz do dia parou com os dados do MAL e cresceu sem eles (veja acima)"
    exit 0
  fi
elif grow; then
  keep
  exit 0
fi
restore
note "não cresceu nesta semana (a geração ou a conferência quebrou; veja a execução)"
echo "::warning::o quiz do dia não cresceu (veja acima); a pasta dele ficou como a da main, e o Anime segue"
exit 1
