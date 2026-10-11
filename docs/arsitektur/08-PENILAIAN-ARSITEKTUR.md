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

276 berkas tes berisi 4.654 tes, dan yang menarik bukan jumlahnya melainkan
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

### ✅ P0-3 — Tidak ada apa pun yang menjalankan tes sebelum kode mencapai produksi — **DITUTUP 11 Okt 2026**

**Bukti.** Diperiksa langsung di `.github/workflows/` dan API proteksi cabang:

| Yang dicari | Hasil |
|---|---|
| Workflow dengan pemicu `pull_request` | **tidak ada** |
| Workflow yang menjalankan `verify` / `test` / `typecheck` / `lint` | **tidak ada** |
| `required_status_checks` pada `main` | **tidak ada** |
| `required_approving_review_count` pada `main` | **0** |
| Berkas tes yang ada di repo | **270** (4.559 tes) — *angka saat temuan ini ditulis; 273 per 11 Okt 2026 sore* |

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

> ✅ **DITUTUP 11 Oktober 2026 — dua langkah, keduanya selesai.**
>
> **(1) Workflow-nya ada** (`.github/workflows/verify.yml`) dan sudah terbukti
> hijau belasan kali di ketiga pemicunya (`pull_request`, push `develop`, push
> `main`).
>
> **(2) `verify` kini REQUIRED STATUS CHECK pada `main`:**
>
> ```
> required_status_checks.strict   : false
> required_status_checks.checks   : [{ context: "verify", app_id: 15368 }]
> enforce_admins                  : true
> ```
>
> Dipasang lewat `gh api -X PUT …/branches/main/protection`. ⚠ Endpoint itu
> **mengganti SELURUH objek** proteksi, jadi setiap setelan lama disertakan
> ulang di payload dan diverifikasi satu per satu sesudahnya — `enforce_admins`,
> jumlah review, `allow_force_pushes`, `allow_deletions`,
> `required_linear_history`, `lock_branch`, `required_signatures` semuanya
> cocok dengan nilai sebelumnya. Satu setelan yang terlewat di payload = satu
> perlindungan yang hilang diam-diam.
>
> **`app_id` disertakan, bukan hanya nama konteks.** Tanpa itu, aplikasi pihak
> ketiga mana pun yang melaporkan konteks bernama `verify` bisa memuaskan
> gerbangnya. Dengan `app_id: 15368` hanya GitHub Actions yang bisa.
>
> **Dan `strict: false`, dengan sengaja.** `strict: true` berarti "cabang harus
> UP TO DATE sebelum merge" — dan di repo ini `main` **selalu** di depan
> `develop` karena merge bubble promosi (6 commit saat ini). Dengan `strict:
> true`, setiap PR `develop` → `main` akan diblokir *"out of date"* sampai
> `develop` merge `main` balik: alur promosi yang dipakai enam kali hari ini
> akan patah. Ini bukan penyetelan kosmetik — ia pilihan yang menentukan
> apakah gerbangnya bisa dipakai.

#### ⚠ Dua hal yang perlu diketahui tentang gerbang ini

**`enforce_admins: true` berlaku juga untuk pemilik repo.** Itu memang
tujuannya — tetapi artinya kalau CI mati atau GitHub Actions sedang gangguan,
`main` **terkunci** sampai `verify` bisa hijau lagi. Jalan keluarnya: matikan
`enforce_admins` sementara (atau cabut checknya), merge, lalu **pasang kembali
pada perubahan yang sama**. Yang berbahaya bukan mematikannya, melainkan lupa
menyalakannya lagi.

**`develop` TIDAK diproteksi** (API menjawab `404 Branch not protected`). Jadi
cabang fitur → `develop` masih bisa di-merge walau `verify` merah — workflow-nya
tetap **berjalan dan terlihat** di PR, tetapi tidak **memblokir**.

Itu celah yang nyata, dan dibiarkan dengan sadar: menambahkannya berarti
**membuat proteksi dari nol** di `develop`, keputusan yang lebih besar daripada
menambah satu check ke proteksi yang sudah ada. Yang menanggung risiko paling
besar — `main`, satu-satunya cabang yang menerbitkan image produksi — sudah
tertutup.

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

### ✅ P1-2 — Temuan kesesuaian data hanya ada di stdout — **DITUTUP 11 Okt 2026**

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

