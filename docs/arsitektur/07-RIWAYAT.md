# 07 — Riwayat & Keputusan Lama

> Keadaan 22 Okt 2026 (produksi `main@3a6d1d35`, v0.11.0; §6 dan §8 tergabung di `develop`, belum digelar) · [indeks](./README.md)

Kenapa sistem ini berbentuk seperti sekarang. Isinya hanya **keputusan yang
masih mengikat** dan **apa yang masih terbuka** dari pekerjaan besar
(migrasi PostgreSQL, monorepo, audit skema, klasifikasi buku, gelar tahap 1a–1c,
rilis 0.11.0, penyatuan container, register lisensi & pindah SaaS → on-premise,
pencabutan MariaDB); jalannya
pekerjaan ada di riwayat git.

## 1. Migrasi ke PostgreSQL

Keputusan yang masih mengikat:

| Keputusan | Alasan |
|---|---|
| **Basis data per PT**, bukan *schema-per-tenant* | Schema-per-tenant lebih hemat koneksi tetapi membatalkan #104: `search_path` yang salah menulis ke buku PT lain **tanpa error**. Harganya PgBouncer wajib |
| **Baseline**, bukan port 99 migration MariaDB | Yang dibutuhkan skema akhirnya, bukan riwayatnya. Tiap basis data dapat satu `0001_baseline` |
| **PostgreSQL jadi kanonik** | Skema PG turunan di samping skema MySQL menghasilkan image dengan adapter PG tetapi **mesin kueri berdialek MySQL** — itu sebab penukaran pertama gagal |
| **Klien ≥ server** | `pg_dump` menolak server yang lebih baru; klien 15 gagal terhadap server 17.11, dan gagalnya baru terlihat pada backup pertama sesudah penukaran. Dijaga `tests/pg-client-version.test.ts` |
| **Trigger ditulis tangan** | Prisma tidak membangkitkan trigger, fungsi, view, atau grant. Dijaga `tests/pg-trigger-parity.test.ts` |
| **Indeks FK eksplisit** | MySQL membuat indeks FK sendiri, PostgreSQL tidak. Dijaga `tests/index-fk-parity.test.ts` |
| **Timestamp naif dipertahankan** | `TIMESTAMP(3)` tanpa zona, setara `datetime` MariaDB. Peralihan ke `timestamptz` ❓ menunggu pemilik |

Empat pelajaran yang masih berlaku:

1. **Uji lapisan yang dipakai produksi.** Fase persiapan menguji adapter, skema, indeks, data, dan trigger — tetapi tidak menjalankan klien Prisma hasil bangkitan terhadap PostgreSQL. Lapisan itulah yang menentukan dialek.
2. **Yang tidak ada di skema Prisma tidak ikut dibangkitkan.** Trigger, fungsi, view, grant harus diperiksa manual setiap pindah mesin.
3. **Sebagian kegagalan baru muncul pada hari pertama sesudah penukaran** — klien `pg_dump` terlalu tua, `backup.sh` memaku host `db`, `SUM(boolean)` di pemeriksa kesesuaian. Ketiganya lolos `verify` dan build.
4. **Fallback adalah syarat.** Penukaran pertama bisa dipulihkan dalam hitungan menit karena MariaDB dibiarkan hidup dan tidak ditulisi — sampai dicabut di Fase E (§9).

### Yang masih terbuka

