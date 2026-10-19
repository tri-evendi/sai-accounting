# 08 — Glosarium, Pengujian, Target & Katalog Rute

> 18 Okt 2026 · diukur di `main@197e78c8` · [indeks](./README.md)

## 1. Glosarium

### 1.1 Empat kata yang paling sering tertukar

Salah memahami keempat ini berarti menulis baris ke basis data yang salah.

| Kata | Artinya di repo ini | BUKAN |
|---|---|---|
| **Tenant** | Satu **customer yang berlangganan** — pemilik paket, tagihan, kuota. Datanya di `sai_control` + `sai_platform` | Bukan perusahaan, bukan pengguna |
| **Perusahaan / PT** | Satu **buku besar**, dengan basis data sendiri (`sai_<slug>`). Satu tenant boleh punya banyak PT | Bukan tenant |
| **Buku** | Isi satu basis data perusahaan: jurnal, dokumen, stok, aset. Wadahnya disebut **basis data perusahaan** — itu nama yang dipakai dalam diagram dan rancangan; "buku PT" di dokumen lama berarti hal yang sama | Bukan nama tabel |
| **Plane** | Permukaan yang dipisahkan **host**: customer (`APP_DOMAIN`) vs operator (`OPERATOR_DOMAIN`) | Bukan grup rute, bukan container |
| **Profil penyebaran** | SaaS atau on-premise — `APP_DEPLOY_PROFILE`, **disetel**, tidak pernah disimpulkan dari env basis data. On-premise tidak memasang `sai_platform` | Bukan `NODE_ENV`, bukan plane |
| **Jejak putaran** | Satu baris per putaran penjadwal, pemeriksa kesesuaian, atau cadangan — `scheduler_runs` · `conformance_runs` · `backup_runs`, di basis data **kendali** | Bukan log, bukan jejak audit |

### 1.2 Istilah akuntansi yang punya arti teknis di sini

