#!/usr/bin/env bash
# Tarefa catalog-pr do update-catalog.yml: confere, só com jq e coreutils, cada arquivo que veio
# da tarefa que roda o pipeline (e os pacotes do pip), copia para a árvore e monta o PR. Roda com
# o token de escrita por perto, então não chama Python nem nada do projeto além deste script, que
# vem da main. Testado em pipeline/tests/test_catalog_pr_script.py (precisa de jq).
#
# Entrada (ambiente): TODAY, FETCH (resultado do passo de busca: success ou failure), RUN_URL, os
# caminhos SNAPSHOTS, ROMAJI, CATALOG, SCHEDULE e FIXTURE_SCHEDULE (relativos à raiz, que é a
# pasta atual, um checkout da main), RUNNER_TEMP (com o artefato em artifact/) e GITHUB_OUTPUT.
# Saída: os arquivos na árvore, $RUNNER_TEMP/pr-body.md e branch/title no GITHUB_OUTPUT.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data inválida: $TODAY"
art="$RUNNER_TEMP/artifact"
snapshot="$SNAPSHOTS/$TODAY.json"
allowed=("$snapshot" "$ROMAJI" "$CATALOG" "$SCHEDULE" "$FIXTURE_SCHEDULE")

# 1. O artefato veio da outra tarefa: só arquivos comuns da lista fechada, e a lista declarada é
#    exatamente o que veio.
[ -f "$art/changed.txt" ] || fail "artefato sem changed.txt"
mapfile -t changed < "$art/changed.txt"
[ "${#changed[@]}" -gt 0 ] || fail "artefato sem arquivos"
for path in "${changed[@]}"; do
  ok=false
  for a in "${allowed[@]}"; do
    if [ "$path" = "$a" ]; then ok=true; fi
  done
  [ "$ok" = true ] || fail "arquivo fora da lista fechada: $path"
done
[ -z "$(find "$art/files" ! -type f ! -type d)" ] || fail "o artefato traz algo que não é arquivo comum"
got="$(cd "$art/files" && find . -type f | sed 's|^\./||' | sort)"
want="$(printf '%s\n' "${changed[@]}" | sort)"
[ "$got" = "$want" ] || fail "os arquivos do artefato não batem com a lista declarada"

has() {
  local p
  for p in "${changed[@]}"; do
    if [ "$p" = "$1" ]; then return 0; fi
  done
  return 1
}
new() { echo "$art/files/$1"; }

# 2. Snapshot, catálogo e romaji andam juntos: só a parada nova muda o catálogo e traz texto novo.
if has "$snapshot"; then
  has "$CATALOG" || fail "snapshot novo sem catálogo novo"
  [ ! -e "$snapshot" ] || fail "o snapshot de hoje já existe na main"
  jq -e --arg d "$TODAY" '.provider == "apple" and .storefront == "jp" and .date == $d
    and (.rss | type == "array" and length > 0 and length <= 100)
    and (.tracks | type == "object") and (.artists | type == "object")
    and (.missing | type == "array")' "$(new "$snapshot")" > /dev/null \
    || fail "snapshot de hoje fora da forma esperada"
else
  if has "$CATALOG"; then fail "catálogo mudou sem parada nova"; fi
  if has "$ROMAJI"; then fail "romaji mudou sem parada nova"; fi
fi

# 3. Romaji: só acréscimo, com o mesmo motor e as mesmas versões; o já revisado não muda.
romaji_list=""
if has "$ROMAJI"; then
  jq -e -n --slurpfile b "$ROMAJI" --slurpfile n "$(new "$ROMAJI")" '
    ($b[0] | del(.entries)) == ($n[0] | del(.entries))
    and ($b[0].entries | to_entries | all(.value == $n[0].entries[.key]))
    and ($n[0].entries | to_entries
         | all(.value | type == "array" and length > 0 and all(type == "string")))' > /dev/null \
    || fail "o romaji novo altera o que já existe"
  # Vai num bloco de código no PR: título com @ ou ] não vira menção nem link, e o ~ sai para não
  # fechar o bloco.
  romaji_list="$(jq -r -n --slurpfile b "$ROMAJI" --slurpfile n "$(new "$ROMAJI")" '
    ($n[0].entries | keys) - ($b[0].entries | keys) | .[]
    | "\(.) → \($n[0].entries[.] | join(" / "))" | gsub("~"; "-")')"
