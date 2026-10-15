# 14 — Konsol Operator & Platform Pelanggan: satu kode, dan apa yang terjadi bila dipisah

> **Status:** asesmen + rencana. **Belum dikerjakan, dan rekomendasinya: jangan
> dikerjakan sekarang.** Rencananya ditulis lengkap supaya ia siap pada hari
> pemicunya muncul, bukan supaya ia dikerjakan hari ini.
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
| `src/app/(app)/(operator)` | 18 | 3.838 |
| `src/lib/operator` | 10 | 2.911 |
| `src/components/operator` | 6 | 3.455 |
| **Jumlah khas-operator** | **34** | **≈ 10.200** |
| Seluruh `src/` | 952 | 357.104 |
| **Porsi operator** | 3,6 % | **2,9 %** |

Angka inilah yang membentuk seluruh putusan di dokumen ini. **Yang dipisah
adalah 2,9 % dari kode, dan 97,1 % sisanya harus dibawa ke kedua sisi** — karena
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

Dua berkas di permukaan **pelanggan** mengimpor dari `lib/operator`:

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

## 4. Fase 0 — yang dikerjakan sekarang

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
| **Porsi operator melewati ~15 % kode** | Pada 2,9 % (15 Okt 2026) pemisahan memindahkan hampir tidak ada apa-apa. Pada 15 % ia memindahkan sesuatu yang nyata. |
| **Waktu build melewati ~20 menit** | Sudah menyakitkan dengan satu aplikasi; dua aplikasi yang bisa dibangun **paralel** mulai menang, bukan kalah. |

**Yang BUKAN pemicu:** "monorepo itu praktik yang baik". Ia bukan praktik, ia
tukar-tambah — dan di repo ini, pada angka hari ini, arah tukar-tambahnya masih
merugikan.

---

## 7. Ringkasan

| | |
|---|---|
| Pemisahan operator **sudah ada** | host + env + sesi + TOTP + proses + volume |
| Yang belum | eliminasi kode — image operator memuat 97,1 % kode yang tidak ia pakai |
| Dikerjakan sekarang | **Fase 0** — penjaga arah dependensi, pindahkan `changeTenantPlan` |
| Ditunda | Fase 1–4, ≈ 14 hari kerja, menunggu pemicu |
| Tidak akan dilakukan | dua repo terpisah |
