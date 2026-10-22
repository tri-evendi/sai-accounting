# 03 — API, Integrasi & Titik Gagal

> 20 Okt 2026 · produksi `main@ca0cd038` · [indeks](./README.md)

Permukaan sistem dari luar: siapa boleh masuk lewat jalur mana, apa yang
dipanggil ke luar, dan apa yang berhenti bila salah satunya mati.

## 1. Protokol

| Protokol | Di mana |
|---|---|
| HTTPS | Semua lalu lintas masuk; Traefik terminasi TLS, HTTP → 301 |
| HTTP | Traefik → `app-*:3000` di jaringan Docker |
| PostgreSQL | `app-*` + `svc-worker` + jalur `interactive` Go → `pgbouncer:5432`; `migrate` + jalur `tenant` (`svc-integrator`) + pagar jalur `ledger` → `pg:5432` langsung |
| SMTP | `app-customer` / `svc-worker` (peran `scheduler`) → penyedia surel |
| HTTPS keluar | `app-customer` → Midtrans Core API — **satu-satunya** panggilan HTTP keluar |
| S3 | `svc-integrator` (jalur `tenant`) → penyimpanan objek (SDK S3 di dalam biner Go; `awscli` hanya di image perkakas `job-backup`) |
| — | Hasil pekerjaan TIDAK memakai penyimpanan objek: ia volume `hasil` di mesin ini, dan satu-satunya jalan keluarnya route handler ber-izin |

Tidak ada gRPC, GraphQL, WebSocket, atau SSE. Layanan berkoordinasi lewat basis
data bersama — termasuk **antrean pekerjaan**, yang adalah satu tabel (`jobs` di
basis data kendali), bukan broker: [04 §8.9](./04-ALIRAN-DATA.md) dan
[02 §5](./02-LAYANAN-INFRA.md). Pemindahan pembuatan dokumen ke server masih
dirancang di [09 §5](./09-RANCANGAN-LAYANAN.md).

### Dokumen & hasil pekerjaan — tiga rute, satu aturan

Sejak tahap 1c pembuatan dokumen ada di SERVER (rancangan §5), dan permukaannya
tiga rute. Semuanya bertenant (`/api/t/{tenant}/{company}/…`) kecuali yang
menerima muatan laporan lewat `apiFetch`:

