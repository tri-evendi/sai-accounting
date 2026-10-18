# 14 — Konsol Operator & Platform Pelanggan: satu kode, dan apa yang terjadi bila dipisah

> **Status:** asesmen + rencana. **Fase 0 SELESAI 17 Okt 2026** (§4): arah
> dependensi kini ditegakkan `tests/operator-dependency-direction.test.ts`, dan
> dua penyeberangan dibereskan. **Fase 1a SELESAI 17 Okt 2026** atas
> permintaan pemilik (§5): workspace bun + `packages/db` (`@sai/db`). **Fase 1b
> SELESAI 17 Okt 2026** (malam): skema + klien hasil bangkitan di `packages/db`,
> diimpor lewat `@sai/db/client/{company,control,platform}`. **Fase 2 SELESAI
> 18 Okt 2026**: `@sai/core`, `@sai/ui`, `@sai/billing` (lihat §Fase 2).
> **Fase 3a–3c SELESAI 18 Okt 2026** (lihat §Fase 3): tiga sisi domain diputus,
> `@sai/platform` lahir, dan permukaan operator kini hanya bergantung pada
> dirinya sendiri + paket. **Belum:** 3d (`apps/operator` lahir) + Fase 4 (dua
> image) — keduanya HARUS dirilis bersama. Timbangan di §2 tidak
> berubah; yang berubah adalah keputusannya, yang memang milik pemilik.
>
> **Koreksi angka 17 Okt 2026:** porsi operator **5,6 %**, bukan 2,9 % (§1).
> Penyebut lama ikut menghitung `src/generated/`. Putusannya tidak berubah.
>
> **Pengukuran ulang 17 Okt 2026 (sore), sesudah 10 fitur konsol:**
> **7,8 %** — 58 berkas / 14.403 baris dari 873 / 185.147 (penyebut yang sama:
> `src/` + `packages/` tanpa `src/generated/`). Naik 2,2 poin dalam sehari;
> pemicu §6 (15 %) belum, tetapi kecepatannya kini terlihat.
>
> **Diukur:** 15 Oktober 2026, di produksi. Setiap angka di dokumen ini adalah
> **potret bertanggal** — ia akan bergerak.
>
> Melanjutkan [10 — Portabilitas & Pemisahan Layanan](10-PORTABILITAS-DAN-PEMISAHAN.md) §3,
> yang memutuskan pemisahan **container**. Dokumen ini menjawab pertanyaan
> berikutnya: pemisahan **kode**.

---

## 0. Putusan ringkas

