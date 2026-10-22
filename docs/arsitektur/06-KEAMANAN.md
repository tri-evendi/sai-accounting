# 06 — Keamanan & Model Ancaman

> 20 Okt 2026 · produksi `main@ca0cd038` · [indeks](./README.md)

Apa yang dilindungi, dari siapa, dengan kontrol apa, dan apa yang belum ditutup.
Temuan keamanan yang masih terbuka dilacak berprioritas di
[05 Penilaian](./05-PENILAIAN.md); di sini hanya diringkas.

## 1. Aset yang dilindungi, menurut urutan kerugian

Urutan ini menentukan prioritas kontrol.

| # | Aset | Kalau bocor / rusak |
|---|---|---|
| 1 | **Buku besar 17 PT** (`journals`, `journal_lines`, dokumen sumber) | Pembukuan yang wajib disimpan 10 tahun (UU KUP) hilang atau tidak bisa dipercaya. Tidak ada cara merekonstruksinya dari ingatan pengguna |
| 2 | **Isolasi antar-PT** | Satu customer membaca buku customer lain. Kerugiannya kepercayaan, dan tidak bisa ditarik kembali |
| 3 | **Jejak audit** (`audit_logs`, `tenant_audit_logs`, `operator_audit_logs`) | Kehilangan kemampuan menjawab "siapa mengubah ini" — justru saat pertanyaan itu paling dibutuhkan |
| 4 | **Arsip backup + kuncinya** | Arsip terenkripsi yang bocor = seluruh basis data bocor, bila kuncinya ikut |
| 5 | **Kredensial pihak ketiga** (SMTP tenant, gateway pembayaran tenant) | Customer menanggung akibat di infrastruktur miliknya sendiri |
| 6 | **Konsol operator** | Akses ke semua tenant sekaligus: pengaturan, katalog paket, hapus tenant |
| 7 | **Identitas & sesi** | Pengambilalihan akun |

## 2. Aktor & ancaman

| Aktor | Yang ia punya | Ancaman utama |
|---|---|---|
| **Pengunjung anonim** | Hanya jalur publik | Enumerasi akun/tenant · brute force masuk · XSS lewat halaman publik |
| **Pengguna sah PT A** | Sesi + keanggotaan satu PT | **Menyeberang ke PT B** (ancaman nomor satu di sistem ini) |
| **Staf berperan rendah** | Sesi di PT yang sama | Naik hak · menembus gate persetujuan · menyunting jurnal yang sudah diposting · memposting ke periode tertutup |
| **Integrator ber-token** | Token Bearer berlingkup PT | Memakai token di luar lingkupnya · token yang tidak bisa dicabut |
| **Midtrans (dipalsukan)** | Tahu alamat webhook | Webhook palsu → tenant naik kelas tanpa bayar |
| **Operator (SAI)** | Akses semua tenant | Tindakan tanpa jejak · kredensial operator yang bocor |
| **Penyerang yang menguasai satu arsip backup** | Satu berkas `.enc` | Seluruh basis data, **bila** kuncinya ikut |
| **Penyerang dengan satu lubang injeksi SQL** | Satu `$queryRawUnsafe` yang salah | Hari ini: akses penuh ke server basis data, karena role aplikasi superuser |

## 3. Kontrol, per ancaman

Setiap baris menyebut penjaganya di kode dan tes yang menahannya.

### 3.1 Menyeberang antar-PT — ancaman nomor satu