| # | Risiko | Usul |
|---|---|---|
| 1 | **Aplikasi tersambung sebagai superuser.** Role `sai` adalah `rolsuper`, jadi pembatasan pola `sai\_t%` yang ada di MariaDB hilang. Satu injeksi SQL di `$queryRawUnsafe` memberi akses penuh ke **server** | Role aplikasi `NOSUPERUSER CREATEDB`; superuser hanya untuk `migrate`/`svc-integrator` (jalur `tenant`, yang mendump SETIAP basis data) |
| 2 | **Pencarian jadi peka huruf besar-kecil.** Filter `contains`/`startsWith` tanpa `mode: "insensitive"` — `abadi` tidak lagi menemukan `PT ABADI` | Tambahkan `mode: "insensitive"` di jalur pencarian |
| 3 | **Collation `C` di semua basis data.** `ORDER BY name` mengurutkan per byte, dan `@unique` pada kode/nomor mengizinkan `ABC` dan `abc` sekaligus | `citext` atau indeks `lower(...)`, per kolom |
| 4 | ~~**Tiga skrip operator masih berdialek MySQL**~~ — ✅ di-port ke PostgreSQL di #636 (`current_schema()`, parameter `$n`), bersama `create-company.ts` yang masih menulis `CREATE DATABASE` gaya MySQL | — |
| 5 | **Login username tidak dinormalkan.** `auth.ts` mencari `username: parsed.data.identifier`, bukan `identifier` yang sudah di-`toLowerCase()` | Pakai `identifier` yang sudah dinormalkan |

**#636, cabut MariaDB: ✅ selesai 22 Okt 2026** — lihat §9.

## 2. Monorepo

Keputusan yang masih mengikat:

- **Monorepo, bukan multi-repo.** 19 basis data berbagi satu skema; dua repo menambah sinkronisasi lintas-repo tanpa manfaat.
- **Migration & `prisma*.config.ts` tetap di akar.** Memindahkan direktori migration yang sudah diterapkan mempertaruhkan `migrate deploy` pada seluruh basis data produksi demi kerapian.
- **Aplikasi customer tetap di `src/`**, tidak dipindah ke `apps/customer`: diff terkecil, dan setiap jalur yang di-scan tes tetap berlaku.
- **`operator-plane` tetap dipakai sisi customer.** Ia yang menolak permintaan bila Traefik salah arah.
- **Kedua image dari `sha-` yang sama.** Dua binari di atas satu skema bisa berbeda versi.
- **Logika penagihan bukan logika operator.** `changeTenantPlan` dipakai dua rute customer, jadi tinggal di `packages/platform`; konsol mengimpornya, tidak sebaliknya.
- **Yang sengaja tetap di aplikasi customer:** `src/lib/i18n/{actions,labels}.ts`, `src/lib/plan-catalog.ts`, dan lima wrapper di `src/components/ui`.

Satu risiko benar-benar terjadi: **scanner yang hanya menyapu `src/` lulus
dengan nol pelanggar** begitu berkasnya pindah. Dua puluh scanner dialihkan ke
`tests/akar-sumber.ts`, dan perubahannya dibuktikan dengan pelanggaran yang
sengaja ditanam di dalam paket.

> ⚠ **Rollback lintas 18 Okt:** tag `sha-` sebelum 18 Okt tidak punya image
> `-operator`, jadi menukar `SAI_TAG` saja tidak cukup — `docker-compose.yml`
> lama dari commit yang sama harus ikut dikembalikan.

## 3. Audit desain skema

Putusan: skemanya sehat. Sifat yang harus dipertahankan, diukur 12 Okt 2026:

| Sifat | Angka |
|---|---|
| Nol drift di 17 buku | Tabel 62, kolom 668, indeks 253 — identik di ke-17 buku |
| Disiplin uang: nol `Float` | `Decimal(15,2)` 81 kolom · `(15,3)` 18 · `(18,6)` 16 · `(5,2)` 1 |
| Semua relasi punya `onDelete` eksplisit | 53 `Restrict` · 34 `Cascade` · 8 `SetNull` |
| Konvensi penamaan 100% | Setiap model ber-`@@map` `snake_case` jamak + `id`/`created_at`/`updated_at`. Satu pengecualian yang benar: `TenantAuditLog` tanpa `updated_at` |
| Permukaan tipe sempit | `VarChar` (247), `Decimal` (116), `Text` (43), `Date` (2). **Nol** `Json`, `Bytes`, enum native |

Tiga aturan dari audit itu yang masih dipakai saat menyentuh indeks: yang
menentukan adalah **apakah indeksnya dideklarasikan di skema Prisma**, bukan
apakah MySQL membuatnya sendiri · sapuan skema dengan regex memberi jawaban
salah, hanya `information_schema` basis data yang berjalan yang benar · untuk
indeks yang sudah ada pakai `RENAME`, bukan `CREATE`, supaya tidak lahir indeks
kedua pada kolom yang sama.

