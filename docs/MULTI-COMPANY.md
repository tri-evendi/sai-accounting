# Multi-PT: satu aplikasi, satu basis data per perusahaan

Issue #104. Dokumen ini menjelaskan **bentuknya**, **cara memindahkan pemasangan
yang sudah berjalan**, dan **aturan yang tidak boleh dilanggar** saat menulis
kode baru.

> **Lingkupnya: SATU GRUP USAHA yang memegang beberapa PT** — bukan platform
> berlangganan dengan pelanggan yang tidak saling kenal. Rencana menjadikannya
> multi-pelanggan ada di [`MULTI-TENANT.md`](./MULTI-TENANT.md); tahap 1–3-nya
> (#134 skema `tenants` di basis data kendali, #135 izin lingkup TENANT —
> `company.create` kini milik keanggotaan tenant, bukan keanggotaan PT —, #136
> email sebagai pengenal login + atur-ulang kata sandi mandiri) SUDAH
> diimplementasikan. Aturan multi-PT di dokumen ini tetap berlaku penuh.

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

Semua kode server bertanya lewat `currentCompany()` (`lib/current-company.ts`),
dan `prisma` memakainya **saat query dipanggil**:

1. konteks `AsyncLocalStorage` (dipasang `runWithCompany` / penjaga), lalu
2. sesi permintaan (`companyId` di JWT → registry → nama basis data), lalu
3. **melempar**.

**Kenapa sesi perlu jadi sumber kedua.** Tidak semua jalur melewati penjaga, dan
yang tidak melewatinya bukan kasus pinggiran: `/api/user/permissions` (penyusun
menu) dan `/api/user/companies` (pemilih perusahaan) sengaja self-scoped —
`auth()` saja, tanpa `requireApiPermission`. Tanpa sumber kedua, sidebar setiap
pengguna kosong dan pemilih perusahaannya gagal persis saat paling dibutuhkan.

**Kenapa penyelesaiannya saat dipanggil, bukan saat akses properti.** Membaca
sesi itu async; akses properti tidak bisa menunggu, pemanggilan bisa.

### Kenapa `enterWith` tidak boleh diandalkan

Rambatan `AsyncLocalStorage.enterWith()` dari fungsi yang di-`await` ke
**kelanjutan pemanggilnya** tergantung lingkungan. Diprobe langsung: di Node
polos ia merambat; di dalam vitest, dengan API yang sama persis, tidak — bedanya
pada rantai async resource yang sudah dibuat pemanggilnya lebih dulu.

Kesimpulannya: `enterCompanyContext()` di penjaga adalah **jalan pintas**, bukan
jaminan. Yang dijamin:

- `runWithCompany()` memakai `run()` — selalu bisa diandalkan, termasuk melewati
  batas async. Inilah cara skrip/cron/tes menyebut perusahaannya.
- Untuk permintaan HTTP, kebenarannya bertumpu pada **sesi**, bukan pada
  rambatan ALS.

Dan satu sifat yang tetap penting: konteks yang sedang berjalan **tidak**
tertimpa dari dalam — pekerjaan latar yang membungkus dirinya dengan
`runWithCompany(PT_A)` tetap menulis ke PT A sekalipun sesuatu di dalamnya
menanam PT B. Yang eksplisit menang. Keduanya dikunci di
`tests/company-context.test.ts`.

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

> **Di server produksi, perintah `npm run …` di bawah harus dijalankan DI DALAM
> container**, bukan di host — dan ini bukan soal selera. Service `db` tidak
> memublikasikan port ke host sama sekali (lihat `docker-compose.yml`), jadi
> nama `db` di `DATABASE_URL` hanya bisa diselesaikan dari dalam jaringan
> `internal`. Menjalankannya di host akan berhenti pada kegagalan koneksi yang
> terdengar seperti kredensial salah. Bungkusnya:
>
> ```bash
> docker compose run --rm migrate npm run <skrip>
> ```
>
> Service `migrate` memakai image yang sama dengan `web`, `env_file: .env` yang
> sama, dan berdiri di jaringan yang sama — jadi yang dijalankan benar-benar
> kode dan konfigurasi yang akan naik. Image-nya harus sudah dibangun:
> `docker compose build`.
>
> Perintah `mariadb`/`mariadb-dump` dijalankan di dalam container `sai-db`
> (image `mariadb:11` **tidak** memasang `mysql`/`mysqldump`; keduanya bernama
> `mariadb`/`mariadb-dump`). Sandi root diambil dari environment container,
> jadi ia tidak pernah tertulis di baris perintah maupun riwayat shell.

