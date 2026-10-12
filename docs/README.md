# Dokumentasi SAI Accounting

Indeks seluruh dokumen. **Satu dokumen = satu bidang**, dan tiap bidang punya
tepat satu sumber kebenaran — kalau dua berkas menjawab pertanyaan yang sama,
salah satunya basi.

## Mulai dari mana

| Anda | Mulai dari |
|---|---|
| Insinyur baru di proyek ini | [`arsitektur/`](./arsitektur/README.md) → `01` → `02` |
| Mau menggelar rilis | [`../PRODUCTION.md`](../PRODUCTION.md) **§Updates** |
| Menulis kode di repo ini | [`../AGENTS.md`](../AGENTS.md) |
| Menyentuh basis data | [`DATABASE.md`](./DATABASE.md) + [`MULTI-COMPANY.md`](./MULTI-COMPANY.md) |
| Menambah halaman / route | [`RBAC.md`](./RBAC.md) |
| Mengerjakan UI | [`../design-system/sai-accounting/MASTER.md`](../design-system/sai-accounting/MASTER.md) |
| Mengambil keputusan teknis | [`arsitektur/08`](./arsitektur/08-PENILAIAN-ARSITEKTUR.md) → [`09`](./arsitektur/09-PETA-JALAN.md) |
| Mengambil keputusan komersial | [`KOMERSIALISASI.md`](./KOMERSIALISASI.md) + [`PRICING.md`](./PRICING.md) |

## Arsitektur & peta layanan

[**`arsitektur/`**](./arsitektur/README.md) — 11 berkas: potret keadaan yang
berjalan (komponen, layanan, dependensi, API, aliran data, infrastruktur,
penilaian berprioritas, peta jalan, portabilitas/pemisahan). Punya indeksnya
sendiri.

## Dokumen domain