**Perbaikan.**

> ✅ **DIKERJAKAN 11 Oktober 2026 — jejak + putusan denyut.**
>
> | Bagian | Keadaan |
> |---|---|
> | Tabel `conformance_runs` | ✅ migration platform **0018** |
> | Model `ConformanceRun` | ✅ sepola `SchedulerRun`/`BackupRun` |
> | Putusan denyut | ✅ `lib/conformance-heartbeat.ts` — **murni**, nol impor |
> | Skrip menulis jejaknya | ✅ satu baris, ke **platform** saja |
> | Medan `/api/health` → `conformance` | ✅ dilaporkan, **tidak** ikut memutuskan 503 (doktrin #137) |
> | Halaman operator `/operator/conformance` | ✅ + entri nav + 19 kunci i18n × 3 bahasa |
> | Panggilan `alert()` | ❌ **belum** — bagian dari P1-1 |
>
> Statusnya **empat** nilai, bukan dua, dan pembedaannya yang paling penting:
> `ok` (berjalan & bersih) · `findings` (berjalan & **menemukan** sesuatu —
> bukan kegagalan layanan) · `late` (basi, **atau** ada buku yang gagal
> diperiksa — buku yang tidak terperiksa bukan buku yang bersih) · `unknown`
> (tak terjangkau / belum pernah jalan — sengaja dibedakan dari `late`, supaya
> pemasangan baru tidak berbunyi seperti pemasangan rusak).
>
> **Penjaganya** `tests/conformance-heartbeat.test.ts` (17 tes) — termasuk tiga
> yang menuntut kabelnya tidak bisa dicabut diam-diam, dan satu yang menuntut
> modulnya tetap **murni** (nol impor) supaya ambangnya bisa diuji sebagai
> fungsi di tiga dunia pemakainya.
>
> **Dan penjaga hanya-baca skripnya DIPERKETAT, bukan dilonggarkan.** Jejaknya
> memang sebuah tulisan, dan penjaga lama (yang memindai lima kata SQL) tidak
> akan melihatnya — `platformDb.conformanceRun.create()` tidak memuat kata
> `INSERT`. Lolos secara huruf bukan jawabannya: tesnya sekarang menuntut
> sifat yang sebenarnya harus dijaga — buku PT hanya boleh **dibaca**
> (`$queryRawUnsafe` ada, `$executeRaw*` **tidak boleh ada**), dan **tepat
> satu** tulisan Prisma yang sasarannya **wajib** `platformDb.conformanceRun`.
> Plus satu tes yang menuntut jejaknya ditulis **sebelum** `process.exit` —
> `exit` tidak menunggu promise, jadi mencatat sesudahnya berarti kehilangan
> jejak tepat pada putaran yang paling perlu dicatat.
>
> **Migration-nya dibuktikan**, bukan diasumsikan: diterapkan ke basis data
> sekali-pakai, lalu kolom nyatanya dibandingkan dengan `@map` di model —
> cocok persis, nol kolom hilang, nol kolom tak terpakai. Scratch-nya dihapus.

**Halaman operatornya ikut selesai.** `/operator/conformance` meniru
`/operator/scheduler` (StaticTable, `ConsolePanel`, token `var(--ant-…)`), dan
merender **ketiga** status — jaminan terpentingnya: halaman yang hanya mengenal
ok/error akan menampilkan `findings` sebagai **kegagalan** (salah —
pemeriksanya bekerja) atau sebagai **bersih** (lebih buruk — temuannya hilang
dari layar). Kolom "gagal diperiksa" berubah penanda saat bukan-nol sekeras
kolom temuan, sebab sapuan yang melewatkan satu buku akan terbaca hijau
selamanya kalau kegagalannya jadi catatan pinggir. Dan daftar temuannya
**menyebut jumlah utuh** saat dipangkas — 200 dari 3.000 yang terlihat seperti
200 total adalah kabar menyesatkan justru pada putaran terburuk.

Dijaga `tests/operator-conformance-page.test.ts` (15 tes) — membaca SUMBER
alih-alih merender, sebab merendernya berarti memalsukan penjaga operator,
sesi, dan Prisma sekaligus: tiga tiruan untuk menguji satu hal. Yang benar-benar
bisa salah di sini adalah kabelnya, dan kabel terbaca dari sumber.

**Yang MASIH terbuka:** panggilan `alert()` — bagian P1-1, bukan butir ini.

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

### 🟡 P2-1 — Basis data uji/demo hidup di instans produksi — **TERKLASIFIKASI 11 Okt 2026**

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

**Perbaikan.**

> ✅ **DIKLASIFIKASIKAN 11 Oktober 2026** — dengan dasar **isi** bukunya, bukan
> namanya. Hasil lengkapnya di [dok 12](./12-KLASIFIKASI-BUKU.md); skripnya
> `bun run classify:books` (hanya-baca, bisa dijalankan ulang).
>
> **Angka yang menentukan: 2 dari 17 buku** punya data yang temuan
> kesesuaiannya layak dipercaya sebagai data sungguhan.
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
> **Dua pertanyaan ikut terjawab:**
>
> 1. **`is_demo` BUKAN penanda yang dicari.** Ia mengubah perilaku —
>    `demoWriteRefusal` di **kedua** penjaga membuat bukunya **hanya-baca**,
>    plus banner, perlakuan langganan, dan pengecualian dari 4 produser
>    penjadwal. Menandai buku uji sebagai `is_demo` akan **menolak tulisan** di
>    buku yang mungkin masih dipakai seseorang.
> 2. **Pengecualian dari cadangan: JANGAN.** Diukur — seluruh `sai_*` **78,1
>    MB**, dan 16 dari 17 buku tepat **4,0 MB** masing-masing, yaitu overhead
>    struktural InnoDB untuk 62 tabel, bukan data. Menukar jaminan
>    `--all-databases` dengan ~60 MB adalah pertukaran yang buruk.
>
> **Yang MASIH butuh pemilik:** apakah buku uji dikecualikan dari laporan
> kesesuaian (mengecualikan berarti berhenti memeriksanya), dan apakah 3 buku
> `kosong` + 4 `semai-dibersihkan` dirapikan (menghapus basis data **tidak
> bisa dibalik**).

**Dan satu keputusan yang masih terbuka terpisah:** apakah staging terpisah
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

### 🟡 P2-4 — CSP memakai `unsafe-inline` + `unsafe-eval` — **`unsafe-eval` DICABUT 11 Okt 2026**

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

**Perbaikan.**

> ✅ **DITINJAU 11 Oktober 2026** — dan hasilnya terbagi tiga, bukan satu.
>
> **(a) `'unsafe-eval'` DICABUT di produksi.** Dokumentasi Next sendiri
> menyatakannya:
>
> > *"`unsafe-eval` is not required for production. Neither React nor Next.js
> > use `eval` in production by default."*
>
> Dan diperiksa di repo ini, bukan sekadar dipercaya: **nol** `eval(` /
> `new Function(` di seluruh `src/`, dan dari **204** berkas js di
> `.next/static` **tepat satu** memuat `eval(` — shim `vm` milik dependensi
> Next sendiri (`vm-browserify`), berisi *definisi*
> `Script.prototype.runInThisContext` **tanpa satu pun tempat pemanggilan**.
> Tetap diizinkan di pengembangan, karena tanpa itu React berhenti bisa
> merekonstruksi jejak galat sisi-server di peramban.
>
> **(b) `style-src 'unsafe-inline'` WAJIB tinggal — dan itu STRUKTURAL, bukan
> kelalaian.** Sejak #203 seluruh gaya repo ini ditulis **sebaris** — terukur
> **2.618 kemunculan `style={{` di 305 berkas**. Di CSP, `style-src` mengatur
> **dua** hal yang sering tertukar: elemen `<style>` **dan atribut
> `style="..."`**. Nonce hanya bisa menandai yang pertama; atribut gaya tidak
> punya tempat untuk membawa nonce. Jadi mencabutnya menuntut **pembatalan
> #203**, bukan penyetelan CSP.
>
> **(c) `script-src 'unsafe-inline'` → nonce + `strict-dynamic`: MUNGKIN, tapi
> proyek tersendiri.** Yang dituntutnya, ditulis di `next.config.ts` supaya
> pembaca berikutnya tahu ini sudah ditinjau: CSP pindah dari `headers()` ke
> `proxy.ts` (nonce lahir ulang per permintaan) · setiap halaman dirender
> dinamis · `StyleProvider` AntD diberi nonce yang sama · dan
> `strict-dynamic` **diuji terhadap Recharts dan pratinjau PDF blob** —
> keduanya permukaan yang kerusakannya **halus**: grafik kosong dan pratinjau
> gagal tidak menjatuhkan halaman.
>
> **Dan satu celah yang ikut ketemu:** sebelum ini **tidak ada satu pun tes**
> yang menyentuh header keamanan. Seluruh CSP bisa dilemahkan atau dihapus
> tanpa satu pun tes merah — dan kelemahan CSP **tidak punya gejala**.
> `tests/security-headers.test.ts` (11 tes) menutupnya, termasuk dua yang
> menuntut sesuatu **tetap tidak ada** di produksi dan satu yang menuntut
> `style-src 'unsafe-inline'` **tetap ada** walau terlihat seperti kelalaian.

---

### ✅ P2-5 — Tabel jejak tumbuh tanpa kebijakan pemangkasan — **DITUTUP 11 Okt 2026**

**Bukti.** `scheduler_runs` = **1.246** baris (kadens per jam).
`backup_runs` = 54. `data/mail-outbox/` menyimpan `.eml` sejak Agustus. Tidak
ada pemangkasan yang terlihat untuk ketiganya.

**Dampak.** Hari ini sepele. Tetapi `scheduler_runs` tumbuh **~8.760 baris per
tahun** selamanya, dan ia ikut dalam setiap dump cadangan.

**Perbaikan.**

> ✅ **DIKERJAKAN 11 Oktober 2026** — dan dua cacat yang tidak ada di resep
> semula ikut tertutup.
>
> Resep semula menyebut dua aturan: 90 hari + semua `error` selamanya. Saat
> mengerjakannya, **dua lagi** ternyata menanggung beban, dan keduanya justru
> berlaku ketika ambang 90 hari **tidak lagi melindungi apa pun**:
>
> | # | Aturan | Cacat yang ditutupnya |
> |---|---|---|
> | 1 | Baris lebih baru dari ambang | — (resep semula) |
> | 2 | Status **bukan `ok`** disimpan tanpa batas | — (resep semula) |
> | 3 | **Baris TERAKHIR** selalu disimpan | Layanan yang mati 100 hari lalu kehilangan **seluruh** jejaknya. Tabel kosong terbaca `unknown` ("belum pernah jalan") alih-alih "berhenti pada tanggal X" — **pemangkasan yang menyembunyikan kegagalan** |
> | 4 | **Baris `ok` TERAKHIR** selalu disimpan | `health-report.ts` membaca baris `ok` terakhir **secara terpisah** (`where: { status: "ok" }`). Memangkasnya mengubah "berhasil terakhir 4 bulan lalu" menjadi "tidak pernah berhasil" — menghapus satu-satunya petunjuk bahwa mekanismenya pernah bekerja |
>
> Cacat 4 bukan hipotesis: `backup_runs` per 11 Okt 2026 berisi **54 baris,
> semuanya `error`**. Begitu satu cadangan berhasil lalu gagal 90 hari
> berturut-turut, pemangkasan naif akan menghapus justru bukti keberhasilan itu.
>
> **Lingkupnya diperluas ke ketiga tabel** — `scheduler_runs`, `backup_runs`,
> `conformance_runs` — bukan hanya yang disebut resepnya.
>
> Aturannya **fungsi murni** (`lib/run-trail-retention.ts`, nol impor), dijaga
> `tests/run-trail-retention.test.ts` (**21 tes**). Sebuah `DELETE` yang salah
> tidak punya langkah balik, dan satu-satunya yang tahu apakah aturannya benar
> adalah tesnya — jadi yang paling penting di berkas itu bukan tes yang
> membuktikan sesuatu **terpangkas**, melainkan empat yang membuktikan sesuatu
> **tertahan**. Dua di antaranya mengunci keadaan produksi hari ini: 1.251 baris
> penjadwal dan 54 baris cadangan → **nol** dipangkas.
>
> Dipanggil `job-scheduler` tiap jam sebagai langkah **ke-6 dan TERAKHIR**: ia
> satu-satunya mata rantai yang **menghapus**, jadi putaran yang mati di tengah
> berhenti pada pekerjaan yang masih bisa diulang — bukan pada satu-satunya yang
> tidak punya langkah balik.
>
> ⚠ `BATAS` timeout per langkah ditinjau ikut: enam langkah × 10 menit = 60
> menit, **tepat** di selang putarannya. Langkah ketujuh menuntut `BATAS`
> diturunkan.

**Yang TIDAK ikut dikerjakan:** pemangkasan `data/mail-outbox/` — ia artefak
pengembangan (transport surel `file`), tidak tumbuh di produksi yang memakai
SMTP, dan tidak ikut dalam cadangan basis data.

---

### 🟢 P3-1 — Berkas besar di lapisan domain — **GARIS DASAR DIUKUR 11 Okt 2026**

**Bukti.** `statement-layout.ts` 79 KB · `docs-content.ts` 68 KB ·
`posting/index.ts` 1.867 baris · `wizard.ts` 44 KB · `receivables.ts` 39 KB.

**Dampak.** Beban membaca. Dan beban **tipe**: kamus i18n (~2.500 kunci
dot-path bertipe) sudah memaksa batas heap `typecheck` dari 768 ke 1536 MB.

**Yang sudah benar.** `posting/index.ts` besar justru karena keputusan yang
benar (satu pintu), dan bagian murninya **sudah** dipisah ke `rules.ts`,
`mapping.ts`, `rates.ts`, `cogs.ts`.

**Perbaikan.** Tidak ada yang mendesak — tetapi pemicunya **lebih dekat
daripada yang tertulis sebelumnya**, dan sekarang ada angkanya.

> **Diukur 11 Oktober 2026** (`/usr/bin/time -v bun run typecheck`):
>
> | Jalan | RSS puncak | Waktu |
> |---|---|---|
> | Inkremental (`tsconfig.tsbuildinfo` ada) | **908 MB** | **13 s** |
> | **DINGIN** (tsbuildinfo disingkirkan) | **1.556 MB** | **82 s** |
>
> Jalan **dingin** adalah yang dialami **CI** dan setiap mesin baru —
> `tsconfig.tsbuildinfo` gitignored, jadi tidak pernah ikut.
>
> ⚠ **Bacanya hati-hati:** 1.556 MB itu **RSS total proses**, bukan heap V8.
> Batas `--max-old-space-size=1536` mengatur *old space*-nya saja, dan jalan
> dingin itu **lulus** (exit 0) — jadi heapnya tidak menembus batas. Tetapi
> jarak antara RSS 1.556 MB dan batas 1.536 MB berarti **marginnya tipis**, dan
> di kotak dengan 600-1.000 MB tersedia ia berjalan **di dalam swap**: 82 detik
> vs 13 detik adalah harga itu.
>
> **Pemicu yang sekarang bisa diperiksa:** jalan dingin yang keluar dengan
> `FatalProcessOutOfMemory` (exit 134), atau waktunya melewati beberapa menit.
> Saat itu naikkan batasnya **dan** pecah kamus i18n — jangan salah satu saja.

---

### ✅ P3-2 — Tes token API tidak menembus proxy — **SUDAH TERTUTUP SEBELUM TEMUAN INI DITULIS**

**Bukti.** Tercatat di `lib/api-v1.ts`: seluruh tes token memanggil
`requireApiToken` **langsung**, jadi tak satu pun bisa melihat penolakan satu
lapis di atasnya. Akibatnya cacat 401-sebelum-penjaga **lolos `verify` DAN
`build`** dan hidup di produksi sampai 16 Agustus 2026.

**Dampak.** Celah kelas-penjaga tetap ada: kebenaran `src/proxy.ts` sendiri
**tidak** teruji ujung-ke-ujung. Cacat berikutnya di lapisan itu akan lolos
dengan cara yang sama.

**Yang sudah benar.** Kejadiannya dicatat lengkap beserta mengapa ia lolos —
itu sendiri sudah mitigasi, karena orang berikutnya diperingatkan.

> ## ⚠ KOREKSI — temuan ini menggambarkan keadaan HISTORIS, bukan sekarang
>
> Diperiksa 11 Okt 2026: **`tests/proxy-bearer-api.test.ts` sudah ada**, dan ia
> melakukan persis apa yang resep di bawah minta — bahkan lebih. Temuan ini
> disusun dari komentar di `lib/api-v1.ts`, yang menceritakan regresinya; yang
> tidak saya periksa adalah apakah penjaganya ikut lahir bersama perbaikannya.
> Ia ikut.
>
> Cakupan yang sudah ada, dan semuanya memanggil `proxy()` **sungguhan**:
>
> | Tes | Menuntut |
> |---|---|
> | setiap route v1 yang benar-benar ada | **tidak** dijawab 401 oleh proxy |
> | `openapi.json` | lolos (sengaja publik) |
> | permukaan API **sesi** | **tetap dijaga** — pelepasannya tidak melebar |
> | `isBearerApiPath` | bentuknya, bukan `startsWith` telanjang |
> | kabelnya | proxy benar-benar **memanggil** `isBearerApiPath` sebagai KODE, bukan komentar |
>
> Baris terakhir itu lebih kuat daripada yang saya resepkan: ia mencegah
> kabelnya dicabut diam-diam, bukan hanya menguji perilakunya hari ini.
>
> **Resep di bawah karena itu tidak perlu dikerjakan.** Dibiarkan tertulis
> supaya jelas apa yang diperiksa dan kenapa kesimpulannya berubah.

**Resep semula (TIDAK perlu dikerjakan).** Satu tes yang memanggil `proxy()`
dengan permintaan ber-`Bearer` dan menuntut ia **tidak** dipantulkan.

Catatan: celah KELAS yang disebut temuan ini memang nyata, dan sejak 11 Okt
2026 ia punya penjaga kedua — `tests/proxy-landing-shortcut.test.ts` (P3-4),
yang juga menembus `proxy()` sungguhan. Jadi dua jalur proxy yang paling mudah
salah kini teruji ujung-ke-ujung.

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
| ~~P0-3~~ | ~~Nol CI — tak ada yang menjalankan tes~~ | ✅ **ditutup 11 Okt 2026** — workflow + `verify` required pada `main`. `develop` masih tanpa proteksi (sadar) | — | — |
| **P1-1** | Kegagalan latar tidak berbunyi | Kegagalan sunyi berumur panjang | Rendah | Rendah |
| ~~P1-2~~ | ~~Temuan kesesuaian hanya di stdout~~ | ✅ **ditutup 11 Okt 2026** — jejak + `/api/health` + halaman operator | — | — |
| ~~P1-3~~ | ~~Dokumen penggelaran bertentangan~~ | ✅ **ditutup 11 Okt 2026** | — | — |
| **P2-1** | Basis data uji di produksi | 🟡 **terklasifikasi** — 2/17 buku relevan; dua pertanyaan terjawab, dua butuh pemilik | Rendah (sisanya) | Rendah |
| **P2-2** | Tanpa pemulihan per-pekerjaan | Perbaikan tertunda sejam | Tinggi | Sedang |
| **P2-3** | Satu `app-customer`, tanpa jalur skala | Batas skala diketahui, belum tercapai | Tinggi | Sedang |
| **P2-4** | CSP `unsafe-inline`/`eval` | 🟡 `unsafe-eval` **dicabut di produksi**; `style-src` terbukti struktural; jalur nonce terdokumentasi | Rendah (sisanya) | **Tinggi** (sisanya) |
| ~~P2-5~~ | ~~Tabel jejak tanpa pemangkasan~~ | ✅ **ditutup 11 Okt 2026** — 4 aturan, 2 di antaranya tidak ada di resep semula | — | — |
| **P3-1** | Berkas besar | Beban baca & tipe | Tinggi | Sedang |
| ~~P3-2~~ | ~~Proxy tak teruji ujung-ke-ujung~~ | ✅ **sudah tertutup** sebelum temuan ditulis — `tests/proxy-bearer-api.test.ts` | — | — |
| ~~P3-4~~ | ~~Pemantulan `/` menempuh dua pantulan~~ | ✅ **ditutup 11 Okt 2026** — resep semula dikoreksi, lihat temuannya | — | — |
| **P3-3** | Tanpa kepemilikan tercatat | *Bus factor* 1 | Rendah | Nol |

**Pengamatan yang layak dinyatakan:** empat temuan teratas semuanya **soal
dapat-diamati, bukan soal arsitektur**. Bentuk sistemnya sehat; yang kurang
adalah kemampuannya memberi tahu kita ketika ia tidak sehat. Dan ketiga P0/P1
pertama berusaha **rendah** — ini bukan proyek, ini sore hari.

Lanjut: [09 Peta Jalan](./09-PETA-JALAN.md)