| Kontrol | Di mana | Guard |
|---|---|---|
| **Isolasi fisik**: satu basis data per PT, jadi kueri yang lupa `WHERE company_id` tidak bisa memulangkan baris PT lain | #104 | — (sifat bentuk) |
| **Konteks hilang = MELEMPAR**, tidak pernah jatuh ke basis data bawaan | `company-context.ts`, `current-company.ts` | `tests/company-context*.test.ts` |
| **Keanggotaan dibaca ulang dari control pada setiap permintaan**, bukan dari JWT | `company-route.ts` | `tests/current-company-route.test.ts` |
| **`companyId` dicabut dari JWT** (#158) — jaring pengaman yang menutupi route lupa-lingkup | `auth.ts` | — |
| **Peran ditimpa per permintaan** dengan peran di PT yang sedang dibuka | `page-auth.ts` | `tests/authz*.test.ts` |
| **404 yang identik** untuk slug tak ada / PT nonaktif / bukan anggota / tenant lain | `company-route.ts` | `tests/cross-tenant-404.test.ts` |
| **Nama basis data disaring** `/^[A-Za-z0-9_]{1,64}$/` sebelum menyusun string koneksi | `company-provisioning.ts` | — |
| **Kredensial basis data selalu dari environment**, tidak pernah dari tabel | — | — |
| **Cache per-tenant wajib berkunci** `companyId`/`tenantId` | `@sai/core/tenant-cache` | `tests/tenant-cache*.test.ts` |

### 3.2 Otorisasi & kenaikan hak

| Kontrol | Guard |
|---|---|
| Izin terpusat sebagai **matriks murni** (66 izin × 4 peran), bukan perbandingan string peran | `tests/authz.test.ts` |
| **Tidak ada halaman/route tanpa deklarasi izin**; pengecualian terdaftar beserta alasannya | `tests/authz-coverage.test.ts` |
| Matriks **efektif** = bawaan + override peran + override pengguna + modul usaha | `tests/authz-overrides*.test.ts` |
| **Modul usaha tidak pernah menggerbangi buku besar** — laporan tetap rekonsiliasi | `tests/business-modules-ledger.test.ts` |
| Matriks tenant **terpisah** dari matriks perusahaan (kunci izinnya saling lepas, jadi salah matriks ditolak `tsc`) | `tests/tenant-authz.test.ts` |
| Peran operator membagi **tindakan**: setiap server action memanggil `requireOperatorActionSession(izin)` | `tests/operator-roles.test.ts` |
| **Kunci buku**: otentikasi ulang sebelum buku bisa ditulis | `tests/company-unlock.test.ts` |

### 3.3 Keutuhan buku besar

| Kontrol | Di mana |
|---|---|
| **Satu pintu**: setiap dokumen → jurnal lewat `postForSource` | `lib/posting/index.ts` |
| **Gate persetujuan** ada di mesin posting, bukan di route — route baru tidak bisa melewatinya | `posting/index.ts` (#25) |
| **Kunci periode** di tempat yang sama | (#13) |
| **Berimbang**: Σ debit = Σ kredit, kalau tidak → rollback | `ledger.ts` |
| **Imutabel**: koreksi lewat `reverseJournal()`, baris jurnal tidak disunting | `ledger.ts` |
| **Idempoten**: sumber yang sudah punya jurnal hidup tidak diposting dua kali | `posting/index.ts` |
| **Atomik**: `tx` dioper, posting commit/rollback bersama tulisan sumbernya | `posting/index.ts` |
| **Slug PT tidak boleh berubah** (trigger basis data + skrip pembuktian) | `0002_slug_permanen` |
| **Pemeriksa kesesuaian data mingguan** untuk jalur yang tidak melewati zod | peran `conformance` di `svc-worker` |

### 3.4 Batas plane operator

Empat syarat berurutan, semuanya fail-closed: host = `OPERATOR_HOST` →
IP ∈ allowlist → cookie bertanda tangan → TOTP.

| Sifat | Akibatnya |
|---|---|
| `OPERATOR_HOST` kosong | Konsol **404 di host mana pun** |
| Allowlist IP kosong | **Tolak semua** (`*` hanya untuk pengembangan lokal) |
| Image customer | **Tidak memuat** rute konsol |
| Image konsol | 404 untuk setiap host selain `OPERATOR_HOST`, **dan** tidak punya rute customer |
| Volume | Konsol **tidak pernah** memasang `documents`, jadi berkas customer di luar jangkauannya |
| Pencabutan sesi | `session_version` dibandingkan tiap permintaan (akun DB) atau putar `OPERATOR_SESSION_SECRET` (akun env) |

### 3.5 Masukan yang tidak dipercaya

| Masukan | Kontrol |
|---|---|
| Badan permintaan | **zod di setiap jalur tulis** (31 modul validasi per domain) |
| Webhook Midtrans | **Tanda tangan SHA-512**, fail-closed: produksi tanpa kunci menolak semua webhook |
| Token Bearer | `requireApiToken(izin)`; tes menuntut izin yang dipakai **sama** dengan yang didokumentasikan (`tests/api-v1-spec.test.ts`) |
| Unggahan berkas | Validasi tipe & ukuran; disimpan **di luar `public/`** dengan nama `uuid`; hanya terjangkau lewat route bertenant yang menuntut `document.read` **dan** menemukan barisnya di buku PT aktif |
| Alur pra-sesi (daftar, lupa sandi, undangan) | Token sekali-pakai ter-hash + **jawaban seragam** (anti-enumerasi) + pembatasan laju per-IP/per-email |
| Impor & dump sistem lama | **Tidak melewati zod** — itu justru alasan peran `conformance` ada |

### 3.6 Hasil pekerjaan: `result_ref` adalah KUNCI, bukan kapabilitas

Hasil pekerjaan latar (`data/hasil/<kind>-<jobId>/<berkas>`) memuat isi buku
besar — ekspor neraca, umur piutang, dokumen. **Memegang kuncinya bukan izin
untuk membacanya**, dan empat aturan menegakkannya sebagai kode:

| Aturan | Kenapa |
|---|---|
| Penyimpanan **di luar `public/`** | berkas statis tidak melewati satu pun penjaga — pelajaran #367, dan satu-satunya alasan rutenya ada |
| Unduhan lewat **rute aplikasi**, dan rute itu men-STREAM byte-nya | ia tidak pernah memulangkan 302 ke penyimpanan mana pun. Redirect ke URL bertanda tangan membuat izin diperiksa SEKALI lalu tautannya hidup sendiri sampai kedaluwarsa — dan tautan itu bisa dibagikan, disimpan peramban, dan muncul di log proxy |
| Izin diperiksa **saat mengunduh** | pekerjaan hidup berjam-jam; orang yang perannya dicabut di antaranya tidak boleh tetap menerima hasilnya |
| **Izin per `kind`, DITAMBAH gerbang kedua dari muatannya** | satu izin tunggal membuat siapa pun yang boleh mengunduh satu dokumen juga boleh mengunduh ekspor neraca. Dan izin JENIS saja tidak cukup: `report.export` menjawab "boleh mengekspor laporan", bukan "boleh mengekspor laporan INI" (#355) — tanpa gerbang kedua, pekerjaan yang terbit ketika sebuah modul masih aktif tetap bisa diunduh sesudah modul itu dimatikan |

Keduanya `Record` yang LENGKAP atas seluruh `kind`: jenis baru tidak akan
mengompilasi sampai seseorang memutuskan siapa yang berhak mengunduh hasilnya,
dan keputusan "tidak pernah bisa diunduh" ditulis `null` beserta alasannya —
ketiadaan entri tidak bisa dibedakan dari entri yang lupa ditulis.

⚠ **Manifest cadangan TIDAK diunduh lewat rute bertenant.** Ia menyebut nama
basis data SELURUH tenant; jalannya runbook operator, bukan permukaan HTTP per
PT. `tenant.backup` karena itu `null` di peta izin.

**Bentuk `result_ref` divalidasi meski ia datang dari basis data kita sendiri:**
tepat dua segmen dari kosakata sempit, dan jalur gabungannya diperiksa LAGI
berada di bawah akarnya. `path.join` menormalkan `..` dengan rapi, dan rapi
adalah persis yang membuat lolosnya tidak terlihat. Penjaganya
`tests/job-result-authorization.test.ts` + `tests/job-result-store.test.ts`,
yang kedua menjalankan berkas sungguhan.

### 3.7 Kriptografi yang dipakai

| Untuk | Algoritma | Catatan |
|---|---|---|
| Kata sandi pengguna | **bcrypt** | `src/lib/auth.ts` |
| Token (atur-ulang sandi, undangan, verifikasi) | Acak 256 bit, disimpan **ter-hash** | Hash cepat disengaja: masukannya sudah 256 bit acak |
| Sesi pengguna | **JWT NextAuth**, masa **24 jam**, cookie berlingkup host | `AUTH_SECRET` |
| Pengaturan tersimpan (sandi SMTP, TOTP operator) | **AES-256-GCM** | `@sai/core/settings-crypto`, kunci `SETTINGS_ENCRYPTION_KEY` |
| Arsip backup | **AES-256-CBC** + PBKDF2 200.000 iterasi + salt | Dienkripsi **sebelum** berkas meninggalkan mesin |
| Keutuhan arsip backup | **SHA-256 atas ciphertext**, dikirim bersama arsip | AES-CBC tidak membawa pemeriksaan keutuhan sendiri |
| Webhook pembayaran | **SHA-512** | Fail-closed |
| MFA operator | **TOTP** | `OPERATOR_MFA` |
| Berkas lisensi on-premise | **Ed25519**, diverifikasi **luring** | `@sai/core/licence`; kunci publik **ditanam di kode** |
| Transport | **TLS** (Let's Encrypt, HSTS `max-age=63072000; preload`) | Hanya Traefik yang mengikat :80/:443 |

**Lisensi on-premise — empat keputusan, dan semuanya tidak simetris.**

| Keputusan | Kalau sebaliknya |
|---|---|
| Kunci publik **ditanam di kode**, tidak pernah dibaca dari env | kunci publik bukan rahasia, tapi kunci yang dibaca dari env berarti siapa pun yang bisa menyetel env di mesin itu menukarnya dengan kuncinya sendiri lalu menandatangani lisensinya sendiri — seluruh tanda tangan jadi hiasan |
| Kunci privat **tidak pernah** di repo maupun di CI | di repo: setiap orang yang pernah mengklon memilikinya selamanya, dan `git` tidak bisa melupakannya. Di CI: siapa pun yang bisa memicu satu workflow mencetak lisensi tak terbatas, dan jejaknya terlihat seperti build biasa. Penerbitan lisensi pekerjaan manusia yang jarang — dan yang jarang tapi berbahaya memang tidak boleh otomatis |
| Formatnya **bukan JWT** | JWT membawa `alg` di dalam pesan yang **belum terverifikasi**, dengan sejarah `alg: none` dan penukaran asimetris→HMAC yang kuncinya justru kunci publik. Di sini algoritmanya tidak dapat dinegosiasikan |
| Diverifikasi **di tempat pemakaian**, tidak pernah disimpan sebagai baris | memverifikasi sekali lalu menyimpan hasilnya di `control` memindahkan kewenangan lisensi dari tanda tangan ke baris yang bisa ditulis. Verifikasi Ed25519 berbiaya mikrodetik; berkasnya dipasang **hanya-baca** |

⚠ **Dukungan yang berakhir tidak mematikan apa pun**, dan itu ditegakkan sebagai
kode, bukan niat: satu tes menyapu modul lisensi dan menolak `throw`,
`process.exit`, `blocked`, `denied` — supaya tidak satu pun pemanggil bisa
menjadikannya pemadaman. Lisensinya **perpetual**: yang berakhir adalah hak atas
versi baru dan dukungan, bukan akses ke pembukuan. Lisensi yang mematikan buku
adalah kesalahan kategori untuk produk akuntansi.

Batas perusahaan/pengguna dari lisensi hanya menahan pembuatan yang **baru**
(`creationQuotaFor`, `seatQuotaOverride`). Selama kunci publik produksi belum
ditanam (`"BELUM-DISETEL"`), pemasangan on-premise memperingatkannya saat start
dan di `/api/health`; langkah pemiliknya di
[`docs/ONPREM-SERAH-TERIMA.md` §0](../ONPREM-SERAH-TERIMA.md). Laporan
kerentanan: [`SECURITY.md`](../../SECURITY.md).

### 3.8 Pengerasan transport & peramban

Header lengkapnya ada di [03 API & Integrasi](./03-API-INTEGRASI.md). Ringkas: `frame-ancestors
'none'` + `X-Frame-Options: DENY` · `object-src` dibatasi · `form-action 'self'`
· `base-uri 'self'` · `nosniff` · `Referrer-Policy` ketat ·
`Permissions-Policy` menutup kamera/mikrofon/lokasi · HSTS dengan `preload` di
produksi. Basis data **tidak pernah** terbit ke host — `pg`, `pgbouncer`, dan
`db` hanya ada di jaringan Docker `internal`.

## 4. Sembilan kelas kegagalan yang dijaga

Sembilan lubang di tabel ini pernah terbuka di repo ini, semuanya lolos
`verify` dan build tanpa menimbulkan error yang terlihat. Kolom terakhir adalah
guard yang berlaku sekarang; kolom tengah menyebut kenapa kelas kegagalan itu
sulit dikenali, dan itu yang perlu diingat saat menambah permukaan baru.

| Lubang | Kenapa tidak terlihat | Guard sekarang |
|---|---|---|
| **`/api/v1` dijawab 401 oleh proxy** sebelum guard token berjalan — di produksi sampai 16 Agu 2026 | Semua tes token memanggil `requireApiToken` **langsung**, tanpa melewati proxy | `tests/proxy-bearer-api.test.ts` memanggil `proxy()` sungguhan |
| **Berkas unggahan ada di direktori statis** `public/uploads/` sebelum #367 — tanpa guard apa pun | Berkas tetap bisa dibuka, jadi tidak ada gejala | Route bertenant (#489) + `document.read` + baris harus ada di buku PT aktif |
| **`companyId` di JWT** membuat route yang lupa lingkup tetap bekerja dengan PT terakhir yang dibuka | Tidak ada error — **jawabannya benar, bukunya salah** | Dicabut #158; lupa lingkup kini melempar |
| **`cache()` React tidak per-permintaan di route handler** (#333) | Di render halaman nilainya benar; **hanya** route handler yang 500 | Penyimpan dikunci pada hasil `await headers()` + `WeakMap` |
| **`enterWith` tidak merambat setelah `await`** | Konteks terukur `null` di badan route, padahal sudah "dipasang" | Permintaan HTTP bertumpu pada penyimpan per-permintaan |
| **Manifest PWA dijawab HTML halaman masuk** dengan status 307 | Peramban mengambilnya `no-cors`; PWA gagal **tanpa error** | `/manifest.webmanifest` masuk daftar jalur publik |
| **Dua container dengan nama service Traefik yang sama** | Traefik membagi beban; permintaan operator bisa mendarat di container customer, **tanpa error** | Nama service berbeda, dan konsol 404 untuk host lain |
| **Tidak ada satu pun tes yang menyentuh header keamanan** | CSP yang dilemahkan atau dihapus **tidak menimbulkan gejala** | `tests/security-headers.test.ts`, termasuk dua tes yang menuntut sesuatu **tetap tidak ada** |
| **`.dockerignore` menjangkar pola, `.gitignore` tidak** | Pola `backups/` membuat seluruh basis data produksi ikut masuk ke image yang di-deploy | Periksa **isi image**, bukan pohon berkas (`tests/dockerignore-migrations.test.ts`) |

Polanya satu: kontrol keamanan yang jebol tidak berbunyi. Itu sebabnya hampir
setiap kontrol di bab ini punya kolom guard.

## 5. Yang belum ditutup

Lima hal, dengan prioritasnya di [05 Penilaian](./05-PENILAIAN.md).

| # | Terbuka | Dampak | Lacak di |
|---|---|---|---|
| 1 | **Backup tanpa salinan luar-mesin** | Kehilangan mesin = kehilangan buku beserta backup-nya | **P0-1** |
| 2 | **`BACKUP_ENCRYPTION_KEY` 🔶 hanya di mesin yang sama dengan datanya** | Backup yang berhasil pun tidak bisa dibuka setelah mesinnya hilang | **P0-2** |
| 3 | **Role aplikasi adalah SUPERUSER PostgreSQL** | Satu injeksi SQL di `$queryRawUnsafe` mana pun memberi akses penuh ke server (`pg_authid`, `COPY … TO PROGRAM`), tidak hanya ke data. Pembatasan pola `sai\_t%` yang ada di MariaDB hilang saat pindah mesin | [07 Riwayat](./07-RIWAYAT.md) |
| 4 | **CSP `script-src 'unsafe-inline'`** | Pertahanan XSS melemah, padahal aplikasi menampilkan nama pelanggan, catatan, dan nama berkas unggahan. `'unsafe-eval'` sudah dicabut; `style-src` struktural (#203) | **P2-4** |
| 5 | **Tidak ada pembaca `/api/health` dari luar mesin** | `watch:health` berjalan di dalam peran `scheduler` (`svc-worker`) dan ikut mati bersamanya, jadi scheduler yang mati total tidak melaporkan apa pun | [02 Layanan & Infrastruktur](./02-LAYANAN-INFRA.md) |

Ditambah dua yang sifatnya operasional: rahasia hanya ada di `.env` di disk yang
sama dengan data, dan `OPERATOR_TRUSTED_PROXY_HOPS` harus dinaikkan **pada
perubahan yang sama** bila nanti ada CDN/LB di depan Traefik — kalau lupa, semua
pengunjung lewat CDN itu tampak sebagai satu IP.

## 6. Kalau menambah permukaan baru

Daftar periksa pendek; aturan penuhnya di [`docs/RBAC.md`](../RBAC.md) dan
[`AGENTS.md`](../../AGENTS.md).

- [ ] Halaman → `requirePagePermission("resource.action")`; API → `requireApiPermission(...)`; `/api/v1` → `requireApiToken(...)`. **Jangan** membandingkan string peran.
- [ ] Halaman publik baru → sebutkan namanya di `isPublicPath` **dan** di `tests/authz-coverage`. Jalur publik dicocokkan **persis**, bukan prefix.
- [ ] Grup rute baru yang berisi halaman berizin → tambahkan ke daftar grup berpenjaga di `tests/authz-coverage.test.ts`.
- [ ] Jalur tulis baru → skema zod, dan konteks PT **dari jalur**, bukan dari klien.
- [ ] Pekerjaan latar baru → `runWithCompany()`; cache tingkat modul → berkunci tenant.
- [ ] Dokumen → jurnal → lewat `postForSource`, jangan menulis `journals` langsung.
- [ ] Kolom rahasia baru → segel `settings-crypto`, bukan teks biasa.
- [ ] Tabel baru → `@@index` untuk setiap FK (PostgreSQL tidak membuatnya sendiri).