| Kata | Artinya |
|---|---|
| **Posting** | Mengubah dokumen jadi jurnal berpasangan ganda. Hanya lewat `postForSource` |
| **Pembalikan** | Satu-satunya cara mengoreksi jurnal; baris jurnal tidak pernah disunting |
| **Periode** | Satu bulan buku, `open` atau `closed`; periode tertutup menolak posting |
| **Tutup tahun** | Memindahkan saldo laba-rugi ke ekuitas dan menutup seluruh periode tahun itu. Bisa dibalik, dan pembalikannya tercatat |
| **Kunci buku** | Buku yang menuntut otentikasi ulang sebelum bisa ditulis. Berbeda dari "tidak punya akses" dan dari "modul belum aktif" |
| **Gate persetujuan** | Dokumen di atas ambang **ada** tetapi jurnalnya **belum** |
| **Kurs dokumen vs kurs penyelesaian** | Pelunasan meringankan piutang/utang pada kurs dokumennya sendiri; selisihnya ke `fx_gain_loss` (#23). Faktur USD yang dilunasi transfer IDR tetap membersihkan piutang USD (#43) |
| **HPP rata-rata bergerak** | Dihitung dari `StockMovement`; setiap jalur baru yang memindahkan barang wajib lewat tabel itu |
| **Pusat biaya** | Dimensi pelaporan di `journal_lines`. `NULL` **bermakna** "belum ditetapkan / seluruh perusahaan", bukan data hilang |
| **Modul usaha** | Sebelas sakelar fitur per perusahaan. Tidak pernah menggerbangi buku besar |
| **Data `[CONTOH]`** | Data contoh bertanda yang disemai ke setiap PT baru; apa pun di luar tanda itu diketik orang |
| **`is_demo`** | Kolom yang **mengubah perilaku**: buku jadi hanya-baca + banner + dikecualikan dari scheduler. **Bukan** penanda "buku uji" |

### 1.3 Istilah teknis khas repo ini

| Kata | Artinya |
|---|---|
| **Konteks perusahaan** | Jawaban atas "PT mana ini?", dari dua sumber: `AsyncLocalStorage` (skrip/cron/tes) atau penyimpan per-permintaan (HTTP). Kosong = **melempar** |
| **Matriks bawaan vs efektif** | Bawaan di kode; efektif = bawaan + override peran + override pengguna + modul. Penjaga memakai yang efektif |
| **Hot path** | Guard, sesi, proxy. `platform-db.ts` dilarang dari sini (#137) |
| **Fail-closed** | Konfigurasi hilang → tolak, bukan izinkan |
| **Snapshot lintas-lapis** | Status & kuota tenant disalin platform → control |
| **Heartbeat** | Baris jejak terakhir dari `*_runs`, diubah jadi status di `/api/health` |
| **Skrip pembuktian** (`prove-*`) | Memeriksa keadaan nyata, bukan melaporkan hasil skrip lain |
| **Gate rilis** | `bun run verify` **dan** build yang `EXIT=0`. Dua-duanya |
| **Guard arsitektural** | Tes yang menjaga aturan, bukan perilaku |
| **Allowlist** | Daftar izin yang disebut persis, bukan pola |
| **Baseline** | Satu `0001_baseline` per basis data, menggantikan 99 migration MariaDB |
| **Fallback** (MariaDB) | Service `db` yang masih hidup tetapi tidak ditulisi sejak 15 Okt 2026 (#636) |

### 1.4 Kata yang sengaja TIDAK dipakai

| Jangan tulis | Tulis | Alasan |
|---|---|---|
| `middleware.ts` | **`proxy.ts`** | Next versi ini menamainya `proxy`; `middleware.ts` tidak dijalankan |
| `className` / kelas Tailwind | Gaya sebaris + token | Dicabut #203. Kelas tidak gagal — tidak ada lembar gaya yang memaknainya, jadi ia **berhenti berlaku tanpa error** |
| `db:migrate` | **`db:migrate:all`** | Yang tunggal hanya menyentuh satu basis data; sisanya tertinggal tanpa error |
| `bun test` | **`bun run test`** | `bun test` memakai runner bawaan Bun dan melapor "no tests found" seolah suite rusak |
| `npm install` | **`bun install`** | Repo hanya punya `bun.lock` |

## 2. Strategi pengujian

**306 berkas tes · 4.429 pemanggilan `it()`/`test()`**, dijalankan Vitest 3
lewat `bun run test`.

| Lapis | Berkas | Isinya |
|---|---|---|
| Guard arsitektural | **130** memindai kode sumber | Menjaga aturan: rute tanpa izin, impor terlarang, relasi tanpa indeks, bentuk impor ikon, warna mentah, paket yang keluar dari dirinya |
| Unit murni | mayoritas sisanya | Matriks izin, aturan posting, penyusun baris jurnal, retensi jejak, klasifikasi buku, format uang, i18n |
| Komponen | **12** me-render React | Primitif `@sai/ui`, tabel, form, overlay |
| Proxy ujung-ke-ujung | beberapa | Memanggil `proxy()` sungguhan |

**Kenapa guard arsitektural jadi lapis tersendiri.** Sembilan regresi keamanan
di [06 Keamanan](./06-KEAMANAN.md) semuanya lolos tes perilaku. Yang jebol
bukan logika melainkan aturan — rute yang lupa guard, impor yang menyeberang
lapisan, indeks yang hilang saat pindah mesin. Aturan seperti itu tidak punya
gejala.

Tiga syarat yang membuat guard semacam ini benar-benar memeriksa, ketiganya
lahir dari kegagalan nyata:

1. **Wajib memakai `tests/akar-sumber.ts`.** Scanner yang hanya menyapu `src/` lulus dengan nol pelanggar begitu kodenya pindah ke paket.
2. **Harus pernah dilihat merah.** Perubahan yang membuat `index-fk-parity` merah pertama kali keliru — yang dicabut masih tertutup indeks lain, dan tesnya tetap hijau.
3. **Pembacanya ikut diuji.** Regex `@relation` yang berhenti di baris pertama melaporkan kolom FK sebagai "bukan relasi"; bila pembacanya naif, seluruh tes hijau karena **tidak melihat apa pun**.

| Tidak diuji otomatis | Gantinya |
|---|---|
| Basis data sungguhan | Fungsi murni + `job-conformance` mingguan di data nyata |
| Browser sungguhan | Tes proxy + tes komponen + pemeriksaan manual |
| Restore backup ke basis data | `prove-backup-restore` sengaja tidak memuat dump; pemuatan sungguhan adalah latihan kuartalan manusia (❓ belum ada bukti) |
| Beban / performa | Tidak ada; angka yang ada pengukuran satu kali |
| Migration terhadap data produksi | ❓ Tidak ada staging |

| Gate | Perintah | Siapa |
|---|---|---|
| CI, setiap PR & push | `verify` = `typecheck + lint + test`; *required status check* pada `main` | GitHub Actions |
| Lokal, sebelum merge | `bun run verify` | Semua, termasuk agent latar |
| Sebelum promosi | `bun run build` (+ `build:operator`) di atas `develop` hasil gabungan | **Hanya sesi utama** |

`next build` tidak memeriksa tipe, jadi `bun run typecheck` satu-satunya gate
tipe; dan verify hijau tidak membuktikan aplikasinya bisa dibangun — itu sudah
terjadi sekali.

## 3. Target non-fungsional

### 3.1 Yang sudah terukur

Semuanya pengukuran satu kali dengan tanggalnya, bukan pemantauan
berkelanjutan: tidak ada metrik atau dasbor di sistem ini.

| Hal | Angka | Kapan |
|---|---|---|
| Halaman pemasaran, hangat / cold | 162–185 ms / 1.337 ms | 11 Okt 2026 |
| Puncak koneksi basis data | 62 | sekitar penukaran PostgreSQL |
| Anggaran koneksi `app-customer` | 8 + 2 + 1 = 11 | 18 Okt 2026 |
| Ukuran data | 227 MB di 19 basis data | 16 Okt 2026 |
| Skala terpasang | 11 tenant · 17 PT · 13 pengguna | 16 Okt 2026 |
| Spesifikasi VM | 2 vCPU · 8 GB · 80 GB SSD · 2.560 GB/bulan | 19 Okt 2026 |
| Satu putaran scheduler | ≤ 56 menit (7 × `timeout` 480 s) | batas by design |
| `next build` di server | ~19 menit, iowait 58–92% | karena itu dilarang |
| `typecheck` cold | 1.556 MB RSS / 82 s (batas kini 2048 MB) | 11 & 17 Okt 2026 |
| Suite tes | ~74 s | 18 Okt 2026 |
| Berat `DataTable` | +80 KB gzip per rute | — |
| Standalone konsol vs customer | 69 MB vs 299 MB | 18 Okt 2026 |

### 3.2 Target yang BELUM ditetapkan

❓ Semuanya keputusan pemilik. Yang belum ada adalah **targetnya**, bukan
pengukurannya.

| Target | Keadaan sekarang | Kenapa perlu ditetapkan |
|---|---|---|
| **RPO** | 24 jam untuk kerusakan data; **tak terbatas** untuk kehilangan mesin | Menentukan apakah WAL/PITR masuk rencana |
| **RTO** | **Belum pernah diukur** | Menentukan apakah HA otomatis sepadan |
| **Ketersediaan** | Tidak ada SLO; tidak ada pemantauan luar | Tanpa pembaca `/api/health` dari luar, uptime tidak bisa diklaim |
| **Waktu respons** halaman buku | Tidak diukur | "Apakah ini melambat?" belum bisa dijawab |
| **Kapasitas** | Batas yang diketahui: `max_connections` 100 + pool; satu `app-customer` | Menentukan kapan replika dibutuhkan (P2-3) |
| **Retensi jejak** | 90 hari untuk `*_runs` | Sudah ditetapkan ✅ |
| **Retensi pembukuan** | **10 tahun** (UU KUP), melekat pada buku bukan pada status langganan | Sudah ditetapkan ✅ |

### 3.3 Yang mengikat target apa pun

1. **Satu VM: 2 vCPU · 8 GB · 80 GB SSD, dibagi enam aplikasi.** Setiap proses jangka-panjang baru harus diukur lebih dulu.
2. **`max_connections` 100, satu proses per koneksi.** Setiap klien baru mengurangi anggaran yang lain.
3. **Migration berjalan N kali per rilis.** Perubahan skema berbiaya linear terhadap jumlah customer.
4. **Tidak ada pemantauan luar.** Target yang tidak bisa diamati dari luar mesin tidak bisa dibuktikan.

## 4. Katalog rute

Daftar per rute **tidak disimpan di sini** — ia basi setiap kali ada rute baru.
Yang menjamin tidak ada rute lolos tanpa izin adalah
`tests/authz-coverage.test.ts`, bukan dokumen. Untuk daftar mutakhir:

```bash
# halaman + izinnya
grep -rho 'requirePagePermission("[^"]*"' src/app --include=page.tsx | sort | uniq -c
# rute API + izinnya
grep -rho 'requireApiPermission("[^"]*"' src/app/api --include=route.ts | sort | uniq -c
# yang TIDAK punya penjaga (harus cocok dengan pengecualian di authz-coverage)
grep -rLE 'require[A-Z][A-Za-z]*\(' src/app/api --include=route.ts
```

Angka per 18 Okt 2026: **131** halaman customer · **128** rute API customer ·
3 rute metadata/aset · **19** halaman konsol · 2 rute fungsional konsol ·
**10** rute API tanpa penjaga (semuanya terdaftar sebagai pengecualian).

Sepuluh rute publik itu: enam alur autentikasi pra-sesi (`auth/[...nextauth]`,
`register`, `verify-email`, `forgot-password`, `reset-password`,
`accept-invitation`), `billing/webhook` (kredensialnya tanda tangan SHA-512),
`health` dan `status/notices` (pembacanya Docker, Traefik, dan halaman status),
serta `v1/openapi.json`.

Rute API customer per kelompok:

| Kelompok | Rute |
|---|---|
| `accounts` 2 · `journals` 3 · `ledger` 1 · `periods` 5 · `cost-centers` 2 | Akuntansi inti |
| `contracts` 4 · `invoices` 4 · `delivery-orders` 1 · `returns` 2 · `customers` 2 · `consignees` 2 | Penjualan |
| `suppliers` 3 · `advances` 3 · `landed-costs` 2 · `inventory` 2 · `wizard` 2 | Pembelian & persediaan |
| `boms` 1 · `work-centers` 1 · `production-orders` 3 | Manufaktur |
| `fixed-assets` 6 | Aset tetap |
| `finance` 1 · `reconciliation` 5 | Kas & rekonsiliasi |
| `reports` 2 · `budget` 4 | Laporan |
| `approvals` 6 · `roles` 2 · `authz` 1 · `users` 3 · `audit` 1 · `company-settings` 4 · `company-unlock` 1 · `upload` 1 · `recurring` 2 · `api-tokens` 2 | Tata kelola |
| `companies` 1 · `company` 1 · `setup` 2 · `sample-data` 1 · `user` 4 · `tenant` 10 · `t` 7 | Tenant & platform |
| `auth` 7 · `health` 1 · `status` 1 · `billing` 1 | Autentikasi & infra |

Konsol operator: 19 halaman (`/`, `/accounts`, `/audit`, `/audit/tenants`,
`/backup`, `/brand`, `/conformance`, `/content`, `/deletions`, `/efaktur`,
`/login`, `/mail`, `/plans`, `/reconciliation`, `/scheduler`, `/settings`,
`/status-notices`, `/tenants`, `/tenants/{id}`) + 2 rute (`/api/health`
publik, `/efaktur/unduh` dengan `tenant.billing`).

Tiga pola yang berlaku di seluruh daftar:

1. **Satu berkas route melayani beberapa metode dengan izin berbeda** — `/api/accounts` memakai `account.read` untuk `GET` dan `account.manage` untuk `POST`.
2. **Halaman baca dan halaman tulis memakai izin berbeda** — `…/customers/{id}` menuntut `customer.read`, `…/edit` menuntut `customer.write`.
3. **Tiga halaman dasbor sengaja tanpa izin tunggal** — beranda PT, `/dashboard`, dan kotak masuk pemberitahuan terbuka untuk **setiap** peran, jadi tidak ada satu izin yang bisa dideklarasikan; ketiganya menjaga diri dengan `auth()` + `enterCompanyFromRoute` dan menyusun isinya per peran di server.
