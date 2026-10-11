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
| [`../DOCKER.md`](../DOCKER.md) | Susunan compose & boot pertama | Aktif (sebagian) |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Perubahan yang terlihat pengguna | **Dibangkitkan** — jangan sunting |
| [`../CLAUDE.md`](../CLAUDE.md) | Penerus ke `AGENTS.md` | Aktif |
| [`../HOSTING.md`](../HOSTING.md) | VPS + PM2 | ⚠️ **Warisan** |
| [`../HOSTING-LOW-MEMORY.md`](../HOSTING-LOW-MEMORY.md) | VPS memori kecil | ⚠️ **Warisan** |
| [`../HOSTING-NO-NODE.md`](../HOSTING-NO-NODE.md) | Hosting tanpa Node | ⚠️ **Warisan** |

### Kenapa `HOSTING*.md` dipertahankan, bukan dihapus

Ketiganya menjelaskan jalur **pra-Docker** dan sudah diberi penanda warisan di
kepalanya masing-masing. Dipertahankan karena `scripts/package-standalone.sh`
dan `ecosystem.config*.cjs` **masih ada di repo** dan masih merujuknya — menghapus
dokumennya akan meninggalkan skrip yang tidak dijelaskan apa pun. Kalau kelak
skrip itu dicabut, ketiga berkas ini ikut.

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
