#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# CADANGAN — ALAT TANGAN sejak tahap 1b (issue #374)
#
#   sh scripts/backup.sh              # cadangkan & kirim
#   sh scripts/backup.sh --dry-run    # cetak yang AKAN dikerjakan; tidak menulis
#                                     # apa pun ke luar, tidak menghapus apa pun
#
# ══ TIDAK LAGI DIJADWALKAN ═════════════════════════════════════════════════
# Yang mencadangkan sekarang `svc-tenant` (jalur `tenant`, Go), dan ia
# mencadangkan SATU OBJEK PER BASIS DATA — menutup celah on-premise #5:
# `pg_dumpall` di bawah berarti satu tenant tidak bisa dipulihkan tanpa
# menyentuh tenant lain, padahal "pulihkan data kami saja ke keadaan Selasa"
# adalah permintaan biasa di SaaS berbayar (rancangan §1, §6).
#
# Skrip ini TETAP ADA, dan bukan karena belum dibereskan. Tiga gunanya:
#
#   1. jalan mundur bertangan bila jalur antrean sedang tidak bisa dipakai;
#   2. satu-satunya yang bisa mendump MariaDB — artefak dari sebelum penukaran
#      15 Okt 2026 masih satu-satunya salinan dari masa itu;
#   3. rujukan FORMAT. Artefak `svc-tenant` memakai `openssl enc` yang sama
#      persis seperti di bawah, byte per byte — supaya prosedur pemulihan tidak
#      bercabang, dan supaya hari pemulihan tidak menuntut biner Go.
#
# ⚠ Jangan menjadwalkannya kembali di `docker-compose.yml`. Dua pelaksana untuk
# satu pekerjaan adalah dua `pg_dump` yang berebut IO di kotak yang satu
# dumpnya saja pekerjaan berat; dijaga `tests/backup-script.test.ts`.
#
# ══ APA YANG DICADANGKAN, DAN KENAPA DAFTARNYA SEPANJANG INI ═══════════════
# Sejak #104 buku besar setiap PT ada di basis datanya SENDIRI, jadi jumlah
# objek yang harus dicadangkan tumbuh seiring jumlah pelanggan. Dan sejak
# #367/#370 daftarnya bukan lagi hanya basis data:
#
#   • SELURUH basis data (kendali, platform, dan setiap buku PT) — satu dump
#     `--all-databases`, bukan daftar yang diketik tangan. Daftar yang diketik
#     tangan pasti tertinggal saat pelanggan baru mendaftar, dan cadangan
#     "hampir semua" adalah janji yang diingkari diam-diam (aturan yang sama
#     dengan sapuan `information_schema` di ekspor mandiri).
#   • `data/documents` — berkas dokumen (#367).
#   • `data/audit`     — jejak tenant & operator (#370).
#
# ══ KENAPA SHELL, BUKAN TYPESCRIPT ═════════════════════════════════════════
# Setiap langkah di sini adalah satu perkakas baku yang sudah terbukti:
# `mariadb-dump`, `tar`, `gzip`, `openssl`, `aws s3`. Menulis ulang orkestrasi
# sesederhana ini di TypeScript berarti menambah runtime dan lapisan yang harus
# dipercaya, tanpa menambah satu jaminan pun. Yang tidak sepele — apa yang
# dijamin skrip ini — dijaga `tests/backup-script.test.ts`.
#
# ══ URUTAN: DUMP → PADAT → SANDI → SIDIK → KIRIM → PANGKAS ═════════════════
# Enkripsi terjadi SEBELUM berkas meninggalkan mesin, tidak pernah sesudah.
# Sidik jari SHA-256 dihitung atas CIPHERTEXT dan ikut dikirim: AES-256-CBC
# tidak membawa pemeriksaan keutuhan sendiri, jadi tanpa berkas `.sha256` di
# sebelahnya, cadangan yang rusak di tengah jalan baru ketahuan pada hari kita
# paling tidak ingin menemukannya. Pemangkasan dikerjakan PALING AKHIR — dan
# hanya bila pengirimannya berhasil.
#
# ══ YANG TIDAK PERNAH DILAKUKAN SKRIP INI ══════════════════════════════════
# Tidak mencetak kredensial (kata sandi lewat berkas opsi, bukan argumen —
# argumen terbaca `ps`). Tidak menghapus apa pun sebelum unggahan sukses.
# Tidak pernah menyentuh basis data selain MEMBACA.
# ═══════════════════════════════════════════════════════════════════════════

set -eu

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "[backup] $*"; }

