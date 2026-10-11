# 08 — Penilaian Arsitektur

> Potret 11 Oktober 2026 · v0.9.0 · [indeks](./README.md)

**Cara membaca dokumen ini.** Setiap temuan menyebut **buktinya**, lalu
**dampaknya**, lalu apa yang **akan mengubah penilaiannya**. Temuan yang hanya
berisi pendapat tidak masuk. Yang bertanda 🔶 adalah simpulan dari bukti, bukan
pengamatan langsung; ❓ berarti butuh pemilik atau pengukuran.

**Satu peringatan.** Repositori ini punya kualitas yang tidak biasa: hampir
setiap keputusan sulit sudah **ditulis beserta alasannya dan beserta ukurannya**
di dekat kodenya. Beberapa "kelemahan" di bawah adalah **harga yang sudah
dibayar sadar-sadar**, dan dokumen ini menandainya begitu alih-alih
mengusulkan membatalkannya.

---

## 1. Kekuatan — yang sebaiknya tidak diutak-atik

### 1.1 Mode kegagalan dipilih, bukan diwarisi

Pola yang muncul berulang dan menjadi ciri sistem ini: **kegagalan yang sunyi
diubah menjadi kegagalan yang berisik, dengan sengaja.**

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

Ini bukan kumpulan kebetulan. Itu doktrin yang konsisten, dan ia **mahal untuk
dibangun ulang** kalau seseorang melonggarkannya demi kenyamanan.

### 1.2 Isolasi buku besar yang nyata, bukan berupa filter

Satu basis data MySQL per PT berarti kueri yang lupa `WHERE company_id` **tidak
bisa** mengembalikan baris PT lain — tidak ada baris PT lain **di sana**. Itu
jaminan yang berbeda kelas dari jaminan baris-bertenant, dan untuk perangkat
lunak akuntansi ia sepadan dengan harganya.

Diperkuat tiga lapis: nama basis data disaring regex, kredensial **tidak
pernah** disimpan di tabel, dan tidak ada FK yang menyeberang.

### 1.3 Satu pintu menuju buku besar

Gerbang **persetujuan** dan **kunci periode** hidup di `postForSource`, bukan di
route. Artinya menambah route baru **tidak bisa** melewatinya. Itu pilihan
desain yang menutup seluruh kelas lubang masa depan, bukan satu lubang.

Ditambah: jurnal **imutabel** (koreksi = pembalikan), posting **idempoten**, dan
**atomik** bersama tulisan sumbernya.

### 1.4 Penjaga sebagai tes, bukan sebagai konvensi

270 berkas tes berisi 4.559 tes, dan yang menarik bukan jumlahnya melainkan
**jenisnya**: banyak
di antaranya menjaga **aturan arsitektural**, bukan perilaku.

`authz-coverage` (rute tanpa izin = merah) · `business-modules-ledger` (laporan
mengimpor modul = merah) · `icon-rsc-boundary` (bentuk impor ikon) ·
`anchor-button-nesting` · `button-no-aschild` · `company-slug-immutable` ·
`cross-tenant-404` · `check-data-conformance` (skripnya hanya-baca) ·
`backup-script` · `docs` (halaman docs tak boleh menyentuh sesi).

Tes semacam ini membuat aturan **selamat dari pergantian orang**.

### 1.5 Kelas skrip "buktikan", bukan "laporkan"

`prove-scheduler-alive`, `prove-backup-restore`, `prove-tenant-adoption`,
`prove-company-slug-immutable`, `prove-company-slug-scope`. Ditambah doktrin
yang tercatat: **buktikan migrasi lewat angka pra/pasca, bukan lewat laporan
skrip**, dan **sapu `.next/server` untuk membuktikan fitur terjangkau**.

`prove-backup-restore` secara khusus menolak memuat dump ke basis data mana pun
— "tidak ada nilai pembuktian yang sepadan dengan risiko itu". Itu pertimbangan
yang benar.

### 1.6 Pemeriksa kesesuaian data

Mengakui bahwa penjaga zod hanya berlaku di jalur **tulis**, lalu membangun
layanan terpisah untuk jalur yang tidak melewatinya (impor sekali-jalan,
perbaikan SQL manual, penyemai). Lahir dari enam kelas cacat nyata yang
ditemukan dengan menggali dua hari. Ia menjawab masalah yang **terbukti ada**.

### 1.7 Dokumentasi di dekat keputusannya

Komentar di repo ini menyimpan **ukuran** dan **tanggal**: "terukur 768 gagal
walau 607 MB bebas; 1400 lolos", "diukur di route handler Next 16.2.1/Node
22.22: `holder() === holder()` → false", "produksi berjalan 26 hari tanpa satu
pun salinan". Itu membuat keputusan bisa **ditinjau ulang** alih-alih hanya
dipatuhi atau dilanggar.

