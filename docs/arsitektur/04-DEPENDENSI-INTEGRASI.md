# 04 — Peta Dependensi & Integrasi

> Potret 11 Oktober 2026 · v0.9.0 · [indeks](./README.md)

## 1. Dependensi eksternal — gambaran

```mermaid
graph LR
    subgraph platform["SAI Accounting"]
        WEB["web"]
        SCH["scheduler"]
        BAK["backup"]
        DB[("PostgreSQL")]
    end

    subgraph wajib["WAJIB — tanpa ini aplikasi tidak melayani"]
        MARIA["PostgreSQL 17 + PgBouncer<br/>(container sendiri)"]
        TRAEFIK["Traefik<br/>TLS + routing"]
        LE["Let's Encrypt<br/>penerbitan sertifikat"]
        DNS["DNS<br/>APP_DOMAIN · OPERATOR_DOMAIN"]
    end

    subgraph degradasi["TERDEGRADASI — fitur mati, aplikasi hidup"]
        SMTP["SMTP<br/>surel keluar"]
        S3["S3-compatible<br/>cadangan luar-mesin"]
        MT["Midtrans Core API<br/>VA + QRIS"]
    end

    subgraph build["HANYA SAAT BUILD/RILIS"]
        GH["GitHub Actions"]
        GHCR["GHCR<br/>registry image"]
        NPM["npm registry<br/>(lewat bun)"]
        DH["Docker Hub<br/>node:22 · postgres:17 · pgbouncer · oven/bun"]
    end

    WEB --> MARIA
    SCH --> MARIA
    BAK --> MARIA
    TRAEFIK --> WEB
    LE --> TRAEFIK
    DNS --> TRAEFIK

    WEB -.-> SMTP
    SCH -.-> SMTP
    BAK -.-> S3
    WEB -.-> MT
    MT -.->|webhook| WEB

    GH --> GHCR --> WEB
    NPM --> GH
    DH --> GH

    style wajib fill:#ffeaea,stroke:#b55
    style degradasi fill:#fff4e6,stroke:#c9873d
    style build fill:#f0f0f5,stroke:#888
```

## 2. Dependensi eksternal — rinci

### 2.1 WAJIB

| Dependensi | Dipakai oleh | Bila mati | Konfigurasi |
|---|---|---|---|
| **PostgreSQL 17** (+ **PgBouncer**) | semua | **Pemadaman total.** PgBouncer mati = sama dengan basis data mati bagi `app-*` dan job; hanya `migrate`/`job-backup` yang langsung ke `pg`. `/api/health` → 503 `database: unreachable`, Traefik berhenti mengirim lalu lintas | `DATABASE_URL`, `CONTROL_DATABASE_URL`, `PLATFORM_DATABASE_URL` |
| **Traefik** | web | Tidak ada akses dari luar. Container tetap sehat | Label Docker di `docker-compose.yml` |
| **Let's Encrypt** (resolver `le`) | Traefik | Sertifikat kedaluwarsa → peramban menolak. 🔶 Pembaruan ditangani Traefik, **tidak ada pemantauan di repo ini** | `certresolver=le` |
| **DNS** | semua | `APP_DOMAIN` tak terselesaikan = tak terjangkau. `OPERATOR_DOMAIN` salah = konsol **404 dengan sengaja** (gagal-tertutup) | `APP_DOMAIN`, `OPERATOR_DOMAIN`, `OPERATOR_HOST` |

Satu catatan penting tentang probe kesehatan: **hanya basis data KENDALI yang
boleh memutuskan 503.** Platform, PT contoh, penjadwal, cadangan, dan surel
semuanya **dilaporkan** tanpa ikut memutuskan. Kalau probe 503 karena penjadwal
telat, satu masalah penagihan berubah menjadi pemadaman total — persis
kebalikan dari tujuannya.

### 2.2 TERDEGRADASI (fitur mati, aplikasi hidup)

#### SMTP — surel keluar

Konfigurasinya **tiga lapis**, dan urutannya menentukan:

```mermaid
graph TD
    A["1. Pengaturan TENANT<br/>control.tenant_mail_settings<br/>(SMTP milik pelanggan)"]
    B["2. Pengaturan PLATFORM<br/>platform.mail_settings<br/>(disetel di /operator/mail)"]
    C["3. Environment<br/>SMTP_* / MAIL_TRANSPORT=file"]

    A -->|tidak ada| B -->|tidak ada / tak terjangkau| C

    X["⚠ Surel TOKEN AKSES<br/>(undangan, atur-ulang sandi,<br/>verifikasi surel)"]
    X -->|"TIDAK PERNAH pakai SMTP tenant"| B

    style A fill:#eef7ee,stroke:#5a8f5a
    style B fill:#e8f0ff,stroke:#4a6fa5
    style X fill:#ffeaea,stroke:#b55
```

