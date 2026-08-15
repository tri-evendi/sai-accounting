# Audit Kesiapan Rilis Umum — Perjalanan Pelanggan Ujung-ke-Ujung

> Ditulis 15 Agustus 2026, terhadap `main` (= `develop`, nol commit selisih).
> Cakupan: pendaratan pemasaran → pendaftaran/masuk → pembuatan PT →
> penyiapan → pemakaian fitur → integrasi & impor data dari sistem luar.
>
> **Metode.** Pembacaan kode langsung atas jalur perjalanan, bukan pengujian
> runtime. Setiap temuan menyebut `berkas:baris`. Yang TIDAK dilakukan audit
> ini, dan karena itu tidak diklaim: tak ada uji beban, tak ada uji tembus, tak
> ada pemeriksaan terhadap basis data produksi, dan `bun run verify` /
> `bun run build` tidak dijalankan sebagai bagian dari audit ini.

---

## 0. Putusan

Aplikasinya **matang secara fitur dan disiplin internal** — RBAC terpusat
ber-uji-cakupan, isolasi multi-PT dengan aturan "konteks hilang harus
MELEMPAR", mesin posting tunggal, 169 berkas uji, 16 dari 16 laporan hidup,
jejak keputusan yang tertulis rapi di kepala setiap berkas. Untuk sebuah grup
usaha yang dikelola sendiri, ini sudah siap dan memang sudah jalan.

Untuk **rilis umum** — orang asing mendaftar sendiri, membawa data lamanya,
membayar, dan menuntut layanan — ia **belum siap**, dan yang menghalangi bukan
kualitas kode melainkan **tiga lubang yang bentuknya sama**: hal-hal yang
selama ini benar karena hanya ada satu pelanggan yang saling kenal.

| Lubang | Inti |
|---|---|
| **Isolasi yang belum lengkap** | Buku besar terisolasi sempurna; **berkas unggahan dan jejak audit tidak** — keduanya hidup di luar basis data PT, di satu direktori bersama. |
| **Pintu masuk data yang belum ada** | Pelanggan baru bisa membuat buku kosong, tapi tidak bisa **memindahkan bukunya yang lama** ke dalamnya. Saldo awal yang tersedia tidak cukup untuk perusahaan yang sudah berjalan. |
| **Operasi yang masih manual** | Tanpa cadangan otomatis, tanpa pemantauan, tanpa pemulihan yang pernah dilatih, dan dengan penjadwal langganan yang bergantung pada cron yang dipasang tangan. |

Rekomendasi: **jangan buka pendaftaran umum** sebelum P0 di bawah tuntas.
Estimasi kasar: P0 ≈ 4–6 minggu kerja, P0+P1 ≈ 10–12 minggu.

---

## 1. Perjalanan yang sebenarnya terjadi

Ditelusuri berkas demi berkas. Kolom "status" adalah putusan audit, bukan
status pengembangan.

| # | Tahap | Jalur | Status |
|---|---|---|---|
| 1 | Pendaratan pemasaran | `src/app/page.tsx` → `components/landing/**` | **Baik.** Hero → fitur → modul → bukti → harga → FAQ → kontak. Harga & kuota dibaca dari katalog paket, lama uji coba dari `TRIAL_DAYS`, tarif PPN dari `lib/tax.ts` — tidak ada angka yang diketik ke kalimat pemasaran. `openGraph` + `robots` + `sitemap` terpasang. |
| 2 | Formulir kontak | `lib/contact-actions.ts:80` | **Bersyarat.** Butuh `PLATFORM_CONTACT_EMAIL`; tanpa itu setiap kiriman gagal. Masuk daftar pra-rilis. |
| 3 | Pendaftaran | `/register` → `api/auth/register` | **Baik.** Jawaban seragam (anti-enumerasi), bcrypt di dalam permintaan, pembatas laju **persisten** per-IP + per-email, S&K ber-versi. Tidak ada apa pun yang lahir sebelum tautan diklik. |
| 4 | Verifikasi email | `api/auth/verify-email` | **Baik.** POST (bukan GET) supaya pemindai tautan surel tidak membakar token. Tenant + User + Membership + langganan lahir di sini; kegagalan langganan tidak menggagalkan pendaftaran (disembuhkan putaran adopsi penjadwal). |
| 5 | Masuk | `lib/auth.ts` + `lib/post-login.ts` | **Cukup, satu cacat** → [F-6]. Pendaratan pasca-masuk satu aturan untuk semua pintu; staf mendarat di buku, pemilik di `/platform`. Pembatas laju login masih di memori. |
| 6 | Buat PT | `/companies/new` → `lib/company-provisioning.ts` | **Baik.** Izin di matriks **tenant** (memecah ayam-dan-telur), urutan buat→migrasi→daftarkan sehingga kegagalan hanya meninggalkan basis data yatim, kemajuan di-stream ke layar. |
| 7 | Wisaya penyiapan | `(setup)/…/setup` + `lib/opening-balance.ts` | **Lubang terbesar** → [F-2], [F-3]. Identitas → modul → mata uang → COA → saldo awal → tinjau; sekali jalan, satu jurnal pembuka seimbang. Tetapi saldo awal yang bisa dimasukkan tidak cukup untuk perusahaan yang sudah berjalan. |
| 8 | Konfigurasi lanjutan | `/settings`, `/permissions`, `/periods` | **Baik.** Modul usaha, matriks izin efektif (bawaan + override DB), pembersihan data `[CONTOH]`, tutup buku bulanan. |
| 9 | Pemakaian fitur | ~90 halaman | **Baik.** 16/16 laporan hidup, mesin posting tunggal, kunci periode, jejak dokumen, persetujuan, valas, pusat biaya, aset tetap, rekonsiliasi bank. |
| 10 | Integrasi & impor | — | **Praktis nol** → [F-2], [F-10]. Impor: hanya COA (xlsx) dan rekening koran. Ekspor: CSV/XLSX/PDF + ZIP ekspor-mandiri. API keluar: **tidak ada**. |

