# 14 — Monorepo: konsol operator & platform pelanggan — selesai 18 Okt 2026

> Keadaan per 18 Okt 2026 (`main@ca0cd038`) · [indeks](./README.md)
>
> Dokumen ini dulu berupa asesmen (15 Okt, putusan "belum"), lalu rencana fase.
> Semua fase sudah dijalankan dan di-deploy. Yang tersisa di sini: bentuk akhir,
> guard-nya, keputusan yang masih berlaku, dan riwayat singkat. Timbangan
> untung-rugi lengkap dan pengukuran porsi operator per fase ada di riwayat git
> berkas ini. Pemisahan container sebelumnya: [dok 10 §3](./10-PORTABILITAS-DAN-PEMISAHAN.md).

## 1. Keadaan akhir

```
sai-accounting/
├── src/                 aplikasi PELANGGAN (Next.js) — (marketing) (auth) (tenant) (dashboard) (setup) (docs)
├── apps/operator/       KONSOL OPERATOR (Next.js) — (operator), lib/operator, components/operator, validations/operator
├── packages/
│   ├── db/              @sai/db — 3 skema Prisma + klien bangkitan (generated/, gitignored) + engine/adapter/server
│   ├── core/            @sai/core — authz, constants, control-db, money-format, i18n inti, operator-plane, security-headers, modul murni platform
│   ├── ui/              @sai/ui — primitif Ant Design v6, tema, layout-scale, ikon, RootDocument & provider
│   ├── billing/         @sai/billing — payment-gateway, plan-change, platform-constants, subscription-lifecycle, platform-revenue
│   └── platform/        @sai/platform — sisi-server platform: platform-db, surel, i18n/server, site-settings, jejak tenant & langganan, billing/*
├── prisma/              migration SQL (postgresql/* aktif + arsip MariaDB) + seed.ts — TIDAK pindah
├── prisma*.config.ts    di akar; `schema:` menunjuk packages/db/prisma/<db>/schema.prisma
└── scripts/             TIDAK pindah; mengimpor @sai/*
```

| | |
|---|---|
| Alias | `@/*` = `src/*` · `@op/*` = `apps/operator/src/*` (di konsol, `@/` tidak terselesaikan) · `@sai/<paket>/*` lewat workspace bun |
| Paket | dikirim sebagai sumber TS, tanpa langkah build: `transpilePackages: ["@sai/db", "@sai/core", "@sai/ui", "@sai/billing", "@sai/platform"]` di kedua `next.config.ts` |
| Image | empat, dari satu commit (`publish-image.yml`): `sai-accounting` (target `runner`), `-operator` (`runner-operator`), `-migrator`, `-backup` |
| Deploy | `docker compose pull` → `migrate` → `up -d`; sesudahnya periksa bahwa image tiap layanan berasal dari `sha-` yang sama |
| Plane | konsol di `ops.saiaccounting.id` tanpa prefix `/operator`; plane ditentukan host saja. `apps/operator/src/proxy.ts`: host lain atau `OPERATOR_HOST` kosong → 404; tanpa sesi → `/login`. `/operator` dan `/operator/*` → 308 ke jalur tanpa prefix (`apps/operator/next.config.ts`) |
| Sisi pelanggan | `src/proxy.ts` tetap memakai `@sai/core/operator-plane`: host operator yang sampai ke aplikasi pelanggan (Traefik salah arah) → 404; aplikasi pelanggan tidak punya rute operator |
| Volume konsol | hanya `audit` (tinggal arsip berkas lama `.dipindahkan`, aman dicabut), tanpa `documents` |
| Ukuran terukur 18 Okt | standalone konsol 69 MB (20 rute) vs pelanggan 299 MB; build pelanggan tidak memuat rute operator |

## 2. Guard

| Guard | Yang dijaga |
|---|---|
| `tests/operator-dependency-direction.test.ts` | arah dependensi: di luar konsol tidak ada yang mengimpor ke dalamnya (daftar putih kosong sejak Fase 3d); konsol hanya memakai `src/components/ui` + komponen operator. Impor diselesaikan sebagai path, komentar dibuang |
| `tests/packages-mandiri.test.ts` | paket tidak mengimpor `@/…` atau keluar lewat path relatif; tiap subpath `exports` menunjuk berkas yang ada; manifes jujur; graf antarpaket tanpa siklus; Dockerfile menyalin manifes setiap paket |
| `tests/klien-prisma-dari-paket.test.ts` | klien Prisma hanya lewat `@sai/db/client/{company,control,platform}`; menolak `@/generated/*`, skema yatim di `prisma/` |
| `tests/paket-pindahan.test.ts` | modul yang sudah pindah tidak hidup kembali di jalur lama |
| `tests/akar-sumber.ts` | wajib dipakai setiap scanner: akar `src/` + `apps/operator/src` + `packages/*/src`, dan `uraiPaket()` untuk graf impor. Scanner yang hanya menyapu `src/` akan lulus dengan nol pelanggar sesudah berkasnya pindah |
| `tests/landing-boundary.test.ts`, `tests/docs.test.ts` | daftar-izin pembaca `@sai/platform` disebut satu per satu: pendaratan hanya `i18n/server` + `site-settings`, `/docs` hanya `i18n/server` |
| `tests/error-pages.test.ts` | halaman error & 404 ada di kedua aplikasi dan memakai `StatusScreen` yang sama |
| ESLint `sai/*` | diperluas ke `packages/*/src/**` dan `apps/operator/src/**` |