| | |
|---|---|
| Pustaka | `nodemailer` 7 — **satu** berkas: `lib/mailer-core.ts` |
| Lapis 1 | `lib/tenant-mail-settings.ts` — SMTP milik pelanggan |
| Lapis 2 | `lib/mail-settings.ts` — milik penyedia, di `sai_platform` |
| Lapis 3 | *environment* / transport `file` → `data/mail-outbox/*.eml` |
| Sandi | Disimpan **hanya** sebagai segel AES-256-GCM (`lib/settings-crypto.ts`, kunci `SETTINGS_ENCRYPTION_KEY`) |
| Cache | TTL 60s; **tidak** berkunci penyewa — sengaja, karena pengaturan platform milik **penyedia**, satu untuk seluruh pemasangan |
| Status 11 Okt | 1 baris `mail_settings`, `transport = smtp`, host terisi. `tenant_mail_settings` = **0 baris** |

**Aturan yang tidak boleh dilanggar:** surel yang membawa **token akses**
(undangan staf, atur-ulang sandi, verifikasi surel) **tidak pernah** lewat SMTP
tenant. Alasannya: SMTP tenant dikendalikan pelanggan, dan token akses adalah
kredensial yang tidak boleh melewati infrastruktur yang bisa ia baca.

Bila mati: undangan, atur-ulang sandi, pengiriman faktur, dan pengingat
pelanggan gagal. Login & buku besar **tidak terpengaruh**. `mail-settings.ts`
sengaja **tanpa** `server-only` karena dipakai skrip `tsx` di luar Next —
menarik `server-only` ke sana akan mematikan penjadwal.

#### S3-compatible — cadangan

| | |
|---|---|
| Perkakas | `awscli` di image `backup` (`aws s3 cp`, `ls`, `rm`) |
| Penyedia | Mana pun yang S3-compatible, lewat `--endpoint-url` |
| Env | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION_DAYS` |
| **Status 11 Okt** | **Tiga env tidak ada**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET` |
| Akibat | 54 percobaan, **0 berhasil**. `/api/health` → `backup: failing`, `lastSuccessAt: null` |

#### Midtrans — gerbang pembayaran

