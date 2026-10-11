# ⚠️ WARISAN — penggelaran standalone / PM2 (pra-Docker)

> **Jalur yang HIDUP ada di [`../../PRODUCTION.md`](../../PRODUCTION.md)
> §Updates:** image dibangun di runner GitHub, lalu di server cukup
> `docker compose pull` + `up -d`. **Jangan** ikuti berkas ini untuk server
> produksi yang sekarang.

Berkas ini menggabungkan tiga dokumen yang dulu tinggal di akar repo —
`HOSTING.md`, `HOSTING-LOW-MEMORY.md`, dan `HOSTING-NO-NODE.md` — menjadi satu.
Ketiganya menjelaskan hal yang sama dari tiga sudut, dan tiga berkas di akar
untuk satu jalur yang sudah tidak dipakai adalah tiga tempat yang bisa
membusuk.

## Kenapa masih disimpan

Bukan karena ia direkomendasikan, melainkan karena **perkakasnya masih ada di
repo** dan akan menjadi perkakas tanpa penjelasan kalau dokumennya hilang:

| Perkakas | Fungsinya |
|---|---|
| `scripts/package-standalone.sh` | Merakit bundel `dist/sai-standalone` |
| `scripts/start-production.sh` | `bun run start:prod` |
| `scripts/start-low-memory.sh` | `bun run start:low-mem` |
| `scripts/setup-production.sh` | `bun run setup:prod` ⚠ **membangun DI SERVER** |
| `ecosystem.config.cjs` | Konfigurasi PM2 |
| `ecosystem.config.low-memory.cjs` | Idem, batas heap lebih kecil |
| `.github/workflows/build-standalone.yml` | Membangun bundel zip di CI tiap push ke `main` |

**Begitu perkakas itu dicabut, berkas ini ikut.** Keduanya satu klaster;
menghapus salah satu saja meninggalkan setengah yang menggantung.

## Bentuknya

Tiga cara menjalankan tanpa Docker, dari yang paling sederhana:

**1. Proyek penuh di server (dulu `HOSTING.md`).** VPS/hosting ber-SSH, Node
20.19+/22.12+/24+ dan Bun 1.2+. `bun run setup:prod` lalu `bun run start:prod`,
atau PM2 lewat `ecosystem.config.cjs`.

**2. Mesin memori kecil (dulu `HOSTING-LOW-MEMORY.md`).** Sama, tetapi batas
heap diperkecil lewat `ecosystem.config.low-memory.cjs` /
`bun run start:low-mem`.

**3. Hosting tanpa Node (dulu `HOSTING-NO-NODE.md`).** Bundel standalone
dirakit di CI (`build-standalone.yml` → artefak `sai-standalone`, ~43 MB),
diunduh, lalu diunggah ke hosting.

## ⚠ Dua hal yang membuat jalur ini berhenti dipakai

**`setup:prod` membangun DI SERVER.** Di kotak produksi sekarang itu terukur
~19 menit dengan iowait 58–92%, dan separuh health probe menjawab 503 selama
rebuild dengan memori bebas turun ke ~41 MB. Dua build bersamaan pernah
menghasilkan OOM (exit 137). Alasan lengkapnya di `AGENTS.md` dan
`PRODUCTION.md` §Updates.

**Tidak ada pemisahan bidang operator.** Susunan Docker sekarang menjalankan
konsol operator sebagai container tersendiri di hostname sendiri
(`app-operator`); jalur standalone tidak punya padanannya.

## Kalau benar-benar perlu

Baca `scripts/package-standalone.sh` dan `scripts/start-production.sh` langsung
— keduanya pendek dan menyebut langkahnya sendiri. Dokumen ini sengaja tidak
mengulang perintahnya baris demi baris: perintah yang disalin ke dokumen yang
tidak dipakai adalah perintah yang akan menyimpang dari skripnya.