### 1.8 Degradasi berjenjang yang konsisten

Doktrin #137 — **penagihan mati ≠ aplikasi mati** — ditegakkan di tingkat
impor (`platform-db.ts` dilarang dari jalur panas), di tingkat klien (dibuat
saat dipakai, bukan saat modul dimuat), dan di tingkat probe (`/api/health`
melaporkan tanpa memutuskan). Tiga lapis untuk satu janji.

---

## 2. Temuan — berurutan menurut prioritas

### 🔴 P0-1 — Cadangan belum pernah berhasil sekali pun

**Bukti**

| Sumber | Nilai |
|---|---|
| `/api/health` → `backup.status` | `"failing"` |
| `lastSuccessAt` | **`null`** |
| `backup_runs` | **54 baris** |
| `.env` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET` **tidak ada** |

**Dampak.** Tidak ada salinan luar-mesin dari 17 buku PT (+ kendali + platform), dokumen, dan jejak
audit **11 tenant pelanggan**. Satu kegagalan disk, satu `DROP DATABASE` yang
salah sasaran, atau satu kehilangan mesin = **kehilangan permanen pembukuan
pelanggan**.

Ini **bukan risiko teknis, melainkan risiko hukum**: pembukuan wajib disimpan
sepuluh tahun (UU KUP), dan kalimat itu ditulis di `docker-compose.yml` sendiri
sebagai alasan layanan ini ada.

**Yang meringankan.** `backups/` berisi dump pra-promosi manual, terbaru
`pra-promosi-0017-2026-10-11-0022.sql` pada hari potret. Jadi ada disiplin dump
saat rilis — tetapi **di mesin yang sama dengan datanya**, yang tidak melindungi
dari kehilangan mesin.

**Yang sudah benar.** Pemangkasan dikerjakan **paling akhir dan hanya bila
unggahan sukses**, jadi tidak ada yang dihapus. Kegagalannya pun **tercatat**
(`backup_runs`) dan **terbaca** (`/api/health`). Perbaikannya karena itu
kemungkinan besar **hanya tiga variabel lingkungan**.

**Perbaikan.** Setel ketiga env, jalankan satu putaran manual, lalu
`docker compose run --rm job-backup bun run prove-backup-restore`.

**Yang mengubah penilaian ini:** `lastSuccessAt` tidak lagi `null` **dan**
`prove-backup-restore` lulus.

---

### 🔴 P0-2 — Kunci enkripsi cadangan 🔶 kemungkinan hanya ada di mesin yang sama

**Bukti.** `BACKUP_ENCRYPTION_KEY` ada di `.env` di mesin produksi.
❓ Tidak ada petunjuk di repo bahwa ia disalin ke luar.

**Dampak.** Begitu P0-1 selesai, cadangan akan terenkripsi AES-256-CBC. Kalau
kuncinya **hanya** ada di mesin yang hilang bersama datanya, cadangan itu
**tidak bisa dibuka** — dan kita akan mengira punya pemulihan padahal tidak.
Bentuk kegagalan yang paling mahal: terasa seperti punya.

**Perbaikan.** Simpan kunci di pengelola rahasia / luar-mesin, lalu
dokumentasikan **di mana** (bukan nilainya). Buktikan dengan memulihkan di
mesin yang **tidak** punya `.env` produksi.

**Prioritas setara P0-1** — keduanya harus selesai bersama, karena P0-1 tanpa
P0-2 menghasilkan rasa aman yang salah.

---

### 🔴 P0-3 — Tidak ada apa pun yang menjalankan tes sebelum kode mencapai produksi

**Bukti.** Diperiksa langsung di `.github/workflows/` dan API proteksi cabang:

| Yang dicari | Hasil |
|---|---|
| Workflow dengan pemicu `pull_request` | **tidak ada** |
| Workflow yang menjalankan `verify` / `test` / `typecheck` / `lint` | **tidak ada** |
| `required_status_checks` pada `main` | **tidak ada** |
| `required_approving_review_count` pada `main` | **0** |
| Berkas tes yang ada di repo | **270** (4.559 tes) |

Dua workflow yang ada (`publish-image.yml`, `build-standalone.yml`) keduanya
hanya memicu pada `push` ke `main` — dan keduanya **membangun**, tidak satu pun
**memeriksa**.

**Dampak.** `AGENTS.md` menjadikan `bun run verify` gerbang WAJIB, dan
`next.config.ts` mematikan pemeriksaan tipe di dalam `next build`. Gabungan
keduanya berarti:

> **Satu-satunya yang berdiri antara sebuah galat tipe dan image produksi yang
> terbit adalah seorang manusia yang ingat menjalankan sebuah perintah.**

Dan jalurnya bukan hipotesis — ia ditempuh saat dokumen ini disusun: PR #599
di-merge ke `main`, lalu **tiga image terbit ke GHCR**, tanpa satu pun
pemeriksaan pernah berjalan. Diff-nya memang Markdown murni sehingga tidak bisa
merusak apa pun, tetapi **mekanismenya tidak membedakan** diff Markdown dari
perubahan `src/`.

Proteksi `main` melindungi dari force-push dan penghapusan (`enforce_admins`
aktif), tetapi **tidak** dari merge kode yang belum diuji.

**Kenapa ini P0 dan bukan P1.** Tiga alasan:

1. **Ia gerbang yang melindungi setiap perbaikan lain di dokumen ini.** Tanpa
   CI, P0-1 dan P1-1 bisa diperbaiki hari ini lalu regresi diam-diam bulan
   depan, dan tidak ada yang akan tahu.
2. **Usahanya paling rendah dari semua temuan di sini** — satu berkas workflow
   ~20 baris, plus satu setelan proteksi cabang.
3. **Gerbangnya sudah ada, sudah ditulis, dan sudah dipatuhi manusia.** Yang
   hilang bukan disiplinnya melainkan otomasinya — jadi ini bukan perubahan
   proses, hanya memindahkan gerbang yang sudah berlaku ke tempat yang tidak
   bisa lupa.

**Perbaikan.**

```yaml
# .github/workflows/verify.yml
name: Verify
on:
  pull_request:
  push:
    branches: [develop]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: bun run db:generate     # TIGA klien — lihat build-standalone.yml
      - run: bun run verify