| | |
|---|---|
| Modul | `lib/payment-gateway.ts`, `lib/payment-webhook.ts`, `lib/company-payment-settings.ts` |
| Keluar | `POST {base}/v2/charge` — Core API. `base` = `api.midtrans.com` (produksi) / `api.sandbox.midtrans.com` |
| Masuk | `POST /api/billing/webhook` — tanda tangan **SHA-512** |
| Env | `PAYMENT_GATEWAY`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION` |
| **Status 11 Okt** | **Tidak ada satu pun** `MIDTRANS_*` di `.env` → transport **MOCK** |

**Dua pemakaian yang harus dibedakan** — dan `lib/company-payment-settings.ts`
ada khusus untuk menjaga pembedaan itu:

1. **Penagihan PLATFORM** (kami menagih tenant) — memakai
   `MIDTRANS_SERVER_KEY` milik **platform**, dibaca dari *environment*.
2. **Penagihan PELANGGAN** (tenant menagih pelanggannya) — memakai kredensial
   **milik tenant**, disimpan terenkripsi per perusahaan.
   `company-payment-settings.ts` karena itu **tidak pernah** membaca
   `process.env.MIDTRANS_*`.

Gerbang **efektif** menuntut `NODE_ENV=production` **DAN**
`MIDTRANS_SERVER_KEY`; di luar itu jatuh ke MOCK **dengan peringatan** —
sehingga salah setel tidak diam-diam menagih sungguhan. Verifikasi webhook
**gagal-tertutup**: produksi tanpa `MIDTRANS_SERVER_KEY` **menolak semua**,
bukan menerima semua.

Bila mati: pembayaran langganan baru tidak bisa diproses. Mengingat
**11 dari 11 langganan ber-`billing_mode=none`** dan 0 pembayaran tercatat,
dampak hari ini **nol**.

### 2.3 Hanya saat build/rilis

| Dependensi | Peran | Bila mati |
|---|---|---|
| **GitHub Actions** | Membangun 3 image (`runner`, `migrator`, `backup`) | Tidak bisa rilis. Produksi tetap jalan. ⚠ Jangan membangun di server — lihat dok 07 |
| **GHCR** | Menyimpan image + tag `sha-<pendek>` | Tidak bisa `pull`; **rollback juga ikut hilang** |
| **npm registry** (lewat bun) | `bun install --frozen-lockfile` | Build gagal |
| **Docker Hub** | `node:22-bookworm-slim`, `postgres:17-alpine`, `edoburu/pgbouncer`, `oven/bun:1.3` (+ `mariadb:11` sampai #636) | Build gagal; container berjalan tak terpengaruh |

### 2.4 Integrasi yang TIDAK dipanggil runtime

**Accurate Online** (`src/lib/accurate/`) — bukan integrasi API. Berbasis
**EKSPOR laporan** yang diunggah manusia, karena yang diekspor Accurate adalah
**halaman cetak, bukan tabel** (lihat
[`docs/accurate-reference.md` Lampiran B](../accurate-reference.md)). Tidak ada
panggilan jaringan ke Accurate; tidak ada kredensial Accurate.

**e-Faktur / Coretax** (`lib/efaktur.ts`, `scripts/efaktur-platform.ts`) —
pembuatan **berkas** untuk diunggah ke sistem pajak. Tidak ada panggilan API ke
DJP.

## 3. Dependensi internal — graf modul

```mermaid
graph TB
    subgraph L0["Lapis 0 — MURNI (tanpa Prisma / React / next)"]
        A0["authz.ts"]; B0["business-modules.ts"]; C0["company-context.ts"]
        D0["operator/plane.ts"]; E0["posting/rules.ts"]; F0["api-v1.ts"]
        G0["invoice-reminder.ts"]; H0["invoice-due-digest.ts"]; I0["recurring.ts"]
        J0["layout-scale.ts"]; K0["brand/mark.ts"]
    end

    subgraph L1["Lapis 1 — akses data"]
        A1["control-db.ts"]; B1["company-clients.ts"]; C1["current-company.ts"]
        D1["prisma.ts"]; E1["platform-db.ts"]
    end

    subgraph L2["Lapis 2 — penjaga"]
        A2["page-auth.ts"]; B2["auth-guard.ts"]; C2["api-token-guard.ts"]
        D2["authz-effective.ts"]; E2["operator/guard.ts"]; F2["auth.ts"]
    end

    subgraph L3["Lapis 3 — domain"]
        A3["posting/index.ts"]; B3["ledger.ts"]; C3["reports.ts"]
        D3["approvals.ts"]; E3["subscription-lifecycle.ts"]; F3["mailer-core.ts"]
    end

    subgraph L4["Lapis 4 — permukaan"]
        A4["app/(app)/**"]; B4["app/api/**"]; C4["app/(operator)/**"]
    end

    C0 --> C1 --> D1
    A1 --> D2
    A0 --> D2
    B0 --> D2
    D2 --> A2 & B2 & C2
    B1 --> D1
    D1 --> A3 & B3 & C3 & D3
    E0 --> A3
    A3 --> B3
    E1 --> E3
    A2 & B2 & C2 --> A4 & B4
    D0 --> E2 --> C4
    A3 & C3 & D3 --> A4 & B4
    E3 --> F3

    style L0 fill:#eef7ee,stroke:#5a8f5a
    style L2 fill:#e8f0ff,stroke:#4a6fa5