### S3 — satu-satunya temuan yang masih terbuka

`z.enum` hanya menjaga tulisan yang lewat aplikasi; CHECK constraint di buku
produksi: **0**. `CONTRACT_STATUSES = ["signed", "pending", "canceled"]`,
sedangkan yang ada di buku produksi:

| status | baris | |
|---|---|---|
| `pending` | 469 | |
| **`completed`** | **101** | ← di luar kosakata |
| `canceled` | 39 | |
| `signed` | **0** | ← ada di kosakata, tak pernah dipakai |

Ketiganya tercatat dalam jendela **dua detik yang sama** (18 Jul 2026), yaitu
impor warisan: di dump lama `status` berisi angka, dan pengimpor memetakannya
dengan kosakata yang **lebih kaya** daripada yang dimiliki aplikasi.

**Pertanyaan untuk pemilik: apakah bisnis ini membedakan kontrak yang sudah
ditandatangani dari yang sudah selesai dikerjakan?**

| Kalau YA | Kalau TIDAK |
|---|---|
| `completed` status keempat yang sah | 101 baris dipetakan ke `signed` |
| Tambahkan ke `CONTRACT_STATUSES` + label 3 bahasa + warna + saringan | Satu migration `UPDATE`, nol perubahan kode |
| Nol data berubah | Informasi "sudah selesai" **hilang**, tanpa jalan balik |

🔶 Rekomendasi: **ya** — memetakan 101 baris ke `signed` membuang informasi
yang tidak bisa dipulihkan.

**Urutan perbaikan yang tidak boleh dibalik:** putuskan kosakatanya → perbaiki
datanya lewat migration → **baru** pasang guard. Guard yang dipasang lebih dulu
menolak data yang sudah ada, karena `ADD CONSTRAINT … CHECK` memvalidasi
seluruh baris saat dipasang. Pilihan guard-nya `CHECK (status IN (…))`, dan
daftarnya **harus dibangkitkan dari `constants.ts`**, jangan diketik ulang.

Satu cacat sudah diperbaiki tanpa menunggu keputusan itu: grafik donat status
kontrak dibangun dari tiga status yang dipaku, sehingga **101 dari 609 kontrak
(16,6%) hilang** dan grafiknya tetap terlihat benar — tiga irisan rapi dengan
jumlah yang masuk akal, sementara tabel di halaman yang sama menunjukkan angka
berbeda. `src/lib/contract-status-chart.ts` kini memasangkan warna **per
posisi**, dan status di luar kosakata menyusul dengan `unknownTone`.

### Zona waktu

Di buku produksi ada 165 kolom waktu, semuanya naif, dan perilakunya bergantung
pada asumsi yang **tidak pernah ditulis**: semua waktu disimpan UTC, tampilan
mengubahnya ke WIB. Penutupan periode berbasis tanggal, jadi bila satu jalur
lupa mengubah zona, dokumen yang diposting pukul 23:30 WIB bisa masuk periode
yang salah.

Dua jawaban yang sah: `timestamptz` untuk kolom **peristiwa** (`created_at`,
`posted_at`, `sent_at`), dan `date` tetap `date` untuk kolom **tanggal
akuntansi** (`invoice_date`, `period`) — tanggal buku bukan titik waktu.

## 4. Klasifikasi buku

> Dijalankan 11 Okt 2026. Untuk angka hari ini jalankan ulang
> `bun run classify:books` — skripnya hanya membaca.

**2 dari 17 buku** berisi data sungguhan: 1 `produksi` (66 pelanggan + 609
kontrak nyata), 1 `dipakai-ringan`, 2 `semai-saja`, 4 `semai-dibersihkan`,
6 `nyaris-kosong`, 3 `kosong`.

