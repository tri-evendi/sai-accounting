#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# BUNDEL DIAGNOSTIK (celah on-premise #6)
#
#   sh scripts/support-bundle.sh                 # rakit bundel di ./diagnostik
#   sh scripts/support-bundle.sh --keluar /tmp   # ke direktori lain
#   sh scripts/support-bundle.sh --log-baris 500 # ambil lebih banyak baris log
#   sh scripts/support-bundle.sh --tanpa-hitungan
#   sh scripts/support-bundle.sh --dry-run       # sebutkan isi; tidak menulis
#
# ══ MASALAH YANG DIBERESKANNYA ═════════════════════════════════════════════
# Di SaaS, ketika sesuatu rusak, SAI membaca log sendiri. Di on-premise log itu
# ada di mesin customer dan tidak terjangkau dari luar — jadi satu-satunya
# saluran diagnosis adalah apa yang customer kirimkan. Tanpa bentuk yang baku,
# yang terkirim adalah tangkapan layar galat dan jawaban bergantian selama
# berhari-hari, atau — jauh lebih buruk — seluruh direktori log yang memuat isi
# pembukuan dan menjadikan permintaan dukungan sebagai kebocoran data.
#
# ══ ALLOWLIST, BUKAN DENYLIST ══════════════════════════════════════════════
# Ini keputusan rancangan yang paling menentukan di berkas ini. Bundel TIDAK
# memuat log mentah lalu menyensor pola yang dikenal: daftar sensor selalu
# ketinggalan satu bentuk, dan yang lolos adalah justru yang tak pernah
# diduga. Yang dikerjakan sebaliknya — hanya baris yang COCOK dengan bentuk
# diagnostik yang dikenal (tingkat galat, nama kelas galat, bingkai tumpukan,
# kode galat Prisma/Postgres) yang masuk; semua yang lain dibuang tanpa
# diperiksa. Baris yang lolos masih disunting.
#
# Konsekuensinya jujur: bundel ini bisa KEHILANGAN petunjuk yang sebenarnya
# berguna. Itu pertukaran yang disengaja — bundel yang kurang satu baris log
# bisa diminta ulang dengan permintaan yang lebih sempit, sementara bundel yang
# membocorkan satu faktur tidak bisa ditarik kembali.
#
# ══ YANG TIDAK PERNAH MASUK ════════════════════════════════════════════════
# Nilai env (hanya NAMA-nya), berkas lisensi, kredensial dalam bentuk apa pun,
# BARIS basis data, berkas dokumen, arsip cadangan, dan log mentah.
#
# Yang ikut dan perlu diketahui customer SEBELUM mengirim: jumlah baris per
# tabel (angka, tanpa isi) dan nama perusahaan TIDAK ikut — lihat `manifes.txt`
# di dalam bundel, yang ditulis supaya bisa dibaca orang yang mengirimnya.
#
# ══ KENAPA SHELL ═══════════════════════════════════════════════════════════
# Alasan yang sama dengan `backup.sh`: setiap langkah di sini satu perkakas
# baku (`docker compose`, `psql`, `tar`, `sed`), dan bundel diagnostik harus
# bisa jalan justru ketika aplikasinya TIDAK bisa — menuntut runtime aplikasi
# untuk mendiagnosis aplikasi yang mati adalah lingkaran.
#
# Jaminan skrip ini dijaga `tests/support-bundle-script.test.ts`.
# ═══════════════════════════════════════════════════════════════════════════
set -eu

KELUAR="./diagnostik"
LOG_BARIS=200
HITUNGAN=1
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --keluar) KELUAR="$2"; shift 2 ;;
    --log-baris) LOG_BARIS="$2"; shift 2 ;;
    --tanpa-hitungan) HITUNGAN=0; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "argumen tak dikenal: $1" >&2; exit 2 ;;
  esac
done

