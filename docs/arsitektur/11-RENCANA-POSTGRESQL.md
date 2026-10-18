# 11 — Migrasi MariaDB → PostgreSQL — selesai 15 Okt 2026

> Keadaan per 18 Okt 2026 (`main@ca0cd038`) · [indeks](./README.md)
>
> Dokumen ini dulu berupa rencana (11 Okt), lalu runbook (12 Okt). Rencananya
> sudah dijalankan. Yang tersisa di sini: keadaan akhir, keputusan yang masih
> berlaku beserta alasannya, pelajaran, dan pekerjaan yang masih terbuka.
> Rencana, audit F1 lengkap, dan runbook fase A–E ada di riwayat git berkas ini.

## 1. Keadaan akhir

| | |
|---|---|
| Mesin | PostgreSQL 17 (`postgres:17-alpine`, service `pg`), diinisialisasi `--data-checksums --encoding=UTF8 --lc-collate=C --lc-ctype=C` |
| Pooler | PgBouncer (service `pgbouncer`, mendengarkan di 5432): `POOL_MODE=transaction`, `DEFAULT_POOL_SIZE=20`, `MAX_CLIENT_CONN=200`. Aplikasi dan job tersambung lewat `pgbouncer:5432` |
| Langsung ke `pg` | `migrate` (advisory lock Prisma tidak bertahan di pooling `transaction`) dan `job-backup` (lewat pooler, dump-nya terpotong). Keduanya `postgres://…@pg:5432/…` |
| Bentuk multi-tenant | Satu basis data per PT, ditambah `sai_control` dan `sai_platform`, sama seperti sebelumnya. Saat penukaran ada 19 basis data |
| Skema | `packages/db/prisma/{company,control,platform}/schema.prisma`, `provider = "postgresql"` |
| Migration kanonik | `prisma/postgresql/<company\|control\|platform>/NNNN_*/migration.sql`, ditulis tangan, diterapkan `bun run db:migrate:all`. Per 18 Okt: company 1 (`0001_baseline`), control 4, platform 4 |
| Arsip MariaDB | `prisma/migrations/` dan `prisma/{control,platform}/migrations/`, hanya-baca, tidak diterapkan lagi |
| Adapter | dipilih dari skema URL (`packages/db/src/adapter.ts`, `engine.ts`); operasi tingkat server (`adakah`/`buat`/`jumlahTabel`/`hapus`) lewat `packages/db/src/server.ts` |
| Backup | `pg_dumpall` dengan `postgresql-client-17` dari PGDG di image `-backup` |
| MariaDB | service `db` (`mariadb:11`, container `sai-db`) masih hidup sebagai jalan mundur dan tidak ditulisi sejak penukaran. Pencabutannya dilacak di issue #636 (paling cepat 22 Okt 2026) |

**Jalan mundur.** Klien Prisma terikat pada `provider`, jadi image yang dibangun
dari skema PostgreSQL tidak bisa tersambung ke `mysql://`. Kembali ke MariaDB
berarti men-deploy image `sha-` lama dari GHCR (sebelum 15 Okt) dan menukar
`DATABASE_URL`/`CONTROL_*`/`PLATFORM_*`. Semua tulisan yang masuk ke PostgreSQL
sesudah penukaran akan hilang. Biaya jalan mundur ini naik setiap hari, dan itu
alasan #636.

## 2. Keputusan penting dan alasannya