fi

# 4. Catálogo: nenhum id da main some (o catálogo é cumulativo), as URLs ficam nos hosts da Apple
#    (vão para href, src e áudio) e os snapshots da main seguem intactos, com o de hoje no fim.
catalog_line=""
if has "$CATALOG"; then
  # \A e \z, e não ^ e $: no jq (Oniguruma) estes podem casar no começo e no fim de cada linha, e
  # um valor com quebra de linha passaria.
  jq -e -n --slurpfile b "$CATALOG" --slurpfile n "$(new "$CATALOG")" \
    --slurpfile s "$(new "$snapshot")" --arg d "$TODAY" '
    def ids($k): [.[$k][].id];
    def apple($host): type == "string" and test("\\Ahttps://" + $host + "/[^\\s\\\\]+\\z");
    $b[0] as $b | $n[0] as $n | $s[0] as $s | ($n.snapshots | last) as $l
    | $n.schemaVersion == $b.schemaVersion and $n.provider == "apple"
      and (["tracks", "albums", "artists"] | all(. as $k | ($b | ids($k)) - ($n | ids($k)) == []))
      and ($n.tracks | all(
            (.preview == null or (.preview.url | apple("audio-ssl\\.itunes\\.apple\\.com")))
            and (.storeUrl == null or (.storeUrl | apple("music\\.apple\\.com")))))
      and ($n.albums | all(.artworkUrl == null or (.artworkUrl | apple("is[0-9]+-ssl\\.mzstatic\\.com"))))
      and ($n.snapshots | length) == ($b.snapshots | length) + 1
      and $n.snapshots[: ($b.snapshots | length)] == $b.snapshots
      and $l.id == $d and $l.date == $d and $l.chart == $s.chart and $l.fetchedAt == $s.fetchedAt
      and ($l.size | type == "number" and . >= 1 and . <= ($s.rss | length))' > /dev/null \
    || fail "o catálogo novo perde ids, sai dos hosts da Apple ou não bate com os snapshots"
  catalog_line="$(jq -r -n --slurpfile b "$CATALOG" --slurpfile n "$(new "$CATALOG")" \
    --slurpfile s "$(new "$snapshot")" '
    ($n[0].tracks | length) as $total
    | (($n[0].tracks | map(.id)) - ($b[0].tracks | map(.id)) | length) as $fresh
    | "- **Parada da Apple de hoje:** \($s[0].rss | length) faixas; **\($fresh) nova(s)** no catálogo, que passa a ter \($total)."')"
elif [ "$FETCH" = "failure" ]; then
  catalog_line="- **Parada da Apple:** não veio hoje (a busca falhou; veja a execução). O PR traz só a agenda; a parada vem na semana que vem."
else
  catalog_line="- **Parada da Apple:** igual à da última busca; o catálogo não muda."
fi

# A busca falhar uma semana é normal (a Apple fora do ar); falhar várias seguidas sugere que o
# fetch quebrou. O PR avisa, sem travar a agenda, que precisa continuar crescendo.
stale_line=""
if ! has "$snapshot"; then
  last_snap="$(find "$SNAPSHOTS" -maxdepth 1 -type f -name '????-??-??.json' -printf '%f\n' | sort | tail -n 1)"
  last_snap="${last_snap%.json}"
  if [ -n "$last_snap" ]; then
    today_s="$(date -ud "$TODAY" +%s)"
    snap_s="$(date -ud "$last_snap" +%s)"
    age=$(( (today_s - snap_s) / 86400 ))
    if [ "$age" -gt 13 ]; then
      stale_line="> **Atenção:** a última parada guardada é de $last_snap ($age dias). Confira a execução: a busca da Apple pode estar quebrada."
      echo "::warning::a última parada guardada é de $last_snap ($age dias)"
    fi
  fi
