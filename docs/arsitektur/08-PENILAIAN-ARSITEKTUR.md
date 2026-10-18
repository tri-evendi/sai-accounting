# 08 — Penilaian Arsitektur

> **ARSIP: potret 11 Oktober 2026** · v0.9.0 · [indeks](./README.md)
>
> Sesudahnya: PostgreSQL 15 Okt 2026 ([dok 11](./11-RENCANA-POSTGRESQL.md)),
> monorepo 18 Okt 2026 ([dok 14](./14-RENCANA-MONOREPO.md)). Status per 18 Okt
> 2026 (`main@ca0cd038`) ada di [§3 Ringkasan prioritas](#3-ringkasan-prioritas):
> di prioritas tertinggi tinggal P0-1 bagian luar-mesin dan P0-2. Angka bukti di
> tiap temuan berlaku pada tanggal temuan itu.

**Cara membaca dokumen ini.** Setiap temuan menyebut buktinya, dampaknya, dan
apa yang akan mengubah penilaiannya. Temuan yang hanya berisi pendapat tidak
dimasukkan. Tanda 🔶 berarti simpulan dari bukti, bukan pengamatan langsung; ❓
berarti butuh pemilik atau pengukuran.

**Catatan.** Hampir setiap keputusan sulit di repo ini sudah ditulis beserta
alasan dan ukurannya di dekat kodenya. Beberapa "kelemahan" di bawah adalah
harga yang sudah diterima dengan sadar, dan ditandai begitu, tanpa usulan untuk
membatalkannya.

---

## 1. Kekuatan yang sebaiknya dipertahankan

### 1.1 Mode kegagalan dipilih dengan sengaja

Pola yang berulang di sistem ini: kegagalan yang tidak terlihat diubah menjadi
kegagalan yang terlihat.

| Keputusan | Yang digantikan |
|---|---|
| Konteks PT hilang → **melempar** | Jatuh ke basis data bawaan → tulisan silang-PT tanpa jejak |
| `companyId` dicabut dari JWT (#158) | Jaring pengaman yang membuat route lupa-lingkup **tetap bekerja** |
| `OPERATOR_HOST` kosong → **404 di mana pun** | Konsol operator terbuka diam-diam |
| Daftar IP kosong → **tolak semua** | Terbuka bagi siapa pun |
| Webhook tanpa kunci di produksi → **tolak semua** | Menerima webhook palsu |
| Rantai proxy lebih pendek dari hitungan hop → **ditolak** | Mempercayai entri kiriman klien |
| `migrate-platform.ts` dilewati **berisik** | Dilewati diam-diam |
| Penjadwal jadi **layanan**, bukan crontab (#373) | Baris cron hilang → tagihan tak pernah terbit, **nol galat** |
| Terjemahan hilang = **galat tsc** | Teks bahasa Inggris bocor ke UI |

Ini aturan yang konsisten, dan mahal untuk dibangun ulang bila dilonggarkan demi
kenyamanan.

### 1.2 Isolasi buku besar secara fisik

Satu basis data per PT (PostgreSQL sejak 15 Okt 2026, sebelumnya MariaDB)
berarti kueri yang lupa `WHERE company_id` tidak bisa mengembalikan baris PT
lain, karena baris PT lain tidak ada di basis data itu. Jaminan ini lebih kuat
daripada isolasi per baris, dan untuk perangkat lunak akuntansi sepadan dengan
harganya.

Ada tiga lapis penguat: nama basis data disaring regex, kredensial tidak pernah
disimpan di tabel, dan tidak ada FK lintas basis data.

### 1.3 Satu pintu menuju buku besar

Gerbang persetujuan dan kunci periode ada di `postForSource`, bukan di route.
Route baru karena itu tidak bisa melewatinya, dan seluruh kelas celah di masa
depan tertutup sekaligus.

Selain itu: jurnal imutabel (koreksi lewat pembalikan), posting idempoten, dan
atomik bersama tulisan sumbernya.

### 1.4 Aturan dijaga tes

276 berkas tes berisi 4.654 tes. Banyak di antaranya menjaga aturan
arsitektural, tidak hanya perilaku:

`authz-coverage` (rute tanpa izin = merah) · `business-modules-ledger` (laporan
mengimpor modul = merah) · `icon-rsc-boundary` (bentuk impor ikon) ·
`anchor-button-nesting` · `button-no-aschild` · `company-slug-immutable` ·
`cross-tenant-404` · `check-data-conformance` (skripnya hanya-baca) ·
`backup-script` · `docs` (halaman docs tak boleh menyentuh sesi).

Dengan tes seperti ini, aturan tetap berlaku walaupun orangnya berganti.

### 1.5 Skrip pembuktian

`prove-scheduler-alive`, `prove-backup-restore`, `prove-tenant-adoption`,
`prove-company-slug-immutable`, `prove-company-slug-scope`. Ditambah aturan
tertulis: buktikan migrasi lewat angka pra/pasca, jangan lewat laporan skrip;
dan sapu `.next/server` untuk membuktikan fitur terjangkau.

`prove-backup-restore` sengaja tidak memuat dump ke basis data mana pun ("tidak
ada nilai pembuktian yang sepadan dengan risiko itu"). Pertimbangan itu tepat.

### 1.6 Pemeriksa kesesuaian data

Penjaga zod hanya berlaku di jalur tulis. Untuk jalur yang tidak melewatinya
(impor sekali-jalan, perbaikan SQL manual, penyemai) dibangun layanan terpisah.
Layanan ini lahir dari enam kelas cacat nyata yang ditemukan dalam dua hari
penelusuran.

### 1.7 Dokumentasi di dekat keputusannya

Komentar di repo ini menyimpan ukuran dan tanggal: "terukur 768 gagal walau 607
MB bebas; 1400 lolos", "diukur di route handler Next 16.2.1/Node 22.22:
`holder() === holder()` → false", "produksi berjalan 26 hari tanpa satu pun
salinan". Dengan begitu keputusan bisa ditinjau ulang, tidak hanya dipatuhi atau
dilanggar.

### 1.8 Degradasi berjenjang yang konsisten

Doktrin #137 (penagihan mati tidak mematikan aplikasi) ditegakkan di tiga
tingkat: impor (`platform-db.ts` dilarang dari jalur panas), klien (dibuat saat
dipakai, tidak saat modul dimuat), dan probe (`/api/health` melaporkan tanpa
memutuskan).

---

## 2. Temuan, berurutan menurut prioritas

### 🟠 P0-1 — Cadangan: lokal ✅ / luar-mesin ❌

**Temuan semula (11 Okt).** `/api/health` → `backup.status = "failing"`,
`lastSuccessAt = null`, 54 baris `backup_runs` yang semuanya gagal, dan tiga env
S3 tidak ada. Tidak ada satu pun salinan dari 17 buku PT, kendali, platform,
dokumen, dan jejak audit.

**Keadaan 18 Okt 2026.** Bagian lokal ✅: sejak 12 Okt `job-backup` membuat
artefak terenkripsi harian di volume `cadangan` (`backup.status = "local_only"`),
dan artefak itu terbukti bisa dipulihkan lewat `prove-backup-restore` (lihat
"Sebagian P0-1" di bawah). Bagian luar-mesin ❌: `BACKUP_S3_BUCKET` dan
kredensialnya masih kosong. Kerusakan disk, kehilangan mesin, atau akun yang
hilang akan menghapus data beserta salinannya.

Risikonya juga hukum: pembukuan wajib disimpan sepuluh tahun (UU KUP), dan
`docker-compose.yml` mencatat itu sebagai alasan layanan cadangan ada.

**Perbaikan.** Setel tiga env S3, jalankan satu putaran manual, lalu
`docker compose run --rm job-backup bun run prove-backup-restore`.

**Yang mengubah penilaian ini:** `backup.status = "ok"`, `lastSuccessAt` terisi,
dan `prove-backup-restore` lulus atas artefak luar-mesin.

---

### 🔴 P0-2 — Kunci enkripsi cadangan 🔶 kemungkinan hanya ada di mesin yang sama

**Bukti.** `BACKUP_ENCRYPTION_KEY` ada di `.env` di mesin produksi.
❓ Tidak ada petunjuk di repo bahwa kunci itu disalin ke luar.

**Dampak.** Cadangan (kini harian, lokal) dienkripsi AES-256-CBC. Bila kuncinya
hanya ada di mesin yang hilang bersama datanya, cadangan itu tidak bisa dibuka,
padahal kita mengira punya jalan pemulihan.

**Perbaikan.** Simpan kunci di pengelola rahasia di luar mesin, lalu catat
lokasinya (bukan nilainya). Buktikan dengan memulihkan di mesin yang tidak punya
`.env` produksi.

**Prioritas setara P0-1.** Keduanya harus selesai bersama; P0-1 tanpa P0-2
memberi rasa aman yang keliru.

---

### ✅ P0-3 — Tidak ada yang menjalankan tes sebelum kode mencapai produksi — **ditutup 11 Okt 2026**

**Temuan semula.** Tidak ada workflow berpemicu `pull_request`, tidak ada yang
menjalankan `verify`, dan `main` tidak punya *required status check* maupun
syarat review. Sementara itu `next.config.ts` sengaja mematikan pemeriksaan tipe
di `next build`. Satu-satunya penghalang antara galat tipe dan image produksi
adalah orang yang ingat menjalankan satu perintah. PR #599 sempat menerbitkan
tiga image tanpa satu pun pemeriksaan.

**Yang dikerjakan.** `.github/workflows/verify.yml` (`pull_request`, push
`develop`, push `main`: `bun install --frozen-lockfile` → `bun run db:generate`
→ `bun run verify`), dan `verify` menjadi *required status check* pada `main`:

```
required_status_checks.strict   : false
required_status_checks.checks   : [{ context: "verify", app_id: 15368 }]
enforce_admins                  : true
```

- **`app_id` dipin**, tidak hanya nama konteks. Tanpa itu, aplikasi pihak ketiga
  mana pun yang melaporkan konteks `verify` bisa memenuhi gerbangnya.
- **`strict: false` disengaja.** `main` selalu di depan `develop` karena merge
  bubble promosi, sehingga `strict: true` akan memblokir setiap PR promosi.
- `gh api -X PUT …/branches/main/protection` mengganti seluruh objek proteksi.
  Setiap setelan lama harus disertakan ulang dan diperiksa sesudahnya.
- ⚠ `enforce_admins: true` berlaku juga untuk pemilik. Bila CI mati, `main`
  terkunci: matikan sementara, merge, lalu pasang kembali dalam perubahan yang
  sama.
- `develop` tidak diproteksi, dengan sadar: `verify` berjalan dan terlihat di PR
  ke `develop`, tetapi tidak memblokir.

Dua jebakan: pakai `bun run db:generate`, jangan `bunx prisma generate` (ada
tiga skema, dan `packages/db/generated/` gitignored sehingga CI selalu mulai
dari nol); dan jangan memakai `| tail`, karena menutupi kode keluar.
`bun run build` tidak ikut di CI PR; ia tanggung jawab sesi utama di atas hasil
gabungan (`AGENTS.md`).

---

### ✅ P1-1 — Kegagalan latar tidak memberi tahu siapa pun — **ditutup 12–13 Okt 2026**

Ketiga denyut (cadangan, penjadwal, kesesuaian) kini mengirim peringatan lewat
`watch:health`, satu langkah `job-scheduler` dengan peredam per komponen.
Terbukti di produksi:
`cadangan=backup:local_only · penjadwal=ok · kesesuaian=conformance:findings`.
Dua mengirim peringatan, satu tidak karena memang sehat.

Celah di versi pertamanya ditutup 13 Okt. Pemeriksa penjadwal mula-mula hanya
membaca `finishedAt`, sehingga putaran yang selesai tepat waktu tetapi merekam
`status = "error"` dilaporkan `ok`. Produksi punya 5 putaran seperti itu (Agu
2026). Diuji terhadap putaran `2026-08-16 07:55:03` (`status=error`, `galat=1`):
versi pertama tidak mengirim peringatan, versi sekarang mengirim dengan sidik
jari terpisah `scheduler:errors`.

`schedulerHealth()` menjawab apakah penjadwalnya hidup, dan untuk itu `ok` memang
benar. Apakah pekerjaannya berhasil adalah pertanyaan lain, dan dijawab di
pemeriksa, tanpa mengubah kontrak `/api/health`.

**Sisa:** hanya `scheduler:subscriptions` yang menulis ke `scheduler_runs`. Enam
langkah lain (`notify:setup`, `notify:invoice-due`, `remind:customers`,
`recurring:run`, `watch:health`, `prune:trails`) tidak meninggalkan jejak; bila
salah satunya gagal tiap jam, itu hanya terlihat di log container. Lihat P2-2.

*Temuan semula (11 Okt): `lib/alert.ts` hanya dipanggil dari dua route
pendaftaran, sehingga cadangan yang gagal 54 kali berturut-turut, putaran
penjadwal `error`/`timeout`, dan temuan kesesuaian tidak memberi tahu siapa
pun.*

---

### ✅ P1-2 — Temuan kesesuaian data hanya ada di stdout — **ditutup 11 Okt 2026**

**Temuan semula.** `job-conformance` hanya menulis ke stdout: tanpa tabel
setara `scheduler_runs`/`backup_runs`, tanpa medan `/api/health`, tanpa halaman.
Padahal layanan ini sudah menemukan enam kelas cacat nyata di buku produksi,
termasuk kuantitas faktur termigrasi yang salah senilai Rp 774 juta.

**Yang dikerjakan.**

| Bagian | Keadaan |
|---|---|
| Tabel `conformance_runs` + model `ConformanceRun` | ✅ (migration platform arsip MariaDB 0018; kini bagian baseline PostgreSQL) |
| Putusan denyut murni `lib/conformance-heartbeat.ts` | ✅ empat status: `ok` · `findings` (berjalan & menemukan — bukan kegagalan layanan) · `late` (basi, atau ada buku gagal diperiksa) · `unknown` (belum pernah jalan) |
| Medan `/api/health` → `conformance` | ✅ dilaporkan, **tidak** ikut memutuskan 503 (doktrin #137) |
| Halaman konsol `/conformance` (host konsol, dulu `/operator/conformance`) | ✅ merender ketiga status; jumlah temuan disebut utuh saat dipangkas |
| Peringatan | ✅ kemudian ditutup `watch:health` (P1-1) |

Penjaganya `tests/conformance-heartbeat.test.ts` dan
`tests/operator-conformance-page.test.ts`. Pemeriksa hanya-baca skripnya
diperketat: buku PT hanya boleh dibaca (tanpa `$executeRaw*`), dan ada tepat satu
tulisan Prisma, ke `platformDb.conformanceRun`, yang dijalankan sebelum
`process.exit`.

---

### ✅ Sebagian P0-1 — jaring cadangan lokal — **12 Okt 2026**

Dulu `backup.sh` berhenti dengan `die` bila `BACKUP_S3_BUCKET` kosong, sehingga
54 putaran tidak menghasilkan artefak. Sejak 12 Okt skrip tetap membuat dump,
mengenkripsinya, menyimpannya ke volume `cadangan`, dan merekam putarannya
`local`. `/api/health` karena itu melaporkan `local_only`, dan laporannya akurat.
Peringatannya dikirim dari `job-scheduler`, tidak dari `job-backup`, karena
pemeriksa di dalam layanan yang mati ikut mati.

Dibuktikan di produksi 12 Okt: artefak terenkripsi (`600`) + `.sha256`, baris
`backup_runs` pertama yang bukan `error`, dan `prove-backup-restore` lulus (sidik
jari cocok, dekripsi berhasil, 19 basis data di dalam dump). Itu kali pertama
satu cadangan di repo ini terbukti bisa dipulihkan. Sejak 15 Okt dump-nya
`pg_dumpall` langsung ke `pg`.

**Masih terbuka:** `BACKUP_S3_BUCKET` + kredensial (P0-1 bagian luar-mesin) dan
`BACKUP_ENCRYPTION_KEY` di luar server (P0-2).

---

### ✅ P1-3 — Dokumentasi deploy saling bertentangan — **ditutup 11–12 Okt 2026**

**Temuan semula.** Lima berkas menjelaskan cara men-deploy dan tidak sepakat.
`PRODUCTION.md` §2 menyarankan `bun run setup:prod` (`next build` di server),
sementara §Updates melarangnya (~19 menit, iowait 58–92%, dua build bersamaan
pernah OOM). Di sampingnya ada `HOSTING*.md`, `DOCKER.md`, dua
`ecosystem.config*.cjs`, dan `build-standalone.yml`; `README.md` keliru di tiga
tempat.

**Yang dikerjakan.** `PRODUCTION.md` §Updates menjadi satu-satunya jalur yang
berlaku (§2/§4/§5 tinggal judul yang menunjuk ke sana); `docs/README.md` dibuat
sebagai indeks tunggal; tiga klaim basi di `README.md` diperbaiki. Pada 12 Okt,
atas keputusan pemilik, seluruh perkakas standalone dicabut: `HOSTING*.md`,
`DOCKER.md`,
`scripts/{package-standalone,setup-production,start-production,start-low-memory,deploy-on-server}.sh`,
`ecosystem.config*.cjs`, `.github/workflows/build-standalone.yml`, dan enam skrip
`package.json` (`setup:prod`, `start:prod`, `start:low-mem`, `build:upload`,
`package:standalone`, `deploy`).

**Temuan saat mencabutnya:** `bun run deploy` menunjuk ke `deploy-on-server.sh`
(`bun install` + `next build` di server), jadi perintah dengan nama paling wajar
menjalankan jalur yang dilarang. `scripts/deploy.sh` dipertahankan sebagai jalan
darurat bila GHCR tidak terjangkau.

---

### 🟡 P2-1 — Basis data uji/demo hidup di instans produksi — **terklasifikasi 11 Okt 2026**

**Bukti.** Empat dari 17 buku di instans produksi bernama seperti buku uji:
`sai_t11_data_dummy`, `sai_t1_uji_wisaya_416`, `sai_t1_uji_pindahan_425`,
`sai_t2_demo`. Dua kelompok nama nyaris kembar (`sai_t8_pt_saro` /
`sai_t8_pt_saroo` / `sai_t8_pt_saro_sejati`, serta `sai_t9_cv_saro` /
`sai_t9_pt_saro`) berpola seperti percobaan berulang.

Semuanya terdaftar di `sai_control` dengan `is_active = 1`.

🔶 Tersimpulkan: tidak ada lingkungan staging (tidak ada definisinya di repo),
jadi pengujian dilakukan di produksi.

**Dampak.**

1. Setiap buku ikut dump seluruh server (`pg_dumpall`; dulu `--all-databases`),
   jadi cadangan membawa data uji dan menjadi lebih besar dan lama tanpa manfaat.
2. `check-data-conformance` menyapu setiap buku, sehingga temuan dari buku uji
   bercampur dengan temuan atas data sungguhan.
3. Karena semuanya `is_active = 1`, buku uji ikut dihitung sebagai perusahaan di
   setiap tempat yang menghitung perusahaan.

**Yang terbukti tidak bermasalah** (diperiksa saat menyusun dokumen ini): jumlah
buku di basis data (17, diperiksa ulang di PostgreSQL 16 Okt 2026) sama dengan
jumlah yang terdaftar di `sai_control` (17). Tidak ada basis data yatim, jadi
tidak ada yang terlewat `db:migrate:all`. `sai_production`, satu-satunya yang
tidak berpola `sai_t<N>_…`, juga terdaftar; 🔶 kemungkinan buku pra-#104 yang
diadopsi.

**Perbaikan.**

> ✅ **Diklasifikasikan 11 Oktober 2026** berdasarkan isi bukunya, tidak
> berdasarkan nama. Hasil lengkapnya di [dok 12](./12-KLASIFIKASI-BUKU.md);
> skripnya `bun run classify:books` (hanya-baca, bisa dijalankan ulang).
>
> Hasilnya: 2 dari 17 buku berisi data sungguhan, sehingga temuan kesesuaiannya
> layak dipercaya.
>
> | Kelas | n |
> |---|---|
> | `produksi` | **1** (`sai_production` — 66 pelanggan + 609 kontrak nyata) |
> | `dipakai-ringan` | 1 |
> | `semai-saja` | 2 |
> | `semai-dibersihkan` | 4 |
> | `nyaris-kosong` | 6 |
> | `kosong` | 3 |
>
> Dua pertanyaan ikut terjawab:
>
> 1. **`is_demo` bukan penanda yang dicari.** Kolom ini mengubah perilaku:
>    `demoWriteRefusal` di kedua penjaga membuat bukunya hanya-baca, ditambah
>    banner, perlakuan langganan, dan pengecualian dari 4 produser penjadwal.
>    Menandai buku uji sebagai `is_demo` akan menolak tulisan di buku yang mungkin
>    masih dipakai seseorang.
> 2. **Jangan kecualikan dari cadangan.** Diukur di MariaDB, 11 Okt: seluruh
>    `sai_*` 78,1 MB, dan 16 dari 17 buku tepat 4,0 MB masing-masing, yaitu
>    overhead struktural InnoDB untuk 62 tabel, bukan data. Menghemat ~60 MB
>    tidak sepadan dengan kehilangan jaminan dump seluruh server.
>
> **Masih butuh pemilik:** apakah buku uji dikecualikan dari laporan kesesuaian
> (artinya berhenti diperiksa), dan apakah 3 buku `kosong` + 4
> `semai-dibersihkan` dirapikan (penghapusan basis data tidak bisa dibalik).

Satu keputusan lain yang terpisah dan masih terbuka: apakah staging sepadan
biayanya pada skala ini (🔶 mungkin belum).

⚠ **Jangan menghapus berdasarkan nama.** `sai_t4_sai`, `sai_t4_selamat`, dan
kelompok `saro` belum tentu uji. Pastikan lewat `sai_control` dan isi bukunya.

---

### 🟡 P2-2 — Tidak ada pemulihan per-pekerjaan di jalur latar

**Bukti.** Tidak ada antrean. Lima produser berjalan berurutan tiap jam dengan
`|| true` + `timeout -k 30 600`.

**Dampak.** Produser yang gagal menunggu satu jam untuk mencoba lagi. Yang
dihentikan `timeout` kehilangan putaran itu. Tidak ada *dead-letter*, jadi
pekerjaan yang selalu gagal akan terus gagal; terlihat di log, tetapi tanpa
pemberitahuan (lihat P1-1).

**Yang sudah benar, dan kenapa ini P2.** Idempotensi dikerjakan serius:
`dedupe_key`, kunci unik `(invoice_id, reminder_kind, reminder_due_key)`,
`(template_id, occurrence_date)`. Putaran berikutnya karena itu menyusulkan yang
tertinggal. Pada 11 tenant dengan kadens per jam, itu cukup.

`timeout` ditambahkan setelah kejadian nyata (30 Agu 2026): `|| true` melindungi
dari langkah yang gagal, tetapi tidak dari langkah yang menggantung. Satu langkah
yang menggantung dua jam menahan semua putaran sesudahnya.

**Perbaikan.** Jangan menambah antrean sekarang. Pemicunya: (a) jumlah tenant
naik sampai satu putaran tidak muat dalam satu jam, atau (b) satu produser butuh
*retry* lebih cepat dari sejam. Keduanya belum terjadi.

> **Diperbaiki sebagian, 13 Okt 2026.** Putaran yang merekam `status = "error"`
> kini mengirim peringatan lewat `watch:health` (sidik jari `scheduler:errors`).
> Lihat P1-1.
>
> **Sisanya:** hanya `scheduler:subscriptions` yang menulis baris
> `scheduler_runs`. Enam langkah lain tidak meninggalkan jejak, jadi salah
> satunya bisa gagal setiap jam sementara putarannya tetap tercatat `ok`.
>
> **Kenapa belum ditutup.** Menutupnya berarti setiap langkah menulis hasilnya
> sendiri: tabel atau kolom baru, migration, dan pembungkus `langkah` di compose
> yang mengumpulkan nama langkah yang gagal lalu memanggil perekam. Pekerjaan itu
> hampir sama dengan membangun antrean, yang sudah diputuskan belum perlu, dan
> antrean setengah jadi lebih sulit dipercaya daripada tanpa antrean.
>
> Untuk sementara, pembungkus `langkah` mencetak nama langkah yang gagal
> (`✗ '<nama>' gagal (kode N)`) ke log, dan `|| true` mencegah satu langkah yang
> gagal menghentikan enam lainnya. Yang belum ada hanya pemberitahuan keluar
> untuk keenam langkah itu.

---

### 🟡 P2-3 — Satu container `app-customer`, tanpa jalur penskalaan

**Bukti.** Satu `app-customer` tanpa replika. Cache dalam-memori: pengaturan
surel (TTL 60s), kolam klien LRU, penyimpan konteks per permintaan.

**Dampak.** Restart mengosongkan setiap cache, dan itu murah serta benar. Tetapi
replika tambahan akan punya kolam LRU dan cache surel sendiri yang bisa berbeda,
sehingga pengaturan tampak berubah tergantung replika yang melayani. Masalah
seperti itu sulit didiagnosis.

**Yang sudah benar.** Anggaran koneksi dihitung eksplisit (8+2+1 = 11 dari
`app-customer`), jadi batas skalanya diketahui sebelum tercapai.

**Perbaikan.** Tidak ada untuk sekarang. Sebelum replika pertama, dibutuhkan
cache bersama (atau cache dalam-memori dicabut) dan peninjauan ulang
`max_connections`. Dicatat sebagai prasyarat, belum sebagai pekerjaan.

---

### 🟡 P2-4 — CSP memakai `unsafe-inline` + `unsafe-eval` — **`unsafe-eval` dicabut 11 Okt 2026**

**Bukti (11 Okt).** `next.config.ts` (kini `packages/core/src/security-headers.ts`, dipakai kedua aplikasi):
`script-src 'self' 'unsafe-inline' 'unsafe-eval'`.

**Dampak.** Pertahanan XSS melemah cukup banyak, padahal aplikasi ini
menampilkan nama pelanggan, catatan, dan nama berkas unggahan.

🔶 Tersimpulkan sebagai kebutuhan Next.js + runtime CSS-in-JS Ant Design.
❓ Tidak ada komentar di repo yang mencatat apakah nonce pernah dicoba. Di repo
yang mencatat hampir semua keputusan, itu menunjukkan hal ini belum pernah
ditinjau.

**Yang sudah benar.** Header lain lengkap dan ketat: `frame-ancestors 'none'`,
`object-src` dibatasi, HSTS dengan preload, `form-action 'self'`,
`X-Frame-Options: DENY`.

**Perbaikan.**

> ✅ **Ditinjau 11 Oktober 2026**, dengan tiga hasil.
>
> **(a) `'unsafe-eval'` dicabut di produksi.** Dokumentasi Next menyatakan:
>
> > *"`unsafe-eval` is not required for production. Neither React nor Next.js
> > use `eval` in production by default."*
>
> Diperiksa juga di repo ini: tidak ada `eval(` / `new Function(` di seluruh
> `src/`, dan dari 204 berkas js di `.next/static` hanya satu yang memuat
> `eval(`, yaitu shim `vm` milik dependensi Next (`vm-browserify`). Isinya
> definisi `Script.prototype.runInThisContext` tanpa pemanggilan. Di
> pengembangan `unsafe-eval` tetap diizinkan, karena tanpa itu React tidak bisa
> merekonstruksi jejak galat sisi server di peramban.
>
> **(b) `style-src 'unsafe-inline'` harus tetap ada, karena struktural.** Sejak
> #203 seluruh gaya repo ini ditulis sebaris: terukur 2.618 kemunculan
> `style={{` di 305 berkas. Di CSP, `style-src` mengatur dua hal: elemen
> `<style>` dan atribut `style="..."`. Nonce hanya bisa menandai yang pertama;
> atribut gaya tidak bisa membawa nonce. Mencabutnya berarti membatalkan #203.
>
> **(c) `script-src 'unsafe-inline'` → nonce + `strict-dynamic`: mungkin, tetapi
> proyek tersendiri.** Yang dibutuhkan, dan sudah ditulis di
> `packages/core/src/security-headers.ts`: CSP pindah dari `headers()` ke
> `proxy.ts` (nonce baru per permintaan) · setiap halaman dirender dinamis ·
> `StyleProvider` AntD diberi nonce yang sama · `strict-dynamic` diuji terhadap
> Recharts dan pratinjau PDF blob. Kerusakan di dua bagian itu sulit dikenali:
> grafik kosong dan pratinjau yang gagal tidak menjatuhkan halaman.
>
> **Celah yang ikut ditemukan:** sebelumnya tidak ada tes yang menyentuh header
> keamanan. Seluruh CSP bisa dilemahkan atau dihapus tanpa tes merah, dan CSP yang
> lemah tidak menimbulkan gejala. `tests/security-headers.test.ts` (11 tes)
> menutupnya, termasuk dua tes yang menuntut sesuatu tetap tidak ada di produksi
> dan satu yang menuntut `style-src 'unsafe-inline'` tetap ada.

---

### ✅ P2-5 — Tabel jejak tumbuh tanpa kebijakan pemangkasan — **ditutup 11 Okt 2026**

**Bukti.** `scheduler_runs` = 1.246 baris (kadens per jam). `backup_runs` = 54.
`data/mail-outbox/` menyimpan `.eml` sejak Agustus. Tidak ada pemangkasan untuk
ketiganya.

**Dampak.** Saat itu kecil. Namun `scheduler_runs` tumbuh ~8.760 baris per tahun
tanpa batas, dan ikut di setiap dump cadangan.

**Perbaikan.**

> ✅ **Dikerjakan 11 Oktober 2026**, dengan dua aturan tambahan di luar resep
> semula.
>
> Resep semula menyebut dua aturan: 90 hari + semua `error` disimpan selamanya.
> Saat dikerjakan, ternyata dibutuhkan dua aturan lagi untuk kasus ketika ambang
> 90 hari tidak lagi melindungi apa pun:
>
> | # | Aturan | Cacat yang ditutupnya |
> |---|---|---|
> | 1 | Baris lebih baru dari ambang | — (resep semula) |
> | 2 | Status **bukan `ok`** disimpan tanpa batas | — (resep semula) |
> | 3 | **Baris TERAKHIR** selalu disimpan | Layanan yang mati 100 hari lalu kehilangan **seluruh** jejaknya. Tabel kosong terbaca `unknown` ("belum pernah jalan") alih-alih "berhenti pada tanggal X" — **pemangkasan yang menyembunyikan kegagalan** |
> | 4 | **Baris `ok` TERAKHIR** selalu disimpan | `health-report.ts` membaca baris `ok` terakhir **secara terpisah** (`where: { status: "ok" }`). Memangkasnya mengubah "berhasil terakhir 4 bulan lalu" menjadi "tidak pernah berhasil" — menghapus satu-satunya petunjuk bahwa mekanismenya pernah bekerja |
>
> Kasus 4 nyata: per 11 Okt 2026 `backup_runs` berisi 54 baris yang semuanya
> `error`. Bila satu cadangan berhasil lalu gagal 90 hari berturut-turut,
> pemangkasan naif akan menghapus bukti keberhasilan itu.
>
> Lingkupnya diperluas ke ketiga tabel: `scheduler_runs`, `backup_runs`,
> `conformance_runs`.
>
> Aturannya fungsi murni (`lib/run-trail-retention.ts`, tanpa impor), dijaga
> `tests/run-trail-retention.test.ts` (21 tes). `DELETE` yang salah tidak bisa
> dibatalkan, jadi tes terpenting di berkas itu adalah empat tes yang
> membuktikan baris tertahan. Dua di antaranya mengunci keadaan produksi saat itu:
> 1.251 baris penjadwal dan 54 baris cadangan, nol yang dipangkas.
>
> Dipanggil `job-scheduler` tiap jam sebagai langkah terakhir (kini ke-7, sesudah
> `watch:health`). Langkah ini satu-satunya yang menghapus, jadi bila putaran
> berhenti di tengah, yang tertunda adalah pekerjaan yang masih bisa diulang.
>
> `BATAS` timeout per langkah diturunkan setiap kali satu langkah ditambahkan
> (jumlah langkah × `BATAS` ≤ selang putaran); per 18 Okt tujuh langkah ×
> 480 s.

**Tidak ikut dikerjakan:** pemangkasan `data/mail-outbox/`. Itu artefak
pengembangan (transport surel `file`), tidak tumbuh di produksi yang memakai
SMTP, dan tidak ikut dalam cadangan basis data.

---

### 🟢 P3-1 — Berkas besar di lapisan domain — **garis dasar diukur 11 Okt 2026**

**Bukti (11 Okt).** `statement-layout.ts` 79 KB · `docs-content.ts` 68 KB ·
`posting/index.ts` 1.867 baris · `wizard.ts` 44 KB · `receivables.ts` 39 KB.

**Dampak.** Beban membaca, dan beban tipe: kamus i18n (~2.500 kunci dot-path
bertipe) memaksa batas heap `typecheck` naik dari 768 → 1536 MB, lalu ke
2048 MB sejak 17 Okt 2026 (jalan dingin OOM di 1536).

**Yang sudah benar.** `posting/index.ts` besar karena keputusan yang benar (satu
pintu), dan bagian murninya sudah dipisah ke `rules.ts`, `mapping.ts`,
`rates.ts`, `cogs.ts`.

> **Garis dasar 11 Okt 2026** (`/usr/bin/time -v bun run typecheck`, batas
> masih 1536 MB): inkremental 908 MB / 13 s; dingin (yang dialami CI dan setiap
> mesin baru, karena `tsconfig.tsbuildinfo` gitignored) 1.556 MB RSS / 82 s.
> Lulus, tetapi dengan margin tipis dan berjalan di swap.
>
> Pemicu yang ditulis saat itu (jalan dingin keluar `FatalProcessOutOfMemory`)
> terjadi 17 Okt. Hanya separuh resepnya dikerjakan: batas naik ke 2048 MB, kamus
> i18n belum dipecah. Pemicu berikutnya OOM di 2048; saat itu kamusnya dipecah,
> jangan hanya menaikkan batas lagi.

---

### ✅ P3-2 — Tes token API tidak menembus proxy — **sudah tertutup sebelum temuan ini ditulis**

Temuan ini disusun dari komentar `lib/api-v1.ts` yang menceritakan regresi
401-sebelum-penjaga (ada di produksi sampai 16 Agu 2026). Diperiksa 11 Okt:
`tests/proxy-bearer-api.test.ts` sudah ada dan memanggil `proxy()` sungguhan.
Tes itu memastikan setiap route v1 tidak dijawab 401 oleh proxy, `openapi.json`
publik, API sesi tetap dijaga, dan `isBearerApiPath` benar-benar dipanggil di
kode. Resep semula tidak perlu dikerjakan. Jalur proxy kedua yang mudah salah
kini juga teruji ujung-ke-ujung oleh `tests/proxy-landing-shortcut.test.ts`
(P3-4).

---

### 🟢 P3-3 — Tidak ada kepemilikan tercatat

**Bukti.** Tidak ada `CODEOWNERS`. Satu penulis commit.

**Dampak.** *Bus factor* = 1. Diperberat oleh banyaknya konteks yang dibawa
sistem ini: aturan seperti "`enterWith` tidak merambat setelah `await`" atau
"platform dulu, kendali belakangan" sudah tertulis, tetapi pembaca harus tahu di
mana mencarinya.

**Yang sudah benar.** Dokumentasi di dekat keputusan mengurangi risiko *bus
factor* jauh lebih baik daripada rata-rata. Set dokumen ini menambah peta ke
tempat konteks itu disimpan.

**Perbaikan.** `CODEOWNERS` bila nanti ada lebih dari satu orang; sampai itu,
pertahankan kebiasaan menulis alasan.

---

### ✅ P3-4 — Pemantulan `/` menempuh dua pantulan — **ditutup 11 Okt 2026, dengan koreksi**

**Temuan semula.** Pengguna bersesi yang membuka `/` dipantulkan ke `/dashboard`
(dipaku di `src/app/(marketing)/page.tsx`), lalu `/dashboard` memantulkan lagi ke
bukunya.

**Resep semula keliru** ("tambahkan `/` ke cabang `/login`/`/register` di
`src/proxy.ts`, cabut `auth()` dari pendaratan"). `/dashboard` menjalankan
`routeForCompany(companyId)`, satu query yang tidak bisa dijalankan di Edge,
untuk sesi tanpa slug. `resolvePostLoginPath` menjawab `/platform` bagi pemegang
urusan akun. Resep itu akan menghasilkan dua regresi tanpa galat.

**Yang dikerjakan:** proxy memotong `/` hanya bila token membawa kedua slug (dan
tidak wajib ganti sandi), ke alamat yang sama dengan jalur `/dashboard`. Di luar
itu proxy tidak bertindak, dan `auth()` di pendaratan tetap menjadi jalur
cadangan. Hasilnya satu pantulan tanpa render, dari semula dua pantulan dan satu
render. Dijaga `tests/proxy-landing-shortcut.test.ts` (9 tes; enam menguji kasus
yang tidak boleh dipantulkan, termasuk `/pricing`, yang sengaja dibiarkan sebagai
pertanyaan produk).

Perbaikan ini tidak membuat pendaratan statis: locale dibaca dari cookie, jadi
halaman pemasaran tetap dirender per permintaan
([dok 10 §4](./10-PORTABILITAS-DAN-PEMISAHAN.md)).

---

### ❓ Yang perlu dipastikan sebelum bisa dinilai

| Pertanyaan | Kenapa penting |
|---|---|
| Apakah ada yang membaca `/api/health` selain `watch:health`? | Menentukan lingkup pemantauan |
| Apakah latihan pemulihan kuartalan pernah dijalankan? | Diwajibkan `package.json`; tanpa bukti, RTO tak diketahui |
| Berapa RPO yang dapat diterima pemilik? | Menentukan apakah WAL/PITR masuk Tier 2 atau Tier 4 ([dok 10 §5](./10-PORTABILITAS-DAN-PEMISAHAN.md)) |
| Berapa RTO yang dapat diterima pemilik? | Menentukan apakah RPO 24 jam cukup |

---

## 3. Ringkasan prioritas

*Status per 18 Okt 2026.*

| # | Temuan | Keadaan | Usaha sisa |
|---|---|---|---|
| **P0-1** | Cadangan | 🟠 lokal ✅ (artefak terenkripsi harian, terbukti bisa dipulihkan sejak 12 Okt) / luar-mesin ❌ (`BACKUP_S3_BUCKET` kosong) | Rendah (3 env) |
| **P0-2** | Kunci cadangan 🔶 di mesin yang sama | ❌ terbuka | Rendah |
| ~~P0-3~~ | ~~Nol CI~~ | ✅ ditutup 11 Okt; `verify` required pada `main`, `develop` tanpa proteksi (disengaja) | — |
| ~~P1-1~~ | ~~Kegagalan latar tidak berbunyi~~ | ✅ ditutup 12–13 Okt; `watch:health` | — |
| ~~P1-2~~ | ~~Temuan kesesuaian hanya di stdout~~ | ✅ ditutup 11 Okt; jejak + `/api/health` + halaman konsol | — |
| ~~P1-3~~ | ~~Dokumen deploy bertentangan~~ | ✅ ditutup 11–12 Okt | — |
| **P2-1** | Basis data uji di produksi | 🟡 terklasifikasi; dua keputusan menunggu pemilik | Rendah |
| **P2-2** | Tanpa pemulihan per-pekerjaan | 🟡 putaran `error` kini mengirim peringatan; enam langkah tanpa jejak sendiri | Tinggi |
| **P2-3** | Satu `app-customer`, tanpa jalur skala | batas diketahui, belum tercapai | Tinggi |
| **P2-4** | CSP | 🟡 `unsafe-eval` dicabut di produksi; `style-src` struktural; jalur nonce terdokumentasi | Tinggi (sisanya) |
| ~~P2-5~~ | ~~Tabel jejak tanpa pemangkasan~~ | ✅ ditutup 11 Okt | — |
| **P3-1** | Berkas besar / beban tipe | 🟡 batas heap 2048 MB sejak 17 Okt; kamus i18n belum dipecah | Tinggi |
| ~~P3-2~~ | ~~Proxy tak teruji ujung-ke-ujung~~ | ✅ sudah tertutup sebelum ditulis | — |
| **P3-3** | Tanpa kepemilikan tercatat | sengaja ditunda sampai ada orang kedua | Rendah |
| ~~P3-4~~ | ~~Pemantulan `/` dua kali~~ | ✅ ditutup 11 Okt | — |

Temuan teratas semuanya menyangkut ketahanan data dan kemampuan sistem
melaporkan kegagalannya, tidak menyangkut struktur arsitektur. Yang tersisa di
puncak (salinan luar-mesin dan kunci di luar mesin) adalah pekerjaan
konfigurasi.

Lanjut: [09 Peta Jalan](./09-PETA-JALAN.md)
