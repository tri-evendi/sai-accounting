#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# CADANGAN OTOMATIS (issue #374)
#
#   sh scripts/backup.sh              # cadangkan & kirim
#   sh scripts/backup.sh --dry-run    # cetak yang AKAN dikerjakan; tidak menulis
#                                     # apa pun ke luar, tidak menghapus apa pun
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
die() { echo "[backup] GAGAL: $*" >&2; exit 1; }

# ── Konfigurasi ────────────────────────────────────────────────────────────
: "${DB_HOST:=db}"
: "${DB_PORT:=3306}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_PREFIX:=sai}"
: "${BACKUP_DATA_DIR:=/app/data}"
: "${BACKUP_WORK_DIR:=/tmp/backup}"

[ -n "${DB_ROOT_PASSWORD:-}" ] || die "DB_ROOT_PASSWORD belum diset — dump seluruh basis data menuntut root."
[ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || die "BACKUP_ENCRYPTION_KEY belum diset. Cadangan TIDAK PERNAH dikirim tanpa sandi: isinya seluruh pembukuan setiap pelanggan."
[ -n "${BACKUP_S3_BUCKET:-}" ] || die "BACKUP_S3_BUCKET belum diset — cadangan yang tinggal di mesin yang sama bukan cadangan."

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${BACKUP_PREFIX}-${STAMP}"
DEST="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-cadangan}"

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
printf '[client]\nhost=%s\nport=%s\nuser=root\npassword=%s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_ROOT_PASSWORD" > "$OPTFILE"

cleanup() { rm -rf "$BACKUP_WORK_DIR"; }
trap cleanup EXIT INT TERM

# ── 1. Dump SELURUH basis data ─────────────────────────────────────────────
# `--single-transaction` = snapshot konsisten tanpa mengunci tabel InnoDB;
# produksi tetap melayani permintaan selama dump berjalan.
# `--routines --events --triggers` supaya yang dipulihkan benar-benar sama.
DUMP="${BACKUP_WORK_DIR}/semua-basis-data.sql"
log "dump seluruh basis data → $(basename "$DUMP")"
if [ "$DRY_RUN" = "0" ]; then
  mariadb-dump --defaults-extra-file="$OPTFILE" \
    --all-databases --single-transaction --quick \
    --routines --events --triggers \
    --default-character-set=utf8mb4 > "$DUMP" \
    || die "mariadb-dump gagal — cadangan TIDAK dikirim."
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
  # shellcheck disable=SC2086
  aws s3 cp $S3_ARGS "$SEALED" "${DEST}/$(basename "$SEALED")" \
    || die "unggah gagal — cadangan lama TIDAK dipangkas."
  # shellcheck disable=SC2086
  aws s3 cp $S3_ARGS "${SEALED}.sha256" "${DEST}/$(basename "$SEALED").sha256" \
    || die "unggah sidik jari gagal — cadangan lama TIDAK dipangkas."
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
  log "  (dry-run) tidak menghapus apa pun"
fi

log "selesai — ${NAME}"