---

## 2. Temuan

### P0 — penghalang rilis umum

#### F-1 · Berkas unggahan tidak berlingkup tenant

> **Status:** issue [#367](https://github.com/tri-evendi/sai-accounting/issues/367) — dikerjakan.

`src/app/api/upload/route.ts:10` menulis **setiap** dokumen setiap PT ke satu
direktori bersama `public/uploads/`, dengan nama
`<nama-asli-disanitasi>_<epoch-ms>.<ext>` (baris 104–106), lalu menyimpan
`/uploads/<nama>` ke kolom `documents.filepath` di basis data PT (baris 122).
Berkasnya disajikan sebagai **berkas statis**.

Tiga akibat, semuanya nyata:

1. **Lintas-tenant.** `proxy.ts` menggerbangi jalurnya sebagai non-publik, jadi
   pengambilan anonim dipantulkan ke `/login` — tetapi proxy **tidak pernah
   membuktikan keanggotaan** (itu memang tugas `requirePagePermission`, dan
   berkas statis tidak melewati satu pun penjaga). Siapa pun yang punya sesi
   **di tenant mana pun** dan mengetahui nama berkasnya bisa mengambil dokumen
   tenant lain. Nama berkasnya mempertahankan nama asli pengguna dan hanya
   diacak oleh stempel milidetik.
2. **Hak akses PDP tidak dipenuhi.** `lib/tenant-export.ts` mengekspor tabel
   basis data lewat `information_schema` — berkasnya tidak ikut. Ekspor mandiri
   yang menjanjikan "seluruh buku" memulangkan baris `documents` tanpa
   dokumennya.
3. **Hak hapus PDP tidak dipenuhi.** `scripts/execute-tenant-deletion.ts` tidak
   menyentuh `public/uploads` sama sekali. Dokumen tenant yang sudah dihapus
   bertahan di disk selamanya.

**Perbaikan.** Pindahkan penyimpanan ke luar `public/` (mis.
`data/documents/<companyId>/<uuid>.<ext>`; nama asli tetap di kolom
`filename`). Sajikan lewat route handler `GET /api/documents/[id]/file` yang
memanggil `requireApiPermission("document.read")`, membaca baris `documents`
**dari basis data PT aktif** (jadi kepemilikan dibuktikan basis datanya, bukan
oleh nama berkas), lalu men-stream isinya. Tambahkan berkas ke `tenant-export`
dan ke jalur penghapusan. Uji yang menjaganya: satu tes yang menolak setiap
penulisan ke `public/uploads` di seluruh `src/`.

#### F-2 · Tidak ada jalan masuk bagi data perusahaan yang sudah berjalan

Impor yang ada hari ini: **daftar akun** (`lib/coa-import.ts`, xlsx bergaya
Accurate) dan **rekening koran** untuk rekonsiliasi. Selesai. Tidak ada impor
untuk pelanggan, pemasok, barang, saldo stok per barang, aset tetap beserta
akumulasi penyusutan, maupun riwayat jurnal.

Yang paling menentukan, dan yang tertulis apa adanya di kodenya sendiri
(`lib/opening-balance.ts:20–27`): saldo awal piutang/utang masuk sebagai
**satu baris jurnal per mitra ke akun kontrol**, dengan nama mitra di `memo`.
Neraca dan Neraca Saldo benar. Tetapi:

> buku besar pembantu Piutang/Utang **membaca dokumen sumber** (faktur/
> pembelian), bukan baris jurnal.

Konsekuensinya di hari pertama pelanggan baru: **umur piutang kosong**
walaupun neraca menunjukkan piutang Rp 2 miliar, dan **pembayaran atas faktur
lama tidak bisa dicatat** karena fakturnya tidak ada sebagai dokumen. Bagi
perusahaan yang pindah dari Accurate/Excel — yaitu setiap pelanggan rilis umum
— ini bukan ketidaknyamanan, ini jalan buntu.

**Perbaikan.** Satu modul **Impor Data Awal** (lihat §4.1), yang untuk AR/AP
membuat **dokumen pembuka** (faktur/pembelian ber-`source_type =
"opening_document"`) alih-alih baris jurnal kontrol — sehingga umur piutang,
pelunasan, dan retur bekerja seperti dokumen biasa, sementara jurnal
pembukanya tetap satu dan tetap seimbang.

#### F-3 · Saldo awal persediaan bisa tercatat dua kali, tanpa penjaga

Wisaya menerima persediaan sebagai **satu angka gelondongan**
(`lib/opening-balance.ts:113`, diposting ke akun `INVENTORY` di baris 180–186).
Sementara itu penambahan stok per barang lewat `/inventory/update`
**memposting jurnalnya sendiri** (`api/inventory/route.ts:200`).

Maka pengguna yang melakukan hal paling wajar — mengisi nilai persediaan di
wisaya, lalu memasukkan stok per barang supaya laporan stok terisi —
**menggandakan akun Persediaan**. Yang mengisi salah satunya saja mendapat
Nilai Persediaan ≠ Neraca sejak hari pertama. Tidak ada satu pun penjaga,
peringatan, maupun rekonsiliasi yang menangkap ini.

**Perbaikan.** Cabut angka gelondongan. Saldo awal persediaan diisi **per
barang (kuantitas × harga pokok)** di langkah yang sama, lalu diposting
sebagai satu bagian dari jurnal pembuka **sekaligus** menerbitkan
`stock_movements` pembuka — satu tindakan, dua akibat yang konsisten. Sampai
itu ada: penjaga yang menolak stok masuk bertanggal ≤ tanggal saldo awal, dan
satu laporan rekonsiliasi "Nilai Persediaan vs saldo akun Persediaan" yang
wajib nol.

#### F-4 · Tidak ada cadangan otomatis, dan pemulihan belum pernah dilatih

> **Status:** issue [#374](https://github.com/tri-evendi/sai-accounting/issues/374) — separuh pertama dikerjakan (cadangan). Keputusan pemilik: penyimpanan objek **S3-compatible**. Latihan pemulihan kuartalan tetap milik manusia, dan **belum pernah dijalankan** — jadi baris daftar siap-rilis ini belum boleh dicentang.

`docker-compose.yml` tidak memuat layanan cadangan. `PRODUCTION.md:107` hanya
berbunyi *"Back up both with your server backups."* Direktori `backups/` berisi
tiga dump manual, yang termuda 28 Juli 2026.

Dengan satu basis data per PT, jumlah objek yang harus dicadangkan **tumbuh
seiring jumlah pelanggan** — dan dua di antaranya bahkan bukan basis data:
`public/uploads` dan `data/audit`. Menjual langganan atas pembukuan yang wajib
disimpan sepuluh tahun (UU KUP) tanpa cadangan otomatis dan tanpa satu pun
pemulihan yang pernah dibuktikan adalah risiko yang tidak sepadan.

**Perbaikan.** Lihat §4.3.

#### F-5 · Tidak ada pemantauan maupun pelacakan galat

Nol Sentry, nol OpenTelemetry, nol metrik. Setiap kegagalan berakhir sebagai
`console.error` di log container. `/api/health` hanya membuktikan basis data
kendali terjangkau — ia **tidak** memeriksa basis data platform, tidak
memeriksa satu pun basis data PT, dan tidak memeriksa apakah penjadwal masih
hidup.

Akibatnya untuk rilis umum: kegagalan pertama yang diketahui adalah kegagalan
yang **dilaporkan pelanggan**. Verifikasi email yang gagal terkirim
(`api/auth/register` menelan galatnya ke `console.error` secara sengaja) tidak
terlihat oleh siapa pun sampai ada yang mengeluh tidak bisa masuk.

---

### P1 — tinggi

#### F-6 · Pembatas laju login masih di memori, dan hanya per-pengenal

> **Status:** issue [#372](https://github.com/tri-evendi/sai-accounting/issues/372) — dikerjakan.
>
> ⚠ **Cakupannya melebar saat dikerjakan, dan temuan barunya lebih berat daripada F-6 sendiri.** Delapan permukaan membaca alamat klien dengan `x-forwarded-for.split(",")[0]` — entri paling KIRI, yang justru bisa diketik klien. Lima di antaranya adalah kunci pembatas laju **per-IP endpoint publik** yang dibangun #138 (`/register`, `/forgot-password`, `/reset-password`, verifikasi surel, penerimaan undangan), satu formulir kontak pendaratan, dan dua jejak audit.
>
> Artinya seluruh pembatas laju per-IP yang selama ini dianggap kokoh **bisa dilewati dengan satu header**: satu nilai acak per permintaan, dan setiap permintaan tampak datang dari alamat baru. Jejak auditnya pun mencatat alamat pilihan penyerang sebagai fakta. Logika pembacaan yang benar sudah ada dan sudah teruji sejak #162 — ia hanya tinggal di `lib/operator/plane.ts` dan tidak pernah dipakai bidang pelanggan.

`lib/rate-limit.ts:5` menyimpan hitungan di `Map` proses; `lib/auth.ts:56`
memakainya dengan kunci `login:<pengenal>`. Tiga akibat: hitungannya **hilang
setiap deploy**, tidak terbagi bila kelak ada dua instance, dan — yang
terpenting — **tidak ada pembatas per-IP**. Serangan isian-kredensial yang
menyebar ke seribu akun dari satu alamat tidak menyentuh batas mana pun.

Ini juga tidak konsisten: `/register`, verifikasi email, dan atur-ulang kata
sandi **sudah** memakai penghitung persisten (`lib/rate-limit-persistent.ts`,
#138) dengan alasan yang berlaku sama persis di sini.

**Perbaikan.** Pindahkan login ke `checkPersistentRateLimit`, dengan **dua**
kunci: `login:id:<pengenal>` dan `login:ip:<alamat>`.

#### F-7 · Jejak audit sebagai berkas, dibaca utuh

> **Status:** issue [#370](https://github.com/tri-evendi/sai-accounting/issues/370) — dikerjakan. Jejak **tenant** dan **operator** masih berkas; keduanya menyusul di issue tersendiri.

`lib/audit.ts:222` menaruh jejak di `data/audit/<slug>/audit.jsonl`; baris 269
menambahkan; baris 328 **membaca seluruh berkas ke memori lalu mem-parse
setiap baris** untuk setiap pembukaan halaman audit, hanya untuk mengambil 20
baris.

Di kotak ~3,6 GB dengan produksi hidup di atasnya, berkas 100 MB berarti lonjakan
memori dan CPU pada satu permintaan halaman. Tidak ada rotasi. Ia juga **tidak
ikut ekspor tenant** dan **tidak ikut penghapusan tenant** — cacat yang sama
persis dengan F-1, dan berasal dari sebab yang sama: keadaan penting yang hidup
di luar basis data PT.

**Perbaikan.** Pindahkan jejak audit ke **tabel di basis data PT**
(`audit_logs`, ber-indeks `created_at`/`action`). Ia langsung ikut dicadangkan,
ikut diekspor, ikut dihapus, ikut ter-paginasi oleh SQL, dan aman bila kelak
ada dua instance. Migrasi berkas lama sekali jalan lewat skrip.

#### F-8 · Langit-langit skala sudah terlihat dari kodenya

`lib/company-clients.ts:34–36`: `COMPANY_CLIENT_POOL_MAX` bawaan **4** klien,
`DB_CONNECTION_LIMIT` bawaan **2** koneksi. Di atas empat PT yang aktif
bersamaan, LRU mulai membanting — setiap pergantian berarti membangun klien
Prisma baru. Angka itu benar untuk kotak sekarang; ia **bukan** angka yang bisa
melayani ratusan tenant.

Di lapisan bawahnya: satu MariaDB, satu container, satu disk. Ratusan basis
data pada satu instance akan menabrak `max_connections`, ukuran buffer pool,
dan waktu cadangan jauh sebelum menabrak CPU.

**Perbaikan.** Bukan kode, melainkan keputusan kapasitas — lihat §4.3 dan §6.

#### F-9 · Siklus hidup langganan bergantung pada cron yang dipasang tangan

> **Status:** issue [#373](https://github.com/tri-evendi/sai-accounting/issues/373) — dikerjakan. Cakupannya menyempit setelah kodenya dibaca: ringkasan tiap putaran **sudah** tercatat di tabel `scheduler_runs` sejak #154, dan konsol operator **sudah** menampilkannya. Yang benar-benar kurang tinggal penjadwalnya sebagai layanan, denyutnya di `/api/health`, dan skrip pembuktiannya.

`package.json` (`_scheduler_note`) menyebut penjadwal harus dipasang lewat cron
host. Ia idempoten dan tertulis rapi — tetapi **tidak ada apa pun yang
memeriksa ia terpasang**. Bila terlewat pada hari rilis: uji coba tidak pernah
berakhir, tagihan pertama tidak pernah terbit, pengingat tidak pernah
terkirim — **tanpa satu pun galat di mana pun**.

**Perbaikan.** (a) jadikan layanan di `docker-compose.yml` (loop tidur, atau
sidecar cron) sehingga ia lahir bersama deploy; (b) tulis waktu jalan terakhir
ke `sai_platform`, dan tampilkan di konsol operator + `/api/health` diperluas
sebagai "penjadwal terakhir jalan: N menit lalu".

#### F-10 · Tidak ada satu pun antarmuka integrasi

Pencarian `Bearer` / `api_token` / `apiKey` di seluruh `src/` di luar
`generated/`: nol. Satu-satunya webhook yang ada adalah webhook **masuk** dari
Midtrans untuk penagihan platform sendiri.

Jadi "integrasi dengan sistem eksternal" hari ini berarti: seseorang mengunduh
CSV/XLSX/PDF dan mengunggahnya ke tempat lain. Untuk rilis umum di pasar yang
memakai marketplace, kasir, dan bank yang bicara API, ini akan menjadi
keberatan penjualan pertama.

**Perbaikan.** Lihat §4.2.

---

### P2 — sedang

| Kode | Temuan | Bukti |
|---|---|---|
| **F-11** | Ekspor e-Faktur **bukan** reproduksi byte-exact skema impor DJP/Coretax — dinyatakan jujur di kepala berkasnya sendiri, dan harus divalidasi terhadap skema berjalan sebelum dipakai melapor. Untuk rilis umum ini harus jadi janji yang **dinyatakan di UI**, atau dipenuhi. | `lib/efaktur.ts:17–27` |
| **F-12** ([#368](https://github.com/tri-evendi/sai-accounting/issues/368)) | PPN adalah **konstanta kompilasi 11%**, tanpa efektif-tanggal dan tanpa penanda PKP/non-PKP per PT. Perubahan tarif menuntut redeploy; PT non-PKP tetap mendapat bawaan 11%. Dokumen tersimpan membawa `taxRate` sendiri, jadi riwayat aman — yang tidak aman adalah **bawaannya**. | `lib/tax.ts:29` |
| **F-13** | Ekspor mandiri tenant menyusun seluruh ZIP **di dalam permintaan HTTP**. Sudah dibaca ber-potongan 1000 baris, tetapi ZIP-nya utuh di memori. Tenant besar × kotak 3,6 GB = risiko OOM yang dipicu pengguna. | `lib/tenant-export.ts` |
| **F-14** | Formulir kontak pendaratan diam-diam gagal tanpa `PLATFORM_CONTACT_EMAIL`. | `lib/contact-actions.ts:80` |
| **F-15** | Tidak ada persetujuan-ulang saat S&K naik versi — pengguna lama dianggap menyetujui versi baru. Sudah dicatat sebagai keputusan sadar, tetapi untuk rilis umum ia menjadi risiko hukum, bukan lagi catatan. | `lib/legal.ts:11` |

---

## 3. Yang sudah benar, dan sebaiknya tidak diutak-atik

Supaya perbaikan tidak merusak yang sudah mahal dibangun:

- **Isolasi buku besar.** Satu basis data per PT; konteks hilang **melempar**,
  tidak pernah jatuh ke bawaan. Kredensial tidak pernah diambil dari tabel.
- **Otorisasi.** Matriks terpusat + override DB + `tests/authz-coverage`
  menolak halaman/route tanpa deklarasi izin. Pemisahan izin tenant vs PT
  memecahkan ayam-dan-telur pembuatan PT pertama.
- **Bidang operator terpisah host** dengan gagal-tertutup ganda (tanpa
  `OPERATOR_HOST`, `/operator` 404 di mana pun) + TOTP + daftar IP.
- **Anti-enumerasi** konsisten di `/register`, `/forgot-password`, dan
  undangan: jawaban seragam, kerja mahal tidak ditunggu respons.
- **Disiplin akuntansi.** Satu mesin posting, kunci periode di dalam
  transaksi, saldo awal sekali-jalan dengan dua penjaga, neraca yang memakai
  satu rumus ekuitas, `Akumulasi Laba/Rugi` yang **dilabeli benar** (bukan
  "laba berjalan" yang menyesatkan di tahun kedua).
- **Suspensi = hanya-baca, bukan terkunci.** Pelanggan menunggak tetap bisa
  mengunduh bukunya — jawaban yang benar menurut UU KUP dan UU PDP sekaligus.

---

## 4. Konsep perbaikan

### 4.1 Impor Data Awal — modul baru, satu bentuk untuk semua

Satu wisaya, enam berkas, satu jurnal pembuka. Bentuk yang sama untuk setiap
jenis supaya sekali dipelajari berlaku semuanya:

```
unggah xlsx/csv  →  pemetaan kolom  →  pratinjau + galat per-baris  →  terapkan
                        (disimpan)        (nol galat = boleh lanjut)     (transaksi)
```

| Berkas | Isi | Menjadi |
|---|---|---|
| 1. Daftar akun | sudah ada (`coa-import.ts`) | `accounts` |
| 2. Pelanggan & pemasok | nama, NPWP, alamat, termin | `customers` / `suppliers` |
| 3. Barang | kode, nama, satuan, HPP | `items` |
| 4. Saldo stok awal | barang, kuantitas, harga pokok | baris jurnal pembuka **+** `stock_movements` pembuka |
| 5. Piutang & utang terbuka | mitra, no. faktur, tanggal, jatuh tempo, mata uang, kurs, sisa | **dokumen pembuka** (`invoices`/`purchases`, `source_type = "opening_document"`) |
| 6. Aset tetap | nama, tanggal perolehan, harga, umur, akumulasi penyusutan | `fixed_assets` + jadwal penyusutan yang **melanjutkan**, bukan mengulang |

Aturan yang mengikat seluruh modul:

1. **Inti murni, seperti `coa-import.ts`.** Parsing + validasi tanpa Prisma dan
   tanpa ExcelJS, sehingga seluruh aturan impor bisa diuji tanpa MySQL.
2. **Nol galat sebelum menerapkan.** Impor sebagian adalah buku yang tidak bisa
   dijelaskan siapa pun.
3. **Satu transaksi per berkas**, dan **satu** jurnal pembuka untuk seluruh
   penyiapan — penjaga sekali-jalan `assertCanRunSetup` tetap berlaku.
4. **Semua baris hasil impor ditandai** (`source_type` pembuka) sehingga bisa
   dilaporkan, direkonsiliasi, dan — selama penyiapan belum dikunci — dibatalkan
   seluruhnya.
5. **Templat unduhan per jenis**, berikut legenda kode (pola `ACCURATE_TYPE_LEGEND`
   yang sudah terbukti).

Ini juga yang menutup F-2 dan F-3 sekaligus: begitu stok awal per barang ada,
angka gelondongan persediaan bisa dicabut tanpa kehilangan apa pun.

### 4.2 Integrasi eksternal — tiga lapis, dikerjakan berurutan

**Lapis 1 — API baca (terkecil yang berguna).**
`Authorization: Bearer <token>` dengan token per-PT yang di-hash di basis data
kendali, berlingkup izin **yang sudah ada** (`invoice.read`, `report.read`, …)
lewat `canEffective` — jadi tidak ada matriks kedua yang akan menyimpang.
Kuota per token, jejak pemakaian, pencabutan seketika. Endpoint: pelanggan,
pemasok, barang, faktur, saldo akun, neraca saldo.

**Lapis 2 — API tulis + idempotensi.**
`POST /api/v1/invoices` dan kawan-kawannya, dengan header `Idempotency-Key`
wajib — sistem luar mengulang kiriman, dan faktur ganda di buku besar adalah
kerusakan yang mahal diperbaiki. Menulis lewat **mesin posting yang sama**;
tidak ada jalur tulis kedua.

**Lapis 3 — webhook keluar.**
`invoice.created`, `payment.received`, `period.closed`. HMAC-SHA256 di header,
antrean coba-ulang dengan mundur-eksponensial, jejak pengiriman yang bisa
dibaca pelanggan sendiri.

**Yang sengaja TIDAK dibangun sendiri:** konektor marketplace/kasir/bank.
Sediakan API-nya, biarkan iPaaS dan integrator yang menjembatani. Satu
konektor bank Indonesia yang dipelihara sendiri akan memakan lebih banyak waktu
daripada seluruh lapis 1–3.

**Prasyarat yang harus diselesaikan lebih dulu:** dokumentasi API (OpenAPI,
disajikan di `/docs` yang sudah ada), pembatas laju per-token, dan versi jalur
(`/api/v1/`) sejak hari pertama.

### 4.3 Operasi — yang harus ada sebelum pelanggan pertama membayar

| Kebutuhan | Bentuk |
|---|---|
| **Cadangan** | ✅ Layanan `backup` di compose (#374): `mariadb-dump --all-databases` harian + `public/uploads` + `data/audit`, terenkripsi, dikirim ke luar server (S3/B2). Retensi 30 hari harian + 12 bulan bulanan. |
| **Pemulihan** | ⬜ **Latihan pemulihan yang dijadwalkan**, bukan dokumen. `prove-backup-restore` ada (#374); latihan penuhnya belum pernah dijalankan. Sekali per kuartal: pulihkan cadangan acak ke server bayangan, jalankan `bun run verify`, buka satu PT, cocokkan neraca saldonya. Yang tidak pernah dipulihkan bukan cadangan. |
| **Pemantauan** | Sentry (atau setara) untuk galat + `/api/health` yang diperluas: kendali, platform, satu PT contoh, dan **umur jalan terakhir penjadwal**. Peringatan ke kanal yang benar-benar dibaca. |
| **Penjadwal** | ✅ Layanan `scheduler` di compose (#373) — bukan lagi cron host. |
| **Kapasitas** | Naikkan `COMPANY_CLIENT_POOL_MAX` seiring RAM; tetapkan **ambang tenant per instans MariaDB** dan rencana pemecahannya (satu instans per rentang tenant) **sebelum** ambangnya tersentuh. |
| **Status** | Halaman status publik + jendela pemeliharaan yang diumumkan. Pelanggan yang membayar berhak tahu sebelum bertanya. |

### 4.4 Urutan pengerjaan, dan alasannya

1. **F-1 (dokumen berlingkup tenant)** — satu-satunya temuan yang merupakan
   kebocoran lintas-tenant. Dikerjakan lebih dulu apa pun yang terjadi.
2. **F-7 (audit ke basis data)** — sebab yang sama dengan F-1; dikerjakan
   berdekatan supaya "keadaan di luar basis data PT" habis sekaligus.
3. **F-4 + F-5 + F-9 (operasi)** — harus ada **sebelum** ada pelanggan yang
   datanya bisa hilang. Ini bukan pekerjaan yang menunggu fitur.
4. **F-6 (pembatas laju login)** — kecil, murah, jelas.
5. **F-2 + F-3 (impor data awal)** — pekerjaan terbesar, tetapi ia yang
   menentukan apakah pelanggan bisa **mulai memakai** produknya.
6. **F-10 lapis 1 (API baca)** — cukup untuk menjawab keberatan penjualan
   pertama; lapis 2–3 menyusul menurut permintaan nyata.
7. **P2** — sesuai kesempatan, kecuali F-12 (PPN) yang harus diputuskan
   pemilik lebih dulu (§6).

---

## 5. Konsep audit — cara membuktikannya, berulang kali

Audit sekali adalah foto. Yang dibutuhkan rilis umum adalah **gerbang**. Tiga
lapis, meniru pola yang sudah dipakai repo ini (`tests/authz-coverage`,
`tests/anchor-button-nesting`, `prove-*`).

### Lapis 1 — gerbang otomatis di `bun run verify`

Uji yang **gagal** bila aturan dilanggar, bukan checklist yang dibaca orang:

| Uji baru | Menjaga |
|---|---|
| `tests/no-public-uploads.test.ts` | Tidak ada berkas di `src/` yang menulis ke `public/` (F-1) |
| `tests/tenant-export-completeness.test.ts` | Setiap penyimpanan per-tenant (tabel, berkas dokumen, jejak audit) punya cabang di `tenant-export` **dan** di jalur penghapusan (F-1, F-7) |
| `tests/rate-limit-coverage.test.ts` | Setiap route yang terjangkau **tanpa sesi** memanggil pembatas laju **persisten** (F-6) |
| `tests/import-purity.test.ts` | Modul impor tidak mengimpor Prisma/ExcelJS (§4.1 aturan 1) |
| `tests/api-versioning.test.ts` | Setiap route di `/api/v1/` mendeklarasikan izin + idempotensi (§4.2) |
| `tests/env-required.test.ts` | `scripts/check-env.mjs` menyebut setiap variabel yang benar-benar dibaca kode di jalur produksi (F-14) |

### Lapis 2 — skrip pembuktian, dijalankan terhadap sistem hidup

Pola `prove-*` yang sudah ada di repo, diperluas. Semuanya **hanya-baca**,
aman dijalankan terhadap produksi:

- `prove-tenant-isolation.ts` — buat dua tenant uji, unggah dokumen di
  masing-masing, lalu **buktikan** sesi A tidak bisa mengambil berkas B
  (tanpa cookie: 302 ke `/login`; dengan cookie A: 403/404). Ini yang mengubah
  F-1 dari "sudah diperbaiki" menjadi "terbukti diperbaiki".
- `prove-backup-restore.ts` — pulihkan cadangan termuda ke basis data bayangan,
  bandingkan jumlah baris per tabel dan neraca saldo satu PT.
- `prove-books-balance.ts` — untuk **setiap** PT terdaftar: aset = kewajiban +
  ekuitas + akumulasi laba/rugi; nilai persediaan = saldo akun persediaan;
  total piutang pembantu = saldo akun kontrol. Dijalankan bulanan; setiap
  ketidakcocokan adalah insiden, bukan pembulatan.
- `prove-scheduler-alive.ts` — waktu jalan terakhir penjadwal < 2 jam.

### Lapis 3 — ritual manual, terjadwal

| Irama | Kegiatan |
|---|---|
| Tiap rilis | `bun run verify` (agent/cabang) **+** `bun run build` sekali di atas `develop` hasil gabungan (sesi utama) — aturan `AGENTS.md` tidak berubah |
| Mingguan | Baca papan galat; nol galat baru yang tidak terjelaskan |
| Bulanan | `prove-books-balance.ts` seluruh PT; tinjau kuota & pemakaian |
| Kuartalan | **Latihan pemulihan penuh** ke server bayangan; tinjau ulang matriks izin efektif tiap tenant |
| Tahunan | Uji tembus pihak ketiga; tinjau ulang skema e-Faktur terhadap aturan DJP berjalan (F-11); tinjau S&K + kebijakan privasi (F-15) |
| Per pelanggan baru (30 hari pertama) | Wawancara singkat perjalanan penyiapan — di situlah F-2/F-3 muncul sebagai keluhan, atau terbukti tertutup |

### Definisi "siap rilis" — daftar yang bisa dicentang

Rilis umum dibuka **hanya bila seluruh baris ini benar**:

- [ ] F-1 tertutup **dan** `prove-tenant-isolation.ts` hijau
- [ ] F-7 tertutup; jejak audit ikut ekspor & penghapusan
- [ ] Cadangan otomatis berjalan **dan** satu pemulihan sudah pernah berhasil
- [ ] Pelacakan galat menyala, peringatan sampai ke orang yang bertugas
- [ ] Penjadwal jadi layanan; `prove-scheduler-alive.ts` hijau
- [ ] F-6 tertutup (pembatas laju login persisten, per-IP + per-pengenal)
- [ ] Impor Data Awal §4.1 minimal berkas 1–5; F-3 tertutup
- [ ] `bun run verify` **dan** `bun run build` hijau di `develop` hasil gabungan
- [ ] `PLATFORM_CONTACT_EMAIL`, `SETTINGS_ENCRYPTION_KEY`, `OPERATOR_HOST`,
      `OPERATOR_IP_ALLOWLIST`, SMTP, dan `db:seed:plans` terpasang & terverifikasi
- [ ] Halaman status + jalur dukungan hidup dan diumumkan
- [ ] Keputusan §6 sudah diambil dan tertulis

---

## 6. Keputusan yang butuh pemilik, bukan pengembang

Empat hal yang tidak boleh diputuskan oleh kode:

1. ~~**PPN (F-12).**~~ **Sudah diputuskan:** tarif menjadi pengaturan
   ber-efektif-tanggal dengan penanda PKP/non-PKP per PT — issue
   [#368](https://github.com/tri-evendi/sai-accounting/issues/368). Alasannya
   dua, dan keduanya lahir dari rilis umum: pelanggan non-PKP pasti ada (bawaan
   11% salah bagi mereka), dan tarif yang berubah karena aturan tidak boleh
   menuntut redeploy 10 menit.
2. **e-Faktur (F-11).** Apakah kita **berjanji** menghasilkan berkas impor DJP
   yang sah — dan karena itu wajib mengikuti perubahan skema Coretax — atau
   kita menyatakan di UI bahwa keluarannya adalah bahan yang harus dicocokkan
   sendiri? Keduanya sah; yang tidak sah adalah membiarkannya ambigu di halaman
   harga.
3. **Batas kapasitas (F-8).** Berapa tenant per instans MariaDB sebelum
   dipecah, dan siapa yang memantau ambangnya? Angkanya tidak perlu tepat —
   yang perlu adalah angkanya ada sebelum tersentuh.
4. **S&K naik versi (F-15).** Apakah pengguna lama diminta menyetujui ulang,
   dan apa yang terjadi bila menolak?

---

## 7. Ringkasan satu halaman

**Yang sudah kuat:** isolasi buku besar, otorisasi, disiplin akuntansi,
pemisahan bidang operator, anti-enumerasi, dokumentasi keputusan.

**Yang menghalangi rilis umum:** dokumen unggahan tidak berlingkup tenant (dan
karenanya juga tidak ikut ekspor & penghapusan PDP); tidak ada jalan masuk bagi
data perusahaan yang sudah berjalan; saldo awal persediaan yang bisa
tercatat dua kali; nol cadangan otomatis; nol pemantauan.

**Yang menentukan apakah produk ini laku:** Impor Data Awal (§4.1) dan API
baca (§4.2 lapis 1). Keduanya bukan perbaikan cacat — keduanya adalah pintu
masuk yang belum dibuat.

**Yang membuat semuanya bertahan:** gerbang otomatis di `bun run verify`
(§5 lapis 1) dan skrip pembuktian terhadap sistem hidup (§5 lapis 2) — supaya
audit berikutnya tidak perlu membaca ulang seluruh kode untuk mengetahui apakah
yang diperbaiki hari ini masih benar bulan depan.