**Nama tidak boleh jadi dasarnya.** Klasifikasi dari nama keliru ke dua arah,
dan kekeliruan yang mahal adalah memperlakukan buku **nyata** sebagai uji.
Dua tanda yang tidak bisa dipalsukan penamaan dipakai sebagai dasar: pelanggan
& kontrak **tanpa tanda `[CONTOH]`** (wisaya menyemai data contoh bertanda ke
setiap PT baru, jadi apa pun di luar itu diketik orang), dan **bentuk semai**
yang tetap — 28 dokumen + 1 saldo awal. Aturannya fungsi murni
(`src/lib/book-classification.ts`), dan salah satu tesnya menuntut agar tidak
ada alasan yang menyebut nama basis data.

Dua putusan yang sudah diambil:

- **`is_demo` bukan penanda yang dicari.** Kolom itu **mengubah perilaku**: buku jadi hanya-baca + banner + dikecualikan dari scheduler. Menandai buku uji sebagai `is_demo` akan menolak tulisan di buku yang mungkin masih dipakai seseorang.
- **Jangan kecualikan dari backup.** Seluruh `sai_*` 78,1 MB; 16 buku non-produksi **tepat 4,0 MB masing-masing** — itu overhead struktural, bukan data. Mengecualikan 15 buku menghemat ~60 MB, tidak sepadan dengan daftar pengecualian yang harus dipelihara tangan dan akan tertinggal saat customer baru mendaftar.

Yang masih terbuka: penanda "buku uji" terpisah dari `is_demo` · ❓ apakah buku
uji dikecualikan dari laporan kesesuaian · ❓ apakah 3 buku `kosong` + 4
`semai-dibersihkan` dirapikan. Modul klasifikasinya tidak pernah menyarankan
penghapusan: "tampaknya tidak dipakai" bukan dasar yang memadai untuk tindakan
yang tidak bisa dibalik.

## 5. Tahap 1a–1c digelar (21 Okt 2026)

Kode tahap 1a–1c ([09 §9](./09-RANCANGAN-LAYANAN.md)) selesai 20 Okt, tetapi
**baru melayani 21 Okt** (`main@a8d2749d`, label **0.10.0**): tiga layanan baru
(`svc-ledger`, `svc-interactive`, `svc-tenant`), image kelima `-integrator`,
migration `control` 0005–0007, volume `hasil`, dan `job-backup` turun menjadi
perkakas (profil `perkakas`, container lamanya dibuang dengan `rm -sf` — `up -d
--no-deps` tidak menghentikannya sendiri).

Gelar pertama (`main@d1baa77f`) **rusak di dua lapis, dan seluruh gerbang
hijau**: `svc-ledger` & `svc-interactive` crash-loop, dan tiga langkah
penjadwal (`recurring:publish`, `backup:publish`, `notify:invoice-due`) gagal
setiap putaran. Sebabnya satu: `@sai/platform/job-queue` mengimpor
`server-only`, yang di luar Next memilih export bawaan yang **melempar**
(Next memuat kode server dengan kondisi `react-server` → `empty.js`). Antrean
tidak kehilangan apa pun — tetapi tidak ada yang diterbitkan, jadi juga tidak
ada cadangan.

| Keputusan | Alasan |
|---|---|
| Skrip yang memuat kode server berjalan dengan `--conditions=react-server` | Memutus impor `server-only` dari setiap modul yang disentuh skrip tidak tahan lama — `job-queue` memang sisi-server. Selain penanda itu, kondisi ini hanya menukar build `react` yang dipakai `next/dist/server` (diperiksa lewat selisih daftar modul bundel) |
| Penjaga menyapu **setiap** skrip `tsx`/`bun` di `package.json` (`tests/worker-server-only.test.ts`) | Perbaikan pertama hanya menjaga `jobs:run:*` dan meluputkan tiga penerbit — cakupan penjaga yang sempit itulah cacatnya |

Pelajaran yang masih berlaku — sejalan dengan pelajaran 1 dan 3 di §1:
**vitest tidak pernah memuat skrip lewat resolusi yang dipakai container.**
Untuk layanan baru, bukti "berjalan" adalah log container pertamanya, bukan
gerbang.

