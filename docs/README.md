# Dokumentasi SAI Accounting

Indeks seluruh dokumen. Satu dokumen untuk satu bidang, dan tiap bidang punya
satu sumber kebenaran. Bila dua berkas menjawab pertanyaan yang sama, salah
satunya sudah basi.

## Mulai dari mana

| Anda | Mulai dari |
|---|---|
| Insinyur baru di proyek ini | [`arsitektur/`](./arsitektur/README.md) → `08` → `01` → `04` |
| Mau men-deploy rilis | [`../PRODUCTION.md`](../PRODUCTION.md) **§Updates** |
| Menulis kode di repo ini | [`../AGENTS.md`](../AGENTS.md) |
| Menyentuh basis data | [`DATABASE.md`](./DATABASE.md) + [`MULTI-COMPANY.md`](./MULTI-COMPANY.md) |
| Menambah halaman / route | [`RBAC.md`](./RBAC.md) |
| Mengerjakan konsol operator | `apps/operator/` + [`../AGENTS.md`](../AGENTS.md) (bagian Struktur monorepo) + [`arsitektur/07`](./arsitektur/07-RIWAYAT.md) |
| Mengerjakan UI | [`../design-system/sai-accounting/MASTER.md`](../design-system/sai-accounting/MASTER.md) |
| Mengambil keputusan teknis | [`arsitektur/05`](./arsitektur/05-PENILAIAN.md) |
| Mengambil keputusan komersial | [`KOMERSIALISASI.md`](./KOMERSIALISASI.md) + [`PRICING.md`](./PRICING.md) |

## Arsitektur & peta layanan

[`arsitektur/`](./arsitektur/README.md) — **8 berkas + indeks**: snapshot
keadaan yang berjalan. Arsitektur dan diagramnya (01), layanan & infrastruktur
termasuk tiga bentuk arsitektur infra (02), API dan integrasi (03), ERD +
aliran data + daur hidup status (04), penilaian berprioritas (05), keamanan &
model ancaman (06), riwayat empat pekerjaan besar (07), serta glosarium,
strategi pengujian, target non-fungsional dan katalog rute (08).

## Dokumen domain

| Dokumen | Bidang | Status |
|---|---|---|
| [`MULTI-COMPANY.md`](./MULTI-COMPANY.md) | Satu basis data per PT (#104) — aturan & penambahan PT | Aktif |
| [`MULTI-TENANT.md`](./MULTI-TENANT.md) | Lapis tenant/SaaS (#133) — model data & pemisahan tiga lapis | Aktif |
| [`RBAC.md`](./RBAC.md) | Matriks izin, empat lapis penegakan, kunci buku | Aktif |
| [`DATABASE.md`](./DATABASE.md) | Standar skema, tipe data, workflow migration | Aktif |
| [`MODUL-USAHA.md`](./MODUL-USAHA.md) | Modul per jenis usaha (#99) | Aktif |
| [`COMPLIANCE.md`](./COMPLIANCE.md) | Retensi, UU PDP, persetujuan ber-versi | Aktif |
| [`KOMERSIALISASI.md`](./KOMERSIALISASI.md) | Strategi go-to-market, fase, gate-nya | Aktif |
| [`PRICING.md`](./PRICING.md) | Katalog paket & harga — sumber kebenaran | Aktif |
| [`AUDIT-RILIS-UMUM.md`](./AUDIT-RILIS-UMUM.md) | Audit perjalanan customer ujung-ke-ujung | **Arsip** (snapshot 15 Agu 2026) |
| [`accurate-reference.md`](./accurate-reference.md) | Peta fitur Accurate Online — referensi pembanding | Referensi |

## Dokumen di akar repo

| Berkas | Isi | Status |
|---|---|---|
| [`../README.md`](../README.md) | Pintu masuk repo, quick start | Aktif |
| [`../AGENTS.md`](../AGENTS.md) | **Aturan kerja** — gate verify/build, UI, otorisasi, DB | Aktif · WAJIB |
| [`../PRODUCTION.md`](../PRODUCTION.md) | **Runbook deploy** — §Updates adalah jalur yang hidup | Aktif |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Perubahan yang terlihat pengguna | **Dibangkitkan** — jangan sunting |
| [`../CLAUDE.md`](../CLAUDE.md) | Penerus ke `AGENTS.md` | Aktif |

`DOCKER.md`, ketiga `HOSTING*.md`, dan perkakas standalone/PM2 dicabut 12 Okt
2026; satu-satunya jalur deploy adalah `PRODUCTION.md` §Updates.

`CHANGELOG.md` dibangkitkan dari `src/lib/changelog.ts`
(`bun run changelog:build`); suntingan langsung akan tertimpa.

## Aturan pemeliharaan

1. **Satu bidang, satu dokumen.** Sebelum menulis dokumen baru, periksa apakah
   bidangnya sudah punya dokumen. Dokumen kedua untuk bidang yang sama akan
   menyimpang, dan pembaca tidak tahu mana yang basi.
2. **Dokumen yang digantikan diberi penanda.** Tulis penanda warisan di
   kepalanya, dengan penunjuk ke jalur yang berlaku. Dokumen basi tanpa penanda
   terbaca seperti nasihat yang sah.
3. **Rujuk, jangan salin.** Salinan aturan akan tertinggal saat aslinya
   berubah.
4. **Angka runtime disertai tanggalnya.** Tanpa tanggal, angka dipercaya
   terlalu lama.
5. **Temuan yang sudah ditutup dipindahkan ke riwayat, tidak dihapus.** Temuan
   yang hilang tanpa jejak akan ditemukan ulang oleh orang berikutnya.
