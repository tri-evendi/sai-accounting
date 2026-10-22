#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# BUNDEL RILIS LURING (tahap D — saluran rilis on-premise)
#
#   sh scripts/onprem-offline-bundle.sh --tag 0.10.3                 # ke ./dist-luring
#   sh scripts/onprem-offline-bundle.sh --tag 0.10.3 --keluar /tmp/x
#   sh scripts/onprem-offline-bundle.sh --tag 0.10.3 --dry-run       # sebut isi; tidak menarik apa pun
#
# Untuk customer yang mesinnya TIDAK boleh menjangkau registry. Isinya:
#
#   <image>.tar.gz   satu arsip `docker save` per image — yang SAI DAN yang hulu
#                    (postgres, pgbouncer): mesin tanpa registry tidak bisa
#                    menarik `postgres:17-alpine` juga
#   docker-compose.yml + docker-compose.onprem.yml + .env.docker.example
#   images.txt       nama image + ID-nya (sha256) — dicocokkan sesudah `docker load`
#   BACA.txt         langkah pasang, untuk orang di sisi customer
#   SHA256SUMS       checksum setiap berkas di atas; `sha256sum -c` SEBELUM memuat
#
# ══ DAFTAR IMAGE DIBACA DARI COMPOSE, TIDAK DITULIS DI SINI ════════════════
# Daftar tulis tangan adalah daftar ketiga yang bisa menyimpang dari compose
# dan matriks publish (`tests/image-compose-sepadan.test.ts` menjaga dua yang
# lain). Yang menyimpang di sini gagal paling mahal: customer yang mendapati
# satu image hilang SESUDAH bundel menyeberang ke mesin tanpa jaringan. Karena
# itu daftarnya keluaran `docker compose config --images` atas kedua berkas
# compose yang DIKIRIM — layanan `tidak-dipasang` tersaring oleh compose sendiri,
# dan `--profile perkakas` mengikutkan `job-backup` (pembukti pemulihan).
#
# ══ TAG WAJIB VERSI PERSIS ═════════════════════════════════════════════════
# `latest` ditolak, alasannya sama dengan `${SAI_TAG:?}` di profil on-premise:
# bundel yang isinya berpindah setiap kali CI mendorong bukan rilis.
#
# Dijaga `tests/release-channel.test.ts`. Dijalankan job `offline-bundle` di
# `.github/workflows/publish-image.yml` pada setiap tag `v*`.
# ═══════════════════════════════════════════════════════════════════════════
set -eu

TAG=""
KELUAR="./dist-luring"
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="$2"; shift 2 ;;
    --keluar) KELUAR="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "argumen tak dikenal: $1" >&2; exit 2 ;;
  esac
done

log() { echo "[bundel-luring] $*"; }
die() { echo "[bundel-luring] GAGAL: $*" >&2; exit 1; }

TAG="${TAG#v}"
[ -n "$TAG" ] || die "--tag wajib, versi persis (mis. 0.10.3)."
case "$TAG" in
  latest|stable|*[!0-9A-Za-z.+-]*) die "tag '$TAG' bukan versi persis — bundel luring tidak boleh berpindah isi." ;;
esac

command -v docker >/dev/null 2>&1 || die "docker tidak ditemukan di PATH."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum tidak ditemukan di PATH."

# `env_file: .env` di compose dasar membuat `config` gagal bila berkasnya tidak
# ada (runner CI). Berkas kosong cukup untuk MEMBACA daftar image; ia dibuang
# lagi dan tidak pernah ikut bundel.
ENV_SEMENTARA=0
if [ ! -f .env ]; then
  : > .env
  ENV_SEMENTARA=1
fi
IMAGES="$(SAI_TAG="$TAG" docker compose \
  -f docker-compose.yml -f docker-compose.onprem.yml --profile perkakas \
  config --images | sort -u)"
[ "$ENV_SEMENTARA" = "1" ] && rm -f .env

[ -n "$IMAGES" ] || die "compose tidak menyebut satu image pun."
JUMLAH_SAI=0
for img in $IMAGES; do
  case "$img" in
    *:latest) die "image '$img' bertag latest — profil on-premise harus mematok versi." ;;
    *sai-accounting*:"$TAG") JUMLAH_SAI=$((JUMLAH_SAI + 1)) ;;
    *sai-accounting*) die "image SAI '$img' tidak bertag $TAG." ;;
  esac
done
# app-customer · -migrator · -backup · -integrator. Kurang dari itu berarti
# compose berubah bentuk dan daftar ini diam-diam menyusut.
[ "$JUMLAH_SAI" -ge 4 ] || die "hanya $JUMLAH_SAI image SAI terbaca dari compose (minimal 4)."

if [ "$DRY" = "1" ]; then
  log "DRY-RUN — bundel ${TAG} AKAN memuat:"
  for img in $IMAGES; do log "  $img"; done
  log "  docker-compose.yml · docker-compose.onprem.yml · .env.docker.example"
  log "  images.txt · BACA.txt · SHA256SUMS"
  exit 0
fi

mkdir -p "$KELUAR"
: > "$KELUAR/images.txt"

for img in $IMAGES; do
  # Nama berkas dari nama image: `/` dan `:` tidak aman di nama berkas.
  berkas="$(echo "$img" | sed -e 's#^.*/##' -e 's#:#_#g').tar.gz"
  log "tarik & simpan $img → $berkas"
  docker pull --quiet "$img" >/dev/null || die "gagal menarik $img."
  docker save "$img" | gzip -6 > "$KELUAR/$berkas"
  printf '%s\t%s\t%s\n' "$img" "$(docker image inspect --format '{{.Id}}' "$img")" "$berkas" \
    >> "$KELUAR/images.txt"
done

cp docker-compose.yml docker-compose.onprem.yml "$KELUAR/"
[ -f .env.docker.example ] && cp .env.docker.example "$KELUAR/"

cat > "$KELUAR/BACA.txt" <<EOF
SAI Accounting ${TAG} — bundel rilis luring (on-premise)

1. Periksa keutuhan SEBELUM memuat apa pun:
     sha256sum -c SHA256SUMS
   Satu baris yang tidak "OK" berarti bundel rusak di jalan — minta ulang,
   jangan dimuat.

2. Muat image:
     for f in *.tar.gz; do docker load -i "\$f"; done
   Cocokkan ID-nya dengan images.txt (docker image ls --digests).

3. Pasang / perbarui dengan versi yang DIPATOK:
     export SAI_TAG=${TAG}
     docker compose -f docker-compose.yml -f docker-compose.onprem.yml up -d --pull never
   '--pull never' wajib di mesin tanpa registry: profil on-premise memakai
   'pull_policy: always', yang di sini hanya akan gagal menjangkau jaringan.

4. Berkas lisensi di ./lisensi/licence.sai (hanya-baca di container).
   Lisensi tidak pernah menutup pembukuan; tanpa berkas, modul dibatasi ke inti.

Serah terima lengkap: docs/ONPREM-SERAH-TERIMA.md di repo SAI.
EOF

( cd "$KELUAR" && sha256sum -- $(ls | grep -v '^SHA256SUMS$') > SHA256SUMS )

log "selesai: ${KELUAR}"
log "$(wc -l < "$KELUAR/images.txt") image · checksum di ${KELUAR}/SHA256SUMS"