```

Lalu jadikan job `verify` sebagai **required status check** pada `main`
(dan sebaiknya pada `develop`).

⚠ Dua jebakan yang sudah terdokumentasi di repo ini dan berlaku di sini:
`bun run db:generate`, **bukan** `bunx prisma generate` — ada tiga skema, dan
`src/generated/` gitignored sehingga hanya CI yang mulai dari nol. Dan
**jangan** pakai `| tail`, yang menutupi kode keluar.

🔶 Catatan ongkos: runner GitHub punya memori yang cukup, jadi batas heap
`typecheck` (1536 MB) bukan masalah di sana — berbeda dari kotak produksi.
`bun run build` **tidak** perlu ikut di CI PR; ia tetap tanggung jawab sesi
utama di atas hasil gabungan, sesuai `AGENTS.md`.

---

### 🟠 P1-1 — Kegagalan latar tidak berbunyi ke siapa pun

**Bukti.** `lib/alert.ts` dipanggil dari **tepat dua berkas**:
`api/auth/register/route.ts` dan `api/auth/verify-email/route.ts`.

**Dampak.** Yang **tidak** memberi tahu siapa pun:

- cadangan gagal — **54 kali berturut-turut**
- putaran penjadwal `error` atau dibunuh `timeout`
- temuan `job-conformance` mingguan
- basis data perusahaan tak terjangkau

Ini **persis bentuk kegagalan yang seluruh repo ini dirancang menghindari**, dan
P0-1 adalah buktinya: 54 kegagalan berurutan tanpa satu pun kabar keluar. Dan
sejarahnya terulang — `backup.sh` sendiri mencatat bahwa produksi pernah
berjalan **26 hari tanpa satu salinan** dan "tidak ada yang berbunyi ke luar
sekali pun".

**Yang sudah benar.** Modulnya dirancang baik: peredam satu surel per sidik
jari per jam, memakai `rate-limit-persistent` yang atomik dan selamat dari
restart; sidik jari = nama peristiwa + nama galat, bukan pesannya. Kanalnya
siap (`PLATFORM_CONTACT_EMAIL` ada di `.env`). **Yang kurang hanya
pemanggilan.**

**Perbaikan.** Panggil `alert()` dari: `scripts/backup.sh` (jalur `die`),
`subscription-scheduler.ts` (status `error`), `check-data-conformance.ts`
(temuan), dan pemeriksa `company` di `health-report.ts`.

🔶 Catatan: `alert()` mengirim **surel**, dan surel yang gagal tidak bisa
melaporkan dirinya sendiri. Satu kanal kedua (webhook/ping luar) layak
dipertimbangkan, tetapi **jangan jadikan itu prasyarat** — satu kanal jauh
lebih baik daripada nol.

---

### 🟠 P1-2 — Temuan kesesuaian data hanya ada di stdout

**Bukti.** Layanan `job-conformance` menulis ke stdout. Tidak ada tabel setara
`scheduler_runs`/`backup_runs`, tidak ada medan di `/api/health`, tidak ada
halaman operator.

**Dampak.** Satu-satunya cara mengetahui temuan adalah **mengingat** untuk
menjalankan `docker compose logs job-conformance` dalam jendela retensi log
container. Pada kadens **mingguan**, sebuah cacat bisa berumur berbulan-bulan.

Yang membuat ini pantas P1 dan bukan P2: layanan ini **sudah menemukan** enam
kelas cacat nyata di buku produksi, termasuk kuantitas faktur termigrasi salah
senilai **Rp 774 juta**. Ia alat yang terbukti berguna dengan keluaran yang
paling mudah tidak terlihat.

Ia juga asimetri yang jelas: dua layanan latar lain **punya** jejak yang bisa
ditanyai; yang ini tidak.

**Perbaikan.** Tabel `conformance_runs` di platform (sepola `scheduler_runs`) +
medan di `/api/health` + panggilan `alert()`. Bisa dikerjakan bersama P1-1.

---

### ✅ P1-3 — Dokumentasi penggelaran saling bertentangan — **DITUTUP 11 Okt 2026**

**Bukti.** Lima berkas menjelaskan cara menggelar, dan mereka tidak sepakat.
`PRODUCTION.md` §2 menyarankan `bun run setup:prod` (yang menjalankan
`next build` **di server**) sementara §Updates **melarangnya** — dan larangan
itu didukung ukuran: ~19 menit, iowait 58–92%, dua build bersamaan pernah OOM.

Ditambah `HOSTING.md` / `HOSTING-LOW-MEMORY.md` / `HOSTING-NO-NODE.md`
(🔶 tampak warisan, **belum ditandai**), `DOCKER.md` (tumpang tindih),
dua `ecosystem.config*.cjs` untuk PM2 yang tidak dipakai, dan
`build-standalone.yml` di samping `publish-image.yml`.

`README.md` ikut membusuk di tiga tempat yang terbukti:

| Klaim di `README.md` | Keadaan sebenarnya |
|---|---|
| §Production → `bun run setup:prod` | Menjalankan `next build` **di server** — dilarang `AGENTS.md` |
| §Security → "Audit log: `data/audit/audit.jsonl`" | Jejak audit **sudah pindah ke tabel**: `audit_logs` per buku PT (migration 0044 + `migrate:audit`) dan `tenant_audit_logs` di kendali |
| §Scripts → `bun run db:migrate` tanpa peringatan | Pada pemasangan multi-PT perintah itu **berbahaya** — lihat dok 07 §6 |

**Dampak.** Seseorang yang menggelar untuk pertama kali — atau di tengah
insiden — membaca dari atas dan menemukan nasihat yang **salah dan merugikan**
sebelum menemukan yang benar. Berbeda dari utang dokumentasi biasa: nasihat ini
**memperlambat produksi yang sedang melayani**.

**Perbaikan.** Jadikan `PRODUCTION.md` §Updates satu-satunya jalur yang hidup;
beri bagian basi penanda warisan yang sama dengan §PM2 yang sudah ada; satukan
atau tandai ketiga `HOSTING*.md`; putuskan nasib `build-standalone.yml`; dan
perbaiki tiga klaim basi di `README.md` di atas.

**Murah dan berdampak langsung** — tidak ada kode yang berubah.

> ✅ **DITUTUP 11 Oktober 2026.** Yang dikerjakan: `PRODUCTION.md` mendapat
> banner "pergi langsung ke §Updates" + tabel "saya mau apa → ke mana", dan §2,
> §4, §5 ditandai **LEGACY di tempatnya** beserta alasan terukurnya (~19 menit,
> iowait 58-92%, OOM pada dua build bersamaan). Ketiga `HOSTING*.md` mendapat
> penanda warisan di kepalanya. `DOCKER.md` mendapat penunjuk ke jalur yang
> hidup. `README.md` berhenti menyebut `HOSTING.md` sebagai "easier path".
> `docs/README.md` lahir sebagai indeks tunggal — sebelumnya `docs/` tidak punya
> indeks sama sekali. Dan satu PNG yatim 1,03 MB (tangkapan layar localhost,
> nol rujukan) dihapus.
>
> `HOSTING*.md` dan `ecosystem.config*.cjs` **tidak dihapus**, dan itu keputusan
> berdasar bukti: `scripts/package-standalone.sh` masih menyalin
> `ecosystem.config.low-memory.cjs` dan merujuk `HOSTING-LOW-MEMORY.md`.
> Menghapus dokumennya akan meninggalkan skrip yang tidak dijelaskan apa pun.
> Keduanya ikut dicabut kalau kelak skrip itu dicabut.

---

### 🟡 P2-1 — Basis data uji/demo hidup di instans produksi

**Bukti.** Empat dari 17 buku di instans produksi bernama seperti buku uji:
`sai_t11_data_dummy`, `sai_t1_uji_wisaya_416`, `sai_t1_uji_pindahan_425`,
`sai_t2_demo`. Dan dua kelompok nama yang nyaris kembar —
`sai_t8_pt_saro` / `sai_t8_pt_saroo` / `sai_t8_pt_saro_sejati`, serta
`sai_t9_cv_saro` / `sai_t9_pt_saro` — berpola seperti percobaan berulang.

Semuanya **terdaftar** di `sai_control` dan `is_active = 1`.

🔶 **Tersimpulkan:** tidak ada lingkungan staging (tidak ada definisi di repo),
jadi pengujian terjadi di produksi.

**Dampak.**

1. Setiap buku ikut `--all-databases`, jadi cadangan membawa data uji —
   menaikkan ukuran & waktu tanpa nilai.
2. `check-data-conformance` menyapu **setiap** buku, jadi temuan dari buku uji
   mencemari laporan yang seharusnya tentang data sungguhan — tepatnya pada
   layanan yang nilainya bergantung pada temuannya dipercaya.
3. Karena semuanya `is_active = 1`, keduanya ikut dihitung sebagai perusahaan
   di permukaan mana pun yang menghitung perusahaan.

**Yang TERBUKTI TIDAK bermasalah** (diperiksa saat menyusun dokumen ini):
jumlah buku di MariaDB (**17**) **sama** dengan jumlah yang terdaftar di
`sai_control` (**17**). Tidak ada basis data yatim, jadi tidak ada yang
terlewat `db:migrate:all`. `sai_production` — satu-satunya yang tidak berpola
`sai_t<N>_…` — **terdaftar**; 🔶 kemungkinan buku pra-#104 yang diadopsi.

**Perbaikan.** Tandai buku uji (kolom atau konvensi nama yang dibaca skrip),
lalu kecualikan dari laporan kesesuaian; putuskan apakah staging terpisah
sepadan harganya pada skala ini (🔶 mungkin belum).

⚠ **Jangan menghapus berdasarkan nama.** `sai_t4_sai`, `sai_t4_selamat`, dan
kelompok `saro` **belum tentu** uji. Pastikan lewat `sai_control` + isi bukunya.

---

### 🟡 P2-2 — Tidak ada pemulihan per-pekerjaan di jalur latar

**Bukti.** Tidak ada antrean. Lima produser berjalan berurutan tiap jam dengan
`|| true` + `timeout -k 30 600`.

**Dampak.** Satu produser yang gagal menunggu **satu jam** untuk mencoba lagi.
Yang dibunuh `timeout` kehilangan putaran itu. Tidak ada *dead-letter*, jadi
pekerjaan yang **selalu** gagal akan gagal selamanya — terlihat di log, tetapi
tanpa kabar keluar (lihat P1-1).

**Yang sudah benar, dan kenapa ini P2 dan bukan P1.** Idempotensi dikerjakan
serius: `dedupe_key`, kunci unik `(invoice_id, reminder_kind,
reminder_due_key)`, `(template_id, occurrence_date)`. Jadi putaran berikutnya
**menyembuhkan** yang tertinggal. Pada 11 tenant dengan kadens per jam, itu
memang cukup.

`timeout` juga sudah ditambahkan karena pelajaran nyata (30 Agu 2026): `|| true`
melindungi dari yang **gagal**, bukan dari yang **menggantung**, dan satu
langkah menggantung dua jam menahan **seluruh** putaran berikutnya selamanya.

**Perbaikan.** **Jangan tambah antrean sekarang.** Pemicunya: (a) jumlah tenant
naik sampai satu putaran tidak muat dalam satu jam, atau (b) satu produser mulai
butuh *retry* lebih cepat dari sejam. Keduanya belum terjadi.

---

### 🟡 P2-3 — Satu container `app-customer`, tanpa jalur penskalaan

**Bukti.** Satu `app-customer` tanpa replika. Cache dalam-memori: pengaturan surel
(TTL 60s), kolam klien LRU, penyimpan konteks per-permintaan.

**Dampak.** Restart mengosongkan setiap cache (murah, benar). Tetapi menambah
replika hari ini akan menghasilkan dua kolam LRU dan dua cache surel yang
**menyimpang** — lalu "kenapa pengaturan berubah tergantung muat ulang?" yang
sulit didiagnosis.

**Yang sudah benar.** Anggaran koneksi sudah dihitung eksplisit (8+2+1 = 11 dari
`app-customer`), jadi batas skala **diketahui**, bukan ditemukan saat tumbang.

**Perbaikan.** Tidak ada sekarang. Sebelum replika pertama, dibutuhkan cache
bersama (atau pencabutan cache dalam-memori) **dan** peninjauan ulang
`max_connections`. Dicatat sebagai **prasyarat**, bukan pekerjaan.

---

### 🟡 P2-4 — CSP memakai `unsafe-inline` + `unsafe-eval`

**Bukti.** `next.config.ts`:
`script-src 'self' 'unsafe-inline' 'unsafe-eval'`.

**Dampak.** Melemahkan pertahanan XSS cukup banyak — tepatnya lapisan yang
paling berguna di aplikasi yang menampilkan nama pelanggan, catatan, dan nama
berkas unggahan.

🔶 **Tersimpulkan** sebagai tuntutan Next.js + runtime CSS-in-JS Ant Design.
❓ Tidak ada komentar di repo yang mencatat apakah nonce pernah dicoba — dan
ketiadaan catatan itu sendiri ganjil di repo yang mencatat segalanya, yang
menunjukkan ini **belum pernah ditinjau** alih-alih sudah ditimbang.

**Yang sudah benar.** Header lain lengkap dan ketat: `frame-ancestors 'none'`,
`object-src` dibatasi, HSTS dengan preload, `form-action 'self'`,
`X-Frame-Options: DENY`.

**Perbaikan.** Tinjau apakah `nonce` + `strict-dynamic` layak. Kalau tidak,
**tulis alasannya di `next.config.ts`** — sepola setiap keputusan lain di repo
ini. Jawaban "tidak bisa, karena X" yang tertulis sudah merupakan kemajuan.

---

### 🟡 P2-5 — Tabel jejak tumbuh tanpa kebijakan pemangkasan

**Bukti.** `scheduler_runs` = **1.246** baris (kadens per jam).
`backup_runs` = 54. `data/mail-outbox/` menyimpan `.eml` sejak Agustus. Tidak
ada pemangkasan yang terlihat untuk ketiganya.

**Dampak.** Hari ini sepele. Tetapi `scheduler_runs` tumbuh **~8.760 baris per
tahun** selamanya, dan ia ikut dalam setiap dump cadangan.

**Perbaikan.** Pemangkasan di layanan `job-scheduler` (mis. pertahankan 90 hari,
plus **semua** baris `error` tanpa batas waktu — kegagalan adalah yang paling
berharga). Tunda sampai P0/P1 selesai.

---

### 🟢 P3-1 — Berkas besar di lapisan domain

**Bukti.** `statement-layout.ts` 79 KB · `docs-content.ts` 68 KB ·
`posting/index.ts` 1.867 baris · `wizard.ts` 44 KB · `receivables.ts` 39 KB.

**Dampak.** Beban membaca. Dan beban **tipe**: kamus i18n (~2.500 kunci
dot-path bertipe) sudah memaksa batas heap `typecheck` dari 768 ke 1536 MB.

**Yang sudah benar.** `posting/index.ts` besar justru karena keputusan yang
benar (satu pintu), dan bagian murninya **sudah** dipisah ke `rules.ts`,
`mapping.ts`, `rates.ts`, `cogs.ts`.

**Perbaikan.** Tidak ada yang mendesak. Pemicunya: `typecheck` menembus 1536 MB
lagi. Saat itu, memecah **kamus** lebih berdampak daripada memecah modul domain
— dan `next.config.ts` sudah menyebut itu sebagai kandidat.

---

### 🟢 P3-2 — Tes token API tidak menembus proxy

**Bukti.** Tercatat di `lib/api-v1.ts`: seluruh tes token memanggil
`requireApiToken` **langsung**, jadi tak satu pun bisa melihat penolakan satu
lapis di atasnya. Akibatnya cacat 401-sebelum-penjaga **lolos `verify` DAN
`build`** dan hidup di produksi sampai 16 Agustus 2026.

**Dampak.** Celah kelas-penjaga tetap ada: kebenaran `src/proxy.ts` sendiri
**tidak** teruji ujung-ke-ujung. Cacat berikutnya di lapisan itu akan lolos
dengan cara yang sama.

**Yang sudah benar.** Kejadiannya dicatat lengkap beserta mengapa ia lolos —
itu sendiri sudah mitigasi, karena orang berikutnya diperingatkan.

**Perbaikan.** Satu tes yang memanggil `proxy()` dengan permintaan ber-`Bearer`
dan menuntut ia **tidak** dipantulkan. 🔶 Mungkin cukup satu tes unit terhadap
fungsi keputusan proxy — tidak perlu server sungguhan.

---

### 🟢 P3-3 — Tidak ada kepemilikan tercatat

**Bukti.** Tidak ada `CODEOWNERS`. Satu penulis commit.

**Dampak.** *Bus factor* = 1. Diperberat oleh kedalaman konteks yang dibawa
sistem ini: aturan seperti "`enterWith` tidak merambat setelah `await`" atau
"platform dulu, kendali belakangan" **tertulis**, tetapi memerlukan pembaca yang
tahu harus mencari di mana.

**Yang sudah benar, dan ini layak dinyatakan.** Dokumentasi di dekat keputusan
adalah mitigasi *bus factor* yang **jauh** lebih baik daripada rata-rata. Set
dokumen ini dimaksudkan menambah satu lapis lagi: peta ke tempat konteks itu
tinggal.

**Perbaikan.** `CODEOWNERS` bila nanti ada lebih dari satu orang; sampai itu,
pertahankan disiplin menulis alasan.

---

### ✅ P3-4 — Pemantulan `/` menempuh dua pantulan — **DITUTUP 11 Okt 2026, dengan koreksi**

**Bukti.** `src/app/(marketing)/page.tsx:124`:

```ts
const session = await auth();
if (session) redirect("/dashboard");     // ← dipaku
```

`src/proxy.ts:269` sudah melakukan hal yang **sama tetapi lebih baik** untuk dua
jalur lain:

```ts
if ((pathname === "/login" || pathname === "/register") && token) {
  const destination = resolvePostLoginPath(…token…);   // tahu tenant & PT
  return NextResponse.redirect(new URL(destination, request.url));
}
```

Dan `src/proxy.ts` baris ~30 memuat pembenaran kenapa `/` **tidak** ikut:

> *"Pemantulan untuk yang SUDAH bersesi tetap ada, tapi di halamannya sendiri:
> ia yang tahu tujuan pasca-masuk, dan proxy tidak boleh menduanya."*

**Pembenaran itu sudah dibatalkan oleh pekerjaan #172 sendiri.** Proxy kini
*memang* menghitung tujuan pasca-masuk — lewat `resolvePostLoginPath`, fungsi
**murni dan aman-edge** (tanpa Prisma, tanpa `node:*`), dari JWT. Sementara
halamannya memakai `/dashboard` yang dipaku, yaitu versi yang **lebih kasar**
dan satu hop lebih panjang bagi pengguna.

**Dampak.** Kecil tapi nyata: pengguna bersesi yang membuka `/` memantul ke
`/dashboard`, lalu `/dashboard` memantul lagi ke bukunya. Dua pantulan di tempat
yang seharusnya satu.

> ## ⚠ KOREKSI — resep di atas SALAH, dan akan menyebabkan regresi
>
> Resep semula berbunyi: *"tambahkan `pathname === "/"` ke kondisi yang sudah
> ada di `src/proxy.ts:269`, lalu cabut `auth()` dari halaman pendaratan."*
> Diperiksa lebih dalam saat mengerjakannya, **keduanya salah** — dan
> pembenaran yang saya sebut "kedaluwarsa" itu ternyata sebagian besar masih
> benar.
>
> **Yang terlewat:** `redirect("/dashboard")` **bukan** hop yang sia-sia. Berkas
> `app/(app)/(dashboard)/dashboard/page.tsx` mengerjakan sesuatu yang proxy
> **tidak bisa** — ia menjalankan `routeForCompany(companyId)`, satu **query
> basis data**, untuk melayani rombongan yang tokennya belum membawa slug:
> sesi lama pra-#157, pemegang banyak PT yang belum memilih, dan pelanggan yang
> belum punya PT. Runtime Edge tidak punya akses Prisma.
>
> Dan `resolvePostLoginPath` **bukan** versi yang lebih baik untuk jalur ini: ia
> menjawab pertanyaan lain ("sesi baru sah, ke mana?") dan sejak #172
> menjawab `/platform` bagi pemegang urusan akun. Memakainya di `/` akan
> melempar **setiap pemilik akun** ke panel akun alih-alih ke bukunya —
> perubahan perilaku, bukan penghematan pantulan.
>
> Jadi resep semula akan: (a) mengirim sesi tanpa slug ke `/platform` alih-alih
> ke bukunya, dan (b) memindahkan setiap pemilik akun dari buku ke panel. Dua
> regresi, keduanya senyap.

**Yang DIKERJAKAN sebagai gantinya** — jalan pintas sempit, nol perubahan
perilaku:

Proxy memotong `/` **hanya** ketika tokennya sudah membawa **kedua slug** (dan
tidak sedang wajib ganti sandi), dan tujuannya
`tenantPath(tenantSlug, companySlug, COMPANY_HOME_PATH)` — **alamat yang sama
persis** dengan yang dicapai hari ini lewat `/dashboard`. Tanpa kedua slug,
proxy **menyerah** dan halamannya tetap memutuskan; karena itu `auth()` di
halaman pendaratan **dipertahankan** — ia jalur cadangan untuk rombongan itu,
bukan sisa yang lupa dicabut.

Doktrin itu bukan baru: blok "jalur lama" di `proxy.ts` sudah menuliskannya —
*"Tanpa slug di token … TIDAK ada pantulan: penjaga halaman yang
mengarahkannya, satu-satunya tempat aturan itu ditulis."*

Hasilnya: dua pantulan + satu render → **satu pantulan, nol render**, dengan
alamat akhir identik.

**Penjaganya** `tests/proxy-landing-shortcut.test.ts` — 9 tes yang memanggil
`proxy()` sungguhan, dan **enam di antaranya menguji kasus yang TIDAK boleh
dipantulkan** (tanpa sesi, companyId tanpa slug, tanpa perusahaan, slug
separuh, wajib ganti sandi, dan `/pricing`). Yang terakhir mengunci lingkupnya:
`/pricing` memantulkan dengan cara yang sama, tetapi **apakah ia seharusnya**
adalah pertanyaan produk — pelanggan yang ingin naik paket justru datang untuk
melihat harga — jadi ia sengaja dibiarkan sampai pertanyaan itu diputuskan.

⚠ **Dan ini tetap BUKAN perbaikan performa yang membuat pendaratan statis.**
`getLocale()` membaca cookie (dan `Accept-Language`) pada setiap permintaan,
jadi ketiga halaman pemasaran per-permintaan **secara konstruksi**. Lihat
[dok 10 §4](./10-PORTABILITAS-DAN-PEMISAHAN.md).

---

### ❓ Yang perlu dipastikan sebelum bisa dinilai

| Pertanyaan | Kenapa penting |
|---|---|
| Apakah ada yang **membaca** `/api/health`? | Menentukan apakah P1-1 adalah lubang tunggal atau salah satu dari dua |
| Apakah latihan pemulihan kuartalan pernah dijalankan? | Diwajibkan `package.json`; tanpa bukti, RTO tak diketahui |
| Mana dari 17 buku yang **uji** dan mana yang **produksi**? | Menentukan apa yang dikecualikan dari laporan kesesuaian |
| Apakah `build-standalone.yml` masih dipakai? | Menentukan apakah ia dihapus atau ditandai |
| Berapa RPO yang dapat diterima pemilik? | Menentukan apakah binlog/PITR masuk Tier 2 atau Tier 4 ([dok 10 §5](./10-PORTABILITAS-DAN-PEMISAHAN.md)) |
| Setuju memisahkan container operator di produksi? | Perubahan infrastruktur; nol kode, ~60 MB ([dok 10 §3](./10-PORTABILITAS-DAN-PEMISAHAN.md)) |
| Apakah `HOSTING*.md` masih berlaku? | Sama |
| Berapa RTO yang dapat diterima pemilik? | Menentukan apakah RPO 24 jam cukup |
| `inventory.suburanugerahindonesia.com` masih aktif? | Host uji di `DOCKER.md` |

---

## 3. Ringkasan prioritas

| # | Temuan | Dampak | Usaha | Risiko mengubah |
|---|---|---|---|---|
| **P0-1** | Cadangan belum pernah berhasil | **Kehilangan data + risiko hukum** | **Rendah** (3 env) | Rendah |
| **P0-2** | Kunci cadangan 🔶 di mesin yang sama | Pemulihan yang terasa ada padahal tidak | Rendah | Rendah |
| **P0-3** | **Nol CI — tak ada yang menjalankan 270 berkas tes** | Kode belum teruji bisa terbit ke produksi | **Rendah** | Rendah |
| **P1-1** | Kegagalan latar tidak berbunyi | Kegagalan sunyi berumur panjang | Rendah | Rendah |
| **P1-2** | Temuan kesesuaian hanya di stdout | Cacat data tak terlihat berbulan-bulan | Sedang | Rendah |
| ~~P1-3~~ | ~~Dokumen penggelaran bertentangan~~ | ✅ **ditutup 11 Okt 2026** | — | — |
| **P2-1** | Basis data uji di produksi | Cadangan & laporan tercemar; 1 DB tak terdaftar | Sedang | Sedang |
| **P2-2** | Tanpa pemulihan per-pekerjaan | Perbaikan tertunda sejam | Tinggi | Sedang |
| **P2-3** | Satu `app-customer`, tanpa jalur skala | Batas skala diketahui, belum tercapai | Tinggi | Sedang |
| **P2-4** | CSP `unsafe-inline`/`eval` | Pertahanan XSS lemah | Sedang | **Tinggi** (bisa merusak UI) |
| **P2-5** | Tabel jejak tanpa pemangkasan | Pertumbuhan lambat | Rendah | Rendah |
| **P3-1** | Berkas besar | Beban baca & tipe | Tinggi | Sedang |
| **P3-2** | Proxy tak teruji ujung-ke-ujung | Kelas cacat bisa terulang | Rendah | Rendah |
| ~~P3-4~~ | ~~Pemantulan `/` menempuh dua pantulan~~ | ✅ **ditutup 11 Okt 2026** — resep semula dikoreksi, lihat temuannya | — | — |
| **P3-3** | Tanpa kepemilikan tercatat | *Bus factor* 1 | Rendah | Nol |

**Pengamatan yang layak dinyatakan:** empat temuan teratas semuanya **soal
dapat-diamati, bukan soal arsitektur**. Bentuk sistemnya sehat; yang kurang
adalah kemampuannya memberi tahu kita ketika ia tidak sehat. Dan ketiga P0/P1
pertama berusaha **rendah** — ini bukan proyek, ini sore hari.

Lanjut: [09 Peta Jalan](./09-PETA-JALAN.md)
