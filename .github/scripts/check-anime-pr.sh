#!/usr/bin/env bash
# Tarefa catalog-pr do update-catalog.yml: confere, só com jq e coreutils, cada arquivo do Anime
# que veio da tarefa anime-generate (que roda o pipeline e os pacotes do pip). Roda com o token de
# escrita por perto, como o check-catalog-pr.sh: não chama Python nem nada do projeto além deste
# script, que vem da main. Só confere e escreve a parte do Anime no corpo do PR: quem copia os
# arquivos para a árvore, depois de tudo conferido, é o catalog-pr.sh, que chama este script no
# mesmo passo do dos Hits. Testado em pipeline/tests/test_anime_pr_script.py (precisa de jq).
#
# Entrada (ambiente): TODAY (calculado nesta tarefa, sem passar pelo pip), ANIME_GENERATED_TODAY
# (o da anime-generate, que precisa bater, ME44), ANIME_FETCH (o resultado da busca), ANIME_SONGS
# (failure quando a busca nova quebrou o acervo ou a agenda e a reserva a descartou), os caminhos
# ANIME_SNAPSHOTS, ANIME_CATALOG, ANIME_SCHEDULE, ANIME_FIXTURE_CATALOG, ANIME_FIXTURE_SCHEDULE,
# ANIME_MIXED e ANIME_FIXTURE_MIXED (as agendas das Misturadas, M17), ANIME_QUIZ e
# ANIME_FIXTURE_QUIZ (as pastas do quiz do dia, M18, um arquivo por mês; relativos à raiz, que é a
# pasta atual, um checkout da main), RUNNER_TEMP (com o artefato em anime-artifact/) e
# GITHUB_OUTPUT.
# Saída: $RUNNER_TEMP/anime-section.md (a parte do Anime no corpo do PR) e, no GITHUB_OUTPUT,
# title (o título do PR só com o Anime) e suffix (o pedaço do título quando os Hits também vêm).
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

# A geração só roda com menos de 21 dias à frente (anime-due.sh) e vai até hoje + 28 (--days 28
# no workflow); o limite aqui tem folga, hoje + 35. Os tetos de tamanho: o do validate-anime para
# o catálogo, uns 5 vezes o maior snapshot da carga de teste e uns 4 vezes o maior mês do quiz
# (31 dias de 50 rodadas).
SKIP_AHEAD=21
LIMIT_DAYS=35
MAX_SNAPSHOT_BYTES=$((2 * 1024 * 1024))
MAX_CATALOG_BYTES=$((5 * 1024 * 1024))
MAX_QUIZ_MONTH_BYTES=$((2 * 1024 * 1024))

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data inválida: $TODAY"
# O "hoje" da anime-generate vem da tarefa que roda os pacotes do pip: um pacote comprometido
# poderia mandar uma data no futuro (P44). Vale o desta tarefa (ME44). O valor não vai para a
# mensagem.
[ "${ANIME_GENERATED_TODAY:-}" = "$TODAY" ] \
  || fail "a tarefa do Anime gerou para outro dia (hoje é $TODAY): rode uma execução nova (gh workflow run update-catalog.yml)"
limit="$(date -ud "$TODAY + $LIMIT_DAYS days" +%F)"
art="$RUNNER_TEMP/anime-artifact"

# 1. Só se a main precisava: a agenda do Anime existe e ela, a das Misturadas (M17, que para no
#    último dia da do Anime) ou a do quiz do dia (M18, que para no último das duas) tem menos de 21
#    dias depois de hoje (P237), como no anime-due.sh.
[ -f "$ANIME_SCHEDULE" ] || fail "a main não tem a agenda do Anime: o robô só a cresce, não a cria (P237)"
ahead_of() { jq --arg d "$TODAY" '[.days | keys[] | select(. > $d)] | length' "$1"; }
# Os meses de uma pasta do quiz (P379), pelo nome, em ordem.
months_of() { find "$1" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]-[0-9][0-9].json' -printf '%f\n' | sort; }
ahead="$(ahead_of "$ANIME_SCHEDULE")"
due=false
[ "$ahead" -ge "$SKIP_AHEAD" ] || due=true
mixed_note=""
if [ -f "$ANIME_MIXED" ]; then
  mixed_ahead="$(ahead_of "$ANIME_MIXED")"
  [ "$mixed_ahead" -ge "$SKIP_AHEAD" ] || due=true
  mixed_note=", e a das Misturadas, $mixed_ahead"