```bash
# 0. CADANGKAN dulu.
docker exec sai-db sh -c 'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" \
  --single-transaction --routines --events sai_production' > backup-sebelum-104.sql
#    Periksa cadangannya SEBELUM lanjut — yang menentukan bukan ukurannya:
#    grep -c "INSERT INTO \`users\`" backup-sebelum-104.sql   # harus ≥ 1

# 1. Basis data kendali — BESERTA HAK AKSESNYA. Pengguna aplikasi hanya berhak
#    atas basis data yang sekarang; tanpa GRANT, migration kendali berhenti
#    dengan `P1010: User was denied access` — pesan yang terdengar seperti
#    kredensial salah padahal bukan.
docker exec sai-db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "
  CREATE DATABASE IF NOT EXISTS \`sai_control\`
    DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON \`sai_control\`.* TO '"'"'$MARIADB_USER'"'"'@'"'"'%'"'"';
  FLUSH PRIVILEGES;"'
#    tambahkan CONTROL_DATABASE_URL ke .env — kredensial & host SAMA dengan
#    DATABASE_URL, hanya nama basis datanya yang berbeda.
docker compose build                                    # image harus ada dulu
docker compose run --rm migrate npm run db:migrate:control

# 2. Daftarkan basis data yang sekarang sebagai perusahaan pertama
#    (menyalin pengguna DENGAN ID YANG SAMA + memindahkan jejak audit lama)
#    Sejak issue #134/#136 adopsi juga MEMBUAT TENANT dan menuntut peta email
#    (JSON {"username": "email"} yang diisi operator — bukan ditebak mesin):
docker compose run --rm migrate npm run adopt-company -- \
  --slug pt-sai --name "PT Subur Anugerah Indonesia" --emails emails.json

#    BUKTIKAN akunnya sudah pindah SEBELUM langkah 3 — ini titik tak-bisa-balik.
#    Yang dicari: jumlah pengguna DAN keanggotaan di basis data kendali > 0.
#    (0042 membuang tabel `users`; kalau adopsi gagal diam-diam, satu-satunya
#    jalan pulang adalah cadangan langkah 0.)

# 3. Migration perusahaan — 0042 membuang tabel `users` dari buku,
#    0043 menyelaraskan nilai enum-like data legacy (issue #111)
docker compose run --rm migrate npm run db:migrate:companies

# 4. Buktikan nilai enum-like sudah baku di SETIAP perusahaan
docker compose run --rm migrate npm run check:legacy-values

# 5. Naikkan image baru (skema & kode harus naik bersama)
docker compose up -d          # image-nya sudah dibangun di langkah 1
```

**Dijalankan sungguhan di produksi 2026-07-28** (PT Subur Anugerah Indonesia,
`sai_production` → `pt-sai`). Yang ditemukan saat itu dan sudah dibetulkan di
atas: perintah `npm run …` tidak bisa jalan di host (service `db` tanpa port),
`mysqldump`/`mysql` tidak ada di image `mariadb:11`, dan pemasangan itu ternyata
masih tertinggal di 0036 — jadi langkah 3 menerapkan 0037→0043 sekaligus, bukan
hanya migration multi-PT. Hasilnya: 1 pengguna pindah ke basis data kendali,
829 gerakan stok & 18.689 baris kas dinormalkan, 26 barang yang saldonya dulu
terbaca nol kembali punya saldo.