```

### Larangan impor yang DITEGAKKAN TES

Bukan konvensi — tes merah kalau dilanggar:

| Larangan | Penjaga | Kenapa |
|---|---|---|
| `lib/reports.ts`, `lib/ledger.ts`, `lib/posting/*` **tidak boleh** mengimpor `business-modules.ts` | `tests/business-modules-ledger.test.ts` | Modul tidak pernah menggerbangi buku besar; laporan harus tetap rekonsiliasi |
| `lib/operator/plane.ts` **tidak boleh** mengimpor `platform-db.ts` | doktrin #137 | Penjaga & proxy bukan kode penagihan |
| Halaman `(docs)/**` **tidak boleh** memuat penjaga apa pun | `tests/authz-coverage.test.ts`, `tests/docs.test.ts` | `/docs` publik; pembaca anonim tidak boleh memicu satu kueri pun |
| `@ant-design/icons` **tidak boleh** diimpor sebagai default/namespace | `tests/icon-rsc-boundary.test.ts` | Barrel-nya meruntuhkan lapisan RSC |
| `<Link><Button/></Link>` | `tests/anchor-button-nesting.test.ts` | Dua elemen interaktif bersarang |
| `asChild` pada `Button` | `tests/button-no-aschild.test.ts` | Tidak aman dari server component (dicabut #250) |
| Nilai warna mentah di luar `packages/ui/src/theme/antd-tokens.ts` | ESLint `sai/warna-token-antd` (#204) | Satu sumber warna |
| Halaman/route tanpa deklarasi izin | `tests/authz-coverage.test.ts` | Rute tak berpenjaga = lubang |
| Skrip **tidak boleh** mengimpor `server-only` | — (`tsx` mati di atasnya) | Logika produser harus di pustaka murni |

## 4. Hulu & hilir

### Hulu (yang memberi masukan)

| Sumber | Masuk lewat | Dipercaya? |
|---|---|---|
| Peramban pengguna | HTTPS → Traefik → proxy → penjaga | **Tidak** — zod di setiap jalur tulis |
| Webhook Midtrans | `POST /api/billing/webhook` | **Tidak** — tanda tangan SHA-512, gagal-tertutup |
| Integrator API | `Authorization: Bearer sai_…` | **Tidak** — `requireApiToken` + izin |
| Unggahan berkas | `POST /api/upload`, impor master/COA | **Tidak** — validasi tipe & bentuk |
| Dump sistem lama | `subt5236_sai_prod_18july.sql` (manual) | **Tidak** — **tidak melewati penjaga zod**; alasan `conformance` ada |
| Ekspor Accurate | Unggahan manusia | **Tidak** — pengurai sendiri |

### Hilir (yang menerima keluaran)

| Tujuan | Keluar lewat | Isi |
|---|---|---|
| Peramban | HTML/JSON/PDF/XLSX | Data perusahaan |
| **Pelanggan tenant** | SMTP | Faktur + **pengingat jatuh tempo** |
| Anggota tim | SMTP | Undangan, atur-ulang sandi, verifikasi |
| Midtrans | `POST /v2/charge` | Jumlah, id pesanan |
| S3 | `aws s3 cp` | **Seluruh** basis data + dokumen + audit (terenkripsi) |
| Pemantauan luar | `GET /api/health` | ❓ pembacanya belum dipastikan |
| Perayap | `/robots.txt`, `/sitemap.xml`, `/opengraph-image` | Metadata publik |

**Tiga penjaga sebelum satu surel pun keluar ke pelanggan** (`remind:customers`)
— layak dicatat karena ia satu-satunya jalur yang menghubungi orang di luar
organisasi pelanggan:

1. `reminder_enabled` — bawaannya **MATI**.
2. `reminder_tested_at` — **seseorang harus pernah menerima sendiri kalimatnya
   lebih dulu**; tanpa itu penjadwal **menolak**.
3. Kunci unik `(invoice_id, reminder_kind, reminder_due_key)` — putaran kedua
   menabrak constraint **sebelum** `sendMail` dipanggil.

Plus jendela toleransi **2 hari**, yang membuat "aktifkan" tidak pernah menjadi
tombol yang mengirim ratusan surel ke tunggakan lama sekaligus.

## 5. Titik gagal tunggal

```mermaid
graph TD
    SPOF1["<b>PostgreSQL — satu instans</b><br/>+ satu PgBouncer<br/>tanpa replika · tanpa failover<br/>17 buku PT + kendali + platform<br/>di satu volume"]
    SPOF2["<b>app-customer — satu container</b><br/>tanpa replika<br/>(app-operator kini terpisah)"]
    SPOF3["<b>Mesin tunggal</b><br/>~3,6 GB RAM · 6 aplikasi"]
    SPOF4["<b>Traefik — satu instans</b><br/>dipakai 6 aplikasi"]
    SPOF5["<b>Cadangan GAGAL</b><br/>tidak ada salinan luar-mesin"]

    SPOF1 --> I1["Pemadaman total +<br/>⚠ kehilangan data permanen<br/>karena SPOF5"]
    SPOF2 --> I2["Pemadaman sampai restart<br/>(~detik, restart: unless-stopped)"]
    SPOF3 --> I3["Kehilangan mesin = kehilangan<br/>SEMUANYA"]
    SPOF4 --> I4["6 aplikasi tak terjangkau"]
    SPOF5 --> I5["Tidak ada jalan pulang<br/>dari kegagalan apa pun"]

    style SPOF1 fill:#ffeaea,stroke:#b55
    style SPOF5 fill:#ffeaea,stroke:#b55
    style I1 fill:#ffd6d6,stroke:#b55
    style I5 fill:#ffd6d6,stroke:#b55
```

| # | Titik | Dampak | Mitigasi hari ini | Penilaian |
|---|---|---|---|---|
| 1 | **PostgreSQL tunggal** (+ PgBouncer tunggal) | Pemadaman total + kehilangan data | `restart: unless-stopped`, healthcheck, volume bernama | **Kritis** — diperburuk SPOF 5 |
| 2 | **Cadangan gagal** | Tidak ada jalan pulang dari apa pun | Tidak ada. Dump manual hanya bila diingat | **Kritis — P0** |
| 3 | **Mesin tunggal** | Kehilangan semuanya | Tidak ada | Diterima sadar pada skala ini |
| 4 | **`app-customer` tunggal** | Pemadaman enam permukaan pelanggan sampai restart — **konsol operator tidak lagi ikut jatuh** | `restart: unless-stopped` + healthcheck | Dapat diterima |
| 5 | **Traefik tunggal** | 6 aplikasi | Di luar repo ini | Di luar lingkup |
| 6 | **`AUTH_SECRET` tunggal** | Rotasi = seluruh sesi batal | Masa sesi 24 jam | Dapat diterima |
| 7 | **`BACKUP_ENCRYPTION_KEY`** | Kunci hilang = cadangan **tidak bisa dibuka** | ❓ Penyimpanan kunci di luar mesin belum dipastikan | **Perlu dipastikan** |
| 8 | **`SETTINGS_ENCRYPTION_KEY`** | Kunci hilang = sandi SMTP tersimpan tak terbaca | Dapat disetel ulang lewat konsol | Rendah |

Titik 7 layak diperiksa segera: cadangan yang berhasil pun **tidak berguna**
kalau kuncinya hanya ada di `.env` mesin yang hilang bersama datanya.

## 6. Kopling

| Kopling | Ketat? | Catatan |
|---|---|---|
| `app-customer` ↔ PostgreSQL | **Ketat** | Benar — ini aplikasi basis data |
| `app-customer` ↔ kolam klien PT | **Ketat** | `prisma` Proxy menyembunyikan ini dari 120 berkas |
| `job-scheduler`/`job-conformance` ↔ image `migrator` | **Ketat, sengaja** | Image sama = env & `node_modules` sama. **Harganya:** `docker compose build web` TIDAK membangun `migrate` → 2 layanan menjalankan kode basi **tanpa satu pun tanda**. Pelajaran yang terulang beberapa rilis; sekarang CI membangun ketiganya tiap kali |
| Kendali ↔ platform | **Longgar, sengaja** | Tanpa FK. Harganya: butuh rekonsiliasi (`reconcile:platform`) |
| Kendali ↔ buku PT | **Longgar, sengaja** | `database_name` menunjuk, bukan FK |
| Aplikasi ↔ Midtrans | **Longgar** | `PaymentGateway` punya transport MOCK & `manual` |
| Aplikasi ↔ SMTP | **Longgar** | Tiga lapis + transport `file` |
| Aplikasi ↔ S3 | **Longgar** | Hanya `job-backup` yang bicara S3 |
| UI ↔ Ant Design v6 | **Ketat** | Diperketat sengaja #203 (Tailwind dicabut) |

## 7. Tanggung jawab yang terduplikasi

Diamati, bukan ditebak:

| Duplikasi | Bukti | Risiko |
|---|---|---|
| **Dua jalur penyemaian** | `prisma/seed.ts` (baris tanpa jurnal) vs `scripts/seed-demo.ts` (diposting lewat mesin sungguhan) | Rendah — pembedaannya **didokumentasikan** di `package.json` |
| **Dua pembatas laju** | `rate-limit.ts` (memori) + `rate-limit-persistent.ts` (tabel kendali) | Rendah — yang persisten sengaja dipakai ulang `lib/alert.ts` alih-alih menulis peredam kedua |
| **Tiga sumber pengaturan surel** | tenant → platform → env | Rendah — urutannya eksplisit dan diuji |
| ~~Dua alur rilis di CI~~ | ✅ **ditutup 12 Okt 2026** — `build-standalone.yml` dicabut. Tinggal `publish-image.yml` + `verify.yml` |
| ~~Runbook rilis ganda~~ | ✅ **ditutup 12 Okt 2026** — `DOCKER.md` dihapus, 3 `HOSTING*.md` digabung jadi satu di `docs/warisan/`. Yang tersisa di akar: `PRODUCTION.md` (§Updates hidup, §2/§4/§5 ditandai warisan) |
| **Dua definisi migration-apply** | `db:migrate` (satu DB) vs `db:migrate:all` (semua) | Rendah — `db:migrate` **sengaja** dipertahankan & bahayanya ditulis di `package.json` |

Lanjut: [05 API & Komunikasi](./05-API-KOMUNIKASI.md)