fi
if [ -d "$ANIME_QUIZ" ]; then
  mapfile -t quiz_months < <(months_of "$ANIME_QUIZ")
  [ "${#quiz_months[@]}" -gt 0 ] || fail "a pasta do quiz do dia da main não tem nenhum mês (caso não suportado)"
  quiz_ahead="$(jq -n --arg d "$TODAY" '[inputs | .days | keys[] | select(. > $d)] | length' \
    "${quiz_months[@]/#/$ANIME_QUIZ/}")"
  [ "$quiz_ahead" -ge "$SKIP_AHEAD" ] || due=true
  mixed_note+=", e a do quiz do dia, $quiz_ahead"
fi
[ "$due" = true ] \
  || fail "a agenda do Anime da main já tem $ahead dia(s) à frente$mixed_note; o robô só gera com menos de $SKIP_AHEAD (P237)"

# 2. O artefato: só arquivos comuns da lista fechada do Anime, no máximo um snapshot, e a lista
#    declarada é exatamente o que veio.
[ -f "$art/changed.txt" ] || fail "artefato do Anime sem changed.txt"
[ -d "$art/files" ] || fail "artefato do Anime sem files/"
mapfile -t changed < "$art/changed.txt"
[ "${#changed[@]}" -gt 0 ] || fail "artefato do Anime sem arquivos"
# Antes de qualquer mensagem citar um caminho: um caractere de controle nele poderia mexer no
# log (o ::error:: e as linhas seguintes). O valor não vai para a mensagem.
for path in "${changed[@]}"; do
  [[ ! "$path" =~ [[:cntrl:]] ]] || fail "o changed.txt do Anime tem caractere de controle num caminho"
done
snapshot=""
for path in "${changed[@]}"; do
  case "$path" in
    "$ANIME_CATALOG" | "$ANIME_SCHEDULE" | "$ANIME_FIXTURE_SCHEDULE" | "$ANIME_MIXED" | "$ANIME_FIXTURE_MIXED") ;;
    "$ANIME_SNAPSHOTS"/*)
      name="${path#"$ANIME_SNAPSHOTS"/}"
      [[ "$name" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.json$ ]] \
        || fail "snapshot do Anime com nome fora do formato: $path"
      [ -z "$snapshot" ] || fail "mais de um snapshot do Anime no artefato"
      snapshot="$path"
      ;;
    "$ANIME_QUIZ"/* | "$ANIME_FIXTURE_QUIZ"/*)
      # Um mês do quiz do dia (P379), direto na pasta: nada de subpasta nem outro nome.
      [ "${path%/*}" = "$ANIME_QUIZ" ] || [ "${path%/*}" = "$ANIME_FIXTURE_QUIZ" ] \
        || fail "mês do quiz do dia fora da pasta dele: $path"
      [[ "${path##*/}" =~ ^[0-9]{4}-(0[1-9]|1[0-2])\.json$ ]] \
        || fail "mês do quiz do dia com nome fora do formato: $path"
      ;;
    *) fail "arquivo fora da lista fechada do Anime: $path" ;;
  esac
done
[ -z "$(find "$art/files" ! -type f ! -type d)" ] || fail "o artefato do Anime traz algo que não é arquivo comum"
got="$(cd "$art/files" && find . -type f | sed 's|^\./||' | sort)"
want="$(printf '%s\n' "${changed[@]}" | sort)"
[ "$got" = "$want" ] || fail "os arquivos do artefato do Anime não batem com a lista declarada"

has() {
  local p
  for p in "${changed[@]}"; do
    if [ "$p" = "$1" ]; then return 0; fi
  done
  return 1
}
new() { echo "$art/files/$1"; }
# Algum mês da pasta do quiz veio no artefato?
has_months() {
  local p
  for p in "${changed[@]}"; do
    if [ "${p%/*}" = "$1" ]; then return 0; fi
  done
  return 1
}