Terbukti sesudah gelar: 16 `ledger.recurring` selesai (p95 ~200 ms), cadangan
per basis data pertama di produksi (22 objek, status `local`) lulus
`prove-backup-restore` dengan objek sendiri untuk ke-17 PT, kesesuaian 1.439
temuan (= sebelum rilis).

Pemicu tahap 1d **diukur, belum terpenuhi** (21 Okt): `app-customer` ~235 MiB
tanpa `--max-old-space-size` saat jalan, dan ekspor besar kini di proses
`svc-interactive` (~83 MiB), bukan di event loop aplikasi. Catatan sampingan:
mesin ini kini **7,4 GB RAM** — angka ~3,6 GB di dokumen lain adalah potret
lama; aturan "jangan build di server" tetap berlaku karena mesinnya dibagi
dengan aplikasi lain.

## 6. Satu image = satu container (22 Okt 2026, belum digelar)

Keputusan pemilik, sesudah diberi tahu harganya: enam layanan latar menjadi
dua. Image `-migrator` → `svc-worker` (penyelia `scripts/run-workers.ts`,
empat peran: `scheduler`, `conformance`, `ledger`, `interactive`); image
`-integrator` → `svc-integrator` (`cmd/integrator`, jalur `tenant` + jalur
`interactive` Go dalam satu proses). Pagar jalur `ledger` sekaligus pindah ke
koneksi langsung (`CONTROL_DATABASE_DIRECT_URL` di compose dasar). Risiko yang
diterima — kunci cadangan seproses dengan parameter laporan pengguna, satu peran
jatuh = semua restart — dan pemicu memisahkannya lagi:
[09 §3.2](./09-RANCANGAN-LAYANAN.md).

Bersamaan: CI membangun `-backup` di atas `-migrator` yang baru didorong
(`build-contexts`, dirujuk digest) karena di job terpisah lapisan
`node_modules`-nya sama isi tetapi beda digest — terukur 2,035 GB unik di cakram
produksi untuk image yang seharusnya hanya menambah ~336 MB.

Gelar pertamanya wajib `--remove-orphans`: compose tidak menghentikan layanan
yang hilang dari berkasnya, dan enam container lama yang tetap hidup mengklaim
pekerjaan yang sama dengan dua yang baru.

## 7. Rilis 0.11.0 — tahap 1d sampai D (22 Okt 2026)

Digelar 22 Okt 2026 (`main@3a6d1d35`, label **0.11.0**), masih dengan enam
layanan latar lama — penyatuan §6 datang sesudahnya. Isinya:

| Bagian | Keadaan sesudah rilis |
|---|---|
| Tahap 1d | Laporan PERTAMA yang berkasnya dibuat Go: lembar sebar Neraca Saldo (`engine: go`, `report.export_go`). Paritas angka dibuktikan atas buku produksi — 17 buku × 3 tanggal, 51 setara (`parityProven` di `src/lib/report-engine.ts`); paritas isi berkas diuji lokal ([09 §9](./09-RANCANGAN-LAYANAN.md)) |
| Tanggal laporan | Batas "per tanggal" dan periode laporan, beranda, buku besar, dan umur piutang/utang memakai jam **Jakarta** eksplisit (`@sai/core/business-date`), bukan zona proses — keputusan pemilik |
| Tahap 2, 3, 4 | Kode siap dan **opt-in**: tanpa berkas override dan variabelnya tidak satu perilaku pun berubah ([02 §19](./02-LAYANAN-INFRA.md), 09 §9) |
| Tahap D | Profil on-premise lengkap kecuali satu langkah pemilik: kunci publik lisensi ([`ONPREM-SERAH-TERIMA.md`](../ONPREM-SERAH-TERIMA.md) §0) |
| Hasil berantre | Ekspor besar yang disiapkan di latar kini bisa diunduh: pelari jalur `chown` ke `node` (sebelumnya setiap hasil dijawab 404) |

## 8. Register lisensi & pindah SaaS → on-premise (22 Okt 2026, belum digelar)