# ── Merekam putaran ini (issue #374) ───────────────────────────────────────
#
# Sampai #374, `die` hanya menulis ke stderr. Layanannya dibungkus `|| true` di
# docker-compose — sengaja, supaya satu putaran yang gagal tidak mematikan
# jadwal berikutnya — jadi kegagalan itu tidur 24 jam lalu terulang persis sama
# besok. Produksi berjalan 26 hari tanpa satu pun salinan dengan cara ini, dan
# tidak ada yang berbunyi ke luar sekali pun.
#
# Sekarang tiap putaran meninggalkan jejak yang bisa DITANYAI dari luar
# (`/api/health` → `backup`), bukan hanya baris log yang harus ditemukan
# seseorang lebih dulu.
#
# `|| true` pada perekamnya bukan pengulangan cacat yang sama, melainkan
# kebalikannya: mencatat tidak boleh menggagalkan mencadangkan. Yang hilang saat
# platform tak terjangkau cuma satu baris riwayat, dan denyutnya memulangkan
# `unknown` untuk ketiadaan itu — bukan `ok`.
BACKUP_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export BACKUP_STARTED_AT

rekam() {
  # `if`, bukan `[ … ] && return 0`: di bawah `set -e` bentuk kedua memulangkan
  # status 1 ketika tesnya salah, dan itu bisa menghentikan skrip di tengah
  # cadangan yang sedang berhasil.
  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  ( cd /app 2>/dev/null && bun run record:backup "$@" ) >/dev/null 2>&1 || true
}

die() {
  echo "[backup] GAGAL: $*" >&2
  rekam gagal "$*"
  exit 1
}

# ── Konfigurasi ────────────────────────────────────────────────────────────

# ── Mesin basis data: DITURUNKAN dari URL, bukan sakelar terpisah ──────────
#
# Sakelar sendiri (`DB_ENGINE=postgres`) bisa menyimpang dari URL-nya — satu
# disetel, satunya lupa — dan cadangan yang memakai perkakas mesin yang SALAH
# gagal dengan pesan yang tidak menyebut sebabnya. URL-nya sudah menyatakan
# mesinnya; satu sumber kebenaran.
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*) MESIN=postgres ;;
  *) MESIN=mariadb ;;
esac

# ── Host, port, dan kredensial: dari URL YANG SAMA ────────────────────────
#
# == CACAT YANG DIPERBAIKI DI SINI ========================================
# Mesinnya sudah diturunkan dari URL (di atas), tetapi HOST-nya tidak — ia
# berdiri sendiri sebagai `: "${DB_HOST:=db}"`. Sesudah penukaran PostgreSQL
# 15 Okt 2026, skrip ini memakai perkakas yang BENAR terhadap host yang SALAH:
#
#   pg_dumpall: error: connection to server at "db" (172.19.0.2), port 5432
#   failed: Connection refused
#
# Persis bentuk yang diperingatkan komentar tepat di atas. Dan akibatnya tidak
# terlihat di mana pun kecuali di `/api/health`: tidak ada cadangan otomatis
# yang berhasil sejak penukaran, sementara container `job-backup` tetap "Up"
# dan penjadwalnya tetap melapor `ok`.
#
# == KENAPA KREDENSIALNYA JUGA DARI URL ===================================
# `DB_ROOT_PASSWORD` adalah sandi root MariaDB. Memakainya untuk PostgreSQL
# berarti dua rahasia berbeda dipaksa menjadi satu, dan rotasi salah satunya
# akan mematahkan yang lain tanpa menyebutkannya.
uri_decode() {
  # Kredensial di URL ter-persen-encode. Dua skrip di repo ini pernah lupa
  # men-decode-nya dan gagal hanya ketika sandinya kebetulan memuat `@` / `%`.
  printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%\(..\)/\\x\1/g')"
}

