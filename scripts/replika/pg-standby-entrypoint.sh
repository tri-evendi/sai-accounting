#!/bin/sh
# Entrypoint `db-postgres-standby` (tahap 2): standby STREAMING dari primary.
#
# Volume kosong → `pg_basebackup` dari primary (`-R` menulis `standby.signal`
# + `primary_conninfo`), lalu postgres start sebagai hot standby yang menerima
# WAL terus-menerus. Volume berisi → langsung start; standby melanjutkan dari
# posisi terakhirnya lewat SLOT REPLIKASI di primary.
#
# ⚠ Slot membuat primary MENAHAN WAL sampai standby mengambilnya. Standby yang
# mati lama berarti disk primary terisi — karena itu primary di
# `docker-compose.replika.yml` memasang `max_slot_wal_keep_size`: lewat batas
# itu slotnya dibatalkan dan standby wajib dibasebackup ulang (kosongkan
# volumenya), alih-alih primary yang berhenti karena disk penuh.
#
# ⚠ Standby menyalin SETIAP perintah, termasuk yang salah (`DROP`, `DELETE`
# tanpa `WHERE`). Ia melindungi dari host yang mati, bukan dari kesalahan —
# yang terakhir urusan cadangan per basis data (jalur `tenant` di `svc-integrator`) dan PITR (02 §17).
set -eu

: "${PG_REPLICATION_PASSWORD:?setel PG_REPLICATION_PASSWORD}"
PRIMARY="${PG_PRIMARY_HOST:-pg}"
PORT="${PG_PRIMARY_PORT:-5432}"
ROLE="${PG_REPLICATION_USER:-replikator}"
SLOT="${PG_STANDBY_SLOT:-standby_1}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export PGDATA

mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[standby] volume kosong — basebackup dari ${PRIMARY}:${PORT} (slot ${SLOT})"
  until pg_isready -h "$PRIMARY" -p "$PORT" -q; do sleep 2; done
  export PGPASSWORD="$PG_REPLICATION_PASSWORD"
  # `-C` membuat slotnya. Slot yang SUDAH ADA (standby dibasebackup ulang
  # sesudah volumenya dikosongkan) membuat `-C` gagal — maka percobaan kedua
  # memakai slot itu apa adanya.
  if ! gosu postgres pg_basebackup -h "$PRIMARY" -p "$PORT" -U "$ROLE" -D "$PGDATA" \
      -X stream -R -C -S "$SLOT" --checkpoint=fast; then
    echo "[standby] basebackup dengan -C gagal (biasanya: slot ${SLOT} sudah ada) — mencoba memakai slot itu"
    find "$PGDATA" -mindepth 1 -delete
    gosu postgres pg_basebackup -h "$PRIMARY" -p "$PORT" -U "$ROLE" -D "$PGDATA" \
      -X stream -R -S "$SLOT" --checkpoint=fast
  fi
  unset PGPASSWORD
  echo "[standby] basebackup selesai"
fi

exec gosu postgres postgres -c hot_standby=on
