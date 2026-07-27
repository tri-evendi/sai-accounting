# Multi-PT: satu aplikasi, satu basis data per perusahaan

Issue #104. Dokumen ini menjelaskan **bentuknya**, **cara memindahkan pemasangan
yang sudah berjalan**, dan **aturan yang tidak boleh dilanggar** saat menulis
kode baru.

---

## 1. Bentuknya

```
  ┌──────────────────────────┐        ┌──────────────────────┐
  │  BASIS DATA KENDALI      │        │  sai_pt_a  (buku PT A)│
  │  companies               │        │  invoices, journals,  │
  │  users                   │        │  stock_movements, …   │
  │  memberships             │        └──────────────────────┘
  │  (nol angka akuntansi)   │        ┌──────────────────────┐
  └──────────────────────────┘        │  sai_pt_b  (buku PT B)│
                                      └──────────────────────┘
```

- **Identitas** (siapa orangnya, kata sandinya, pencabutan sesinya) hidup di
  basis data kendali. Satu orang = satu akun, berapa pun PT yang dipegangnya.
- **Keanggotaan** = `pengguna × perusahaan × peran`. Seseorang bisa Direktur
  Utama di PT A dan Kepala Gudang di PT B; satu kolom `users.role` tidak bisa
  menyatakan itu.
- **Buku besar** — jurnal, faktur, stok, kas, bagan akun, izin per peran, modul
  aktif — seluruhnya per perusahaan, tanpa satu pun kolom `company_id`.

**Kenapa basis data terpisah, bukan tenancy per-baris.** Isolasinya FISIK, bukan
sekadar teruji: satu klausa `WHERE company_id = …` yang terlupa akan menampilkan
buku besar satu klien kepada klien lain, dan di produk akuntansi itu bukan bug
melainkan insiden. Dengan basis data terpisah, kebocoran seperti itu **tidak
mungkin terjadi** — bukan "tidak terjadi karena tesnya lengkap". Modelnya juga
sudah dikenal akuntan Indonesia: berkas perusahaan Accurate/MYOB.

**Ongkosnya, disebut apa adanya:** manajemen koneksi, migration harus jalan di
semua basis data, dan pelaporan konsolidasi lintas-PT menjadi sulit. Yang
terakhir sengaja **di luar lingkup** — bila kebutuhan itu muncul, pilihan
arsitekturnya berubah dan harus dibicarakan lagi.

---

## 2. Aturan yang tidak boleh dilanggar

> **Konteks perusahaan yang hilang harus MELEMPAR — tidak pernah jatuh ke basis
> data bawaan.**

Ini satu-satunya aturan yang kalau meleset akibatnya fatal DAN sunyi. Kode yang
berjalan tanpa konteks lalu diam-diam memakai koneksi bawaan akan menulis
transaksi PT A ke buku PT B: tanpa galat, tanpa jejak, ketahuan berbulan-bulan
kemudian sebagai neraca yang tidak cocok — kalau ketahuan.

Karena itu di `src/lib/prisma.ts` tidak ada `?? defaultCompany`, tidak ada mode
"kalau cuma satu perusahaan pakai yang itu", dan `DATABASE_URL` lama tidak
pernah menjadi jawaban.

| Jalur kode | Cara mendapat konteks |
|---|---|
| Halaman `(dashboard)` / `(setup)` | `requirePagePermission()` — otomatis |
| Route API | `requireApiPermission()` — otomatis |
| Skrip, cron, seed, pekerjaan latar | **`runWithCompany(ctx, fn)` — wajib eksplisit** |
| Halaman `(auth)` (masuk, pilih perusahaan) | tidak punya, dan memang tidak boleh menyentuh buku besar |

### Bagaimana klien diselesaikan

`prisma` adalah **Proxy** yang mencari kliennya **saat query dipanggil**:

1. konteks `AsyncLocalStorage` (dipasang `runWithCompany`), lalu
2. sesi permintaan (`companyId` di JWT → registry → nama basis data), lalu
3. **melempar**.

Kenapa saat dipanggil, bukan saat akses properti: rancangan pertama memakai
`AsyncLocalStorage.enterWith()` di penjaga lalu membacanya sinkron. Itu tidak
bekerja — `enterWith` di dalam fungsi async **tidak merambat ke kelanjutan
pemanggilnya**, jadi kode halaman sesudah `await requirePagePermission()` tidak
melihatnya. Gejalanya bukan galat, melainkan halaman yang membaca basis data
yang salah.

### Satu bentuk yang tidak didukung

`prisma.$transaction([a, b])` (bentuk array) tidak bisa lewat proxy — bentuk itu
menuntut `PrismaPromise` yang belum dijalankan. Bentuk callback
(`prisma.$transaction(async (tx) => …)`) bekerja penuh dan dipakai seluruh
transaksi di kode ini. Kalau perlu bentuk array: `await currentCompanyClient()`
lalu panggil di klien itu.