**Kenapa langkah 4 ada.** `migrate deploy` tidak melaporkan berapa baris yang
diperbaikinya, dan sejak sekarang ia berjalan ke N basis data sekaligus.
Pemeriksaannya BINARY — dengan collation `utf8mb4_unicode_ci`, `type = 'in'`
cocok dengan `'IN'`, jadi pemeriksaan biasa akan bilang "bersih" untuk data yang
justru sedang salah hitung (issue #111). Perintah ini read-only dan exit-nya
bukan nol bila masih ada sisa.

**`docker compose up` kini aman terhadap urutan.** Service `migrate` menjalankan
`db:migrate:all`, bukan `prisma migrate deploy` mentah. Bedanya menentukan:
perintah mentah itu menerapkan 0042 — yang **menghapus tabel `users`** — ke
basis data yang ditunjuk `DATABASE_URL`, jadi menaikkan container sebelum
langkah 2 akan menghapus seluruh akun beserta hash kata sandinya. `db:migrate:all`
hanya menyentuh perusahaan yang **sudah terdaftar**; registry yang masih kosong
membuatnya berhenti dengan kode bukan-nol dan menyebutkan perintah yang harus
dijalankan lebih dulu, sehingga `web` pun tidak ikut naik.

### Bila pemasangannya masih di bawah 0032, PERIKSA `memberships.role`

Adopsi menyalin `users.role` apa adanya ke `memberships.role` di basis data
kendali, dan itu terjadi **sebelum** langkah 3. Migration `0032` mengganti nama
kunci peran (`bos → managing_director`, `core → finance_manager`,
`ptg → warehouse_head`) — tapi ia hanya menyentuh basis data PERUSAHAAN, tempat
kuncinya sudah tidak lagi tinggal. Akibatnya, pada pemasangan yang diadopsi saat
masih di bawah 0032, `memberships.role` tertinggal memakai kunci lama sementara
tabel `roles` dan kode sudah memakai kunci baru: setiap pengguna kehilangan
SELURUH izinnya, tanpa satu pun galat — sekadar aplikasi yang kosong.

Produksi tidak mengalaminya karena sudah di 0036 saat diadopsi. Pemasangan yang
lebih tua harus diperbaiki sesudah langkah 3:

```sql
UPDATE memberships SET role='managing_director' WHERE role='bos';
UPDATE memberships SET role='finance_manager'   WHERE role='core';
UPDATE memberships SET role='warehouse_head'    WHERE role='ptg';
```

Cara memeriksanya: setiap nilai `memberships.role` di basis data kendali harus
ada di `roles.key` basis data perusahaannya.

Skrip adopsi membaca skema LAMA (kolomnya masih `users.status`, bukan
`must_change_password`) — ia mendeteksi mana yang ada, jadi urutan di atas benar
apa adanya. Ia juga **menolak berjalan** bila tabel `users` sudah hilang, jadi
urutan yang salah gagal berisik. Tapi kalau langkah 3 terlanjur jalan lebih dulu, akun
lama hanya bisa dipulihkan dari cadangan — karena itu langkah 0 ada.

### Perusahaan berikutnya

**Dari aplikasi** (issue #104) — halaman **Tambah Perusahaan** (`/companies/new`;
sejak issue #135 izinnya `company.create` di matriks TENANT — owner/admin
tenant, tanpa menuntut perusahaan aktif). Ia mengerjakan hal yang sama dengan
skrip di bawah — buat basis data, terapkan skema, daftarkan — sambil
mengalirkan kemajuannya tahap demi tahap.

Syaratnya satu: pengguna basis data aplikasi harus boleh membuat basis data.
Hak itu dibatasi **pola nama**, bukan diberikan menyeluruh:

```bash
docker exec sai-db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "
  GRANT ALL PRIVILEGES ON \`sai\_%\`.* TO '"'"'$MARIADB_USER'"'"'@'"'"'%'"'"';
  FLUSH PRIVILEGES;"'
```

`sai\_%` berarti aplikasi hanya bisa menyentuh basis data yang namanya
berawalan `sai_` — dan kode memaksa awalan yang sama
(`COMPANY_DATABASE_PREFIX`). Dua sisi yang saling menjaga: satu di server, satu
di kode. Tanpa GRANT ini halamannya tetap berguna, hanya jalurnya berbeda:
administrator membuat basis data kosong lebih dulu, lalu penyediaan mengisinya.

Migration diterapkan oleh aplikasi SENDIRI, bukan lewat Prisma CLI (image
produksi tidak memuatnya). Pembukuannya ditulis ke `_prisma_migrations` dengan
bentuk yang sama persis, jadi `db:migrate:all` berikutnya membacanya sebagai
sudah diterapkan — dijaga `tests/company-provisioning.test.tsx`.

**Dari baris perintah** — tetap ada, dan tetap jalan:

```bash
docker compose run --rm migrate npm run create-company -- \
  --slug pt-b --name "PT Bumi Baru" [--admin budi]
```

Pengguna basis datanya harus berhak `CREATE DATABASE`; bila tidak (dan di banyak
hosting memang tidak), buat basis datanya manual **beserta GRANT-nya**, lalu
jalankan dengan `--database <nama>`.

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

### Gladi resik sebelum menyentuh produksi

Seluruh urutan di atas layak dijalankan dulu pada SALINAN. Sekali dijalankan
begitu, ia sudah menemukan dua hal yang tidak terlihat dari membaca kode: hak
akses yang kurang (`P1010`) dan skrip adopsi yang menyebut kolom yang belum ada.

```bash
mysqldump --single-transaction sai_production > /tmp/full.sql
mysql -e "CREATE DATABASE sai_gladi; CREATE DATABASE sai_gladi_control"
mysql sai_gladi < /tmp/full.sql
# arahkan DATABASE_URL & CONTROL_DATABASE_URL ke kedua salinan itu, lalu
# jalankan langkah 1-3. Bandingkan jumlah baris & Σ debit dengan produksi.
# Setelah yakin: DROP kedua basis data salinan dan hapus dump-nya.
```

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