# A geração sempre cresce uma das agendas reais: a do Anime ou, com ela longe, a das Misturadas (a
# estreia delas) ou a do quiz do dia.
has "$ANIME_SCHEDULE" || has "$ANIME_MIXED" || has_months "$ANIME_QUIZ" \
  || fail "o artefato do Anime não traz a agenda real (a geração sempre a cresce)"
# Cada arquivo é um JSON só: com dois documentos colados, o --slurpfile olharia só o 1º.
for path in "${changed[@]}"; do
  jq -e -n --slurpfile x "$(new "$path")" '$x | length == 1' > /dev/null \
    || fail "$path: o arquivo precisa ser um JSON só"
done

# 3. O snapshot e o catálogo andam juntos: só a busca nova muda o catálogo.
id=""
fetched_at=""
if [ -n "$snapshot" ]; then
  has "$ANIME_CATALOG" || fail "snapshot do Anime novo sem catálogo novo"
  [ ! -e "$snapshot" ] || fail "o snapshot do Anime já existe na main"
  [ "$(wc -c < "$(new "$snapshot")")" -le "$MAX_SNAPSHOT_BYTES" ] \
    || fail "o snapshot do Anime passa de $MAX_SNAPSHOT_BYTES bytes"
  id="$(basename "$snapshot" .json)"
  # O id é o instante da busca sem os dois-pontos: 2026-10-26T091700Z → 2026-10-26T09:17:00Z.
  fetched_at="${id:0:13}:${id:13:2}:${id:15:2}Z"
  day="$(TZ=America/Sao_Paulo date -d "$fetched_at" +%F)" || fail "snapshot do Anime com hora impossível: $id"
  [ "$day" = "$TODAY" ] || fail "o snapshot do Anime ($id) não é de hoje em Brasília ($TODAY)"
  last_main=""
  if [ -d "$ANIME_SNAPSHOTS" ]; then
    last_main="$(find "$ANIME_SNAPSHOTS" -maxdepth 1 -type f -name '????-??-??T??????Z.json' -printf '%f\n' | sort | tail -n 1)"
    last_main="${last_main%.json}"
  fi
  [ -z "$last_main" ] || [[ "$id" > "$last_main" ]] \
    || fail "o snapshot do Anime ($id) não vem depois do último da main ($last_main)"
  jq -e --arg id "$id" --arg at "$fetched_at" '
    (keys - ["anime", "artists", "fetchedAt", "id", "provider", "resolved", "storefront", "tracks"]) == []
    and .provider == "apple" and .storefront == "jp" and .id == $id and .fetchedAt == $at
    and (.anime | type == "array") and (.artists | type == "object")
    and (.resolved | type == "object") and (.tracks | type == "object")' "$(new "$snapshot")" > /dev/null \
    || fail "snapshot do Anime fora da forma esperada"
else
  if has "$ANIME_CATALOG"; then fail "o catálogo do Anime mudou sem busca nova"; fi
fi
# A reserva apaga o snapshot que quebrou o acervo; se ele veio mesmo assim, algo no caminho não
# fez o que diz.
if [ "${ANIME_SONGS:-success}" = "failure" ] && [ -n "$snapshot" ]; then
  fail "a busca do Anime ficou de fora (ANIME_SONGS=failure), mas o snapshot veio no artefato"
fi