| Keputusan | Alasan |
|---|---|
| **Opsi A: basis data per PT**, bukan *schema-per-tenant* | Schema-per-tenant lebih hemat koneksi, tetapi membatalkan janji #104: `search_path` yang salah menulis ke buku PT lain tanpa error. Isolasi fisik dipertahankan. Harganya, PgBouncer wajib: PostgreSQL memakai satu proses per koneksi, dan puncak terukur 62 koneksi di mesin 3,6 GB |
| **Baseline, bukan port 99 migration MariaDB** | Riwayat migration tidak berguna di mesin baru; yang dibutuhkan skema akhirnya. Tiap basis data mendapat satu `0001_baseline`. Untuk 21 migration yang berisi data, diperiksa bahwa hasilnya sudah ada di data yang dipindahkan |
| **PostgreSQL kanonik** (sejak penukaran pertama gagal) | Skema PG turunan di samping skema MySQL menghasilkan image dengan adapter PG tetapi mesin kueri berdialek MySQL. Kini satu sumber dan satu dialek: `provider = "postgresql"` di skema itu sendiri |
| **Klien ≥ server** | `pg_dump` menolak server yang lebih baru. Klien 15 (bawaan Debian) gagal terhadap server 17.11, dan gagalnya baru terlihat pada backup pertama sesudah penukaran. Klien dipatok ke `postgresql-client-17`; dijaga `tests/pg-client-version.test.ts` |
| **Trigger slug ditulis tangan** | Prisma tidak membangkitkan trigger, fungsi, view, atau grant. `companies_slug_immutable` ditulis ulang sebagai `FUNCTION … RETURNS trigger` di `prisma/postgresql/control/0002_slug_permanen`. `tests/pg-trigger-parity.test.ts` menolak trigger MariaDB yang tidak punya padanan |
| **Indeks FK eksplisit** | MySQL membuat indeks FK sendiri, PostgreSQL tidak. 32 `@@index` dideklarasikan sebelum pindah (dok 13 §S1, migration arsip 0065/0018/0019), dan himpunan indeks PG terbukti identik. Dijaga `tests/index-fk-parity.test.ts` |
| **Timestamp naif dipertahankan** | Baseline memakai `TIMESTAMP(3)` tanpa zona (162 kolom di buku PT), setara `datetime` MariaDB. Peralihan ke `timestamptz` tidak dikerjakan saat penukaran; lihat §5 dan dok 13 §5 |
| **Migrator data generik** | `pg:data` membaca daftar tabel dari `information_schema` (1.084 tabel). FK ditunda lewat `session_replication_role = replica`, lalu baris yatim setiap FK dihitung. Uang tidak pernah dikonversi ke `Number`. Boolean `0/1` dikonversi eksplisit, karena `"0"` bernilai benar di JS. `pg:prove` membandingkan jumlah baris, jumlah tiap kolom uang sebagai teks, sebaran boolean, dan rentang waktu |

## 3. Riwayat singkat

- **11 Okt**: rencana disusun atas permintaan pemilik. Putusan awal: jangan sekarang (tidak ada pemicu terukur, P0 backup masih terbuka).
- **12 Okt**: audit kompatibilitas F1 (78 MB data, empat tipe native, 29 titik raw SQL, jebakan collation satu baris). Fase A–D selesai: paritas skema, pemindahan data ke PG bayangan 19/19 dengan 6.310 pembandingan tanpa beda, dan port kode.
- **15 Okt**: penukaran pertama gagal dan produksi mati ±9 menit. Port PgBouncer salah, dan klien Prisma masih dibangkitkan dari `provider = "mysql"`. MariaDB yang belum ditulisi memungkinkan pemulihan. Skema lalu dijadikan kanonik PG dan 28 skrip berhenti memaku adapter MariaDB (dijaga `tests/adapter-dari-url.test.ts`). Penukaran kedua berhasil (`main@1057bc0f`).
- **16 Okt**: validasi pasca-penukaran (§5). Mesin dan data utuh, tetapi image yang berjalan belum membawa perbaikan backup dan pemeriksaan kesesuaian. Perbaikannya dirilis lewat PR #637 (`main@dcf1c071`).
- **17 Okt**: pembaca jangkar retensi hapus-tenant berhenti memakai driver `mariadb` (`apps/operator/src/lib/operator/writes.ts`, `makeLatestJournalDateReader` lewat `@sai/db/server`).

## 4. Pelajaran

1. **Uji lapisan yang dipakai produksi.** Fase D menguji adapter, skema, indeks, data, dan trigger, tetapi tidak menjalankan klien Prisma hasil bangkitan terhadap PostgreSQL. Lapisan itulah yang menentukan dialek.
2. **Yang tidak ada di skema Prisma tidak ikut dibangkitkan.** Trigger, fungsi, view, dan grant harus diperiksa manual setiap pindah mesin. Tanpa padanan tulisan tangan, trigger keabadian slug akan hilang tanpa error.
3. **Sebagian kegagalan baru muncul pada hari pertama sesudah penukaran**: klien `pg_dump` terlalu tua, `backup.sh` memaku host `db`, dan `SUM(boolean)` di pemeriksa kesesuaian. Ketiganya lolos `verify` dan build. Sesudah rilis, buktikan lewat `/api/health` dan angka pra/pasca, jangan lewat laporan skrip.
4. **Jalan mundur adalah syarat.** Penukaran pertama bisa dipulihkan dalam hitungan menit karena MariaDB dibiarkan hidup dan tidak ditulisi.

## 5. Sisa terbuka

### 10.2 Validasi pasca-penukaran (16 Okt 2026)

*(Nomor 10.2 dipertahankan karena dirujuk dari dok 01, 03, `docs/DATABASE.md`,
dan `docs/MULTI-COMPANY.md`.)*