if [ "$MESIN" = "postgres" ]; then
  _netloc=${DATABASE_URL#*://}
  _netloc=${_netloc%%/*}
  case "$_netloc" in
    *@*) _userinfo=${_netloc%@*} ; _hostport=${_netloc##*@} ;;
    *)   _userinfo=""            ; _hostport=$_netloc ;;
  esac
  case "$_hostport" in
    *:*) _host=${_hostport%:*} ; _port=${_hostport##*:} ;;
    *)   _host=$_hostport      ; _port=5432 ;;
  esac
  case "$_userinfo" in
    *:*) _user=${_userinfo%%:*} ; _pass=${_userinfo#*:} ;;
    *)   _user=$_userinfo       ; _pass="" ;;
  esac
  : "${DB_HOST:=$_host}"
  : "${DB_PORT:=$_port}"
  : "${DB_USER:=$(uri_decode "$_user")}"
  DB_SANDI=$(uri_decode "$_pass")
else
  : "${DB_HOST:=db}"
  : "${DB_PORT:=3306}"
  : "${DB_USER:=root}"
  DB_SANDI=${DB_ROOT_PASSWORD:-}
fi
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_PREFIX:=sai}"
: "${BACKUP_DATA_DIR:=/app/data}"
: "${BACKUP_WORK_DIR:=/tmp/backup}"

if [ "$MESIN" = "postgres" ]; then
  [ -n "$DB_SANDI" ] || die "DATABASE_URL tidak memuat sandi — dump seluruh basis data menuntut kredensial."
  [ -n "$DB_HOST" ] || die "DATABASE_URL tidak memuat host."
else
  [ -n "$DB_SANDI" ] || die "DB_ROOT_PASSWORD belum diset — dump seluruh basis data menuntut root."
fi
[ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || die "BACKUP_ENCRYPTION_KEY belum diset. Cadangan TIDAK PERNAH dikirim tanpa sandi: isinya seluruh pembukuan setiap pelanggan."
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${BACKUP_PREFIX}-${STAMP}"

# ── Tujuan: S3 bila disetel, kalau tidak LOKAL-SAJA ────────────────────────
#
# ══ KENAPA JALUR LOKAL ADA, SETELAH SKRIP INI DULU MENOLAK BERJALAN TANPA S3
# Sampai 12 Okt 2026 ketiadaan `BACKUP_S3_BUCKET` membuat skrip ini `die`
# SEBELUM dump pertama. Niatnya benar — "cadangan yang tinggal di mesin yang
# sama bukan cadangan" — tapi akibatnya terukur dan buruk: produksi berjalan
# 54 putaran dengan NOL artefak, sementara satu-satunya jaring adalah dump
# tangan yang kebetulan diambil saat rilis.
#
# Penolakan itu melindungi dari SATU bentuk kegagalan (kehilangan mesin) dengan
# membiarkan kita tanpa pertahanan apa pun terhadap semua bentuk lainnya:
# `DROP TABLE` yang keliru, migrasi yang merusak, kerusakan logis, berkas
# terhapus. Itu mayoritas kejadian yang sungguh terjadi.
#
# Maka sekarang: tanpa S3 ia TETAP mencadangkan, tersandi, ke cakram — dan
# merekam putarannya sebagai `lokal`, BUKAN `ok`. Bedanya penting dan bukan
# kosmetik: `/api/health` memulangkan `local_only`, dan `watch:backup` tetap
# mengirim surel tiap hari sampai tujuan di luar mesin disetel. Jaringnya
# dipasang tanpa satu pun klaim yang tidak benar.
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  MODE=s3
  DEST="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-cadangan}"
else
  MODE=lokal
  : "${BACKUP_LOCAL_DIR:=/app/data/cadangan}"
  DEST="$BACKUP_LOCAL_DIR"
  log "⚠ BACKUP_S3_BUCKET belum diset — menyalin ke ${DEST} SAJA."
  log "⚠ Salinan di mesin yang sama TIDAK menyelamatkan dari kehilangan mesin."
  log "⚠ Putaran ini akan dicatat 'lokal', dan kesehatan tetap berbunyi."
fi

# `--endpoint-url` hanya diteruskan bila diisi: kosong = AWS S3 sungguhan,
# terisi = penyedia S3-compatible mana pun (B2, Wasabi, IDCloudHost).
S3_ARGS=""
[ -n "${BACKUP_S3_ENDPOINT:-}" ] && S3_ARGS="--endpoint-url ${BACKUP_S3_ENDPOINT}"

log "mulai — ${NAME} (dry-run=${DRY_RUN})"
mkdir -p "$BACKUP_WORK_DIR"
ARCHIVE="${BACKUP_WORK_DIR}/${NAME}.tar.gz"
SEALED="${ARCHIVE}.enc"

# Berkas opsi: kata sandi TIDAK PERNAH jadi argumen baris perintah — argumen
# terbaca siapa pun yang bisa menjalankan `ps` di dalam container.
OPTFILE="${BACKUP_WORK_DIR}/my.cnf"
umask 077
if [ "$MESIN" = "mariadb" ]; then
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
    "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_SANDI" > "$OPTFILE"
fi

cleanup() { rm -rf "$BACKUP_WORK_DIR"; }
trap cleanup EXIT INT TERM

# ── 1. Dump SELURUH basis data ─────────────────────────────────────────────
# `--single-transaction` = snapshot konsisten tanpa mengunci tabel InnoDB;
# produksi tetap melayani permintaan selama dump berjalan.
# `--routines --events --triggers` supaya yang dipulihkan benar-benar sama.
DUMP="${BACKUP_WORK_DIR}/semua-basis-data.sql"
log "dump seluruh basis data (${MESIN}) → $(basename "$DUMP")"
if [ "$DRY_RUN" = "0" ]; then
  if [ "$MESIN" = "postgres" ]; then
    # `pg_dumpall` dan BUKAN `pg_dump`: yang dibutuhkan SELURUH basis data —
    # kendali, platform, dan setiap buku PT — persis alasan `--all-databases`
    # dipakai di jalur MariaDB. `pg_dump` hanya satu basis data, dan daftar
    # yang diketik tangan pasti tertinggal saat pelanggan baru mendaftar.
    #
    # `--clean --if-exists` supaya hasilnya bisa dipulihkan ke server yang sudah
    # berisi, bukan hanya ke server kosong — pada hari pemulihan, menuntut
    # server kosong adalah syarat yang mahal.
    #
    # Perannya diambil dari URL, BUKAN dipaku `postgres`. Peran yang dipaku
    # akan gagal di pemasangan mana pun yang memberi nama lain pada peran
    # super-nya — dan di sini namanya memang bukan `postgres`.
    PGPASSWORD="$DB_SANDI" pg_dumpall \
      --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
      --clean --if-exists > "$DUMP" \
      || die "pg_dumpall gagal — cadangan TIDAK dikirim."
  else
    mariadb-dump --defaults-extra-file="$OPTFILE" \
      --all-databases --single-transaction --quick \
      --routines --events --triggers \
      --default-character-set=utf8mb4 > "$DUMP" \
      || die "mariadb-dump gagal — cadangan TIDAK dikirim."
  fi
else
  log "  (dry-run) dilewati"
  : > "$DUMP"
fi

# ── 2. Padatkan bersama berkas yang bukan basis data ────────────────────────
log "kemas dump + data/documents + data/audit"
if [ "$DRY_RUN" = "0" ]; then
  tar -czf "$ARCHIVE" \
    -C "$BACKUP_WORK_DIR" "$(basename "$DUMP")" \
    -C "$BACKUP_DATA_DIR" documents audit \
    || die "tar gagal — cadangan TIDAK dikirim."
else
  log "  (dry-run) dilewati"
fi

# ── 3. Sandi SEBELUM meninggalkan mesin ────────────────────────────────────
# AES-256-CBC + PBKDF2. Kuncinya lewat `-pass env:` — bukan argumen, dengan
# alasan yang sama seperti berkas opsi di atas.
log "sandikan → $(basename "$SEALED")"
if [ "$DRY_RUN" = "0" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$ARCHIVE" -out "$SEALED" -pass env:BACKUP_ENCRYPTION_KEY \
    || die "enkripsi gagal — cadangan TIDAK dikirim."
  rm -f "$ARCHIVE"
else
  log "  (dry-run) dilewati"
fi

# ── 4. Sidik jari — AES-CBC tidak membawa pemeriksaan keutuhan sendiri ──────
log "sidik jari SHA-256"
if [ "$DRY_RUN" = "0" ]; then
  ( cd "$BACKUP_WORK_DIR" && sha256sum "$(basename "$SEALED")" > "$(basename "$SEALED").sha256" )
fi

# ── 5. Kirim KELUAR dari mesin ini ─────────────────────────────────────────
log "kirim ke ${DEST}/"
if [ "$DRY_RUN" = "0" ]; then
  if [ "$MODE" = "s3" ]; then
    # shellcheck disable=SC2086
    aws s3 cp $S3_ARGS "$SEALED" "${DEST}/$(basename "$SEALED")" \
      || die "unggah gagal — cadangan lama TIDAK dipangkas."
    # shellcheck disable=SC2086
    aws s3 cp $S3_ARGS "${SEALED}.sha256" "${DEST}/$(basename "$SEALED").sha256" \
      || die "unggah sidik jari gagal — cadangan lama TIDAK dipangkas."
  else
    # `mkdir -p` tiap putaran: volume yang baru dibuat datang kosong, dan satu
    # direktori yang hilang tidak boleh menjadi alasan nol cadangan.
    mkdir -p "$DEST" || die "tidak bisa membuat ${DEST} — cadangan TIDAK disalin."
    # Salin lalu pindahkan: `cp` yang terputus di tengah meninggalkan berkas
    # setengah yang namanya tampak sah, dan nama yang tampak sah itulah yang akan
    # dipercaya pada hari pemulihan.
    cp "$SEALED" "${DEST}/.$(basename "$SEALED").partial" \
      || die "salin ke cakram gagal — cadangan lama TIDAK dipangkas."
    mv "${DEST}/.$(basename "$SEALED").partial" "${DEST}/$(basename "$SEALED")" \
      || die "memindahkan salinan gagal — cadangan lama TIDAK dipangkas."
    cp "${SEALED}.sha256" "${DEST}/$(basename "$SEALED").sha256" \
      || die "salin sidik jari gagal — cadangan lama TIDAK dipangkas."
  fi
else
  log "  (dry-run) tidak mengunggah apa pun"
fi

# ── 6. Pangkas — PALING AKHIR, dan hanya setelah unggahan sukses ────────────
# Urutan ini yang membuat kegagalan tidak berbahaya: cadangan lama baru dibuang
# setelah ada yang baru menggantikannya di tempat tujuan. Kebalikannya —
# memangkas dulu — bisa meninggalkan kita tanpa cadangan sama sekali.
CUTOFF="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null \
  || date -u -v-"${BACKUP_RETENTION_DAYS}"d +%Y%m%d)"
log "pangkas yang lebih tua dari ${CUTOFF} (retensi ${BACKUP_RETENTION_DAYS} hari)"
if [ "$DRY_RUN" = "0" ]; then
  if [ "$MODE" = "s3" ]; then
    # shellcheck disable=SC2086
    aws s3 ls $S3_ARGS "${DEST}/" | awk '{print $4}' | grep -E "^${BACKUP_PREFIX}-[0-9]{8}T" | while read -r key; do
      keydate="$(echo "$key" | sed -E "s/^${BACKUP_PREFIX}-([0-9]{8})T.*/\1/")"
      if [ "$keydate" -lt "$CUTOFF" ]; then
        log "  buang $key"
        # shellcheck disable=SC2086
        aws s3 rm $S3_ARGS "${DEST}/${key}" || log "  ⚠ gagal membuang $key (dilewati)"
      fi
    done
  else
    # Pemangkasan lokal, dan SATU aturan tambahan yang tidak ada di jalur S3:
    # **yang paling baru tidak pernah dibuang**, berapa pun umurnya. Di S3 retensi
    # 30 hari tanpa pengecualian itu aman karena sumber lain masih ada; di sini
    # direktori ini adalah satu-satunya yang ada. Sebuah mesin yang mati sebulan
    # lalu hidup kembali tidak boleh menyalakan pemangkas yang menghapus salinan
    # terakhirnya sendiri — kegagalan yang bentuknya persis seperti keberhasilan.
    TERBARU="$(ls -1 "$DEST" 2>/dev/null | grep -E "^${BACKUP_PREFIX}-[0-9]{8}T.*\.enc$" | sort | tail -1 || true)"
    ls -1 "$DEST" 2>/dev/null | grep -E "^${BACKUP_PREFIX}-[0-9]{8}T" | while read -r key; do
      base="$(echo "$key" | sed -E 's/\.sha256$//')"
      [ "$base" = "$TERBARU" ] && continue
      keydate="$(echo "$key" | sed -E "s/^${BACKUP_PREFIX}-([0-9]{8})T.*/\1/")"
      if [ "$keydate" -lt "$CUTOFF" ]; then
        log "  buang $key"
        rm -f "${DEST}/${key}" || log "  ⚠ gagal membuang $key (dilewati)"
      fi
    done
  fi
else
  log "  (dry-run) tidak menghapus apa pun"
fi

# ── 7. Tinggalkan jejak yang bisa ditanyai dari LUAR ───────────────────────
# Ukurannya ikut dicatat: sebuah cadangan yang "berhasil" tapi 0 byte adalah
# kegagalan yang paling meyakinkan bentuknya, dan satu-satunya angka yang bisa
# membantahnya adalah ukurannya sendiri.
if [ "$DRY_RUN" = "0" ]; then
  UKURAN="$(wc -c < "$SEALED" 2>/dev/null | tr -d ' ' || echo '')"
  if [ "$MODE" = "s3" ]; then
    rekam ok "$(basename "$SEALED")" "$UKURAN"
  else
    # `lokal`, bukan `ok`. Satu kata ini yang menentukan apakah permukaan
    # kesehatan berkata benar: `ok` berarti ada salinan DI LUAR mesin ini.
    rekam lokal "$(basename "$SEALED")" "$UKURAN"
  fi
fi

log "selesai — ${NAME} (mode=${MODE})"