Dua pekerjaan yang tergabung ke `develop` pada hari yang sama dengan §6
(PR #690 dan #691) dan menunggu rilis berikutnya bersamanya.

**Register lisensi di konsol operator** (#690): halaman `/licences`, migration
platform `0006_licence_register` (`licence_customers`,
`licence_register_entries`), izin operator `licence.register` (peran `owner`
dan `billing`). Keputusan yang mengikat:

| Keputusan | Alasan |
|---|---|
| Register = **arsip, bukan kewenangan** | Konsol menyusun perintah `licence:issue`, penandatanganan terjadi di mesin luring, konsol hanya memverifikasi berkas yang diunggah. Tidak ada tempat untuk kunci privat, dan `app-customer` tidak membaca tabel register — dijaga `tests/licence-register-archive.test.ts` ([06 §3.7](./06-KEAMANAN.md)) |
| "Dicabut" di register hanya catatan | Lisensi luring tidak bisa dicabut dari jauh; tombol yang berpura-pura bisa adalah janji palsu |

**Penandatanganan pindah ke konsol** (keputusan pemilik 22 Okt 2026, belum
digelar): migration platform `0007_licence_signing_keys`, izin `licence.sign`
(owner saja). Baris pertama tabel di atas — "penandatanganan terjadi di mesin
luring" — DIBALIK: konsol kini membuat kunci penanda dan menandatangani draf,
dengan kunci privat tersegel (scrypt + AES-256-GCM) dan frasa sandi yang
diketik setiap kali. Register tetap arsip; jangkarnya tetap kunci publik yang
ditanam di kode, dan konsol hanya menandatangani bila sidiknya sama. Jalur
luring tetap tersedia lewat modul penanda yang sama. Model dan risiko sisanya
(RCE pada `app-operator` menangkap frasa saat diketik):
[06 §3.7](./06-KEAMANAN.md).

**Pindah tenant SaaS → on-premise** (#691, runbook
[`ONPREM-PINDAH-DARI-SAAS.md`](../ONPREM-PINDAH-DARI-SAAS.md)): lima skrip
(`tenant:export-onprem`, `tenant:import-onprem`, `tenant:mark-migrated-out`,
`tenant:unfreeze`, `tenant:prove-onprem`) dan migration kendali
`0010_tenant_pindah_onprem` (`tenants.frozen_at`, `tenants.migrated_out_at`,
status tenant `migrated_out`).

| Keputusan | Alasan |
|---|---|
| Pembekuan = kolom `frozen_at`, **bukan** nilai `status` | `status` ditulis ulang penjadwal, webhook, dan konsol; pembekuan yang dicairkan diam-diam di tengah dump berarti tulisan yang hilang |
| Satu bundel bersandi; `SETTINGS_ENCRYPTION_KEY` SaaS tidak pernah ikut | Rahasia dibuka di SaaS dan disegel ulang dengan kunci customer |
| Impor hanya ke pemasangan **kosong** | id tenant/pengguna/perusahaan dibawa apa adanya karena buku besar merujuknya |
| `migrated_out` tidak menghapus apa pun | Penghapusan tetap lewat alur #142 dengan permintaan dan masa tenggang |

Yang masih terbuka (rinciannya di runbook): tombol konsol untuk bekukan /
cairkan / nyatakan pindah · tagihan terbuka saat `migrated_out` · `change-plan`
atas tenant `migrated_out` yang belum dipagari · siapa yang boleh meminta
penghapusan data SaaS sesudah penggunanya tidak bisa masuk lagi.

## 9. Fase E: MariaDB dicabut (22 Okt 2026, #636)

Penutup migrasi PostgreSQL (§1). Produksi berjalan di PostgreSQL sejak 15 Okt
2026 tanpa insiden selama jendela tujuh hari; pemilik memutuskan melepas jalan
mundur "detik" (tukar URL) pada 22 Okt 2026.

**Langkah produksi (sesi utama, sebelum PR-nya):** container `sai-db`
dihentikan 22 Okt 08:47 UTC; volume `sai-accounting_db_data` DIPERTAHANKAN.
Dump terakhir `mariadb-terakhir-20261022-164624.sql.gz` (sha256
`bb2b52c1…a7192b4`) dibuktikan terpulihkan ke `mariadb:11` sekali pakai: 19
basis data, jumlah tabel identik, contoh jumlah baris sama. Image terakhir yang
masih membawa jalur MariaDB: **`sha-c9b5d9c` (v0.12.0)**, kelima image. Sesudah
ini jalan mundur ke MariaDB = memulihkan dump itu + menggelar image tersebut.

**Yang dicabut dari repo:**

| Bagian | Sesudahnya |
|---|---|
| Compose | Service `db` dan deklarasi volume `db_data` hilang (dasar + on-premise). Rilis pertama sesudahnya `--remove-orphans` menghapus container `sai-db` yang berhenti; volumenya tetap sampai `docker volume rm` tangan |
| `@sai/db` | `engine.ts` hanya mengenal `postgres://`; `mysql://`/`mariadb://` **ditolak** dengan pesan yang menyebut #636. `engine-runtime.ts` (yang memulangkan `"mariadb"` untuk URL kosong) dihapus — pemakainya tinggal satu cabang PostgreSQL. `adapter.ts`/`server.ts` tanpa cabang MariaDB |
| Paket | `@prisma/adapter-mariadb` dan `mariadb` keluar dari `package.json` + `packages/db/package.json` + `bun.lock` |
| Image | `mariadb-client` keluar dari tahap `backup`; `DATABASE_URL` waktu build `postgres://` |
| Skrip | `backup.sh` hanya `pg_dumpall` (URL lain → `die`); pembukti pemulihan tanpa penanda dump MariaDB; `pg:data`/`pg:prove` (`pg-migrate-data.ts`, `pg-prove-parity.ts`, `src/lib/pg-coerce.ts`) **dihapus** — alat sekali pakai penukaran; sumber datanya kini dump terakhir, kodenya tetap ada di riwayat repo |
| Riwayat migration | `prisma/migrations/`, `prisma/{control,platform}/migrations/` → `prisma/_arsip-mariadb/{company,control,platform}/` (dipertahankan karena penjaga paritas trigger & beberapa tes membaca transformasi data lama), dan tidak lagi masuk image |
| Penjaga | `tests/mariadb-retired.test.ts`: nol impor `mariadb`/`@prisma/adapter-mariadb` di `src`, `packages`, `apps`, `scripts`, `tests`; nol URL `mysql://` berkredensial di compose, Dockerfile, contoh env, config tes; arsip hanya di `_arsip-mariadb` |

**Sisa MySQL yang ditemukan dalam sapuan dan ikut diperbaiki** — semuanya
gagal SENYAP di PostgreSQL sejak 15 Okt, karena tidak satu pun punya tes yang
menyentuh mesin:

- `makeLatestJournalDateReader` (jangkar retensi UU KUP hapus-tenant) sudah
  dipindah ke `@sai/db/server` sebelum PR ini; kini punya tes
  (`tests/latest-journal-date-reader.test.ts`).
- Ekspor mandiri tenant (`tenant-export.ts`) mengutip tabel dengan backtick —
  sintaks yang ditolak PostgreSQL, jadi setiap ekspor gagal pada tabel pertama.
- `isAccessDeniedError` hanya mengenal nomor MariaDB 1044/1045; penolakan hak
  PostgreSQL (SQLSTATE `42501`/`28P01`/`28000`) jatuh ke pesan umum.
- Batas nama basis data 64 (MySQL) — PostgreSQL memotong di 63 dengan sekadar
  NOTICE; kini 63, sepakat dengan pemeriksaan kedua di `@sai/db/server`.
- `create-company.ts` (dipakai `bootstrap`) masih `CREATE DATABASE` ber-backtick
  dengan `utf8mb4`; kini lewat `bukaServer().buat()`.
- `tests/migration-tier.test.ts` hanya memindai pohon migration MariaDB, jadi
  migration PostgreSQL sejak 15 Okt tidak dijaga tingkatnya; kini keduanya.

Yang masih terbuka: menyalin dump terakhir ke luar server, lalu
`docker volume rm sai-accounting_db_data` (langkah pemilik); butir 1–3 dan 5 di
§1 "Yang masih terbuka".
