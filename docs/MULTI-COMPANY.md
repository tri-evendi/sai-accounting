# Multi-PT: satu aplikasi, satu basis data per perusahaan

Issue #104. Dokumen ini menjelaskan bentuknya, cara menambah perusahaan, dan
aturan yang tidak boleh dilanggar saat menulis kode baru.

> Lingkupnya satu grup usaha yang memegang beberapa PT. Lapis multi-customer
> di atasnya (tenant, pendaftaran mandiri, langganan; #134–#142) sudah
> diimplementasikan; rancangannya di [`MULTI-TENANT.md`](./MULTI-TENANT.md).
> Aturan multi-PT di dokumen ini tetap berlaku penuh.

---

## 1. Bentuknya

```
  ┌──────────────────────────┐        ┌──────────────────────┐
  │  BASIS DATA CONTROL      │        │  sai_pt_a  (buku PT A)│
  │  companies               │        │  invoices, journals,  │
  │  users                   │        │  stock_movements, …   │
  │  memberships             │        └──────────────────────┘
  │  (nol angka akuntansi)   │        ┌──────────────────────┐
  └──────────────────────────┘        │  sai_pt_b  (buku PT B)│
                                      └──────────────────────┘
```

- **Identitas** (orangnya, kata sandinya, pencabutan sesinya) hidup di basis
  data control. Satu orang punya satu akun, berapa pun PT yang dipegangnya.
- **Keanggotaan** = `pengguna × perusahaan × peran`. Seseorang bisa menjadi
  Direktur Utama di PT A dan Kepala Gudang di PT B; satu kolom `users.role`
  tidak bisa menyatakan itu.
- **Buku besar** (jurnal, faktur, stok, kas, bagan akun, izin per peran, modul
  aktif) seluruhnya per perusahaan, tanpa kolom `company_id`.

**Kenapa basis data terpisah, bukan tenancy per baris.** Isolasinya fisik.
Dengan tenancy per baris, satu klausa `WHERE company_id = …` yang terlupa
menampilkan buku besar satu klien kepada klien lain, dan di produk akuntansi
itu insiden. Dengan basis data terpisah, kebocoran seperti itu tidak mungkin
terjadi, terlepas dari lengkap atau tidaknya tes. Modelnya juga sudah dikenal
akuntan Indonesia: berkas perusahaan Accurate/MYOB.

**Ongkosnya:** manajemen koneksi, migration harus jalan di semua basis data,
dan pelaporan konsolidasi lintas-PT menjadi sulit. Konsolidasi sengaja di luar
lingkup. Bila kebutuhan itu muncul, pilihan arsitekturnya berubah dan harus
dibicarakan lagi.

---

## 2. Aturan yang tidak boleh dilanggar

> **Konteks perusahaan yang hilang harus melempar error, tidak pernah jatuh ke
> basis data bawaan.**

Pelanggaran aturan ini fatal dan tidak bersuara. Kode yang berjalan tanpa
konteks lalu memakai koneksi bawaan akan menulis transaksi PT A ke buku PT B
tanpa error dan tanpa jejak. Ia baru ketahuan berbulan-bulan kemudian sebagai
neraca yang tidak cocok, kalau ketahuan.

Karena itu `src/lib/prisma.ts` tidak punya `?? defaultCompany`, tidak punya
mode "kalau cuma satu perusahaan pakai yang itu", dan tidak pernah memakai
`DATABASE_URL` lama sebagai jawaban.

| Jalur kode | Cara mendapat konteks |
|---|---|
| Halaman `/t/{tenant}/{company}/…` (termasuk wizard `(setup)`) | `requirePagePermission(izin, params)` — dari **URL** |
| Route API | `requireApiPermission(izin)` — dari **permintaan** (header `x-tenant-slug`/`x-company-slug`) |
| Route API unduhan `/api/t/{tenant}/{company}/…` | `requireApiPermission(izin, ctx.params)` — dari **jalur** |
| Route self-scoped tanpa izin (`/api/user/permissions`, …) | `enterCompanyFromRequest()` — dari **permintaan** |
| Skrip, cron, seed, pekerjaan latar | **`runWithCompany(ctx, fn)` — wajib eksplisit** |
| Halaman `(auth)` (masuk, pilih perusahaan) | tidak punya, dan memang tidak boleh menyentuh buku besar |

### Sejak issue #157: konteks halaman datang dari URL

Halaman dasbor hidup di `/t/{tenantSlug}/{companySlug}/…`. Perusahaannya
diambil dari jalur, dan keanggotaannya diverifikasi ulang pada setiap
permintaan (`enterCompanyFromRoute`, `lib/company-route.ts`).

Alasannya: satu cookie sesi berlaku untuk semua tab. Berganti perusahaan di tab
sebelah membuat tab ini menampilkan buku PT lama sambil menulis ke PT baru. Itu
kegagalan yang dilarang di atas, hanya masuk lewat antarmuka. Akibat lainnya,
tautan `/invoices/12` menunjuk faktur yang berbeda bagi setiap penerimanya.

Yang berlaku sekarang:

* **Sesi turun pangkat.** `session.user.companyId` berarti "yang terakhir
  dibuka". Gunanya menjawab `/dashboard` tanpa jalur perusahaan dan menandai
  pilihan di `/select-company`; ia bukan sumber otorisasi. Peran pun tidak
  diambil dari sesi: JWT menyimpan peran di perusahaan terakhir, dan memakainya
  di halaman perusahaan lain berarti memberi hak PT A di buku PT B.
* **Gagal apa pun menghasilkan 404.** Slug tak ada, PT nonaktif, bukan anggota,
  atau tenant lain mendapat jawaban yang sama. Jawaban 403 mengakui bahwa
  sumber dayanya ada, dan pengakuan itu sudah kebocoran enumerasi (§4.4
  docs/MULTI-TENANT.md).
* **`currentCompany()` punya dua sumber:** konteks ALS, lalu penyimpan
  per-permintaan yang ditulis guard. Setelah itu ia melempar. Sumber ketiga
  (sesi) dihapus di #158; lihat di bawah.
* **Slug perusahaan tetap.** Slug menyusun nama basis data dan muncul di URL.
  Menggantinya mematikan setiap tautan yang pernah dibagikan, tanpa error.
  Nama perusahaan bebas berubah.
* **Jalur lama masih dilayani** dengan redirect 307 oleh `src/proxy.ts`
  menurut `MIGRATED_ROOT_SEGMENTS` di `packages/core/src/tenant-routes.ts`.
  Satu-satunya berkas yang sengaja tinggal di jalur lama adalah `/dashboard`
  tanpa jalur perusahaan. Ia pengarah tanpa query, karena proxy tidak bisa
  me-redirect token yang belum membawa slug.
* **Tautan tidak ditulis dalam bentuk bertenant.** `Link`/`useAppRouter` di
  `packages/ui/src/components/app-link.tsx` memetakan `href` lama ke jalur
  kanonik dari `usePathname()`. Sesi tidak dipakai karena dibagi semua tab.
* **`CompanySessionSync` tidak menahan apa pun lagi.** Di #157 ia menahan
  permukaan interaktif sampai cookie menyusul, karena route API masih membaca
  sesi. Sejak #158 ia hanya mencatat "yang terakhir dibuka" di latar.

### Sejak issue #158: konteks API datang dari permintaan, dan sesi dihapus

#157 memindahkan halaman, tetapi route API masih menanyakan perusahaan kepada
sesi. Selama itu, `/t/acme/cv-maju/invoices` menampilkan buku CV Maju sambil
menulis ke PT yang tercatat di cookie. Bahayanya hanya turun satu lapis, dan
lebih sulit terlihat karena URL-nya tampak benar.

* **Bentuknya header.** `apiFetch()` (`lib/api-fetch.ts`) menyuntikkan
  `x-tenant-slug` + `x-company-slug` dari `window.location.pathname`, di satu
  tempat untuk 67 pemanggil. Tes scanner di `tests/authz-coverage.test.ts`
  menolak setiap `fetch("/api/…")` langsung.
* **Jalur untuk yang tidak bisa berheader.** Unduhan `<a href download>` tidak
  melewati `apiFetch`, jadi dua route tinggal di `/api/t/{tenant}/{company}/…`
  (template Daftar Akun, ekspor e-Faktur). Bila jalur dan header dikirim
  bersamaan, jalur menang.
* **Header adalah masukan pengguna.** Guard memakainya hanya untuk menentukan
  perusahaan yang dimaksud, lalu membaca ulang keanggotaan pemanggil di basis
  data control pada permintaan itu juga. Gagal apa pun menghasilkan 404 yang
  sama persis dengan jawaban untuk slug fiktif, dan tidak ada gate
  berikutnya yang berjalan.
* **Peran diambil dari keanggotaan, bukan dari JWT**, sama seperti di halaman.
* **Tidak ada backup sesi.** `enterCompanyFromSession` dihapus seluruhnya, dan
  `currentCompany()` kehilangan sumber ketiganya. Permintaan tanpa lingkup
  dijawab 409 `company_required`, tidak dilayani dengan perusahaan yang
  terakhir dibuka. Dengan begitu aturan di atas menjadi sifat struktur, bukan
  kedisiplinan yang harus diingat setiap penulis route: tidak ada perusahaan
  bawaan yang bisa dipakai.
* **Route publik dan tingkat tenant tidak ikut.** `/api/auth/*`,
  `/api/billing/webhook`, `/api/health`, seluruh `/api/tenant/*`, dan
  `/api/companies` bekerja tanpa perusahaan; daftarnya di
  `tests/authz-coverage.test.ts`.

### Bagaimana klien diselesaikan

Semua kode server bertanya lewat `currentCompany()` (`lib/current-company.ts`),
dan `prisma` memakainya saat query dipanggil:

1. konteks `AsyncLocalStorage` (dipasang `runWithCompany` / guard), lalu
2. penyimpan per-permintaan yang ditulis guard (`setRouteCompany`), lalu
3. **melempar**.

**Kenapa sumber kedua ada**, padahal guard juga memanggil
`enterCompanyContext()`: rambatan `enterWith` tidak pernah sampai dari guard
ke badan route (lihat bagian berikutnya). Sumber kedua yang sebenarnya melayani
setiap permintaan HTTP. Guard menulis ke keduanya, lalu membaca kembali
sumber kedua untuk membuktikan konteksnya terpasang. Kalau tidak, ia melempar
sebelum query pertama berjalan.

**Jangkar sumber kedua (issue #333).** Penyimpan itu dulu `cache()` React.
`cache()` hanya memoisasi di dalam render, dan route handler bukan render.
Diukur di route handler Next 16.2.1, `holder() === holder()` bernilai `false`:
guard menulis ke satu objek, pembacaan berikutnya menerima objek lain.
Akibatnya mekanisme ini tidak pernah bekerja untuk API. Halaman selamat karena
di render `cache()` memang memoisasi, sedangkan route handler menjawab 500.
Jangkarnya sekarang objek permintaan milik Next sendiri, yaitu hasil
`await headers()`. Objek itu terukur identik sepanjang satu permintaan dan
berbeda antarpermintaan. `WeakMap` di atasnya membuat entrinya hilang bersama
permintaannya.

**Route self-scoped menyebut perusahaannya sendiri.** `/api/user/permissions`,
`/api/user/accountant-mode`, dan `/api/company/identity` sengaja tanpa
`requireApiPermission`, tetapi tetap butuh konteks. Sejak #158 mereka memanggil
`enterCompanyFromRequest()` (`lib/company-request.ts`), yang memverifikasi
keanggotaan dengan cara yang sama seperti guard.

**Kenapa diselesaikan saat dipanggil, bukan saat akses properti.** Membaca
sesi itu async; akses properti tidak bisa menunggu, pemanggilan bisa.

**Konteks membawa instansnya (tahap 4).** `CompanyContext` berisi
`databaseName` **dan** `dbInstance` (`null` = instans bawaan). Medan itu wajib
disebut, termasuk `null`: konteks yang lupa mengisinya tidak lolos `tsc`.
Rakit konteks dari baris `companies` dengan `companyContextOf(row)`, dan baca
barisnya dengan `COMPANY_DATABASE_TARGET_SELECT`. Detailnya di §6.

### Kenapa `enterWith` tidak boleh diandalkan

Diukur di issue #333 (Node 22.22, serta di route handler dan render Next
16.2.1), batas rambatannya ditentukan oleh `await`:

- `enterWith` yang dipanggil sebelum `await` apa pun di fungsi itu merambat ke
  kelanjutan pemanggilnya.
- `enterWith` yang dipanggil sesudah sebuah `await` tidak merambat; pemanggil
  melihat store lamanya, atau tidak ada store sama sekali.

Guard selalu berada di kasus kedua, karena ia membaca basis data control
lebih dulu sebelum menanam konteks. Karena itu konteks dari
`enterCompanyContext()` di guard tidak pernah sampai ke badan route maupun ke
komponen halaman; terukur `null` di keduanya. Yang dijamin:

- `runWithCompany()` memakai `run()` dan selalu bisa diandalkan, termasuk
  melewati batas async. Ini cara skrip, cron, dan tes menyebut perusahaannya.
- Untuk permintaan HTTP, kebenarannya bertumpu pada penyimpan per-permintaan di
  `lib/current-company.ts`, bukan pada rambatan ALS dan (sejak #158) bukan pada
  sesi.

Konteks yang sedang berjalan juga tidak tertimpa dari dalam. Pekerjaan latar
yang membungkus dirinya dengan `runWithCompany(PT_A)` tetap menulis ke PT A
walaupun sesuatu di dalamnya menanam PT B; konteks eksplisit menang. Kedua
sifat ini dikunci di `tests/company-context.test.ts`.

### Satu bentuk yang tidak didukung

`prisma.$transaction([a, b])` (bentuk array) tidak bisa lewat proxy, karena
bentuk itu menuntut `PrismaPromise` yang belum dijalankan. Bentuk callback
(`prisma.$transaction(async (tx) => …)`) bekerja penuh dan dipakai semua
transaksi di kode ini. Kalau perlu bentuk array: `await currentCompanyClient()`,
lalu panggil di klien itu.

### Cache wajib dikunci per perusahaan

Satu proses melayani beberapa PT bergantian. Cache tingkat modul yang isinya
milik satu perusahaan akan dipakai untuk perusahaan lain selama satu TTL.
Query-nya tetap ke basis data yang benar, tetapi keputusannya salah, tanpa
error. Yang sudah dikunci: matriks izin efektif, override per pengguna,
himpunan modul (`authz-effective.ts`), latch gate penyiapan
(`setup-gate.ts`), dan registry perusahaan.

### Slug perusahaan permanen, ditegakkan basis data (#161)

`companies.slug` tidak boleh berubah setelah perusahaan dibuat. Sejak issue
#161 yang menolak perubahan itu adalah trigger `companies_slug_immutable`
(PostgreSQL: `prisma/postgresql/control/0002_slug_permanen`, fungsi trigger
dengan `RAISE EXCEPTION`; dulu migration MariaDB control 0010):

```
ERROR: slug perusahaan permanen (#161): ia menyusun nama basis data dan URL.
Nama boleh diubah; ganti slug perlu alias tersimpan.
```

Alasannya, dan semuanya tidak menimbulkan error bila dilanggar:

- Slug menyusun nama basis data (`sai_t{tenantId}_{slug}`, sejak #153).
  Menggantinya berarti mengganti nama basis data yang sedang dipakai, atau
  membiarkan nama basis data tidak lagi sesuai slug-nya. Nama itu satu-satunya
  petunjuk yang terbaca manusia tentang buku siapa di dalamnya.
- Sejak #157 slug ada di URL. Menggantinya mematikan setiap tautan yang pernah
  dibagikan, disimpan, atau dikirim lewat surel. Yang muncul adalah `not-found`
  yang identik dengan "perusahaan ini tidak ada" (sifat anti-penyisiran #158),
  sehingga penyebabnya tidak terlihat.
- Cache rute `(tenant.slug, company.slug) → id` akan menunjuk id lama sampai
  satu TTL berlalu.

Yang ditolak adalah nilai yang berubah, bukan kolom yang disebut: `SET slug =
slug` dan penulisan baris penuh oleh ORM tetap lolos. `name` bebas diubah
karena tidak pernah dipakai sebagai pengenal.

Ada dua lapis lagi. Tes `tests/company-slug-immutable.test.ts` menolak kode
yang menulis `slug` ke baris yang sudah ada, supaya kesalahannya ketahuan saat
kode ditulis. `scripts/prove-company-slug-immutable.ts` memastikan trigger-nya
masih ada di pemasangan nyata. Trigger bisa hilang tanpa perubahan kode (dump
tanpa `--triggers`, restore dari dump seperti itu, migration yang membangun
ulang tabelnya), dan CI tidak akan melihatnya.

**Kalau penggantian slug memang dibutuhkan**, jalurnya bukan membuang trigger
lalu `UPDATE slug`. Slug lama harus disimpan dan tetap dilayani sebagai alias.
Tanpa itu, kerusakan hanya berpindah ke tautan orang lain.

---

## 3. Memindahkan pemasangan yang sudah berjalan

Adopsi pemasangan satu-basis-data ke model ini (#104) sudah dijalankan di
produksi pada 2026-07-28, saat mesinnya masih MariaDB (`sai_production` →
`pt-sai`). Runbook lengkapnya ada di riwayat git berkas ini.

Urutan yang tetap berlaku, dan tidak boleh ditukar: **cadangkan →
`db:migrate:control` → `adopt-company` → buktikan akunnya pindah →
`db:migrate:companies`**. `adopt-company` menyalin pengguna dengan id yang
sama, membuat tenant, dan menuntut peta email `--emails`. Urutan itu penting
karena migration perusahaan membuang tabel `users` yang dibaca adopsi; skripnya
menolak berjalan bila tabel itu sudah hilang.

Di server, perintah `bun run …` dijalankan lewat
`docker compose run --rm migrate bun run <skrip>`, karena basis data tidak
memublikasikan port ke host.

### Perusahaan berikutnya

**Dari aplikasi** (issue #104): halaman Tambah Perusahaan (`/companies/new`).
Sejak issue #135 izinnya `company.create` di matriks tenant (owner/admin
tenant), tanpa menuntut perusahaan aktif. Halaman ini mengerjakan hal yang sama
dengan skrip di bawah (buat basis data, terapkan skema, daftarkan) sambil
menampilkan kemajuannya per tahap.

Syaratnya: pengguna basis data aplikasi harus boleh membuat basis data. Di
PostgreSQL hak itu adalah `CREATEDB` pada role aplikasi:

```sql
ALTER ROLE sai CREATEDB;   -- dijalankan sebagai superuser di `sai-pg`
```

PostgreSQL tidak punya padanan pembatasan pola nama yang dulu dipakai di
MariaDB (`GRANT … ON \`sai\_t%\`.*`). `CREATEDB` berlaku untuk nama apa pun.
Prefix `sai_` dipaksa oleh kode: `COMPANY_DATABASE_PREFIX`, dan sejak #153 nama
`sai_t{tenantId}_{slug}` dari `databaseNameForSlug`. Basis data yang dibuat
role itu dimiliki role itu.

> ⚠ Per 16 Okt 2026 role `sai` juga `SUPERUSER`, jadi aplikasi berhak atas
> seluruh server. Usulannya role `NOSUPERUSER CREATEDB` untuk aplikasi, dan
> superuser hanya untuk `migrate`/`svc-integrator` (jalur `tenant`); lihat
> [`arsitektur/07-RIWAYAT.md`](./arsitektur/07-RIWAYAT.md#yang-masih-terbuka)
> butir 4.

Tanpa hak itu halamannya tetap bisa dipakai lewat jalur lain. Administrator
membuat basis data kosong lebih dulu (`CREATE DATABASE "<nama>" OWNER sai
TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C';`, dengan nama
persis seperti yang dipratinjau formulir), lalu penyediaan mengisinya. Basis
data yang sudah ada dan masih kosong dipakai apa adanya; yang sudah berisi
tabel ditolak. Penyediaan menulis registry paling akhir, jadi kegagalan di
tahap "Membuat basis data" tidak meninggalkan perusahaan yang terdaftar. Hak
baru tidak berlaku untuk koneksi yang sudah terbuka di pool, jadi buat ulang
`app-customer` sesudahnya.

Jangan memperbaikinya dengan memberi aplikasi `SUPERUSER`.

**Yang dilihat pengguna** adalah kalimat yang menjelaskan tindakannya
("hubungi administrator server Anda"), bukan teks error basis data. Error
mentahnya hanya ada di log server. Pemetaannya fungsi murni yang teruji,
`provisionErrorMessage` (`src/lib/company-provisioning-shared.ts`), dijaga
`tests/company-provisioning.test.tsx`.

Migration untuk perusahaan baru diterapkan oleh aplikasi sendiri, bukan lewat
Prisma CLI (image produksi tidak memuatnya). Catatannya ditulis ke
`_prisma_migrations` dengan bentuk yang sama, jadi `db:migrate:all` berikutnya
membacanya sebagai sudah diterapkan. Ini juga dijaga
`tests/company-provisioning.test.tsx`.

**Dari baris perintah:**

```bash
docker compose run --rm migrate bun run create-company -- \
  --slug pt-b --name "PT Bumi Baru" [--admin budi]
```

Role basis datanya harus berhak `CREATEDB`; bila tidak, buat basis datanya
manual (lihat di atas), lalu jalankan dengan `--database <nama>`.

Urutannya: buat basis data, terapkan migration, lalu daftarkan. Registry
ditulis terakhir supaya kegagalan di tengah tidak meninggalkan perusahaan yang
bisa dipilih tetapi belum bisa dibuka. Sesudahnya masuk ke aplikasi, pilih
perusahaannya, dan jalankan wizard penyiapan. Identitas, bagan akun, saldo
awal, dan modul adalah keputusan akuntansi, jadi tidak diberikan sebagai
argumen baris perintah.

### Migration sesudah ini

```bash
docker compose run --rm migrate bun run db:migrate:all   # control → platform → SETIAP perusahaan
```

Kegagalan satu perusahaan tidak menghentikan yang lain. Kalau proses berhenti
di kegagalan pertama, sisanya tertinggal di skema lama sementara aplikasinya
sudah versi baru. Ringkasan dicetak di akhir, dan exit code-nya bukan nol.

---

## 4. Berganti perusahaan

Pemilih ada di `/select-company`, penukar di menu pengguna (hanya muncul bila
ada lebih dari satu perusahaan). Pengguna dengan satu perusahaan tidak melihat
keduanya; perusahaannya sudah aktif sejak ia masuk.

**Berpindah selalu memuat ulang halaman sepenuhnya**, tidak lewat navigasi
klien. Izin efektif, himpunan modul, identitas perusahaan di dokumen, dan cache
query semuanya per perusahaan. Navigasi klien menyisakan jeda singkat ketika
menu PT A dirender di atas data PT B. Perlakukan berganti perusahaan sebagai
masuk ke buku lain, bukan mengubah filter.

**Kenapa tidak dipilihkan otomatis.** Memilihkan perusahaan pertama berbahaya:
orang akan mengira ia melihat PT yang biasa dibukanya, lalu mencatat transaksi
ke buku yang salah.

**Pengecualiannya PT yang baru dibuat (issue #339).** Sesudah `/companies/new`
selesai, perusahaan yang baru dibuat menjadi perusahaan yang dibuka, hanya bila
sesi itu belum menunjuk perusahaan mana pun. Yang dipilih adalah perusahaan
yang orang itu buat sedetik sebelumnya, bukan perusahaan pertama menurut abjad.
Orang yang sedang bekerja di PT A lalu membuat PT B tidak dipindahkan bukunya;
ia membuka PT baru lewat tautan. Keputusannya fungsi murni yang teruji di
`lib/company-selection.ts`, dan id-nya tetap melewati `update({ companyId })`
yang memeriksa ulang keanggotaan di basis data control.

**Sesi sah tanpa peran bisa terjadi, dan ia pulih sendiri (issue #339,
`4c1424b`).** Untuk `role: null` dengan `companyCount ≥ 1`, di rute yang
jalurnya menyebut perusahaan, kerangka dasbor tetap memasang `{children}`
secara tersembunyi. Dengan begitu `CompanySessionSync` di dalamnya berjalan dan
memperbarui token lewat `update({ companyId })`. Satu putaran render kemudian
perannya tersedia dan halaman tampil utuh.

Sebelumnya halaman menampilkan "Memuat sesi…" tanpa batas. Guard jalur
bertenant mengambil perusahaan dari jalur, jadi menjawab 200 dan tidak
me-redirect. Sementara itu `{children}` tidak dirender, sehingga
`CompanySessionSync`, satu-satunya yang bisa memperbarui token, tidak pernah
berjalan. Di luar rute berperusahaan (mis. `/dashboard` tanpa jalur
perusahaan), guard me-redirect ke `/select-company`, jadi tidak ada yang
perlu diperbarui.

Pemilihan otomatis di atas menutup penyebab yang paling sering, tetapi keadaan
ini masih bisa muncul dari luar `/companies/new`: akses yang dicabut lalu
diberikan lagi saat sesi hidup, keanggotaan yang ditulis skrip CLI
(`create-company`, `adopt-existing-company`), atau token yang lebih tua dari
perubahan ini. Karena itu kedua mekanisme tetap ada.

---

### Gladi resik sebelum menyentuh produksi

Perubahan yang menyentuh banyak buku sekaligus sebaiknya dijalankan dulu pada
salinan. Gladi adopsi #104 menemukan dua hal yang tidak terlihat dari membaca
kode: hak akses yang kurang dan skrip yang menyebut kolom yang belum ada.

```bash
# di dalam container `sai-pg`:
pg_dump -U sai -Fc sai_production > /tmp/full.dump
createdb -U sai -T template0 sai_gladi
pg_restore -U sai -d sai_gladi --no-owner /tmp/full.dump
# arahkan URL basis data ke salinannya, jalankan perubahan, bandingkan jumlah
# baris & Σ debit dengan produksi, lalu DROP salinan dan hapus dump-nya.
```

## 5. Yang berubah bagi pengembang

| Dulu | Sekarang |
|---|---|
| `prisma.user.…` | `users-directory.ts` (satu-satunya jembatan ke basis data control) |
| `session.user.role` selalu ada | `null` selama perusahaan belum dipilih |
| `users.status` (Int) | `users.must_change_password` (Boolean) |
| FK `periods.closed_by_id → users` | id global tanpa FK; nama dicari, yang hilang tampil "—" |
| `data/audit/audit.jsonl` | tabel `audit_logs` di basis data tiap PT |
| `bun run db:migrate` | `bun run db:migrate:all` |
| `bun run create-admin -- --username …` | `… --company <slug>` (wajib) |

Tabel di basis data perusahaan **tidak boleh** punya foreign key ke pengguna,
karena FK tidak bisa menyeberangi basis data. Simpan id global sebagai `Int`
biasa dan cari namanya lewat `users-directory.ts`.

## 6. Instans basis data (tahap 4)

Rancangan [09 §9](./arsitektur/09-RANCANGAN-LAYANAN.md) tahap 4: buku PT
dipecah ke beberapa instans `db-postgres`. Kodenya lengkap, dan sifatnya
**opt-in**. Selama tabel `db_instances` kosong, semua PT memakai instans
bawaan dan perilakunya sama dengan sebelum tahap 4.

### Bentuknya

| Di mana | Isi |
|---|---|
| `db_instances` (kendali, migration 0009) | `key`, `url_env_var`, `is_active`. Isinya **nama** env var. URL dan sandinya tetap di environment |
| `companies.db_instance_key` | `NULL` = instans bawaan. Selain itu FK ke `db_instances.key` |
| env `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE` | URL template instans itu. Bentuk namanya dipaku CHECK, jadi baris registry tidak bisa menunjuk `CONTROL_DATABASE_URL` |

Instans bawaan tidak punya baris. URL-nya tetap rantai yang sama:
`COMPANY_DATABASE_URL_TEMPLATE` → `DATABASE_URL` → `CONTROL_DATABASE_URL`.
Kunci `default` dicadangkan untuknya.

Bentuk kunci, bentuk nama env var, label `default`, dan awalan objek cadangan
`instans/` **dibangkitkan** dari `contract/db-instances.yaml` (`bun run
contract:gen`) ke `packages/db/src/generated/db-instances.ts` dan
`services/integrator/internal/contract/dbinstances_gen.go`. Dua regex tulisan
tangan yang menyimpang berarti PT berjalan normal di aplikasi sementara jalur
`tenant` menolak instansnya, dan bukunya tidak dicadangkan. Penjaganya
`tests/contract-db-instances.test.ts`. CHECK migration 0009 ditulis tangan;
kesamaannya dengan kontrak dijaga `tests/company-url-resolver.test.ts`.

### Satu penyelesai

`@sai/db/company-url` adalah **satu-satunya** tempat yang menyusun URL buku
PT. Pemakainya aplikasi (`company-clients.ts`), fan-out migration, sapuan
kesesuaian, penyediaan, konsol operator, dan skrip cron. Aturannya tiga:

1. **Instans yang tak terselesaikan melempar.** Penyebabnya bisa kunci tak
   dikenal, relasi yang tidak ikut dimuat, nama env var di luar bentuknya,
   atau env var yang kosong. Jatuh ke bawaan berarti membuka basis data
   bernama sama di server bawaan. Di sana mungkin masih ada salinan lama buku
   PT yang sudah pindah, dan tulisan ke salinan itu tidak menghasilkan galat
   apa pun.
2. **Kunci kolam klien = instans + basis data** (`db2/sai_t1_x`, bawaan
   `/sai_t1_x`). Selama pemindahan, nama yang sama hidup di dua server.
3. **Replika baca hanya untuk instans bawaan.** `COMPANY_DATABASE_READ_URL_TEMPLATE`
   adalah standby server bawaan, jadi PT di instans lain selalu membaca
   primary-nya sendiri.

Penjaganya `tests/company-url-resolver.test.ts`. Ia menolak pembacaan
`COMPANY_DATABASE_URL_TEMPLATE`, penggantian `url.pathname` dengan nama
basis data, dan `bukaBasisData` di luar daftar. Pindaiannya mencakup `src/`, `packages/*`,
`apps/*`, `scripts/`, dan `workers/`.

### Menambah instans

```sql
-- di basis data kendali; CHECK menolak bentuk kunci / nama env var yang salah
INSERT INTO db_instances (key, url_env_var, updated_at)
VALUES ('db2', 'COMPANY_DB2_DATABASE_URL_TEMPLATE', now());
```

Lalu set `COMPANY_DB2_DATABASE_URL_TEMPLATE` di `.env` **dan** tulis namanya
(tanpa nilai) di grup `x-env.db-instances` di `docker-compose.yml` — grup itu
digabung ke **setiap** layanan yang membuka buku: `app-customer`,
`app-operator`, `migrate`, `svc-worker`, `svc-integrator`, dan `job-backup`. Layanan yang tidak punya env itu tetap jalan, tetapi melempar
saat membuka buku PT di instans tersebut. Untuk `svc-integrator` artinya buku PT
di instans itu **tidak dicadangkan** (lihat *Cadangan per instans* di bawah).
Pengguna di URL itu wajib berhak `CREATEDB`, **dan** superuser atau
mewarisi `pg_read_all_data` — tanpa yang kedua cadangan instans itu gagal
setiap malam (lihat *Peran cadangan per instans* di bawah).

Jalannya **satu**: nilai di `.env`, nama di grup `x-env.db-instances`, yang
sampai ke semua layanan itu lewat `<<: *env-db-instances`. (Sampai Okt 2026
jalannya `env_file: .env`; itu dicabut karena membawa SELURUH rahasia ke setiap
container — PRODUCTION.md §Env allowlist.) Jangan menulisnya di `environment:`
satu layanan. Penimpaan per layanan adalah persis cara satu nilai sampai ke
satu layanan dan terlewat di yang lain.
`tests/db-instance-env-reaches-every-service.test.ts` menolak keduanya: layanan
repo yang tidak menggabungkan grup itu, dan env var berbentuk
`COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE` di `environment:` sebuah layanan di
berkas compose mana pun. Akibatnya URL itu dipakai apa adanya oleh semua layanan, jadi ia wajib
**langsung** ke PostgreSQL, tidak lewat PgBouncer. `migrate` butuh advisory
lock sesi, dan jalur `tenant` butuh `pg_database` yang utuh. Go menolak URL
instans yang memuat `pgbouncer=true`.

Untuk menyediakan PT baru di instans itu, isi `dbInstanceKey` pada
`provisionCompany()`. Tanpa nilai itu, PT baru masuk instans bawaan.
Penempatan otomatis belum ada, karena itu keputusan kapasitas yang belum
punya pemilik.

### Memindahkan satu PT — `bun run tenant:move`

Jalankan di image `backup`. Image itu membawa `pg_dump`/`pg_restore` 17, dan
env-nya menunjuk PostgreSQL langsung.

1. **Nonaktifkan PT** (`companies.is_active = false`), lalu tunggu ≥ 60 detik
   sampai cache registry aplikasi kedaluwarsa. Tanpa langkah ini skrip menolak
   berjalan. Jangan memindah saat rilis sedang menjalankan `db:migrate:all`.
2. **Pratinjau:**
   `docker compose run --rm job-backup bun run tenant:move -- --database sai_t1_x --to db2`.
   Pratinjau mencetak fakta, setiap alasan menolak, dan langkah yang akan
   dijalankan.
3. **Jalankan:** perintah yang sama, ditambah `--apply --reason "…"`. Urutannya:
   - buat basis data di tujuan;
   - `pg_dump -Fc | pg_restore --single-transaction`;
   - bandingkan jumlah baris **setiap** tabel. Selisih satu baris pun
     menghentikan proses, dan registry tidak disentuh;
   - balik `db_instance_key` dengan syarat nilai lama masih sama;
   - ganti nama salinan asal menjadi `<nama>_moved_<yyyymmdd>`;
   - tulis jejak `tenant.company.move`.
4. **Aktifkan lagi** PT itu, buka bukunya, dan periksa satu laporan.
5. **Salinan `_moved_` adalah jalan balik.** Hapus dengan sadar setelah buku
   di tujuan terbukti. Selama salinan itu ada, penjadwal melaporkannya sebagai
   basis data yatim, dan itu disengaja.

**Jalan balik** sebelum salinan lama dihapus: nonaktifkan PT, kembalikan nama
`<nama>_moved_<yyyymmdd>` menjadi `<nama>` di server asal, lalu set
`db_instance_key` kembali ke nilai lama (`NULL` untuk bawaan). Buku di tujuan
tidak dibuka siapa pun begitu registry kembali.

### Cadangan per instans (`svc-integrator`)

`internal/backup` membaca `db_instances` dan `companies.db_instance_key` dari
kendali, hanya-baca. Instans yang ikut adalah yang **aktif**, ditambah instans
nonaktif yang masih ditempati satu PT. Menonaktifkan instans tidak memindahkan
buku siapa pun. URL tiap instans diambil dari env var yang **namanya**
tercatat di barisnya (`internal/db/instans.go`, cermin `company-url.ts`).
Nama di luar bentuk `COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE` ditolak, begitu
juga env yang kosong dan URL lewat PgBouncer. Tidak ada jalur yang jatuh ke
server bawaan.

Lalu, per instans:

| Langkah | Instans bawaan | Instans `<kunci>` |
|---|---|---|
| Kredensial | `CONTROL_DATABASE_DIRECT_URL` (peran `sai_backup`) | template instans itu (`COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE`), pathname diganti `postgres` |
| Pencacahan | `pg_database` server `CONTROL_DATABASE_DIRECT_URL` | `pg_database` server instans itu (basis data `postgres`) |
| Dump per basis data | `db-<nama>.dump.enc` | `instans/<kunci>/db-<nama>.dump.enc` |
| Peran & hak akses | `globals.sql.enc` | `instans/<kunci>/globals.sql.enc` |
| `companyId` di manifest | PT dengan `db_instance_key = NULL` | PT dengan `db_instance_key = '<kunci>'` |

Nama objek instans bawaan **tidak berubah sama sekali**. Tanpa instans
tambahan, manifest tidak memuat satu pun bidang baru, jadi runbook pemulihan di
`PRODUCTION.md` tetap berlaku byte demi byte. Instans lain memakai
subdirektori, bukan sufiks, karena selama pemindahan nama basis data yang sama
hidup di dua server.

**Kelengkapan per instans.** PT yang terdaftar di instans X wajib punya objek
yang didump **dari X**. Basis data bernama sama di server lain, misalnya salinan
lama yang belum diganti nama, didump sebagai `other` tanpa `companyId`. Ia
tidak membuktikan apa pun tentang buku yang hidup. PT terdaftar yang tidak ada
di server instansnya masuk `Hilang` sebagai `<nama>@<kunci>`. Seperti
sebelumnya, `Hilang` menghentikan putaran sebelum satu objek pun dikirim.

**Instans yang gagal** (env tak diset, nama salah, server tak terjangkau,
server lebih baru daripada `pg_dump`, peran tanpa hak cadangan — atau, sejak
23 Okt 2026, `pg_dump`/`pg_dumpall` instans itu yang gagal **di tengah**
putaran) **tidak** menghentikan instans lain. Satu env var yang lupa disalin
tidak boleh membuat semua PT tanpa salinan. Instans yang gagal di tengah
berhenti pada galat pertamanya: sisa buku dan globals-nya dilewati, objeknya
yang sudah terkirim tetap disebut manifest (mereka ada dan utuh), dan ia
pindah dari `instans` ke `instansGagal`. Yang **tetap** menghentikan seluruh
putaran: galat instans bawaan (ia memegang basis data kendali — perilaku
sebelum tahap 4, apa adanya), galat tujuan (S3/cakram bukan milik satu
instans), dan pembatalan (SIGTERM). Akibatnya:

- objek instans lain tetap terkirim;
- manifest memuat `instansGagal: [{kunci, sebab, basis}]`;
- jejak `backup_runs` berstatus `error`, dengan nama putaran dan ukurannya,
  sehingga `/api/health` dan `watch:health` berbunyi;
- pemangkasan **dilewati**, sebab putaran lama mungkin satu-satunya salinan
  buku di instans yang gagal. Harganya: selama instans itu gagal, cakram
  atau bucket bertambah sampai dua putaran per hari (`max_attempts: 2`),
  tanpa ada yang dibuang. Alarmnya berbunyi sejak hari pertama;
  `local_only` di cakram yang penuh adalah bentuk yang harus dicegah lewat
  alarm itu, bukan lewat membuang salinan terakhir;
- `prove-backup-restore` menolak putaran itu.

Konsol operator `/backup` membaca `backup_runs` (putaran, status, galat,
ukuran), bukan manifest, jadi bentuknya tidak berubah. Label `@kunci` di
daftar versi skema tetap berasal dari registry.

### Peran cadangan per instans

Instans bawaan dicadangkan sebagai `sai_backup` (anggota `sai_app` +
`pg_read_all_data`, dibuat `scripts/postgres-roles.py apply`). Instans
tambahan mengikuti konvensi `company-url`: **satu** URL per instans, dan
template itu sekaligus penyedianya — jadi jalur `tenant` memakai peran di
template itu juga. Tidak ada env var kredensial cadangan kedua per instans;
dua kredensial untuk satu server adalah dua hal yang harus sampai ke setiap
layanan, dan satu di antaranya akan tertinggal.

Peran itu biasanya **pemilik** buku di instansnya (NOSUPERUSER CREATEDB). Ia
bisa `pg_dump` setiap buku miliknya, tetapi `pg_dumpall --globals-only`
membaca `pg_authid` dan ditolak:

```
pg_dumpall: error: query failed: ERROR:  permission denied for table pg_authid
```

Terukur 23 Okt 2026 terhadap `postgres:17`. Jadi di **setiap** instans
tambahan, peran di template-nya wajib superuser atau mewarisi
`pg_read_all_data` (PostgreSQL ≥ 14). Jalur `tenant` memeriksanya **di depan**
(`backup.PeriksaHakCadangan`), sebelum satu buku pun didump, dan instans yang
gagal pemeriksaan masuk `instansGagal` dengan kalimat yang menyebut GRANT-nya.

`scripts/postgres-roles.py` **tidak** menjangkau instans tambahan: ia bekerja
lewat `docker compose exec` ke layanan `pg` di mesin ini, sebagai superuser di
soket lokalnya, dan servernya tidak ada di compose ini. Opsi `--instance`
sengaja tidak ditambahkan — memperluasnya berarti menulis sandi superuser
server lain ke `.env` produksi. Di server instans itu, sebagai superuser-nya:

```sql
-- <peran> = pengguna di COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE
ALTER ROLE "<peran>" LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
GRANT pg_read_all_data TO "<peran>";
```

Lalu buktikan dari host yang menjalankan `svc-integrator`, dengan peran itu:

```bash
docker compose run --rm --no-deps job-backup sh -c \
  'pg_dumpall --globals-only -d "$COMPANY_DB2_DATABASE_URL_TEMPLATE" -l postgres >/dev/null && echo globals-ok'
```

(`-d` di `pg_dumpall` adalah **string koneksi**, jadi URL template itu dipakai
apa adanya; `-l postgres` memilih basis data tempat ia membaca. Parameter
khusus Prisma di URL itu — `connection_limit`, `schema`, … — ditolak libpq;
jalur `tenant` membuangnya sendiri (`db.Bersih`), perintah uji ini tidak.)

Harganya diterima dengan sadar: `pg_read_all_data` membuat peran template —
yang juga dipakai aplikasi untuk instans itu — bisa membaca hash sandi peran
lain di server tersebut. Instans tambahan hanya berisi buku SAI, dan peran itu
sudah pemilik setiap buku di sana. Bila instans itu kelak berbagi server
dengan basis data lain, pisahkan perannya dulu (rancangan 09 §9).

**Urutan untuk pemindahan pertama di produksi:** siapkan peran di server
instans (di atas), set env var instans di `.env` dan namanya di
`x-env.db-instances`, recreate `svc-integrator` (dan layanan lain), terbitkan
satu putaran, dan pastikan manifestnya memuat `instans: [{kunci: …}]` tanpa
`instansGagal`. Baru sesudah itu jalankan `tenant:move`.

### Yang belum ikut

✅ `cmd/parity` mengenal instans sejak 22 Okt 2026: `-database` diselesaikan
lewat registry kendali (`registry.LookupByDatabase` → `ledgerread.OpenAt`),
sama dengan pelari. Nama yang tidak terdaftar, atau instans yang env var-nya
tidak diset, MELEMPAR — tidak lagi membandingkan salinan lama di server bawaan.

- Konsol operator menampilkan instans di `/backup` (label `@kunci`), tetapi
  belum di halaman kesesuaian. Jejak `conformance_runs` sudah mencatat
  `instance` per buku.

