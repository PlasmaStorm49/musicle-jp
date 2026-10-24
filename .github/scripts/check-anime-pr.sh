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
# ANIME_MIXED e ANIME_FIXTURE_MIXED (as agendas das Misturadas, M17; relativos à raiz, que é a
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
# o catálogo e uns 5 vezes o maior snapshot da carga de teste.
SKIP_AHEAD=21
LIMIT_DAYS=35
MAX_SNAPSHOT_BYTES=$((2 * 1024 * 1024))
MAX_CATALOG_BYTES=$((3 * 1024 * 1024))

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data inválida: $TODAY"
# O "hoje" da anime-generate vem da tarefa que roda os pacotes do pip: um pacote comprometido
# poderia mandar uma data no futuro (P44). Vale o desta tarefa (ME44). O valor não vai para a
# mensagem.
[ "${ANIME_GENERATED_TODAY:-}" = "$TODAY" ] \
  || fail "a tarefa do Anime gerou para outro dia (hoje é $TODAY): rode uma execução nova (gh workflow run update-catalog.yml)"
limit="$(date -ud "$TODAY + $LIMIT_DAYS days" +%F)"
art="$RUNNER_TEMP/anime-artifact"

# 1. Só se a main precisava: a agenda do Anime existe e ela, ou a das Misturadas (M17, que para no
#    último dia da do Anime), tem menos de 21 dias depois de hoje (P237), como no anime-due.sh.
[ -f "$ANIME_SCHEDULE" ] || fail "a main não tem a agenda do Anime: o robô só a cresce, não a cria (P237)"
ahead_of() { jq --arg d "$TODAY" '[.days | keys[] | select(. > $d)] | length' "$1"; }
ahead="$(ahead_of "$ANIME_SCHEDULE")"
due=false
[ "$ahead" -ge "$SKIP_AHEAD" ] || due=true
mixed_note=""
if [ -f "$ANIME_MIXED" ]; then
  mixed_ahead="$(ahead_of "$ANIME_MIXED")"
  [ "$mixed_ahead" -ge "$SKIP_AHEAD" ] || due=true
  mixed_note=", e a das Misturadas, $mixed_ahead"
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

# A geração sempre cresce uma das duas: a do Anime ou, com ela longe (a estreia das Misturadas), a
# das Misturadas.
has "$ANIME_SCHEDULE" || has "$ANIME_MIXED" \
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
#    rodada.
schedule_lines=""
gap_lines=""
real_last=""
mixed_last=""
check_schedule() {
  local base="$1" label="$2" catalog="$3" kind="$4" fresh base_last first last count expected base_s first_s last_s gap
  local -a added
  fresh="$(new "$base")"
  jq -e -n --slurpfile b "$base" --slurpfile n "$fresh" --slurpfile c "$catalog" --arg kind "$kind" '
    def answers:
      if $kind == "anime-mixed" then [.musica, .titulo | .[] | .answers[]]
      else [.musica, .titulo | .facil, .medio, .dificil | .[] | .answer] end;
    $b[0] as $b | $n[0] as $n | ($c[0].tracks | map(.id)) as $ids
    | [$n.days | to_entries[] | select(.key as $k | $b.days | has($k) | not)] as $added
    | ($b | del(.days)) == ($n | del(.days))
      and $n.kind == $kind
      and ($b.days | to_entries | all(.value == $n.days[.key]))
      and ($added | all(.key | test("\\A[0-9]{4}-[0-9]{2}-[0-9]{2}\\z")))
      and ($added | all(.value.catalogVersion == $c[0].catalogVersion))
      and ([$added[].value | answers[]] | all(. as $a | $ids | any(. == $a)))' > /dev/null \
    || fail "$base: a agenda nova altera o que já existe, traz data inválida ou cita faixa fora do catálogo"
  base_last="$(jq -r '.days | keys | last // empty' "$base")"
  [ -n "$base_last" ] || fail "$base: a agenda da main não tem dias (caso não suportado)"
  mapfile -t added < <(jq -r -n --slurpfile b "$base" --slurpfile n "$fresh" \
    '($n[0].days | keys) - ($b[0].days | keys) | .[]')
  [ "${#added[@]}" -gt 0 ] || fail "$base: mudou sem dia novo"
  first="${added[0]}"
  last="${added[-1]}"
  count="${#added[@]}"
  expected="$(date -ud "$base_last + 1 day" +%F)"
  if [[ "$TODAY" > "$expected" ]]; then expected="$TODAY"; fi
  [ "$first" = "$expected" ] || fail "$base: o 1º dia novo deveria ser $expected, e não $first (P44)"
  base_s="$(date -ud "$base_last" +%s)"
  first_s="$(date -ud "$first" +%s)"
  last_s="$(date -ud "$last" +%s)"
  [ "$count" -eq $(( (last_s - first_s) / 86400 + 1 )) ] || fail "$base: há buraco entre os dias novos"
  [[ ! "$last" > "$limit" ]] || fail "$base: o último dia novo ($last) passa de hoje + $LIMIT_DAYS ($limit)"
  gap=$(( (first_s - base_s) / 86400 - 1 ))
  schedule_lines+="- **$label:** $count dia(s) novo(s), de $first a $last (a da main vai até $base_last)."$'\n'
  if [ "$gap" -gt 0 ]; then
    gap_lines+="> **Atenção ($label):** $gap dia(s) ficaram sem diário depois de $base_last: dia que já passou não é gerado (P44). Faça o merge hoje."$'\n'
  elif [ "$first" = "$TODAY" ]; then
    gap_lines+="> **Atenção ($label):** a agenda acabou ontem e o 1º dia novo é hoje: faça o merge hoje, ou o dia fica sem diário (P44)."$'\n'
  fi
  if [ "$base" = "$ANIME_SCHEDULE" ]; then real_last="$last"; fi
  if [ "$base" = "$ANIME_MIXED" ]; then mixed_last="$last"; fi
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
  # Cada dia das Misturadas lê as respostas do Anime do dia (P25): ela nunca passa do fim dele.
  [[ ! "$mixed_last" > "$real_last" ]] \
    || fail "$ANIME_MIXED: o último dia novo ($mixed_last) passa do fim da agenda do Anime ($real_last), P25"
fi
if has "$ANIME_FIXTURE_SCHEDULE"; then
  check_schedule "$ANIME_FIXTURE_SCHEDULE" "Agenda fictícia do Anime (só desenvolvimento)" "$ANIME_FIXTURE_CATALOG" anime
fi
if has "$ANIME_FIXTURE_MIXED"; then
  check_schedule "$ANIME_FIXTURE_MIXED" "Agenda fictícia das Misturadas (só desenvolvimento)" "$ANIME_FIXTURE_CATALOG" anime-mixed
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