Yang lulus di produksi: `/api/health` kedua aplikasi `ok`; tidak ada URL
`mysql://` di container; `_prisma_migrations` bersih di 19/19 basis data; setiap
sequence ≥ `MAX(id)`; 13/13 email pengguna huruf kecil tanpa duplikat
case-insensitive; role `sai` punya `CREATEDB`.

Pemblokir yang ditemukan, semuanya sudah ditutup:

1. Backup otomatis menuju host `db`, sehingga tidak satu pun berhasil sejak penukaran. ✅ `53c3f458`, dirilis #637.
2. Pemeriksaan kesesuaian gagal di 17 buku (`sum(boolean)`, `FORMAT()`, `GROUP BY` longgar). ✅ `449796e5` (sekaligus `migrate` langsung ke `pg`), dirilis #637.
3. Jangkar retensi hapus-tenant memakai driver `mariadb` dan tanpa error jatuh ke tanggal hari ini. ✅ `baa5bfab` (17 Okt).

Risiko yang masih terbuka. Tidak memblokir, tetapi perilakunya berubah tanpa error:

4. **Aplikasi tersambung sebagai superuser.** Role `sai` adalah `rolsuper`. Pembatasan pola `sai\_t%` di MariaDB ([MULTI-COMPANY.md](../MULTI-COMPANY.md)) hilang. Satu injeksi SQL di `$queryRawUnsafe` mana pun kini memberi akses penuh ke server basis data (`pg_authid`, `COPY … TO PROGRAM`), tidak hanya ke data. Usul: role aplikasi `NOSUPERUSER CREATEDB`, superuser hanya untuk `migrate`/`job-backup`.
5. **Pencarian peka huruf besar-kecil.** Filter Prisma `contains`/`startsWith` di pencarian pengguna (pelanggan, pemasok, kontrak, faktur, tenant di konsol, …) tidak memakai `mode: "insensitive"`, jadi `abadi` tidak lagi menemukan `PT ABADI`. Penomoran dokumen (`startsWith: prefix` bangkitan sistem) tidak terdampak.
6. **Collation `C` di semua basis data.** `ORDER BY name` mengurutkan per byte (huruf besar dulu, huruf beraksen di akhir). `@unique` pada kode/nomor kini mengizinkan `ABC` dan `abc` sekaligus. Bila perilaku lama diinginkan, pakai `citext` atau indeks `lower(...)`, diputuskan per kolom.
7. **Skrip operator yang masih berdialek MySQL.** Tidak berjalan otomatis, tetapi akan gagal saat dipakai:
   - `scripts/pause-platform-billing.ts:113` (`TABLE_SCHEMA = DATABASE()`)
   - `scripts/adopt-existing-company.ts:132,184` (`DATABASE()`)
   - `scripts/prove-company-slug-immutable.ts:56` dst. (placeholder `?`, `trigger_schema = <nama db>` yang di PostgreSQL bernilai `public`)

Lainnya:

- **Login username tidak dinormalkan.** `src/lib/auth.ts:116` mencari
  `username: parsed.data.identifier`, tidak memakai `identifier` yang sudah
  di-`toLowerCase()` (baris 57) seperti branch email (baris 113). Pengguna
  warisan yang mengetik `Budi` untuk akun `budi` kini ditolak sebagai
  kredensial salah.
- **#636, cabut MariaDB** (service `db`, volume `db_data`, `@prisma/adapter-mariadb`, branch MySQL di `packages/db`). Paling cepat 22 Okt 2026, sesudah dump terakhir disimpan di luar mesin. Butir 4–7 sebaiknya ditutup lebih dulu.
- **❓ Pemilik:** `timestamptz` untuk kolom peristiwa (dok 13 §5.1). Tidak diputuskan saat penukaran; bawaannya tetap naif.

## Rujukan lama

Komentar di kode masih menyebut nomor bagian versi rencana. Padanannya:

| Rujukan lama | Kini |
|---|---|
| §9.2 (paritas skema / baseline) — kepala `0001_baseline` | §2 "Baseline" |
| §9.5 (koneksi) — `packages/db/src/adapter.ts` | §2 "Opsi A" + §1 Pooler |
| §10 Fase D (port kode, klien ≥ server, trigger) — `packages/db/src/*`, `tests/pg-*`, `tests/db-engine.test.ts`, `0002_slug_permanen` | §2 + §4 |
| §10 Fase E (penukaran, jalan mundur) — `docker-compose.yml`, `tests/adapter-dari-url.test.ts`, `tests/postgres-service-utama.test.ts` | §1 Jalan mundur + §3 |
| §10 (pemindahan data) — `scripts/pg-migrate-data.ts`, `scripts/pg-prove-parity.ts` | §2 "Migrator data generik" |