## 3. Keputusan penting

- **Monorepo, bukan multi-repo.** 19 basis data berbagi satu skema. Dua repo
  menambah sinkronisasi lintas-repo tanpa manfaat yang membutuhkannya.
- **Migration & `prisma*.config.ts` tetap di akar.** Memindahkan direktori
  migration yang sudah diterapkan mempertaruhkan `migrate deploy` pada seluruh
  basis data produksi demi kerapian.
- **Aplikasi pelanggan tetap di `src/`**, tidak dipindah ke `apps/customer`:
  diff terkecil, dan setiap jalur yang di-scan tes tetap berlaku.
- **`operator-plane` tetap dipakai sisi pelanggan.** Ia yang menolak permintaan
  bila Traefik salah arah.
- **Kedua image dari `sha-` yang sama.** Dua binari di atas satu skema bisa
  berbeda versi. Satu tag untuk keduanya mencegah kelas bug itu.
- **Logika penagihan bukan logika operator.** `changeTenantPlan` /
  `planChangeApplier` dipakai dua rute pelanggan, jadi tinggal di
  `packages/platform/src/billing/change-tenant-plan.ts`. Konsol mengimpornya,
  tidak sebaliknya. Komponen generik yang dipakai konsol (mis. `StatCard`, kini
  `packages/ui/src/components/stat-card.tsx`) tinggal di `ui`.
- **Yang sengaja tetap di aplikasi pelanggan** (bergantung pada modul aplikasi
  atau berupa server action): `src/lib/i18n/{actions,labels}.ts`,
  `src/lib/plan-catalog.ts`, dan lima pembungkus di `src/components/ui`
  (`disclosure-section`, `locale-toggle`, `server-searchable-select`,
  `status-column`, `theme-toggle`).

## 4. Riwayat singkat

Asesmen 15 Okt memutuskan "belum". Porsi khas-operator kecil (5,6 % pada
17 Okt pagi, 7,8 % sore harinya; pemicunya ~15 %), sedangkan biayanya (dua
build, dua image, risiko perbedaan versi) dibayar setiap hari. Pemilik lalu
memutuskan untuk mengerjakannya. Fase disusun supaya pekerjaan bisa berhenti di
fase mana pun dengan repo tetap lebih baik, dan `verify` hijau di antara tiap
gerakan.

| Fase | Tanggal | Isi |
|---|---|---|
| 0 | 17 Okt | guard arah dependensi; `changeTenantPlan` keluar dari `lib/operator`; `StatCard` ke `ui` |
| 1a | 17 Okt | workspace bun + `@sai/db` (engine/adapter/server) |
| 1b | 17 Okt | skema + klien bangkitan ke `packages/db` |
| 2a–2d | 18 Okt | `@sai/core`, i18n inti, `@sai/ui`, `@sai/billing` |
| 3a–3c | 18 Okt | putus tiga sisi yang menyeret kode pembukuan ke konsol; modul murni ke `core`/`billing`; `@sai/platform` |
| 3d + 4 | 18 Okt | kerangka bersama ke `@sai/ui`; `apps/operator` lahir; image `-operator` |
| hanya-host | 18 Okt | konsol tanpa prefix `/operator`; tautan lama 308; halaman error & 404 di kedua aplikasi |

Satu risiko benar-benar terjadi: scanner yang hanya menyapu `src/` lulus
dengan nol pelanggar begitu berkasnya pindah. Dua puluh scanner dialihkan ke
`tests/akar-sumber.ts`, dan perubahannya dibuktikan dengan pelanggaran yang
sengaja ditanam di dalam paket.

## 5. Rollback lintas 18 Okt

Tag `sha-` sebelum 18 Okt tidak punya image `-operator`, dan `docker-compose.yml`
kini menarik `${SAI_IMAGE}-operator:${SAI_TAG}` untuk `app-operator`. Rollback
ke tag sebelum 18 Okt karena itu juga harus mengembalikan `docker-compose.yml`
lama dari commit yang sama; menukar `SAI_TAG` saja tidak cukup. Rinciannya di
[dok 07 §Rollback](./07-INFRASTRUKTUR-DEPLOY.md#rollback).

## Rujukan lama

Komentar kode masih menyebut nomor versi asesmen: §3 (`changeTenantPlan`
milik penagihan) → kini §3 di atas; §4 (Fase 0, guard arah dependensi) →
§2 dan §4.
