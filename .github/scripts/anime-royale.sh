#!/usr/bin/env bash
# Tarefa anime-generate do update-catalog.yml, depois do quiz do dia (cada dia do Anime Royale evita
# as respostas do Anime, das Misturadas e do quiz do dia e não passa do último dia deles): os dias
# novos do Anime Royale (o usuário, 01/11/2026). Só quando a agenda real já existe na main: ela
# nasce com a tela, num PR humano, e o robô só a cresce. Se a geração ou a conferência quebrar, a
# agenda volta à da main e o passo falha sem derrubar o Anime: o Royale tenta de novo na próxima
# geração. Sem token. Testado em pipeline/tests/test_catalog_generate_scripts.py.
#
# Entrada (ambiente): TODAY, ANIME_DAYS, ANIME_ROYALE (relativo à raiz, que é a pasta atual),
# RUNNER_TEMP (com o anime.log); PYTHON (opcional, padrão python: os testes trocam).
# Saída: a agenda crescida, e as linhas do schedule-royale no $RUNNER_TEMP/anime.log, com a marca
# "Anime Royale: " (os avisos vão ao corpo do PR, depois dos do Anime e dos do quiz; os de uma
# tentativa que quebrou, não).
set -euo pipefail

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "::error::data inválida: $TODAY"; exit 1; }
[[ "$ANIME_DAYS" =~ ^[0-9]+$ ]] || { echo "::error::ANIME_DAYS inválido: $ANIME_DAYS"; exit 1; }
python="${PYTHON:-python}"
log="$RUNNER_TEMP/anime.log"
attempt="$RUNNER_TEMP/anime-royale.log"
if [ ! -f "$ANIME_ROYALE" ]; then
  echo "Anime Royale: a main ainda não tem a agenda dele; nada a crescer."
  exit 0
fi

# A geração e a conferência da pasta inteira (o validate-anime confere o Royale ao lado do Anime).
# Só as linhas do schedule-royale vão ao log da tentativa: as do validate-anime repetem as do Anime.
: > "$attempt"
if "$python" -m musicle_pipeline schedule-royale --provider apple --today "$TODAY" --days "$ANIME_DAYS" 2>&1 \
  | tee -a "$attempt" \
  && "$python" -m musicle_pipeline validate-anime --provider apple 2>&1; then
  sed -E 's/^(aviso|afrouxamento): /\1: Anime Royale: /' "$attempt" >> "$log"
  exit 0
fi
# A agenda da main de volta (o schedule-royale grava só no fim, mas o validate-anime pode recusar o
# que ele gravou).
git checkout -- "$ANIME_ROYALE"
echo "aviso: Anime Royale: não cresceu nesta semana (a geração ou a conferência quebrou; veja a execução)" >> "$log"
echo "::warning::o Anime Royale não cresceu (veja acima); a agenda dele ficou como a da main, e o Anime segue"
exit 1