| Rute | Masukan | Izin |
|---|---|---|
| `POST /api/reports/pdf` | muatan laporan (sama dengan tombol Excel) | `report.export` |
| `POST /api/reports/export` | muatan laporan; di atas ambang penyerahan ia **202** beserta `jobId` | `report.export` + izin laporannya (#355) |
| `GET /api/t/…/documents/pdf/{jenis}/{id}` | **ID saja**, tanpa badan | per JENIS: `invoice.read`, `contract.read`, `document.read`, `return.read` |
| `GET /api/t/…/jobs/{kind}/{id}/result` | ID pekerjaan | per `kind` + gerbang kedua dari muatannya |

**Aturan yang mengikat ketiganya: kertasnya diturunkan dari BUKU.** Rute dokumen
menerima ID dan memuat barisnya sendiri; ia `GET` tanpa badan, jadi jalur
"render apa yang dikirim klien" tidak ada untuk ditutup. Syarat audit §5 —
"server menyimpan byte yang persis sama dengan yang dikirim ke customer" — baru
berarti sesuatu bila angka di atas kertas bukan angka yang dikirim peramban.

⚠ **Dua jenis untuk satu generator, dan itu disengaja.** `contract-shipping`
dibangun dari KONTRAK, `delivery-order` dari baris `delivery_orders` (#16).
Generatornya sama — satu tata letak — tapi sumbernya berbeda; satu kunci untuk
keduanya akan membuat `id` berarti dua hal tergantung pemanggilnya.

⚠ **`kind` ada di JALUR rute hasil**, dan itu urutan pemeriksaan bukan kerapian
URL: izin yang dituntut bergantung pada jenis pekerjaan, dan jenis itu ada di
BARISnya. Membacanya sebelum gerbang berjalan membuat penanya **anonim**
menerima 401 untuk id yang ada dan 404 untuk yang tidak — dan dari dua jawaban
itu volume pemakaian bisa dicacah, yang doktrin #317 melarang.

## 2. Tiga rezim autentikasi

Sesi NextAuth dan token Bearer berjalan di aplikasi customer, dipisahkan
**oleh jalur**. Sesi operator hidup di aplikasi tersendiri, dipisahkan **oleh
host**.

| Rezim | Untuk | Pemisah |
|---|---|---|
| Tanpa autentikasi | Daftar jalur publik yang dicocokkan persis | `isPublicPath(path)` |
| Sesi NextAuth | Mayoritas halaman & API customer | sisanya di `APP_DOMAIN` |
| Token Bearer | `/api/v1/**` | `isBearerApiPath(path)` |
| Sesi operator | Seluruh jalur di `OPERATOR_HOST` | `decideOperatorRouting()` |

### 2.1 Sesi NextAuth

`next-auth` v5 beta, **Credentials** saja (nama pengguna + sandi, `bcrypt`),
strategi **JWT** masa 24 jam, cookie **berlingkup host** — itulah yang
memisahkan plane operator. Env: `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`.

JWT **tidak** membawa `companyId` (dicabut #158); perusahaan selalu dari jalur
URL, keanggotaan dibaca ulang tiap permintaan. Peran juga ditimpa per
permintaan — tanpa itu `finance_manager` di PT A yang membuka buku PT B (tempat
ia hanya `staff`) akan memegang hak PT A.

### 2.2 Token Bearer (`/api/v1`)

`Authorization: Bearer sai_…` → `lib/api-token-guard.ts` →
`requireApiToken("izin")`. Disimpan di `control.api_tokens`, dikelola di
halaman `/api-tokens`. Status 11 Okt 2026: **0 token aktif**.

| Endpoint | Izin |
|---|---|
| `/api/v1/accounts` · `customers` · `invoices` · `items` · `suppliers` | `account.read` · `customer.read` · `invoice.read` · `inventory.read` · `supplier.read` |
| `/api/v1/openapi.json` | publik, tanpa data perusahaan |

Hanya-baca, lima sumber daya, semuanya `GET`. Bentuk jawaban ditetapkan di
`lib/api-v1.ts` sejak baru ada satu endpoint.

> **Kenapa proxy melepas `/api/v1/*`.** Proxy membaca sesi NextAuth untuk tiap
> `/api/*` non-publik lalu menjawab 401 bila tidak ada cookie — dan permintaan
> ber-`Authorization` tidak membawa cookie. Sampai 16 Agu 2026 **seluruh
> `/api/v1` di produksi dijawab 401** sebelum guard token berjalan. Cacat itu
> lolos `verify` dan `build` karena semua tes token memanggil `requireApiToken`
> langsung. Kini `tests/proxy-bearer-api.test.ts` memanggil `proxy()` sungguhan,
> dan `tests/api-v1-spec.test.ts` menuntut izin yang dipakai sama dengan yang
> didokumentasikan.

### 2.3 Sesi operator

```
1. Host = OPERATOR_HOST        →  kalau tidak: 404
2. IP ∈ OPERATOR_IP_ALLOWLIST  →  kosong: TOLAK SEMUA
3. Cookie sesi bertanda tangan →  kalau tidak: /login
4. TOTP bila OPERATOR_MFA      →  kalau tidak: tolak
```

| | |
|---|---|
| Modul murni | `@sai/core/operator-plane` (aman-edge: tanpa Prisma, `node:crypto`, `next/*`) |
| Guard & sesi | `apps/operator/src/lib/operator/{guard,session}.ts` · `OPERATOR_SESSION_SECRET` |
| Kredensial | `OPERATOR_USERS` (akun darurat, selalu owner) + `control.operator_accounts` (TOTP dienkripsi) |
| Peran | owner / billing / support / viewer — membagi **tindakan**, bukan bacaan; tiap server action memanggil `requireOperatorActionSession(izin)` |
| Pencabutan sesi | Akun DB: `session_version` dibandingkan tiap permintaan · akun env: hapus entri atau putar secret |

Fail-closed di empat tempat: `OPERATOR_HOST` kosong → 404 di mana pun · image
customer tidak memuat rute konsol · image konsol 404 untuk host lain ·
allowlist kosong → tolak semua.

> ⚠ **Daftar IP & hitungan hop proxy.** Allowlist membaca `x-forwarded-for` dan
> mengambil entri ke-N **dari kanan**, N = `OPERATOR_TRUSTED_PROXY_HOPS`
> (bawaan 1 = Traefik saja). Entri paling kanan satu-satunya yang ditulis
> Traefik; entri di kirinya bisa diketik klien. Menambah CDN/LB di depan
> Traefik → setel `=2` pada perubahan yang sama, kalau lupa semua pengunjung
> lewat CDN tampak sebagai satu IP. Jangan menurunkan angkanya di bawah jumlah
> proxy sebenarnya. Rantai lebih pendek dari angka ini ditolak.

## 3. Jalur publik — daftarnya PERSIS

`isPublicPath` mencocokkan jalur **persis**, bukan prefix, dengan dua
pengecualian. Halaman publik baru harus disebut namanya di sana dan di
`tests/authz-coverage`.

| Jalur | Kenapa publik |
|---|---|
| `/`, `/pricing`, `/status` | Pembacanya belum punya akun, atau sedang tidak bisa memakai aplikasinya |
| `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/accept-invitation` | Pra-akun |
| `/terms`, `/privacy` | Harus terbaca sebelum disetujui |
| `/api/health` | Docker & Traefik tidak punya — dan tidak boleh punya — kredensial |
| `/api/billing/webhook` | Pengirimnya server Midtrans; kredensialnya tanda tangan |
| `/api/auth/*` | NextAuth, **kecuali** `change-password` |
| `/robots.txt`, `/sitemap.xml`, `/opengraph-image*` | Perayap & pratinjau tautan tidak punya cookie |
| `/manifest.webmanifest` | Peramban mengambilnya `no-cors`; tanpa ini PWA #471 gagal **tanpa error** |
| `/docs/**` | Satu-satunya pelepasan subpohon — pohon dokumen tidak bisa dienumerasi |

`/opengraph-image` dicocokkan sebagai prefix karena Next menambahkan sufiks
versi.

## 4. Permukaan HTTP

| Permukaan | Jumlah (18 Okt 2026) |
|---|---|
| Halaman | 131 customer + 19 konsol |
| Rute API | 128 customer + 2 konsol |
| Rute aset | 3 customer + 3 konsol |

| Grup | Jumlah | Pola jalur | Guard |
|---|---|---|---|
| `(marketing)` | 3 | `/`, `/pricing`, `/status` | Tanpa |
| `(app)/(auth)` | 13 | `/login`, `/register`, … | Sebagian publik |
| `(app)/(dashboard)` | 103 | `/t/{tenant}/{company}/…` + `/dashboard` | `requirePagePermission` |
| `(app)/(setup)` | 2 | `/t/{t}/{c}/setup`, `/setup/done` | `setup.manage` |
| `(app)/(tenant)/(panel)` | 7 | `/platform/…`, `/companies/new` | Matriks tenant |
| `(app)/(docs)` | 3 | `/docs`, `/docs/cari`, `/docs/[...slug]` | Tanpa — dijaga tes |
| `apps/operator` | 19 | `/`, `/tenants`, `/login`, … | Plane operator |

```
/t/{tenantSlug}/{companySlug}/{halaman}
   └── tenant       └── PT        └── 102 halaman
```

- **Slug tenant berganti (#458)** → `permanentRedirect` (**301**, bukan 307), supaya bookmark dan mesin pencari ikut pindah. Jalur dalamnya dari header `x-sai-path`. Bukan anggota tetap 404.
- **Slug PT tidak boleh berubah** — trigger basis data + `prove-company-slug-immutable`.
- Slug tak ada, PT nonaktif, bukan anggota, dan tenant lain dijawab **404 yang sama** (`lib/company-route.ts`, dijaga `tests/cross-tenant-404.test.ts`). Jawaban berbeda membocorkan keberadaan perusahaan orang lain.

128 rute API per domain: akuntansi inti · penjualan · pembelian & persediaan ·
manufaktur · aset tetap · kas & rekonsiliasi · laporan · tata kelola · tenant &
platform · autentikasi & infra. Daftar lengkap per rute beserta izinnya:
[08 Glosarium & Katalog](./08-GLOSARIUM.md).

| Permukaan | Format jawaban |
|---|---|
| Halaman · API internal | HTML (RSC) · JSON |
| `/api/v1` | JSON + `meta` |
| `/api/health` | JSON; **503 hanya bila keadaan intrinsik container ini buruk** — lihat [02 §14](./02-LAYANAN-INFRA.md) |
| Ekspor laporan | XLSX (`exceljs`) **di server** · PDF (`jspdf`) **di peramban** · ZIP (`jszip`) **di server, di-stream** |
| Lampiran surel | PDF faktur dibuat **di server** dengan modul `jspdf` yang sama |
| Berkas dokumen | Byte lewat route bertenant, bukan berkas statis |

### Batas muatan masuk

Dua batas berdiri di jalur ekspor laporan (`POST /api/reports/export`), dan
keduanya ada karena rute itu satu-satunya tempat yang merakit lembar sebar dari
muatan yang datang dari **luar** — peramban mengirim `StatementPayload` yang
sudah dihitung halamannya.

| Batas | Nilai | Di mana ia berdiri |
|---|---|---|
| Badan permintaan | **16 MiB** | **sebelum** diurai — `@/lib/request-body` |
| Baris lembar sebar | **50.000** | pada `SheetModel` yang **sudah** dipetakan |
| Kolom yang diminta | 64 | skema muatan |

⚠ **Penempatannya yang menentukan, bukan angkanya.** `await request.json()`
sudah mematerialkan DAN mengurai seluruh badan, jadi skema zod paling ketat pun
tidak melindungi apa pun dari badan 500 MB — prosesnya mati sebelum baris pertama
skema itu dibaca. Dan `content-length` saja tidak cukup: header itu tidak ada
pada permintaan ber-*chunked encoding*, dan pada yang lain ia hanya pernyataan
pengirim. Jadi byte yang sungguh datang **dihitung**, dan alirannya dibatalkan
begitu melewati batas — batas yang menjawab 413 sambil membiarkan sisa
unggahannya mengalir tidak membatasi apa pun.

Batas barisnya dihitung pada model lembar, bukan pada muatannya: muatan tiap
laporan berbeda bentuk (`rows`, seksi bersarang, grup arus kas), jadi penghitung
per-jenis adalah penghitung yang akan melewatkan laporan berikutnya. Keduanya
wajib **konsisten** — batas byte yang lebih ketat daripada yang dibutuhkan batas
baris membuat batas baris tak pernah tercapai, dan penggunanya menerima galat
yang menyebut sebab yang salah.

Angkanya di `@sai/core/export-limits`, bukan di rutenya: begitu pembuatan dokumen
pindah ke proses terpisah, pekerjanya menegakkan batas yang sama, dan batas yang
hanya hidup di `src/lib` akan ditinggalkan pemakainya sendiri.

### Batas periode laporan

`resolvePeriod` (`src/lib/report-catalog.ts`) — satu titik tersempit untuk
sebelas halaman laporan — menerapkan tiga aturan, dan ketiganya menutup
kegagalan yang **sekelas**: semuanya menghasilkan laporan yang BENAR untuk
periode yang tidak diminta.

| Aturan | Perilakunya |
|---|---|
| Tanggal tak sah | jatuh ke bawaan |
| Rentang terbalik | **ditukar** — konvensi yang sama dengan `resolveStockPeriod` |
| Rentang keterlaluan | **awalnya** dipendekkan, akhirnya dipertahankan |

Batas rentangnya **sepuluh tahun**, dan itu retensi wajib pembukuan (UU KUP),
bukan tebakan kapasitas: periode tidak menentukan ongkos — laporan lima tahun di
tenant berumur setahun membaca baris yang sama banyak dengan laporan setahun.
Jadi ia batas **kewarasan**, yang hanya menolak yang mustahil. Yang memikul
kapasitas adalah batas baris di atas.

Batas yang sama berdiri di **kedua** pembaca periode: `?g=custom` di
`src/lib/stock-period.ts` menerima `?from=&to=` mentah yang sama, dan batas yang
hanya berdiri di satu pembaca adalah batas yang dilewati dengan menambahkan satu
parameter.

⚠ Ketiga aturan itu senyap, dan senyap adalah bagian yang berbahayanya. Penyaring
periode membandingkan `?from=`/`?to=`/`?asOf=` **mentah** dengan nilai yang sudah
diselesaikan dan mengatakan periode mana yang sungguh dipakai.

## 5. Header keamanan

Didefinisikan **sekali** di `packages/core/src/security-headers.ts`, dipasang
kedua aplikasi untuk setiap jalur. Dijaga `tests/security-headers.test.ts`.

| Header | Nilai |
|---|---|
| `X-Frame-Options` · `X-Content-Type-Options` | `DENY` · `nosniff` |
| `Referrer-Policy` · `X-DNS-Prefetch-Control` | `strict-origin-when-cross-origin` · `off` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` — produksi saja |

```
default-src 'self'
script-src  'self' 'unsafe-inline'                 ← 'unsafe-eval' hanya di DEV
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob:
connect-src 'self'        font-src 'self'
frame-src   'self' blob:  object-src 'self' blob:
frame-ancestors 'none'    base-uri 'self'    form-action 'self'
```

`blob:` ada untuk pratinjau PDF faktur/kontrak, tanpa membuka sumber luar.

| Arahan longgar | Keadaan |
|---|---|
| `'unsafe-eval'` | ✅ **dicabut di produksi** (11 Okt 2026) |
| `style-src 'unsafe-inline'` | **Struktural** — 2.618 `style={{` di 305 berkas (#203); nonce tidak bisa menandai atribut `style` |
| `script-src 'unsafe-inline'` | Jalur nonce + `strict-dynamic` terdokumentasi di `security-headers.ts`; terbuka sebagai P2-4 |

## 6. Komunikasi antar-layanan

**Tidak ada panggilan jaringan antar-layanan**, dan itu invarian — bukan
kebetulan: I-3 (`09` §2) melarangnya, sehingga integrator yang mati tidak
membuat aplikasi gagal (permintaan menumpuk sebagai baris), bahasa pekerja bisa
ditukar per `kind`, dan tidak ada *dual-write* karena tidak ada pihak kedua yang
harus ikut berhasil.

Seluruh koordinasi lewat basis data bersama. Sejak tahap 1a salah satu bentuknya
adalah **antrean**: tabel `jobs` di basis data kendali, dengan klaim
satu-pernyataan ber-`FOR UPDATE SKIP LOCKED`, *lease* yang diperpanjang,
*backoff* ber-jitter, dan `dedupe_key` unik sebagai ganti *leader election*.

| Jalur | Mekanisme | Jejaknya di |
|---|---|---|
| `svc-worker` (`scheduler`) → `app-customer` | `notifications`, `platform_invoices`, `scheduler_runs` (kendali) | `/scheduler`, `/api/health` |
| `svc-worker` (`scheduler`) → `svc-worker` (`ledger`) | **antrean** — `jobs`, `kind` `ledger.*` (`recurring:publish`) | `/api/health` → `queue` |
| `svc-worker` (`scheduler`) → `svc-integrator` (`tenant`) | **antrean** — `jobs`, `kind` `tenant.backup` (`backup:publish`) | `/api/health` → `queue` |
| `app-customer` → `svc-worker` (`interactive`) | **antrean** — `jobs`, `kind` `report.export`, diterbitkan rute ekspor di atas ambang penyerahan | `/api/health` → `queue`; hasilnya di `data/hasil` |
| `svc-worker` (`interactive`) → `app-customer` | `jobs.result_ref` + berkas di volume `hasil`; aplikasi men-stream byte-nya lewat rute ber-izin | rute hasil (409 sampai siap, 200 beserta byte) |
| `svc-worker` (`conformance`) → `app-customer` | `conformance_runs` | `/api/health` |
| `svc-integrator` (`tenant`) → `app-customer` | `backup_runs` + objek manifest di tujuan cadangan | `/api/health` |
| `migrate` → semua | `depends_on: service_completed_successfully` + gerbang skema saat boot | Keluaran container, `/api/health` |
| Midtrans → `app-customer` | Webhook HTTP | `payments`, `platform_invoices` |

*Retry* per pekerjaan, *dead-letter*, dan *backpressure* karena itu **sudah ada
untuk yang lewat antrean** — `attempts`/`max_attempts`, status `dead`, dan
klaim yang dibatasi satu pekerjaan per pekerja. Yang BELUM lewat antrean
(pengingat, kesesuaian data, migration) masih mengandalkan produser yang
idempoten: putaran berikutnya menyelesaikan yang tertinggal. Terbuka sebagai
P2-2 untuk sisa itu.

⚠ **Dua pembacaan yang wajib berpasangan.** Umur antrean per jalur (`queue`)
HIJAU ketika antreannya kosong — termasuk ketika penerbitnya mati dan tidak ada
baris yang pernah terbit. Yang membantahnya denyut PENERBIT (`scheduler`), yang
diukur dari stempel waktu putaran dan karena itu tidak bergantung pada isi
antrean sama sekali. Satu di antaranya saja bisa berkata sehat untuk kegagalan
total.

## 7. Dependensi luar

### Wajib — tanpa ini aplikasi tidak melayani

| Dependensi | Bila mati |
|---|---|
| PostgreSQL + PgBouncer | Pemadaman total. Bagi aplikasi, PgBouncer mati = basis data mati |
| Traefik | Tidak ada akses dari luar; container tetap sehat |
| Let's Encrypt | Sertifikat kedaluwarsa → peramban menolak. 🔶 Tanpa pemantauan di repo ini |
| DNS | `APP_DOMAIN` tak terselesaikan = tak terjangkau; `OPERATOR_DOMAIN` salah = konsol 404 |

Probe kesehatan: **hanya control yang boleh memutuskan 503.** Kalau probe 503
karena scheduler telat, satu masalah penagihan berubah jadi pemadaman total.

### Terdegradasi — fitur mati, aplikasi hidup

**SMTP**, konfigurasinya tiga lapis dan urutannya menentukan:

```
1. Pengaturan TENANT      control.tenant_mail_settings   (SMTP milik customer)
        ↓ tidak ada
2. Pengaturan PLATFORM    platform.mail_settings         (disetel di /mail)
        ↓ tidak ada / tak terjangkau
3. Environment            SMTP_* / MAIL_TRANSPORT=file → data/mail-outbox/*.eml
```

> ⚠ **Surel yang membawa TOKEN AKSES** (undangan, atur-ulang sandi, verifikasi)
> **tidak pernah** lewat SMTP tenant — langsung ke lapis 2. SMTP tenant
> dikendalikan customer, dan token akses adalah kredensial.

`nodemailer` 7 di satu berkas (`@sai/platform/mailer-core`); sandi disimpan
terenkripsi AES-256-GCM. Cache TTL 60s, sengaja tanpa kunci tenant karena
pengaturan platform hanya satu. Status 11 Okt: 1 baris `mail_settings`,
`tenant_mail_settings` 0 baris. Bila SMTP mati: undangan, atur-ulang sandi,
pengiriman faktur, dan pengingat gagal; **login dan buku besar tidak
terpengaruh**.

**S3** — `awscli` di image `backup`, penyedia mana pun lewat `--endpoint-url`.
Status 18 Okt: tiga env kosong → `local_only`.

**Midtrans** — `POST {base}/v2/charge` keluar, `POST /api/billing/webhook`
masuk (tanda tangan SHA-512). Status 11 Okt: tanpa `MIDTRANS_*` → transport
**MOCK**. Dua pemakaian yang harus tetap terpisah:

1. **Penagihan platform** (SAI menagih tenant) → kunci platform dari environment.
2. **Penagihan pelanggan** (tenant menagih pelanggannya) → kredensial milik tenant, terenkripsi per perusahaan. Karena itu `company-payment-settings.ts` **tidak pernah** membaca `process.env.MIDTRANS_*`.

Gate efektif menuntut `NODE_ENV=production` **dan** `MIDTRANS_SERVER_KEY`; di
luar itu jatuh ke MOCK dengan peringatan. Verifikasi webhook fail-closed:
produksi tanpa kunci menolak semua webhook.

### Hanya saat build/rilis

GitHub Actions (tidak bisa rilis; produksi tetap jalan) · GHCR (tidak bisa
`pull`, jadi rollback juga tidak) · npm registry dan Docker Hub (build gagal;
container berjalan tak terpengaruh).

### Tidak dipanggil runtime

**Accurate Online** (`src/lib/accurate/`) berbasis ekspor laporan yang diunggah
manusia. **e-Faktur / Coretax** membuat berkas untuk diunggah ke sistem pajak.
Keduanya tanpa panggilan jaringan maupun kredensial.

### Hulu & hilir

| Sumber masuk | Dipercaya? |
|---|---|
| Peramban pengguna | Tidak — zod di setiap jalur tulis |
| Webhook Midtrans | Tidak — tanda tangan SHA-512, fail-closed |
| Integrator API | Tidak — `requireApiToken` + izin |
| Unggahan berkas | Tidak — validasi tipe & bentuk |
| Dump sistem lama | Tidak — **tidak melewati guard zod**; alasan peran `conformance` (`svc-worker`) ada |
| Ekspor Accurate | Tidak — pengurai sendiri |

Keluar: peramban (HTML/JSON/PDF/XLSX) · pelanggan tenant lewat SMTP (faktur +
pengingat) · anggota tim (undangan, atur-ulang sandi) · Midtrans (jumlah, id
pesanan) · S3 (**seluruh** basis data + dokumen + audit, terenkripsi) ·
perayap.

`remind:customers` satu-satunya jalur yang menghubungi orang **di luar**
organisasi customer. Empat gate sebelum surel keluar: `reminder_enabled`
menyala (bawaan mati) · `reminder_tested_at` terisi, jadi seseorang pernah
menerima sendiri kalimatnya · masih dalam jendela toleransi 2 hari · kunci unik
`(invoice, kind, due_key)` belum terpakai.

## 8. Titik gagal tunggal

| # | Titik | Dampak | Mitigasi hari ini | Penilaian |
|---|---|---|---|---|
| 1 | **PostgreSQL tunggal** (+ PgBouncer tunggal) | Pemadaman total + kehilangan data | `restart: unless-stopped`, healthcheck, volume bernama | **Kritis** — diperburuk #2 |
| 2 | **Backup tanpa salinan luar-mesin** | Kehilangan mesin = kehilangan buku **beserta** backup-nya | Salinan terenkripsi harian di mesin yang sama + peringatan | **Kritis — P0** |
| 3 | **Mesin tunggal** (satu VM, 6 aplikasi) | Kehilangan semuanya | Tidak ada | Diterima sadar |
| 4 | **`app-customer` tunggal** | Enam permukaan customer padam; konsol **tidak** ikut jatuh | `restart` + healthcheck | Dapat diterima |
| 5 | **Traefik tunggal** | 6 aplikasi tak terjangkau | Di luar repo ini | Di luar lingkup |
| 6 | **`AUTH_SECRET` tunggal** | Rotasi = seluruh sesi batal | Masa sesi 24 jam | Dapat diterima |
| 7 | **`BACKUP_ENCRYPTION_KEY`** | Kunci hilang = backup tidak bisa dibuka | ❓ Penyimpanan luar belum dipastikan | **Perlu dipastikan segera** |
| 8 | **`SETTINGS_ENCRYPTION_KEY`** | Sandi SMTP tersimpan tak terbaca | Dapat disetel ulang lewat konsol | Rendah |

## 9. Larangan impor yang ditegakkan tes

| Larangan | Guard | Kenapa |
|---|---|---|
| `reports.ts`, `ledger.ts`, `posting/*` mengimpor `business-modules.ts` | `tests/business-modules-ledger.test.ts` | Modul tidak menggerbangi buku besar |
| `operator-plane` mengimpor `platform-db.ts` | doktrin #137 | Guard & proxy bukan kode penagihan |
| Halaman `(docs)/**` memuat guard | `tests/docs.test.ts` | `/docs` publik; pembaca anonim tidak memicu kueri |
| `@ant-design/icons` default/namespace | `tests/icon-rsc-boundary.test.ts` | Barrel-nya meruntuhkan lapisan RSC |
| `<Link><Button/></Link>` · `asChild` | `tests/anchor-button-nesting` · `button-no-aschild` | Elemen interaktif bersarang · tidak aman dari server component |
| Warna mentah di luar `antd-tokens.ts` | ESLint `sai/warna-token-antd` | Satu sumber warna |
| Halaman/route tanpa deklarasi izin | `tests/authz-coverage.test.ts` | Rute tak ber-guard = lubang |
| Skrip mengimpor `server-only` | `tsx` mati di atasnya | Logika produser harus di pustaka murni |

Arah dependensi antar-paket dijaga `tests/packages-mandiri.test.ts` dan
`tests/operator-dependency-direction.test.ts`.

| Kopling | Ketat? | Catatan |
|---|---|---|
| `app-customer` ↔ PostgreSQL | Ketat | Benar — ini aplikasi basis data |
| `job-*` ↔ image `migrator` | Ketat, sengaja | Env & `node_modules` sama; harganya CI harus membangun keempat image |
| Control ↔ platform · Control ↔ buku PT | Longgar, sengaja | Tanpa FK; butuh `reconcile:platform` · `database_name` menunjuk |
| Aplikasi ↔ Midtrans · ↔ SMTP | Longgar | Transport MOCK/`manual` · tiga lapis + transport `file` |
| UI ↔ Ant Design v6 | Ketat | Diperketat sengaja #203 |