log() { echo "[bundel] $*"; }
die() { echo "[bundel] GAGAL: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker tidak ditemukan di PATH."

CAP="$(date -u +%Y%m%dT%H%M%SZ)"
NAMA="diagnostik-${CAP}"
KERJA="${KELUAR}/${NAMA}"

# ── Penyuntingan ───────────────────────────────────────────────────────────
# Dipakai pada SETIAP baris yang lolos allowlist. Urutannya penting: kredensial
# di URI disunting sebelum pola angka, supaya sandi yang kebetulan berupa angka
# tidak lolos sebagai "angka biasa".
sunting() {
  sed -E \
    -e 's#(postgres|postgresql|mysql|redis|https?)://[^:/@[:space:]]+:[^@[:space:]]+@#\1://<kredensial>@#g' \
    -e 's#[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}#<surel>#g' \
    -e 's#(ey[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#<jwt>#g' \
    -e 's#((secret|token|key|password|sandi|passwd|authorization|bearer)[=: "'"'"']+)[^[:space:]"'"'"',]+#\1<disunting>#Ig' \
    -e 's#[0-9]{7,}#<angka>#g'
}

# ── Allowlist baris log ────────────────────────────────────────────────────
# Hanya bentuk yang memang dipakai untuk mendiagnosis. Apa pun di luar ini
# dibuang tanpa dibaca.
POLA_DIAGNOSTIK='(ERROR|FATAL|WARN|Error:|Exception|Unhandled|ECONN[A-Z]*|EACCES|ENOENT|ETIMEDOUT|EADDRINUSE|^[[:space:]]*at [^[:space:]]+ \(|PrismaClient[A-Za-z]*Error|\bP[0-9]{4}\b|\b[0-9]{5}\b: |Listening on|Ready in|started server|Migration|migrate (deploy|found)|out of memory|OOM|killed|SIGTERM|SIGKILL|healthcheck)'

if [ "$DRY" = "1" ]; then
  log "DRY-RUN — yang AKAN dirakit, tanpa menulis apa pun:"
  log "  ${KERJA}.tar.gz"
  log "    manifes.txt      daftar isi + yang sengaja TIDAK ikut"
  log "    versi.txt        tag & digest image, versi mesin"
  log "    layanan.txt      status container, kesehatan, jumlah restart"
  log "    sumber-daya.txt  disk, memori, snapshot stats"
  log "    skema.txt        nama migration yang terpasang per basis data"
  [ "$HITUNGAN" = "1" ] && log "    hitungan.txt     jumlah baris per tabel (angka saja)"
  log "    kesehatan.txt    keluaran /api/health"
  log "    log/<layanan>.log  baris diagnostik, disunting"
  exit 0
fi

mkdir -p "$KERJA/log"
trap 'rm -rf "$KERJA"' EXIT

# ── manifes ───────────────────────────────────────────────────────────────
{
  echo "BUNDEL DIAGNOSTIK SAI Accounting"
  echo "Dirakit : ${CAP} (UTC)"
  echo "Mesin   : $(uname -srm 2>/dev/null || echo '-')"
  echo
  echo "Berkas ini ditulis supaya bisa dibaca SEBELUM bundel dikirim."
  echo
  echo "YANG IKUT"
  echo "  versi.txt        tag & digest image yang berjalan, versi Docker & PostgreSQL"
  echo "  layanan.txt      status, kesehatan, dan jumlah restart tiap container"
  echo "  sumber-daya.txt  sisa disk, memori, snapshot penggunaan container"
  echo "  skema.txt        NAMA migration yang terpasang per basis data"
  if [ "$HITUNGAN" = "1" ]; then
    echo "  hitungan.txt     JUMLAH baris per tabel — angka, tanpa satu pun isinya"
  fi
  echo "  kesehatan.txt    keluaran /api/health"
  echo "  log/*.log        hanya baris log yang cocok bentuk diagnostik, lalu disunting"
  echo
  echo "YANG SENGAJA TIDAK IKUT"
  echo "  • Nilai variabel lingkungan — hanya NAMA-nya muncul, di versi.txt"
  echo "  • Berkas lisensi dan kredensial dalam bentuk apa pun"
  echo "  • BARIS basis data: tidak ada faktur, jurnal, nama pelanggan, atau nominal"
  echo "  • Berkas dokumen (data/documents) dan arsip cadangan"
  echo "  • Log MENTAH. Log diambil dengan allowlist, bukan dengan sensor:"
  echo "    hanya baris berbentuk diagnostik yang masuk, sisanya dibuang."
  echo
  echo "PENYUNTINGAN yang diterapkan pada baris yang lolos"
  echo "  kredensial di URI → <kredensial> · alamat surel → <surel>"
  echo "  token JWT → <jwt> · nilai setelah secret/token/key/password → <disunting>"
  echo "  deretan 7 angka atau lebih → <angka>  (nominal, telepon, NPWP)"
  if [ "$HITUNGAN" = "0" ]; then
    echo
    echo "CATATAN: dirakit dengan --tanpa-hitungan, jadi hitungan.txt tidak ada."
  fi
} > "$KERJA/manifes.txt"

# ── versi ─────────────────────────────────────────────────────────────────
{
  echo "── docker ──"
  docker version --format '{{.Server.Version}} (api {{.Server.APIVersion}})' 2>/dev/null || echo "-"
  docker compose version --short 2>/dev/null || echo "-"
  echo
  echo "── image yang berjalan ──"
  docker compose ps --format '{{.Service}}\t{{.Image}}' 2>/dev/null || echo "-"
  echo
  echo "── digest ──"
  for s in $(docker compose ps --services 2>/dev/null); do
    cid=$(docker compose ps -q "$s" 2>/dev/null | head -1)
    [ -n "$cid" ] || continue
    d=$(docker inspect --format '{{index .Image}}' "$cid" 2>/dev/null || echo '-')
    printf '%s\t%s\n' "$s" "$d"
  done
  echo
  echo "── PostgreSQL ──"
  docker compose exec -T pg psql -U postgres -tAc 'select version()' 2>/dev/null || echo "tak terjangkau"
  echo
  echo "── NAMA variabel lingkungan app-customer (tanpa nilai) ──"
  docker compose exec -T app-customer env 2>/dev/null | cut -d= -f1 | sort || echo "tak terjangkau"
} 2>&1 | sunting > "$KERJA/versi.txt"

# ── layanan ───────────────────────────────────────────────────────────────
{
  docker compose ps -a 2>/dev/null || echo "-"
  echo
  echo "── restart & keluar ──"
  for s in $(docker compose ps -a --services 2>/dev/null); do
    cid=$(docker compose ps -aq "$s" 2>/dev/null | head -1)
    [ -n "$cid" ] || continue
    docker inspect --format \
      '{{.Name}} restart={{.RestartCount}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} since={{.State.StartedAt}}' \
      "$cid" 2>/dev/null || true
  done
} 2>&1 | sunting > "$KERJA/layanan.txt"

# ── sumber daya ───────────────────────────────────────────────────────────
{
  echo "── disk ──"; df -h 2>/dev/null | head -20
  echo; echo "── memori ──"
  (free -h 2>/dev/null || vm_stat 2>/dev/null | head -8) || echo "-"
  echo; echo "── container ──"
  docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null || echo "-"
  echo; echo "── volume ──"
  docker system df -v 2>/dev/null | head -40 || echo "-"
} 2>&1 | sunting > "$KERJA/sumber-daya.txt"

# ── skema: NAMA migration, bukan isinya ───────────────────────────────────
# `migration_name` adalah pengenal di repo (`0007_tambah_kolom_x`), bukan data
# customer — dan justru inilah yang paling sering menjawab "kenapa kolom ini
# tidak ada": satu basis data perusahaan yang ketinggalan migration.
{
  echo "── daftar basis data & ukurannya ──"
  docker compose exec -T pg psql -U postgres -tAc \
    "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where datistemplate = false order by datname" \
    2>/dev/null || echo "tak terjangkau"
  echo
  echo "── migration terpasang per basis data ──"
  for db in $(docker compose exec -T pg psql -U postgres -tAc \
      "select datname from pg_database where datistemplate = false order by datname" 2>/dev/null); do
    echo "[$db]"
    docker compose exec -T pg psql -U postgres -d "$db" -tAc \
      "select migration_name, case when finished_at is null then 'BELUM SELESAI' else 'ok' end
         from _prisma_migrations order by migration_name" 2>/dev/null \
      || echo "  (tanpa tabel _prisma_migrations)"
  done
} 2>&1 | sunting > "$KERJA/skema.txt"

# ── hitungan baris: angka, tanpa isi ──────────────────────────────────────
if [ "$HITUNGAN" = "1" ]; then
  {
    for db in $(docker compose exec -T pg psql -U postgres -tAc \
        "select datname from pg_database where datistemplate = false order by datname" 2>/dev/null); do
      echo "[$db]"
      # `n_live_tup` adalah perkiraan dari statistik perencana — cukup untuk
      # diagnosis dan TIDAK menyentuh satu baris data pun, berbeda dengan
      # COUNT(*) yang memindai tabel di mesin yang mungkin sudah tertekan.
      docker compose exec -T pg psql -U postgres -d "$db" -tAc \
        "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 40" \
        2>/dev/null || echo "  tak terjangkau"
    done
  } 2>&1 | sunting > "$KERJA/hitungan.txt"
fi

# ── kesehatan ─────────────────────────────────────────────────────────────
{
  docker compose exec -T app-customer sh -lc \
    'wget -qO- http://127.0.0.1:3000/api/health || curl -sS http://127.0.0.1:3000/api/health' \
    2>/dev/null || echo "tak terjangkau"
} 2>&1 | sunting > "$KERJA/kesehatan.txt"

# ── log: allowlist lalu sunting ───────────────────────────────────────────
for s in $(docker compose ps -a --services 2>/dev/null); do
  docker compose logs --no-color --tail "$LOG_BARIS" "$s" 2>/dev/null \
    | grep -E "$POLA_DIAGNOSTIK" \
    | sunting > "$KERJA/log/${s}.log" || true
  if [ ! -s "$KERJA/log/${s}.log" ]; then
    echo "(tidak ada baris yang cocok bentuk diagnostik dalam ${LOG_BARIS} baris terakhir)" \
      > "$KERJA/log/${s}.log"
  fi
done

# ── bungkus ───────────────────────────────────────────────────────────────
trap - EXIT
ARSIP="${KELUAR}/${NAMA}.tar.gz"
tar -czf "$ARSIP" -C "$KELUAR" "$NAMA" || die "pembungkusan gagal."
rm -rf "$KERJA"

log "selesai: ${ARSIP}"
log "BACA ${NAMA}/manifes.txt di dalamnya sebelum mengirim — ia menyebutkan"
log "apa yang ikut dan apa yang sengaja ditinggalkan."