| Pertanyaan | Jawaban |
|---|---|
| Kenapa konsol operator masih satu kode dengan platform pelanggan? | Karena pemisahan yang **menanggung keamanan** sudah ada di tempat lain — di batas permintaan (host + sesi), bukan di batas artefak. Memisah kode tidak menambah satu pun pagar baru di sana. |
| Apakah itu disengaja? | Ya. [§3 dokumen 10](10-PORTABILITAS-DAN-PEMISAHAN.md) memilihnya secara eksplisit dan mencatat kekurangannya apa adanya: *"Image operator tetap memuat seluruh kode pelanggan."* |
| Haruskah dipisah menjadi monorepo sekarang? | **Tidak.** Manfaat keamanannya nyata tapi kecil; biayanya nyata dan berulang setiap hari. Rasio itu belum berbalik. |
| Kalau begitu apa yang dikerjakan sekarang? | **Fase 0** — satu penjaga arah dependensi, dan memindahkan satu modul yang salah tempat. Dua hari kerja, mengambil sebagian besar manfaat yang bisa diambil tanpa memecah apa pun. |
| Kapan jawabannya berubah? | Lihat [§6 Pemicu](#6-pemicu-yang-akan-mengubah-jawaban). Semuanya dapat diamati; tidak satu pun soal selera. |

---

## 1. Keadaan hari ini, terukur

### Yang SUDAH terpisah

Pemisahan operator **bukan rencana** — ia sudah berjalan di produksi, dan ia
berlapis:

| Lapis | Bentuknya | Ditegakkan di |
|---|---|---|
| **Hostname** | Konsol hidup di host sendiri (`OPERATOR_HOST`). Host pelanggan → `/operator` = 404. Host operator → rute pelanggan = 404. | `src/proxy.ts` + `src/lib/operator/plane.ts` |
| **Tanpa env → mati** | `OPERATOR_HOST` tidak diset → `/operator` 404 di host **mana pun**. Lalai menyetelnya gagal ke arah tertutup. | `configuredOperatorHost()` |
| **Sesi** | Sesi operator terpisah dari sesi pelanggan, diverifikasi kriptografis, + TOTP. | `lib/operator/session.ts`, `guard.ts`, `totp.ts` |
| **Proses** | Dua container, memori & log & restart sendiri-sendiri. | `app-customer` / `app-operator` |
| **Volume** | Volume `documents` **tidak** dipasang di container operator. | `docker-compose.yml` |

### Yang TIDAK terpisah

Satu hal, dan dokumen 10 sudah menyebutnya tanpa dibungkus:

> **Image operator tetap memuat seluruh kode pelanggan.** Route group Next.js
> tidak bisa dieksklusi saat build, jadi ini isolasi **proses**, bukan eliminasi
> kode.

Terukur 15 Okt 2026:

```
app-customer  →  ghcr.io/tri-evendi/sai-accounting:latest   (729 MB)
app-operator  →  ghcr.io/tri-evendi/sai-accounting:latest   (729 MB)   ← SAMA
```

### Seberapa besar sebenarnya bagian "operator" itu?

| Bagian | Berkas | Baris |
|---|---:|---:|
| `src/app/(app)/(operator)` | 18 | 3.837 |
| `src/lib/operator` | 10 | 2.710 |
| `src/components/operator` | 6 | 3.455 |
| **Jumlah khas-operator** | **34** | **10.002** |
| `src/` tulisan tangan (tanpa `src/generated/`) | 840 | 179.835 |
| **Porsi operator** | 4,0 % | **5,6 %** |

*Diukur ulang 17 Okt 2026, sesudah Fase 0 (`lib/operator` turun ~200 baris
karena `changeTenantPlan` pindah ke `lib/billing`).*

> **⚠ Koreksi.** Potret 15 Okt menulis 952 berkas / 357.104 baris / **2,9 %**.
> Penyebut itu ikut menghitung `src/generated/`: klien Prisma hasil bangkitan,
> 113 berkas dan 177.335 baris, yang bahkan tidak ada di git. Itu bukan kode
> yang ditulis, dibaca, atau dipindahkan siapa pun, jadi ia tidak boleh masuk
> penyebut porsi. Angka yang benar hampir **dua kali lipat**. Putusannya tetap,
> karena pemicu §6 ada di ~15 %, tetapi jaraknya ke pemicu separuh dari yang
> dikira.
>
> Ukur ulang dengan:
> `find src -path src/generated -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 cat | wc -l`

Angka inilah yang membentuk seluruh putusan di dokumen ini. **Yang dipisah
adalah 5,6 % dari kode, dan 94,4 % sisanya harus dibawa ke kedua sisi** — karena
yang dipakai bersama bukan fitur, melainkan fondasi: i18n, tema, format uang,
basis data kendali, konstanta.

Dari 33 modul `@/lib/*` yang diimpor permukaan operator, **12 dipakai bersama**
permukaan pelanggan:

```
constants          control-db        i18n/client       i18n/dictionary
i18n/server        layout-scale      money-format      payment-gateway
platform-constants site-settings     theme/antd-tokens utils
```

Tidak satu pun dari dua belas itu "kebetulan". Semuanya infrastruktur yang
memang harus satu — dan karena itu semuanya akan menjadi *package* bersama pada
hari pemisahan. Memecah aplikasi **tidak** memecah ini; ia hanya memindahkan
batasnya dan menambah satu lapisan versi di antaranya.

---

## 2. Kenapa jawabannya "belum", bukan "tidak pernah"

### Yang akan DIDAPAT dari pemisahan

1. **Eliminasi kode, bukan sekadar isolasi proses.** Satu-satunya kekurangan
   yang dicatat §3 dokumen 10 akan tertutup: image operator berhenti memuat
   pembukuan 17 PT.
2. **Permukaan serangan per image lebih kecil.** Kerentanan di dependensi yang
   hanya dipakai permukaan pelanggan berhenti hadir di binari operator.
3. **Arah dependensi ditegakkan compiler, bukan kedisiplinan.** Hari ini tidak
   ada yang menghentikan halaman pelanggan mengimpor `lib/operator/*` — dan
   **dua sudah melakukannya** (§3).
4. **Irama gelar terpisah.** Hari ini restart sudah terpisah; *build* belum.

### Yang akan DIBAYAR, setiap hari

1. **Dua build Next.js.** Satu build sekarang ≈ 10 menit. Dua aplikasi berarti
   dua, dan keduanya menarik `packages/*` yang sama. Ini biaya **CI**, bukan
   biaya server — tapi ia dibayar di setiap PR, selamanya.
2. **Dua image untuk disimpan, ditarik, dan diperiksa.** Ritual rilis
   bertambah satu layanan yang harus dibuktikan image-nya sesudah gelar —
   dan pemeriksaan "image TIAP layanan" sudah pernah menangkap kesalahan.
3. **Pergeseran versi menjadi mungkin.** Dua aplikasi yang menulis ke basis data
   yang sama bisa berada pada migrasi yang berbeda. Hari ini keadaan itu
   **tidak bisa terjadi** — satu image berarti satu versi skema. Ini bukan biaya
   teoretis: ia adalah kelas bug baru yang hari ini mustahil.
4. **Pekerjaan satu kali yang besar.** Lihat [§5](#5-rencana-pelaksanaan-bila-pemicunya-muncul) — 12 modul
   bersama harus pindah ke *package*, tiga klien Prisma harus dibagi, dan tiap
   langkah harus menjaga `bun run verify` tetap hijau.

### Timbangannya

Manfaat 1 dan 2 **nyata**, dan keduanya soal keamanan. Tetapi keduanya
melindungi dari **penyerang yang sudah bisa menjalankan kode di dalam container
operator** — dan terhadap penyerang itu, batas yang menahan hari ini (host,
sesi, TOTP, volume) sudah runtuh lebih dulu. Pemisahan kode mempersempit apa
yang bisa ia capai *setelah* masuk; ia tidak membuatnya lebih sulit masuk.

Manfaat 3 bisa diambil **hari ini, tanpa memecah apa pun**, dengan satu tes.
Itulah Fase 0.

Biaya 3 adalah yang paling sering diremehkan, dan ia bergerak ke arah yang
salah: platform ini melayani 17 buku PT pada satu skema bersama. Dua binari yang
boleh berbeda versi di atas satu skema adalah tukar-tambah yang **memperburuk**
properti terkuat arsitektur ini hari ini.

**Jadi: jangan sekarang.**

---

## 3. Satu temuan yang tidak boleh ikut menunggu

> **✅ DIBERESKAN 17 Okt 2026 (Fase 0).** `changeTenantPlan`, `planChangeApplier`,
> `QuotaWarning`, `ChangePlanResult`, tipe deps/aktor, dan `auditActor` pindah ke
> **`src/lib/billing/change-tenant-plan.ts`**. Nama berkasnya sengaja BUKAN
> `plan-change.ts` seperti usulan di bawah: `src/lib/plan-change.ts` sudah ada
> dengan tugas lain (kuotasi murni, tanpa I/O), dan dua berkas bernama sama
> dengan tugas berbeda adalah persis kebingungan yang hendak dihapus di sini.
> `writes.ts` tidak mengekspor ulang. Semua pemanggil (konsol, skrip
> `change-plan`, dua rute, tes) mengimpor dari sumbernya, dan `OperatorWriteDeps`
> / `OperatorActor` tinggal sebagai alias tipe untuk aksi operator lainnya.
> Tanpa perubahan perilaku, tanpa migration.
>
> ⚠ Satu jebakan yang ikut diperbaiki: `tests/plan-change-contact-only.test.ts`
> me-*mock* `@/lib/operator/writes`. Kalau hanya rutenya yang diubah, mock itu
> diam-diam berhenti berlaku dan tesnya memanggil `changeTenantPlan` asli.
>
> **Temuan kedua yang tidak tercatat di sini sebelumnya:** konsol operator
> (`operator/page.tsx`) mengimpor `components/dashboard/stat-card`, komponen
> generik (hanya bergantung pada `components/ui/*`) yang tinggal di folder milik
> buku besar. Pola yang sama, arah sebaliknya. Dipindah ke
> **`components/ui/stat-card.tsx`**.

Dua berkas di permukaan **pelanggan** mengimpor dari `lib/operator` *(keadaan 15 Okt)*:

```
src/app/api/billing/webhook/route.ts:28        import { planChangeApplier } from "@/lib/operator/writes";
src/app/api/tenant/billing/plan-change/route.ts:40  import { changeTenantPlan }  from "@/lib/operator/writes";
```

Ini **bukan pelanggaran batas keamanan** — keduanya rute pelanggan yang sah yang
memang mengubah langganan, dan penjaganya ada di rutenya masing-masing. Tapi ia
menandakan sesuatu yang lain, dan itu yang penting:

> `changeTenantPlan` **bukan logika operator**. Ia logika **penagihan** yang
> kebetulan pertama kali ditulis untuk konsol operator, lalu dipakai ulang dari
> sisi pelanggan tanpa pernah berpindah tempat.

Namanya menyembunyikan kenyataan bahwa ia dipakai bersama. Konsekuensinya hari
ini kecil (satu pembaca bingung); konsekuensinya pada hari pemisahan besar
(modul ini akan tampak "milik operator" dan ikut pindah ke sisi operator,
memutus dua rute pelanggan).

**Tindakan (Fase 0):** pindahkan `changeTenantPlan` + `planChangeApplier` ke
`src/lib/billing/plan-change.ts`, biarkan `lib/operator/writes.ts`
mengekspor-ulang bila perlu. Tanpa perubahan perilaku, tanpa migration.

---

## 4. Fase 0 — ✅ SELESAI 17 Okt 2026

| Butir | Hasil |
|---|---|
| 0.1 Penjaga arah dependensi | `tests/operator-dependency-direction.test.ts`: tiga aturan + daftar putih satu entri (`proxy.ts → plane`). Impor diselesaikan sebagai **path** (alias dan relatif), komentar dibuang. Entri daftar putih yang tak terpakai membuat tes merah. **Dibuktikan merah**: mengembalikan impor lama (lewat path relatif `../../../../lib/operator/writes`) dan impor `components/dashboard/*` dari konsol, keduanya tertangkap |
| 0.2 Pindahkan `changeTenantPlan` | Ke `lib/billing/change-tenant-plan.ts` (lihat §3 untuk kenapa namanya berbeda) |
| 0.3 Catat porsinya | Di [README arsitektur](./README.md), dengan angka yang dikoreksi: 5,6 % |
| Tambahan | `StatCard` → `components/ui/stat-card.tsx` (temuan kedua §3) |

Aturan yang ditegakkan, sedikit lebih luas daripada sketsa di bawah: **apa pun**
di luar permukaan operator dilarang mengimpor ke dalamnya (bukan hanya
`(dashboard)` dan bukan hanya delapan modul), dan permukaan operator hanya boleh
memakai `components/ui/*` + `components/operator/*`. Daftar putih yang pendek
lebih mudah dijaga daripada daftar hitam yang harus diingat diperbarui.
`scripts/` di luar cakupan: skrip CLI adalah jalur pemulihan operator.

*Rancangan aslinya (15 Okt), dibiarkan sebagai catatan:*

Dua hari kerja. Mengambil manfaat 3 seluruhnya, dan menyiapkan manfaat 1–2
tanpa membayar satu pun biayanya.

### 0.1 Penjaga arah dependensi

Satu tes yang menyatakan aturannya sebagai aturan, bukan sebagai kebiasaan:

```
(operator)  →  boleh impor  lib/*, components/ui/*, lib/operator/*
(dashboard) → TIDAK boleh impor  lib/operator/guard, session, totp,
                                 credentials, store, nav, attention, audit
lib/operator/*  →  TIDAK boleh impor  app/(app)/(dashboard)/*
```

Daftar putihnya **eksplisit dan pendek** (`plane.ts` dibolehkan — `proxy.ts`
memang harus memutuskan bidang; `writes.ts` dicabut dari daftar begitu §3
dikerjakan). Bentuknya mengikuti `tests/adapter-dari-url.test.ts`: pindai
berkas, buang komentar lebih dulu — tes yang menghukum dokumentasi yang baik
akan membuat orang menghapus dokumentasinya.

**Yang dibeli tes ini:** pada hari pemisahan benar-benar dikerjakan, arah
dependensinya sudah bersih. Tanpa itu, Fase 1 dimulai dengan arkeologi.

### 0.2 Pindahkan `changeTenantPlan` ke `lib/billing`

Seperti §3.

### 0.3 Catat porsinya di README arsitektur

Angka 2,9 % itu yang membuat seluruh putusan ini bisa ditinjau ulang oleh orang
lain tanpa mengukur ulang. Ia harus ada di tempat yang dibaca, bukan hanya di
sini.

---

## 5. Rencana pelaksanaan, bila pemicunya muncul

Urutannya dipilih supaya **setiap fase bisa berhenti di situ** dan
meninggalkan repo dalam keadaan yang lebih baik, bukan setengah jadi. Tidak ada
fase yang mengharuskan fase berikutnya.

### Bentuk akhir yang dituju

```
sai-accounting/
├── apps/
│   ├── customer/          Next.js — (marketing) (auth) (tenant) (dashboard) (setup) (docs)
│   └── operator/          Next.js — (operator) saja
├── packages/
│   ├── db/                3 skema Prisma + klien + db-adapter/db-engine/db-server
│   ├── core/              authz, i18n, money-format, constants, utils, control-db
│   ├── ui/                components/ui (Ant Design v6) + theme/antd-tokens + layout-scale
│   └── billing/           payment-gateway, plan-change, platform-constants
├── prisma/                migration SQL — TIDAK pindah
├── scripts/               TIDAK pindah; ia bicara ke packages/db
└── docker-compose.yml
```

**Yang sengaja TIDAK pindah:** `prisma/migrations/**`. Memindahkan direktori
migration yang sudah diterapkan berarti mempertaruhkan `migrate deploy` pada 19
basis data produksi untuk alasan kerapian. Jangan.

### Fase 1 — workspace, tanpa memecah aplikasi (≈ 3 hari)

Tambahkan `workspaces` ke `package.json`; buat `packages/*` **kosong**;
pindahkan `src/lib/db-*` + skema Prisma ke `packages/db`. Aplikasi tetap
**satu**, dan ia mengimpor dari `packages/db`.

- **Gerbang:** `bun run verify` EXIT=0 **dan** `bun run build` EXIT=0.
- **Risiko utama:** 28 skrip berjalan di bawah `tsx`, yang tidak selalu
  menyelesaikan alias tsconfig. Ini **sudah menggigit** (lihat
  `tests/adapter-dari-url.test.ts`: pabrik adapter wajib memakai impor relatif).
  Setiap skrip harus dijalankan sungguhan, bukan hanya di-`tsc`.
- **Bisa berhenti di sini?** Ya, dan hasilnya tetap perbaikan.

#### Fase 1a — ✅ SELESAI 17 Okt 2026

| Apa | Hasil |
|---|---|
| `workspaces: ["packages/*"]` di `package.json` | bun membuat symlink `node_modules/@sai/db → packages/db` |
| `src/lib/db-{engine,engine-runtime,adapter,server}.ts` | pindah ke `packages/db/src/{engine,engine-runtime,adapter,server}.ts`, diekspor sebagai subpath `@sai/db/<nama>` |
| 40 pengimpor (28 skrip memakai `../src/lib/db-adapter`) | semuanya mengimpor `@sai/db/*` |
| `next.config.ts` | `transpilePackages: ["@sai/db"]` (paketnya dikirim sebagai SUMBER TS, tanpa langkah build) |
| `Dockerfile` tahap `deps` | menyalin `packages/db/package.json` sebelum `bun install --frozen-lockfile` |
| Penjaga baru `tests/packages-mandiri.test.ts` | paket tidak boleh mengimpor `@/…` atau keluar lewat path relatif; tiap subpath `exports` menunjuk berkas yang ada; Dockerfile menyalin manifes SETIAP paket |

Risiko utama di atas dibuktikan saat BERJALAN: keempat subpath dimuat oleh
`tsx` dan oleh `bun` dari sebuah skrip di `scripts/`, bukan hanya oleh `tsc`.

#### Fase 1b — ✅ SELESAI 17 Okt 2026

| Apa | Hasil |
|---|---|
| `prisma/schema.prisma`, `prisma/{control,platform}/schema.prisma` | pindah ke `packages/db/prisma/{company,control,platform}/schema.prisma`; isinya tidak berubah selain baris `output` |
| `src/generated/{prisma,control,platform}` | kini `packages/db/generated/{company,control,platform}` (gitignored, dibangkitkan `bun run db:generate` dan tahap build Docker seperti sebelumnya) |
| 78 pengimpor (`@/generated/*` di aplikasi, `../src/generated/*/client.js` di 29 skrip) | semuanya `@sai/db/client/{company,control,platform}`, satu bentuk untuk Next, `tsx`, dan `bun` |
| `prisma*.config.ts` | tetap di akar (perintah CLI dan Dockerfile tidak berubah); `schema:` menunjuk ke paket, `migrations.path` tetap `prisma/postgresql/<db>` |
| `.gitignore`, `.dockerignore`, ESLint | jalur baru ditambahkan; `src/generated` tetap diabaikan demi checkout/worktree lama |
| Penjaga baru `tests/klien-prisma-dari-paket.test.ts` | menolak impor jalur lama, skema yatim di `prisma/`, dan subpath klien yang tidak diekspor; dibuktikan merah dengan satu impor `@/generated/…` |

Dibuktikan saat BERJALAN, bukan hanya `tsc`: ketiga subpath klien dimuat oleh
`tsx` dan oleh `bun` dari skrip di `scripts/`; `prisma validate` lolos untuk
ketiga config. Yang tetap di `prisma/`: `postgresql/**` (migration yang
diterapkan), arsip MariaDB, dan `seed.ts`.

### Fase 2 — `packages/core` + `packages/ui` (≈ 5 hari)

Pindahkan 12 modul bersama (§1) + `components/ui`. Satu *package* per gerakan,
`verify` hijau di antara tiap gerakan.

- **Risiko utama:** `components/ui` adalah permukaan desain yang dijaga
  `MASTER.md` dan beberapa tes bentuk (`anchor-button-nesting`,
  `button-no-aschild`, ESLint `sai/warna-token-antd`). Jalur berkas yang dipindai
  tes-tes itu **harus ikut diperbarui**, dan tes yang memindai jalur yang tidak
  ada lagi akan **lulus dengan nol pelanggar** — yaitu gagal secara diam-diam.
  Setiap tes bentuk wajib punya asersi "ada berkas untuk diperiksa".
- **Bisa berhenti di sini?** Ya.

#### Fase 2 — ✅ SELESAI 18 Okt 2026 (empat gerakan, `verify` hijau di antara tiap gerakan)

| Gerakan | Paket | Isi |
|---|---|---|
| 2a | `@sai/core` | `authz` (matriks BAWAAN), `constants`, `control-db`, `money-format`, `utils` |
| 2b | `@sai/core/i18n/*` | `config`, `dictionary`, `load`, `client`, `validation`, `locale-cookie`, kamus `id/en/zh.json` |
| 2c | `@sai/ui` | 39 primitif `components/ui`, tema (`antd-tokens`, `config`, `tone-recipe`), `layout-scale`, `icons`, `table-sort`, `brand/mark`; plus `labels` & `tenant-routes` ke `@sai/core` |
| 2d | `@sai/billing` | `payment-gateway`, `plan-change`, `plan-copy`, `plan-stacking`, `platform-constants` |

Ukuran per 18 Okt: core 13 berkas / 2.510 baris, ui 46 / 9.454, billing 5 / 944,
db 4 / 656. Setiap pindahan **dihitung penutupan dependensinya**, bukan ditebak:
yang bergantung pada modul aplikasi tetap tinggal.

**Yang TETAP di aplikasi, dan kenapa.** `i18n/server.ts` (membaca timpaan isi
situs dari basis data platform), `i18n/actions.ts` & `theme/{client,server,actions}`
(server action), `i18n/labels.ts`; enam pembungkus di `src/components/ui` (lima sejak 3a — `confirm-dialog` menyusul ke `@sai/ui`)
(`confirm-dialog`, `disclosure-section`, `locale-toggle`,
`server-searchable-select`, `status-column`, `theme-toggle`); penulis penagihan
(`payment-webhook`, `plan-catalog`, `billing/change-tenant-plan`,
`billing/platform-efaktur`).

**Risiko utama di atas TERJADI, dan ditutup.** Sembilan pemindai menyapu `src/`
saja; begitu primitif pindah, mereka akan lulus dengan nol pelanggar. Semuanya
kini memakai `tests/akar-sumber.ts` (akar `src/` + `packages/*/src`, dan
`uraiPaket()` untuk penjaga yang membangun graf impor). ESLint `sai/*`
diperluas ke `packages/*/src/**`. Dibuktikan dengan pelanggaran yang DITANAM di
`packages/ui`: sarang Link>Button, warna mentah, modul client baru, dan
client → `server-only` lewat `@sai/ui/*` — keempatnya merah.
`landing-boundary` dulu melewatkan `@sai/*` sebagai pihak ketiga; kini tidak.

**Yang ditemukan — dan mengubah perkiraan Fase 3.** Dari 12 modul bersama di
§1, **10 kini di paket**; `i18n/server` dan `site-settings` tidak (keduanya
membaca basis data platform). Lebih penting: sesudah 10 fitur konsol 17 Okt,
permukaan operator mengimpor **32 modul aplikasi** di luar `lib/operator`
(`platform-db`, `mailer*`, `subscription-*`, `tenant-*`, `site-content*`,
`status-notices*`, `account-mail`, `invitation-store`, `password-reset-store`,
`rate-limit`, `schema-version`, …). Fase 3 karena itu tidak bisa "memindahkan
`(operator)` + `lib/operator` + `components/operator`" saja: ia butuh satu paket
sisi-server lagi (sebut `@sai/platform`: klien platform, surel, jejak
langganan & tenant, isi situs) — dan itu kode yang MENULIS basis data, jadi
gerbangnya lebih berat daripada Fase 2.

### Fase 3 — `apps/operator` lahir (≈ 4 hari)

Buat aplikasi Next.js kedua; pindahkan `(operator)` + `lib/operator` +
`components/operator` ke sana. `proxy.ts` di sisi operator menyusut drastis —
ia tidak lagi perlu memutuskan bidang, karena bidang lain tidak ada di binari.

- **Yang WAJIB tetap ada:** `plane.ts` **tidak dihapus** dari sisi pelanggan.
  `OPERATOR_HOST` kosong → `/operator` 404 harus tetap berlaku di sana, karena
  itulah yang menahan bila Traefik salah arah.
- **Gerbang tambahan:** pemisahan bidang 200/404/404/307 harus diukur ulang
  terhadap **kedua** aplikasi, bukan hanya satu.
- **Risiko utama:** pergeseran versi (biaya 3, §2). Mulai dari sini, kedua
  aplikasi **wajib** digelar dari tag yang sama, dan ritual rilis harus
  memeriksanya.

#### Fase 3a–3c — ✅ SELESAI 18 Okt 2026: prasyaratnya, bukan aplikasinya

Penutupan dependensi permukaan operator (`(operator)` + `lib/operator` +
`components/operator`) diukur dulu: **54 berkas aplikasi** (termasuk sisi
`import type`), 47 di antaranya runtime. Isinya bukan hanya kode platform —
tiga sisi menyeret kode PEMBUKUAN pelanggan ke konsol yang, menurut doktrinnya,
tidak pernah membuka buku:

| Gerakan | Apa | Hasil |
|---|---|---|
| 3a | Putus tiga sisi: `tax` → `posting/rules` (cukup `round2`, kini di `@sai/core/money-format`); `confirm-dialog` → `form-guards` → `delivery-orders` (cukup `matchesConfirmPhrase`, kini `@sai/ui/confirm-phrase`; dialognya pindah ke `@sai/ui`); `invitation-store` → `users-directory` → `current-company` (upsert keanggotaan dipisah ke `membership-upsert`) | 54 → 42 berkas, perilaku tidak berubah |
| 3b | Modul MURNI dari penutupan → `@sai/core` (19, a.l. `tax`, `efaktur`, `rate-limit`, `site-content`, `status-notices`, `tenant-deletion`) dan `@sai/billing` (`subscription-lifecycle`, `platform-revenue`) | arah diperiksa dulu: tak satu pun calon `core` mengimpor `billing`/platform |
| 3c | Modul SISI-SERVER → paket baru **`@sai/platform`** (20: `platform-db`, surel, `i18n/server`, jejak langganan & tenant, isi situs, `payment-webhook`, `billing/*`) | penutupan tinggal **satu** berkas: `lib/validations/operator` (khusus operator — ikut ke `apps/operator`) |

Penjaga yang lahir di sepanjang jalan: sebelas pemindai lagi beralih ke
`tests/akar-sumber.ts`; daftar-izin pendaratan & `/docs` menyebut PERSIS dua
pembaca dari `@sai/platform` (`i18n/server`, `site-settings`) — lebih ketat
daripada sebelumnya, ketika keduanya lolos sebagai bagian dari `@/lib/`;
`packages-mandiri` menuntut manifes jujur dan graf antarpaket tanpa siklus.
Tiga belas skrip yang mengimpor `@sai/platform` dijalankan sungguhan lewat `tsx`.

#### Fase 3d — belum: `apps/operator` lahir (+ Fase 4, dirilis BERSAMA)

Yang tersisa kini mekanis di sisi kode, tetapi berat di sisi gelar:

- Aplikasi Next kedua butuh kerangkanya sendiri: root layout + provider (AntD,
  tema, i18n), `proxy.ts` versi operator, `next.config.ts`, aset publik.
- Begitu `(operator)` keluar dari aplikasi pelanggan, container `app-operator`
  yang menjalankan image pelanggan berhenti punya konsol. 3d **tidak bisa
  digelar tanpa** Fase 4 (Dockerfile/target kedua, CI membangun dua image,
  compose menarik dua) — keduanya satu rilis, dengan ritual gelar yang
  memeriksa kedua image berasal dari SHA yang sama.

### Fase 4 — dua image (≈ 2 hari)

`Dockerfile` per aplikasi; CI membangun dua; compose menarik dua.

- **Jangan lupa:** `--remove-orphans` pada gelar pertama, pelajaran yang sudah
  dibayar sekali saat `web` menjadi `app-customer`/`app-operator`.
- **Pembuktian:** `docker inspect` image **tiap** layanan sesudah gelar.

### Yang TIDAK dilakukan, pada fase mana pun

- **Memecah repo menjadi dua repo.** Tidak satu pun manfaat di §2 menuntutnya,
  dan ia menambahkan sinkronisasi lintas-repo pada 19 basis data yang berbagi
  satu skema. Monorepo ya; multi-repo tidak.
- **Memecah basis data operator/pelanggan.** Sudah terpisah
  (`sai_control` / `sai_platform` / 17 buku PT) — lihat `docs/MULTI-COMPANY.md`.
- **Memindahkan `prisma/migrations/**`.** Lihat di atas.

---

## 6. Pemicu yang akan mengubah jawaban

Semuanya dapat diamati. Satu saja cukup.

| Pemicu | Kenapa ia membalik timbangannya |
|---|---|
| **Kewajiban kepatuhan** yang menuntut binari operator tidak memuat data/kode penyewa | Manfaat 1 berhenti menjadi "lebih baik" dan menjadi **syarat**. |
| **Deployable operator ketiga** (mis. halaman status publik, portal audit) | Biaya *package* terbayar oleh tiga konsumen, bukan dua. |
| **Dua tim menggelar dengan irama berbeda** | Hari ini satu orang menggelar keduanya; biaya 3 ditanggung oleh orang yang sama yang tahu konteksnya. Dua tim mematahkan asumsi itu. |
| **Porsi operator melewati ~15 % kode** | Pada 7,8 % (17 Okt 2026 sore; 5,6 % pagi harinya, potret 15 Okt menulis 2,9 % karena salah penyebut, lihat §1) pemisahan memindahkan sedikit sekali. Pada 15 % ia memindahkan sesuatu yang nyata. |
| **Waktu build melewati ~20 menit** | Sudah menyakitkan dengan satu aplikasi; dua aplikasi yang bisa dibangun **paralel** mulai menang, bukan kalah. |

**Yang BUKAN pemicu:** "monorepo itu praktik yang baik". Ia bukan praktik, ia
tukar-tambah — dan di repo ini, pada angka hari ini, arah tukar-tambahnya masih
merugikan.

---

## 7. Ringkasan

| | |
|---|---|
| Pemisahan operator **sudah ada** | host + env + sesi + TOTP + proses + volume |
| Yang belum | eliminasi kode — image operator memuat 94,4 % kode yang tidak ia pakai |
| Fase 0 | ✅ **selesai 17 Okt 2026**: penjaga arah dependensi, `changeTenantPlan` → `lib/billing`, `StatCard` → `components/ui` |
| Ditunda | Fase 1–4, ≈ 14 hari kerja, menunggu pemicu |
| Tidak akan dilakukan | dua repo terpisah |