### Cache WAJIB dikunci per perusahaan

Satu proses melayani beberapa PT bergantian. Cache tingkat modul yang isinya
milik satu perusahaan akan dipakai untuk perusahaan lain selama satu TTL —
querynya tetap ke basis data yang benar, tapi **keputusannya** salah, dan itu
tidak meninggalkan galat apa pun. Sudah dikunci: matriks izin efektif, override
per pengguna, himpunan modul (`authz-effective.ts`), latch gerbang penyiapan
(`setup-gate.ts`), dan registry perusahaan.

---

## 3. Memindahkan pemasangan yang sudah berjalan

**Urutannya tidak boleh ditukar.** Langkah 2 membaca tabel `users` yang dibuang
langkah 3.

```bash
# 0. CADANGKAN dulu.
mysqldump sai_production > backup-sebelum-104.sql

# 1. Basis data kendali
mysql -e "CREATE DATABASE sai_control DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
#    tambahkan CONTROL_DATABASE_URL ke .env
npm run db:migrate:control

# 2. Daftarkan basis data yang sekarang sebagai perusahaan pertama
#    (menyalin pengguna DENGAN ID YANG SAMA + memindahkan jejak audit lama)
npm run adopt-company -- --slug pt-sai --name "PT Subur Anugerah Indonesia"

# 3. Migration perusahaan — 0042 membuang tabel `users` dari buku
npm run db:migrate:companies

# 4. Naikkan image baru (skema & kode harus naik bersama)
docker compose up --build -d
```

Skrip adopsi **menolak berjalan** bila tabel `users` sudah hilang, jadi urutan
yang salah gagal berisik. Tapi kalau langkah 3 terlanjur jalan lebih dulu, akun
lama hanya bisa dipulihkan dari cadangan — karena itu langkah 0 ada.

### Perusahaan berikutnya

```bash
npm run create-company -- --slug pt-b --name "PT Bumi Baru" [--admin budi]
```

Membuat basis data → menerapkan migration → **baru** mendaftarkan (registry
ditulis terakhir supaya kegagalan di tengah tidak meninggalkan perusahaan yang
bisa dipilih tapi belum bisa dibuka). Sesudahnya: masuk ke aplikasi, pilih
perusahaannya, jalankan **wizard penyiapan** — identitas, bagan akun, saldo
awal, dan modul adalah keputusan akuntansi, bukan argumen baris perintah.

### Migration sesudah ini

```bash
npm run db:migrate:all      # kendali, lalu SETIAP perusahaan
```

Kegagalan satu perusahaan **tidak menghentikan** yang lain: kalau berhenti di
yang pertama gagal, sisanya tertinggal di skema lama sementara aplikasinya sudah
versi baru. Ringkasannya dicetak di akhir dan exit code-nya bukan nol.

---

## 4. Berganti perusahaan

Pemilih di `/select-company`; penukar di menu pengguna (muncul hanya bila
memang ada lebih dari satu). Pengguna dengan **satu** perusahaan tidak pernah
melihat keduanya — perusahaannya sudah aktif sejak ia masuk.

**Berpindah selalu memuat ulang halaman sepenuhnya**, tidak pernah navigasi
klien. Izin efektif, himpunan modul, identitas perusahaan yang tercetak di
dokumen, dan cache query semuanya per perusahaan; navigasi klien menyisakan
jendela — sekejap, tapi nyata — di mana menu PT A dirender di atas data PT B.
Anggap berganti perusahaan sebagai "masuk ke buku yang lain", bukan mengubah
penyaring.

**Kenapa tidak dipilihkan otomatis.** Memilihkan "yang pertama" terdengar ramah
dan justru berbahaya: orang akan mengira ia melihat PT yang biasa dibukanya,
lalu mencatat transaksi ke buku yang salah.

---

## 5. Yang berubah bagi pengembang

| Dulu | Sekarang |
|---|---|
| `prisma.user.…` | `users-directory.ts` (satu-satunya jembatan ke basis data kendali) |
| `session.user.role` selalu ada | `null` selama perusahaan belum dipilih |
| `users.status` (Int) | `users.must_change_password` (Boolean) |
| FK `periods.closed_by_id → users` | id global tanpa FK; nama dicari, yang hilang tampil "—" |
| `data/audit/audit.jsonl` | `data/audit/<slug>/audit.jsonl` |
| `npm run db:migrate` | `npm run db:migrate:all` |
| `npm run create-admin -- --username …` | `… --company <slug>` (wajib) |

Tabel di basis data perusahaan **tidak boleh** punya foreign key ke pengguna —
FK tidak bisa menyeberangi basis data. Simpan id global sebagai `Int` biasa dan
cari namanya lewat `users-directory.ts`.
