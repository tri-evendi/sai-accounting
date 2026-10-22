#!/bin/sh
# Siapkan PRIMARY PostgreSQL untuk menerima standby streaming (tahap 2).
#
# Dijalankan MANUAL, sekali per primary — primary produksi yang sudah berisi
# data maupun primary baru di host lain, resep yang sama:
#
#   docker compose exec -T -e PG_REPLICATION_PASSWORD=... pg \
#     sh -s < scripts/replika/pg-primary-prepare.sh
#
# Sengaja TIDAK dipasang ke /docker-entrypoint-initdb.d: skrip initdb tidak
# pernah berjalan di atas volume yang sudah berisi (jadi tidak menolong primary
# produksi), dan berkas `.sh` tanpa bit eksekusi DI-SOURCE ke dalam entrypoint
# image — `set -eu` di bawah akan ikut mengubah tingkah entrypoint itu.
#
# Yang dilakukan, idempoten (aman dijalankan ulang):
#   • peran `${PG_REPLICATION_USER:-replikator}` ber-REPLICATION + LOGIN, sandinya
#     disetel ulang ke `PG_REPLICATION_PASSWORD` setiap kali;
#   • satu baris `host replication` di pg_hba.conf untuk peran itu SAJA (bukan
#     `all`): peran replikasi membaca SELURUH klaster, termasuk setiap buku PT;
#   • `pg_reload_conf()` — tanpa restart.
#
# `wal_level`, `max_wal_senders`, `max_replication_slots`, dan
# `max_slot_wal_keep_size` TIDAK di sini: itu argumen `postgres -c` di
# `docker-compose.replika.yml`, karena pengaturan yang menuntut restart tidak
# boleh tersembunyi di skrip yang terlihat "sudah dijalankan".
set -eu

: "${PG_REPLICATION_PASSWORD:?setel PG_REPLICATION_PASSWORD — sandi peran replikasi}"
ROLE="${PG_REPLICATION_USER:-replikator}"
# `samenet` = subnet tempat server terhubung langsung (jaringan compose).
# Standby di HOST LAIN butuh CIDR-nya sendiri, mis. 10.0.2.0/24.
CIDR="${PG_REPLICATION_CIDR:-samenet}"
SUPER="${POSTGRES_USER:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$SUPER" --dbname postgres \
  -v role="$ROLE" -v pass="$PG_REPLICATION_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I WITH REPLICATION LOGIN', :'role')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH REPLICATION LOGIN PASSWORD %L', :'role', :'pass') \gexec
SQL

HBA="${PGDATA:?PGDATA tidak disetel — jalankan di dalam container pg}/pg_hba.conf"
LINE="host replication ${ROLE} ${CIDR} scram-sha-256"
if ! grep -qxF "$LINE" "$HBA"; then
  echo "$LINE" >> "$HBA"
  echo "[replika] pg_hba: ditambahkan '$LINE'"
fi

psql -v ON_ERROR_STOP=1 --username "$SUPER" --dbname postgres -c 'SELECT pg_reload_conf();' >/dev/null
echo "[replika] primary siap menerima standby (peran ${ROLE})."