fi

# 5. Agendas: o mesmo cabeçalho, todo dia da main igual e os dias novos em sequência, a partir do
#    dia seguinte ao fim da agenda, ou de hoje, se esse dia já passou (P44: o buraco nunca é
#    preenchido nem cresce além do necessário).
schedule_lines=""
gap_lines=""
real_last=""
check_schedule() {
  local base="$1" label="$2" fresh base_last first last count expected base_s first_s last_s gap
  local -a added
  fresh="$(new "$base")"
  jq -e -n --slurpfile b "$base" --slurpfile n "$fresh" \
    '($b[0] | del(.days)) == ($n[0] | del(.days))
     and ($b[0].days | to_entries | all(.value == $n[0].days[.key]))
     and ((($n[0].days | keys) - ($b[0].days | keys)) | all(test("\\A[0-9]{4}-[0-9]{2}-[0-9]{2}\\z")))' > /dev/null \
    || fail "$base: a agenda nova altera o que já existe ou traz data inválida"
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
  # Cada data numa variável: se o date falhar, o script para (em vez de a conta sair errada).
  base_s="$(date -ud "$base_last" +%s)"
  first_s="$(date -ud "$first" +%s)"
  last_s="$(date -ud "$last" +%s)"
  [ "$count" -eq $(( (last_s - first_s) / 86400 + 1 )) ] || fail "$base: há buraco entre os dias novos"
  gap=$(( (first_s - base_s) / 86400 - 1 ))
  schedule_lines+="- **$label:** $count dia(s) novo(s), de $first a $last (a da main vai até $base_last)."$'\n'
  if [ "$gap" -gt 0 ]; then
    gap_lines+="> **Atenção ($label):** $gap dia(s) ficaram sem desafio depois de $base_last: dia que já passou não é gerado (P44). Faça o merge hoje."$'\n'
  fi
  if [ "$base" = "$SCHEDULE" ]; then real_last="$last"; fi
}
if has "$SCHEDULE"; then check_schedule "$SCHEDULE" "Agenda do site"; fi
if has "$FIXTURE_SCHEDULE"; then check_schedule "$FIXTURE_SCHEDULE" "Agenda das fixtures (só desenvolvimento)"; fi

# 6. Tudo conferido: os arquivos entram na árvore, e o corpo do PR é montado.
for path in "${changed[@]}"; do
  mkdir -p "$(dirname "$path")"
  cp "$art/files/$path" "$path"
done
{
  echo "Parada e agenda de $TODAY (gerado pela Action \`update-catalog.yml\`)."
  echo
  echo "$catalog_line"
  printf '%s' "$schedule_lines"
  echo "- Mudou só o que a lista fechada permite, conferido aqui com \`jq\` e de novo pela CI (\`validate\`, \`schedule-check\` e os testes)."
  if [ -n "$gap_lines" ]; then
    echo
    printf '%s' "$gap_lines"
  fi
  if [ -n "$stale_line" ]; then
    echo
    echo "$stale_line"
  fi
  if [ -n "$romaji_list" ]; then
    echo
    echo "**Romaji novo para revisar** (cutlet). Se algum estiver errado, corrija no \`pipeline/data/apple/aliases.toml\` num PR à parte:"
    echo
    echo "~~~text"
    echo "$romaji_list"
    echo "~~~"
  fi
  echo
  echo "**Para publicar:** aprove as checagens em \"Approve workflows to run\"; com \`pipeline\`, \`web\` e \`e2e\` verdes, faça o merge (merge commit). O merge dispara o deploy."
  echo
  echo "Execução que gerou este PR: $RUN_URL"
} > "$RUNNER_TEMP/pr-body.md"
if has "$snapshot"; then
  title="chore: parada de $TODAY"
else
  title="chore: agenda de $TODAY"
fi
if [ -n "$real_last" ]; then title="$title (agenda até $real_last)"; fi
{
  echo "branch=catalogo/$TODAY"
  echo "title=$title"
} >> "$GITHUB_OUTPUT"
