#!/usr/bin/env bash
#
# PUTAR SANDI SATU PERAN POSTGRESQL
#
#   bash scripts/rotate-postgres-password.sh <superuser|owner|app|backup>
#
# Pembungkus tipis `scripts/postgres-roles.py rotate` — seluruh logikanya di
# sana, satu salinan, bersama pembuatan peran hak minimum yang memakai rumus
# sandi & `.env` yang sama.
#
# KAPAN DIPAKAI
#   - sandi pernah tercetak ke terminal / log / tiket
#   - orang yang pernah memegangnya tidak lagi perlu memegangnya
#   - rotasi berkala
#
# URUTANNYA (dikerjakan skrip, tidak bisa dibalik):
#   1. hitung `.env` baru DI MEMORI; berhenti bila sandi lama masih tersisa di
#      sana (URL yang tidak dikenali) — SEBELUM server disentuh;
#   2. bandingkan `docker compose config` sebelum vs sesudah → layanan yang
#      environment-nya berubah (bukan daftar tulisan tangan);
#   3. server: `ALTER ROLE … PASSWORD '<verifier SCRAM>'` lewat stdin;
#   4. `.env` (cadangan `.env.sebelum-putar-sandi-<peran>-<waktu>` dulu);
#   5. `up -d --no-deps` HANYA layanan yang berubah DAN sedang berjalan
#      (`pg` sendiri tidak pernah — POSTGRES_PASSWORD hanya berlaku saat init);
#   6. `https://$APP_DOMAIN/api/health` (domain dari `.env`).
#
# Yang diperbaiki dari versi sebelumnya (sesi 22 Okt 2026, tak pernah masuk repo):
#   • ia membuat ulang `job-scheduler`/`job-conformance`, layanan yang SUDAH
#     TIDAK ADA (kini `svc-worker`/`svc-integrator`) — `compose up` gagal
#     SESUDAH sandi server diganti, dan setiap koneksi baru ditolak: outage;
#   • ia memeriksa kesehatan di domain yang dipaku tangan, bukan `APP_DOMAIN`;
#   • sandi baru & lama lewat ARGV (`psql -v pw=…`, `python3 - LAMA BARU`,
#     `grep -F LAMA`) — terbaca siapa pun lewat `ps` di host.
#
# Kembalikan bila ada yang tidak sehat:
#   python3 scripts/postgres-roles.py rollback .env.sebelum-putar-sandi-<…>
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  superuser | owner | app | backup) ;;
  *)
    echo "Pakai: bash scripts/rotate-postgres-password.sh <superuser|owner|app|backup>" >&2
    exit 2
    ;;
esac

exec python3 scripts/postgres-roles.py rotate "$1"