| Dokumen | Bidang | Status |
|---|---|---|
| [`MULTI-COMPANY.md`](./MULTI-COMPANY.md) | Satu basis data per PT (#104) — aturan & migrasi pemasangan | Aktif |
| [`MULTI-TENANT.md`](./MULTI-TENANT.md) | Lapis tenant/SaaS (#133) — model data & pemisahan tiga lapis | Aktif |
| [`RBAC.md`](./RBAC.md) | Matriks izin, empat lapis penegakan, kunci buku | Aktif |
| [`DATABASE.md`](./DATABASE.md) | Standar skema, tipe data, workflow migration | Aktif |
| [`MODUL-USAHA.md`](./MODUL-USAHA.md) | Modul per jenis usaha (#99) | Aktif |
| [`COMPLIANCE.md`](./COMPLIANCE.md) | Retensi, UU PDP, persetujuan ber-versi | Aktif |
| [`KOMERSIALISASI.md`](./KOMERSIALISASI.md) | Strategi go-to-market, fase, gerbangnya | Aktif |
| [`PRICING.md`](./PRICING.md) | Katalog paket & harga — sumber kebenaran | Aktif |
| [`AUDIT-RILIS-UMUM.md`](./AUDIT-RILIS-UMUM.md) | Audit perjalanan pelanggan ujung-ke-ujung | Audit bertanggal |
| [`accurate-reference.md`](./accurate-reference.md) | Peta fitur Accurate Online — referensi pembanding | Referensi |

## Dokumen di akar repo

| Berkas | Isi | Status |
|---|---|---|
| [`../README.md`](../README.md) | Pintu masuk repo, quick start | Aktif |
| [`../AGENTS.md`](../AGENTS.md) | **Aturan kerja** — gerbang verify/build, UI, otorisasi, DB | Aktif · WAJIB |
| [`../PRODUCTION.md`](../PRODUCTION.md) | **Runbook penggelaran** — §Updates adalah jalur yang hidup | Aktif |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Perubahan yang terlihat pengguna | **Dibangkitkan** — jangan sunting |
| [`../CLAUDE.md`](../CLAUDE.md) | Penerus ke `AGENTS.md` | Aktif |

### Apa yang dirapikan 12 Okt 2026, dan kenapa

**Tiga `HOSTING*.md` → satu, lalu nol.** Ketiganya menjelaskan satu jalur yang
sudah tidak dipakai dari tiga sudut, jadi mula-mula digabung jadi
`warisan/PENGGELARAN-STANDALONE.md` (12,4 KB → 3,0 KB). Beberapa jam kemudian
**perkakas** yang dijelaskannya ikut dicabut — dan dokumen yang menjelaskan
perkakas yang tidak ada tidak punya alasan hidup, jadi ia pergi juga. Urutannya
sengaja: digabung dulu supaya terlihat utuh isinya apa, baru diputuskan.

**`DOCKER.md` dihapus.** Isinya tumpang tindih dengan `PRODUCTION.md` (boot
pertama, perintah, admin pertama) dan dengan `arsitektur/07` (jaringan,
volume, probe) — dan §Redeploying-nya justru mengajarkan jalur **build di
server** yang sekarang dilarang. Satu pengukurannya yang berharga
(*"separuh health probe 503, memori bebas ~41 MB saat rebuild"*)
**diselamatkan** ke `PRODUCTION.md` §Updates, sebab itu bukti terkuat aturan
"jangan build di server".

**`README.md` diperbaiki di tiga tempat** yang sudah terlanjur basi: §Production
mengajarkan `setup:prod` (membangun di server), §Scripts menyebut `db:migrate`
tanpa peringatan multi-PT, dan §Security menyebut `data/audit/audit.jsonl`
padahal jejak audit sudah pindah ke tabel.

**Klaster perkakas standalone dicabut** (keputusan pemilik, hari yang sama):
lima skrip (`package-standalone.sh`, `setup-production.sh`,
`start-production.sh`, `start-low-memory.sh`, `deploy-on-server.sh`), dua
`ecosystem.config*.cjs`, `.github/workflows/build-standalone.yml` — yang
menghasilkan artefak **43 MB tiap dorongan ke `main`** tanpa satu pun pemakai —
dan enam skrip `package.json`. `PRODUCTION.md` §2/§4/§5 jadi **nisan**:
judulnya dipertahankan supaya penomoran dan tautan masuk tidak rusak.

**Jebakan yang ketemu saat mencabutnya**, dan ini yang paling berharga:
`bun run deploy` menunjuk ke `scripts/deploy-on-server.sh` — `bun install` +
`next build` **di server** — bukan ke `scripts/deploy.sh`. Perintah dengan nama
paling wajar di repo ini menjalankan jalur yang dilarang, dan tidak ada dokumen
yang pernah menyebutnya. Jalan pintasnya dicabut; `scripts/deploy.sh` tinggal
sebagai pecah-kaca kalau GHCR tak terjangkau.

**Yang TIDAK dihapus, dan kenapa:** `AUDIT-RILIS-UMUM.md` — potret 15 Agustus
dengan metode jelas dan kutipan `berkas:baris`. Itu riwayat, bukan sampah; ia
hanya diberi penanda kesegaran yang menunjuk ke `arsitektur/08` dan `09`.

`CHANGELOG.md` **dibangkitkan** dari `src/lib/changelog.ts`
(`bun run changelog:build`); menyuntingnya langsung akan tertimpa.

## Aturan pemeliharaan

1. **Satu bidang, satu dokumen.** Sebelum menulis dokumen baru, periksa apakah
   bidangnya sudah punya rumah. Dokumen kedua untuk bidang yang sama akan
   menyimpang, dan yang basi tidak mengumumkan dirinya.
2. **Dokumen yang digantikan DITANDAI, bukan dibiarkan.** Penanda warisan di
   kepalanya, dengan penunjuk ke jalur yang hidup. Dokumen basi tanpa penanda
   adalah nasihat yang salah yang terlihat sah.
3. **Rujuk, jangan salin.** Menyalin aturan berarti membuat salinan kedua yang
   akan membusuk tanpa ada yang menyadarinya.
4. **Angka runtime disertai tanggalnya.** Angka tanpa tanggal akan dipercaya
   terlalu lama.
5. **Temuan yang sudah ditutup dipindahkan ke riwayat, bukan dihapus** —
   temuan yang hilang tanpa jejak akan ditemukan ulang oleh orang berikutnya.