# 4. O catálogo: o mesmo esquema; nenhum id da main some (as agendas e os saves os citam); as URLs
#    só nos hosts da Apple (vão para href, src e áudio); os snapshots da main intactos, com o de
#    agora no fim.
catalog_line=""
if has "$ANIME_CATALOG"; then
  [ "$(wc -c < "$(new "$ANIME_CATALOG")")" -le "$MAX_CATALOG_BYTES" ] \
    || fail "o catálogo do Anime passa de $MAX_CATALOG_BYTES bytes"
  # \A e \z, e não ^ e $: no jq (Oniguruma) estes casam no começo e no fim de cada linha.
  jq -e -n --slurpfile b "$ANIME_CATALOG" --slurpfile n "$(new "$ANIME_CATALOG")" \
    --arg id "$id" --arg at "$fetched_at" '
    def ids($k): [.[$k][].id];
    def apple($host): type == "string" and test("\\Ahttps://" + $host + "/[^\\s\\\\]+\\z");
    $b[0] as $b | $n[0] as $n
    | $n.schemaVersion == $b.schemaVersion and $n.provider == "apple"
      and $n.storefront == $b.storefront
      and (["tracks", "albums", "artists", "franchises"]
           | all(. as $k | ($b | ids($k)) - ($n | ids($k)) == []))
      and ($n.tracks | all(
            (.preview == null or (.preview.url | apple("audio-ssl\\.itunes\\.apple\\.com")))
            and (.storeUrl == null or (.storeUrl | apple("music\\.apple\\.com")))))
      and ($n.albums | all(.artworkUrl == null or (.artworkUrl | apple("is[0-9]+-ssl\\.mzstatic\\.com"))))
      and ($n.snapshots | length) == ($b.snapshots | length) + 1
      and $n.snapshots[: ($b.snapshots | length)] == $b.snapshots
      and ($n.snapshots | last) == {id: $id, fetchedAt: $at}
      and $n.generatedAt == $at' > /dev/null \
    || fail "o catálogo novo do Anime perde ids, muda o esquema, sai dos hosts da Apple ou não bate com os snapshots"
  catalog_line="$(jq -r -n --slurpfile b "$ANIME_CATALOG" --slurpfile n "$(new "$ANIME_CATALOG")" \
    --slurpfile s "$(new "$snapshot")" '
    ($n[0].tracks | length) as $total
    | (($n[0].tracks | map(.id)) - ($b[0].tracks | map(.id)) | length) as $fresh
    | [$s[0].anime[] | objects | (.themes // []) | arrays | .[] | objects] as $themes
    | "- **Busca do Anime de hoje:** \($s[0].anime | length) anime(s) tentado(s), \($themes | length) tema(s), \([$themes[] | select(.result == "matched")] | length) achado(s) na Apple; **\($fresh) música(s) nova(s)** no acervo, que passa a ter \($total)."')"
  if [ "${ANIME_FETCH:-success}" = "failure" ]; then
    catalog_line+=" A busca parou com erro (veja a execução): entrou o que ela gravou antes."
  fi
elif [ "${ANIME_SONGS:-success}" = "failure" ]; then
  catalog_line="- **Busca do Anime:** a de hoje veio, mas quebrou o acervo ou a agenda (veja o passo \"Anime: acervo, agenda e validação\" da execução) e ficou de fora. A agenda do Anime cresceu com o acervo de antes; corrija o código ou o aliases.toml do Anime."
  echo "::warning::a busca do Anime de hoje quebrou o acervo ou a agenda e ficou de fora do PR"
elif [ "${ANIME_FETCH:-success}" = "failure" ]; then
  catalog_line="- **Busca do Anime:** falhou hoje (veja a execução). A agenda do Anime cresceu com o acervo de antes."
else
  catalog_line="- **Busca do Anime:** não trouxe nada hoje. A agenda do Anime cresceu com o acervo de antes."
fi

# 5. As agendas: o mesmo cabeçalho, todo dia da main igual e os dias novos em sequência, a partir
#    do dia seguinte ao fim da agenda, ou de hoje, se esse dia já passou (P44), até hoje + 35. Os
#    dias novos citam faixas do catálogo que os gerou, com a versão dele. O `kind` diz onde estão
#    as respostas: no Anime, uma por rodada de cada dificuldade; nas Misturadas (M17), várias por
#    rodada; no quiz do dia (M18), as duas faixas da rodada (a e b).
schedule_lines=""
gap_lines=""
quiz_questions=""
real_last=""
mixed_last=""
#    O 5º e o 6º argumento, opcionais, são a agenda nova (a do artefato, se faltar) e o nome nas
#    mensagens (o da main, se faltar): o quiz passa os meses juntos, em arquivos à parte. O último
#    dia novo fica em checked_last.
checked_last=""
check_schedule() {
  local base="$1" label="$2" catalog="$3" kind="$4" fresh="${5:-}" name="${6:-$1}" base_last first last count expected base_s first_s last_s gap
  local -a added
  [ -n "$fresh" ] || fresh="$(new "$base")"
  jq -e -n --slurpfile b "$base" --slurpfile n "$fresh" --slurpfile c "$catalog" --arg kind "$kind" '
    def answers:
      if $kind == "anime-mixed" then [.musica, .titulo | .[] | .answers[]]
      elif $kind == "anime-quiz" then [.rounds[] | .a, .b]
      else [.musica, .titulo | .facil, .medio, .dificil | .[] | .answer] end;
    $b[0] as $b | $n[0] as $n | ($c[0].tracks | map(.id)) as $ids
    | [$n.days | to_entries[] | select(.key as $k | $b.days | has($k) | not)] as $added
    | ($b | del(.days)) == ($n | del(.days))
      and $n.kind == $kind
      and ($b.days | to_entries | all(.value == $n.days[.key]))
      and ($added | all(.key | test("\\A[0-9]{4}-[0-9]{2}-[0-9]{2}\\z")))
      and ($added | all(.value.catalogVersion == $c[0].catalogVersion))
      and ([$added[].value | answers[]] | all(. as $a | $ids | any(. == $a)))' > /dev/null \
    || fail "$name: a agenda nova altera o que já existe, traz data inválida ou cita faixa fora do catálogo"
  base_last="$(jq -r '.days | keys | last // empty' "$base")"
  [ -n "$base_last" ] || fail "$name: a agenda da main não tem dias (caso não suportado)"
  mapfile -t added < <(jq -r -n --slurpfile b "$base" --slurpfile n "$fresh" \
    '($n[0].days | keys) - ($b[0].days | keys) | .[]')
  [ "${#added[@]}" -gt 0 ] || fail "$name: mudou sem dia novo"
  first="${added[0]}"
  last="${added[-1]}"
  count="${#added[@]}"
  expected="$(date -ud "$base_last + 1 day" +%F)"
  if [[ "$TODAY" > "$expected" ]]; then expected="$TODAY"; fi
  [ "$first" = "$expected" ] || fail "$name: o 1º dia novo deveria ser $expected, e não $first (P44)"
  base_s="$(date -ud "$base_last" +%s)"
  first_s="$(date -ud "$first" +%s)"
  last_s="$(date -ud "$last" +%s)"
  [ "$count" -eq $(( (last_s - first_s) / 86400 + 1 )) ] || fail "$name: há buraco entre os dias novos"
  # O formato e a conta não pegam um dia impossível no lugar de outro ("2026-11-31" no lugar de
  # "2026-11-30"): cada dia novo é o do calendário, um depois do outro.
  local i=0 d
  for d in "${added[@]}"; do
    [ "$d" = "$(date -ud "$first + $i day" +%F)" ] || fail "$name: dia novo fora do calendário: $d"
    i=$((i + 1))
  done
  [[ ! "$last" > "$limit" ]] || fail "$name: o último dia novo ($last) passa de hoje + $LIMIT_DAYS ($limit)"
  gap=$(( (first_s - base_s) / 86400 - 1 ))
  schedule_lines+="- **$label:** $count dia(s) novo(s), de $first a $last (a da main vai até $base_last)."$'\n'
  if [ "$gap" -gt 0 ]; then
    gap_lines+="> **Atenção ($label):** $gap dia(s) ficaram sem diário depois de $base_last: dia que já passou não é gerado (P44). Faça o merge hoje."$'\n'
  elif [ "$first" = "$TODAY" ]; then
    gap_lines+="> **Atenção ($label):** a agenda acabou ontem e o 1º dia novo é hoje: faça o merge hoje, ou o dia fica sem diário (P44)."$'\n'
  fi
  if [ "$base" = "$ANIME_SCHEDULE" ]; then real_last="$last"; fi
  if [ "$base" = "$ANIME_MIXED" ]; then mixed_last="$last"; fi
  checked_last="$last"
}
# O último dia de uma agenda com o que veio no artefato (ou a da main, se ela não mudou).
last_day() { jq -r '.days | keys | last // empty' "$1"; }
final_last() { if has "$1"; then last_day "$(new "$1")"; else last_day "$1"; fi; }
# O quiz do dia (M18): a pasta, um arquivo por mês (P379), é uma agenda só. Cada mês que veio tem o
# cabeçalho do 1º mês da main, o nome do mês e só dias dele; o que já existia na main só cresce, e
# o novo vem depois do último. Juntos, os meses passam pelo check_schedule, como as outras agendas,
# e nenhum dia novo passa do último da agenda do Anime nem do da das Misturadas, que ele lê (P378).
quiz_tmp="$RUNNER_TEMP/anime-quiz-check"
check_quiz() {
  local dir="$1" label="$2" catalog="$3" anime="$4" mixed="$5" path name main_month end
  local -a main_months mine main_paths fresh_paths
  [ -d "$dir" ] || fail "a main não tem a agenda do quiz do dia em $dir: o robô só a cresce, não a cria"
  [ -f "$mixed" ] || fail "$dir: o quiz do dia lê a agenda das Misturadas, e a main não a tem (P378)"
  mapfile -t main_months < <(months_of "$dir")
  [ "${#main_months[@]}" -gt 0 ] || fail "$dir: a pasta do quiz da main não tem nenhum mês (caso não suportado)"
  mkdir -p "$quiz_tmp"
  printf '{"days": {}}\n' > "$quiz_tmp/empty.json"
  mine=()
  for path in "${changed[@]}"; do
    if [ "${path%/*}" = "$dir" ]; then mine+=("${path##*/}"); fi
  done
  mapfile -t mine < <(printf '%s\n' "${mine[@]}" | sort)
  for name in "${mine[@]}"; do
    main_month="$dir/$name"
    [ "$(wc -c < "$(new "$main_month")")" -le "$MAX_QUIZ_MONTH_BYTES" ] \
      || fail "$main_month: o mês do quiz passa de $MAX_QUIZ_MONTH_BYTES bytes"
    if [ ! -f "$main_month" ]; then
      [[ "$name" > "${main_months[-1]}" ]] \
        || fail "$main_month: o mês novo do quiz precisa vir depois do último da main (${main_months[-1]})"
      main_month="$quiz_tmp/empty.json"
    fi
    jq -e -n --slurpfile h "$dir/${main_months[0]}" --slurpfile b "$main_month" \
      --slurpfile n "$(new "$dir/$name")" --arg m "${name%.json}" '
      $h[0] as $h | $b[0] as $b | $n[0] as $n
      | ($n | del(.days, .month)) == ($h | del(.days, .month))
        and $n.month == $m and ($n.days | type == "object")
        and ($n.days | keys | all(startswith($m + "-")))
        and ($b.days | to_entries | all(.value == $n.days[.key]))
        and (($n.days | keys) - ($b.days | keys) | length > 0)' > /dev/null \
      || fail "$dir/$name: o mês do quiz muda o cabeçalho ou um dia que já existe, traz dia de outro mês ou não cresce"
  done
  # Os meses juntos: os da main, com os que cresceram no lugar deles, e os novos no fim.
  main_paths=()
  fresh_paths=()
  for name in "${main_months[@]}"; do
    main_paths+=("$dir/$name")
    if has "$dir/$name"; then fresh_paths+=("$(new "$dir/$name")"); else fresh_paths+=("$dir/$name"); fi
  done
  for name in "${mine[@]}"; do
    if [ ! -f "$dir/$name" ]; then fresh_paths+=("$(new "$dir/$name")"); fi
  done
  local merge='[inputs] | (.[0] | del(.days, .month)) + {days: (map(.days) | add)}'
  jq -n "$merge" "${main_paths[@]}" > "$quiz_tmp/base.json"
  jq -n "$merge" "${fresh_paths[@]}" > "$quiz_tmp/new.json"
  # A forma de cada dia novo, a do schema: nas famílias do MAL, a CI não consegue regerar o dia
  # inteiro (P380), e o único texto livre é o parâmetro (o rótulo e o estúdio), curto e sem
  # caractere de controle, sem <, >, aspas, crase, barra invertida nem endereço.
  jq -e -n --slurpfile b "$quiz_tmp/base.json" --slurpfile n "$quiz_tmp/new.json" '
    def int_in($lo; $hi): type == "number" and . == floor and . >= $lo and . <= $hi;
    def short_text: type == "string" and length >= 1 and length <= 40
      and (test("[[:cntrl:]<>\"\\\\`]|://") | not);
    def pair(f): type == "array" and length == 2 and all(f);
    def info_of($f):
      {ano: "seasons", ano_x: "years", playlists: "playlists", amq: "rates", tema: "themes",
       nota: "diff", membros: "diff"}[$f];
    def round_ok($f):
      info_of($f) as $want
      | type == "object" and (keys - ["a", "answer", "b", "info"]) == []
        and has("a") and has("b") and .a != .b and (.answer | IN("a", "b"))
        and (if $want == null then (has("info") | not)
             else (.info | type == "object" and keys == [$want])
               and (.info[$want]
                 | if $want == "seasons" then pair(type == "object" and keys == ["season", "year"]
                       and (.year | int_in(1900; 2100))
                       and (.season | IN("winter", "spring", "summer", "fall")))
                   elif $want == "years" then pair(int_in(1900; 2100))
                   elif $want == "rates" then pair(type == "number" and . >= 0 and . <= 100)
                   elif $want == "playlists" then pair(int_in(1; 1000000))
                   elif $want == "themes" then pair(type == "string" and test("\\A(OP|ED|IN)[0-9]{0,3}\\z"))
                   else type == "number" and . >= 0 end)
             end);
    def day_ok:
      . as $d | .family as $f
      | type == "object"
        and (keys - ["catalogVersion", "direction", "family", "mal", "number", "param", "rounds"]) == []
        and (["catalogVersion", "direction", "family", "mal", "number", "rounds"] | all(. as $k | $d | has($k)))
        and ($d.number | int_in(1; 100000)) and ($d.mal | type == "boolean")
        and (if ($f | IN("ano", "nota", "membros", "playlists", "amq")) then ($d.direction | IN("max", "min"))
             elif ($f | IN("rotulo", "fonte", "tema", "estudio", "ano_x")) then ($d.direction | IN("tem", "nao"))
             else false end)
        and (if ($f | IN("nota", "membros", "rotulo", "fonte", "estudio")) then $d.mal == true else true end)
        and (if $f == "ano_x" then ($d.param | int_in(1900; 2100))
             elif $f == "fonte" then ($d.param | IN("manga", "light_novel", "novel", "original", "visual_novel", "game"))
             elif ($f | IN("rotulo", "estudio")) then ($d.param | short_text)
             else ($d | has("param") | not) end)
        and ($d.rounds | type == "array" and length >= 1
             and length <= (if ($f | IN("estudio", "ano_x")) then 30 else 50 end)
             and all(round_ok($f)));
    $b[0] as $b | $n[0] as $n
    | [$n.days | to_entries[] | select(.key as $k | $b.days | has($k) | not) | .value] | all(day_ok)' \
    > /dev/null \
    || fail "$dir: um dia novo do quiz fora da forma (as chaves, a família, a direção, o parâmetro, as rodadas ou o dado da revelação)"
  check_schedule "$quiz_tmp/base.json" "$label" "$catalog" anime-quiz "$quiz_tmp/new.json" "$dir"
  # As perguntas dos dias novos da agenda real, para quem lê o PR (o parâmetro é o único texto
  # livre), num bloco de código, com o ~ trocado para não fechá-lo.
  if [ "$dir" = "$ANIME_QUIZ" ]; then
    quiz_questions="$(jq -r -n --slurpfile b "$quiz_tmp/base.json" --slurpfile n "$quiz_tmp/new.json" '
      $b[0] as $b | $n[0].days | to_entries[] | select(.key as $k | $b.days | has($k) | not)
      | "\(.key) \(.value.family) \(.value.direction)\(if .value.param then " \(.value.param)" else "" end) (\(.value.rounds | length) rodadas)"
      | gsub("~"; "-")')"
  fi
  end="$(final_last "$anime")"
  [[ ! "$checked_last" > "$end" ]] \
    || fail "$dir: o último dia novo ($checked_last) passa do fim da agenda do Anime ($end), P378"
  end="$(final_last "$mixed")"
  [[ ! "$checked_last" > "$end" ]] \
    || fail "$dir: o último dia novo ($checked_last) passa do fim da agenda das Misturadas ($end), P378"
}
real_catalog="$ANIME_CATALOG"
if has "$ANIME_CATALOG"; then real_catalog="$(new "$ANIME_CATALOG")"; fi
if has "$ANIME_SCHEDULE"; then
  check_schedule "$ANIME_SCHEDULE" "Agenda do Anime" "$real_catalog" anime
else
  real_last="$(jq -r '.days | keys | last // empty' "$ANIME_SCHEDULE")"
fi
if has "$ANIME_MIXED"; then
  [ -f "$ANIME_MIXED" ] || fail "a main não tem a agenda das Misturadas: o robô só a cresce, não a cria"
  check_schedule "$ANIME_MIXED" "Agenda das Misturadas" "$real_catalog" anime-mixed
  # Cada dia das Misturadas lê as respostas do Anime do dia (P332): ela nunca passa do fim dele.
  [[ ! "$mixed_last" > "$real_last" ]] \
    || fail "$ANIME_MIXED: o último dia novo ($mixed_last) passa do fim da agenda do Anime ($real_last), P332"
fi
if has_months "$ANIME_QUIZ"; then
  check_quiz "$ANIME_QUIZ" "Agenda do quiz do dia" "$real_catalog" "$ANIME_SCHEDULE" "$ANIME_MIXED"
fi
if has "$ANIME_FIXTURE_SCHEDULE"; then
  check_schedule "$ANIME_FIXTURE_SCHEDULE" "Agenda fictícia do Anime (só desenvolvimento)" "$ANIME_FIXTURE_CATALOG" anime
fi
if has "$ANIME_FIXTURE_MIXED"; then
  check_schedule "$ANIME_FIXTURE_MIXED" "Agenda fictícia das Misturadas (só desenvolvimento)" "$ANIME_FIXTURE_CATALOG" anime-mixed
fi
if has_months "$ANIME_FIXTURE_QUIZ"; then
  check_quiz "$ANIME_FIXTURE_QUIZ" "Agenda fictícia do quiz do dia (só desenvolvimento)" \
    "$ANIME_FIXTURE_CATALOG" "$ANIME_FIXTURE_SCHEDULE" "$ANIME_FIXTURE_MIXED"
fi

# Os avisos e afrouxamentos da agenda real (acervo curto, resposta futura que deixou de ser
# elegível, as regras que afrouxaram): num bloco de código, com o ~ trocado para não fechar o
# bloco e sem caracteres de controle. Até 50 linhas de até 300 caracteres (o jq corta por
# caractere, sem partir um UTF-8): o corpo do PR nunca chega perto do limite do GitHub (65.536
# caracteres), e o Anime nunca impede o PR dos Hits. Fora de files/: não entram na árvore.
warnings=""
warning_count=0
if [ -f "$art/avisos.txt" ] && [ ! -L "$art/avisos.txt" ]; then
  warning_count="$(wc -l < "$art/avisos.txt")"
  warnings="$(head -n 50 "$art/avisos.txt" | jq -R -r '.[0:300] | gsub("[[:cntrl:]]"; "") | gsub("~"; "-")')" \
    || warnings="(os avisos do log não deram para ler; veja a execução)"
fi

# 6. Tudo conferido: a parte do Anime no corpo do PR e o título.
{
  echo "**Anime**"
  echo
  echo "$catalog_line"
  printf '%s' "$schedule_lines"
  if [ -n "$gap_lines" ]; then
    echo
    printf '%s' "$gap_lines"
  fi
  if [ -n "$quiz_questions" ]; then
    echo
    echo "**As perguntas dos dias novos do quiz do dia** (a data, a família, a direção, o parâmetro e as rodadas):"
    echo
    echo "~~~text"
    echo "$quiz_questions"
    echo "~~~"
  fi
  if [ -n "$warnings" ]; then
    echo
    echo "**Avisos e afrouxamentos do Anime** ($warning_count sem repetir; até 50 aqui):"
    echo
    echo "~~~text"
    echo "$warnings"
    echo "~~~"
  fi
} > "$RUNNER_TEMP/anime-section.md"
{
  echo "title=chore: Anime de $TODAY (agenda até $real_last)"
  echo "suffix=e Anime (agenda até $real_last)"
} >> "$GITHUB_OUTPUT"
