# Arsitektur & Peta Layanan — SAI Accounting

> **Apa ini.** Gambaran keadaan yang berjalan saat ini, disusun dari kode,
> konfigurasi, dan bukti runtime. Rencana tidak dicatat di sini.
> Dimutakhirkan **18 Oktober 2026**; produksi = `main@ca0cd038`. Angka runtime
> yang lebih tua diberi tanggal di tempatnya.
>
> **Batasnya.** Dokumen ini tidak menggantikan dokumen domain. Ia menjawab
> bentuk sistem, sambungannya, dan letak risikonya. Alasan sebuah aturan tetap
> dijawab dokumen aslinya, yang dirujuk lewat tautan. Aturan tidak disalin ke
> sini supaya tidak ada dua salinan yang bisa berbeda.

## Urutan baca

Titik mulai menurut siapa yang membaca:

| Anda | Mulai dari |
|---|---|
| Insinyur baru | [01](./01-RINGKASAN-PLATFORM.md) → [02](./02-ARSITEKTUR.md) → [06](./06-ALIRAN-DATA.md) |
| Mengambil keputusan teknis | [01](./01-RINGKASAN-PLATFORM.md) → [08](./08-PENILAIAN-ARSITEKTUR.md) → [09](./09-PETA-JALAN.md) |
| Bertugas jaga / menggelar rilis | [07](./07-INFRASTRUKTUR-DEPLOY.md) → [03](./03-INVENTARIS-LAYANAN.md) |
| Membaca laporan kesesuaian data | [12](./12-KLASIFIKASI-BUKU.md) *(buku mana yang temuannya nyata)* |
| Menyentuh skema / menambah tabel atau relasi | [13](./13-AUDIT-SKEMA.md) *(aturan yang ditegakkan + jebakan indeks FK)* |
| Merencanakan VM baru / DC-DRC | [10](./10-PORTABILITAS-DAN-PEMISAHAN.md) → [08](./08-PENILAIAN-ARSITEKTUR.md) |
| Mempertimbangkan ganti basis data | [10 §2](./10-PORTABILITAS-DAN-PEMISAHAN.md) *(putusan)* → [11](./11-RENCANA-POSTGRESQL.md) *(rencana)* |
| Mempertimbangkan memisah konsol operator dari platform pelanggan | [10 §3](./10-PORTABILITAS-DAN-PEMISAHAN.md) *(container — sudah)* → [14](./14-RENCANA-MONOREPO.md) *(kode — selesai 18 Okt 2026: `apps/operator` + lima paket)* |

## Isi

| # | Dokumen | Menjawab |
|---|---|---|
| 01 | [RINGKASAN-PLATFORM.md](./01-RINGKASAN-PLATFORM.md) | Produk apa ini, untuk siapa, kemampuan apa yang sudah ada, arsitektur sekilas |
| 02 | [ARSITEKTUR.md](./02-ARSITEKTUR.md) | Batas sistem, tiga lapis basis data, pola arsitektur, diagram komponen |
| 03 | [INVENTARIS-LAYANAN.md](./03-INVENTARIS-LAYANAN.md) | Katalog setiap layanan, container, modul, dan skrip — beserta tanggung jawabnya |
| 04 | [DEPENDENSI-INTEGRASI.md](./04-DEPENDENSI-INTEGRASI.md) | Dependensi internal/eksternal, hulu-hilir, titik gagal tunggal |
| 05 | [API-KOMUNIKASI.md](./05-API-KOMUNIKASI.md) | Permukaan HTTP, tiga rezim autentikasi, pola komunikasi antar-layanan |
| 06 | [ALIRAN-DATA.md](./06-ALIRAN-DATA.md) | Daur hidup permintaan, alur posting jurnal, alur penagihan, alur cadangan |
| 07 | [INFRASTRUKTUR-DEPLOY.md](./07-INFRASTRUKTUR-DEPLOY.md) | Container, domain, port, volume, alur rilis, variabel lingkungan |
| 08 | [PENILAIAN-ARSITEKTUR.md](./08-PENILAIAN-ARSITEKTUR.md) | Kekuatan, utang teknis, risiko — diprioritaskan dengan bukti |
| 09 | [PETA-JALAN.md](./09-PETA-JALAN.md) | Rekomendasi berurutan, prasyarat, pertanyaan yang belum terjawab |
| 10 | [PORTABILITAS-DAN-PEMISAHAN.md](./10-PORTABILITAS-DAN-PEMISAHAN.md) | Asesmen: portabilitas VM · PostgreSQL · pemisahan container operator & pemasaran · prasyarat DC/DRC |
| 11 | [RENCANA-POSTGRESQL.md](./11-RENCANA-POSTGRESQL.md) | Migrasi MariaDB → PostgreSQL — **DIJALANKAN 15 Okt 2026**; fase, gerbang, kegagalan penukaran pertama, dan **validasi pasca-penukaran (§10.2)** |
| 12 | [KLASIFIKASI-BUKU.md](./12-KLASIFIKASI-BUKU.md) | Buku mana **produksi**, mana **uji** — dengan dasar isinya, bukan namanya. Dibangkitkan `bun run classify:books` |
| 13 | [AUDIT-SKEMA.md](./13-AUDIT-SKEMA.md) | **Audit desain skema** — apa yang sudah benar dan harus dijaga, tiga temuan (S1/S2 **ditutup**, S3 menunggu keputusan kosakata), dan keputusan desain yang harus diambil saat pindah mesin |
| 14 | [RENCANA-MONOREPO.md](./14-RENCANA-MONOREPO.md) | Pemisahan konsol ke `apps/operator` + paket `@sai/*` (`@sai/db`, `@sai/core`, `@sai/ui`, `@sai/billing`, `@sai/platform`) — alasan, harga, fase (selesai 18 Okt 2026) |

## Dokumen domain yang TIDAK digantikan dokumen ini

Semuanya tetap sumber kebenaran untuk bidangnya masing-masing:

| Dokumen | Bidang |
|---|---|
| [`docs/MULTI-COMPANY.md`](../MULTI-COMPANY.md) | Satu basis data per PT (#104) — aturan & migrasi pemasangan |
| [`docs/MULTI-TENANT.md`](../MULTI-TENANT.md) | Lapis tenant/SaaS (#133) — model data & pemisahan tiga lapis |
| [`docs/RBAC.md`](../RBAC.md) | Matriks izin, empat lapis penegakan, kunci buku |
| [`docs/DATABASE.md`](../DATABASE.md) | Standar skema, tipe data, workflow migration |
| [`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md) | Strategi komersial, fase, gerbangnya |
| [`docs/PRICING.md`](../PRICING.md) | Katalog paket & harga |
| [`docs/COMPLIANCE.md`](../COMPLIANCE.md) | Retensi, UU PDP, persetujuan ber-versi |
| [`docs/MODUL-USAHA.md`](../MODUL-USAHA.md) | Modul per jenis usaha (#99) |
| [`docs/AUDIT-RILIS-UMUM.md`](../AUDIT-RILIS-UMUM.md) | Audit perjalanan pelanggan ujung-ke-ujung |
| [`AGENTS.md`](../../AGENTS.md) | Aturan kerja: gerbang verify/build, UI, otorisasi, DB |
| [`PRODUCTION.md`](../../PRODUCTION.md) | Runbook penggelaran (§Updates; ringkasannya di dok 07 §5) |
| [`design-system/sai-accounting/MASTER.md`](../../design-system/sai-accounting/MASTER.md) | Sistem desain, token, penjaga UI |

## Tiga tingkat keyakinan

Setiap klaim di dokumen ini ditandai. Klaim tanpa tanda berarti terbukti.

| Tanda | Arti |
|---|---|
| *(tanpa tanda)* | **Terbukti**: dibaca dari kode, konfigurasi, atau keluaran perintah yang dijalankan saat penyusunan |
| 🔶 **Tersimpulkan** | Kesimpulan yang wajar dari bukti, tetapi tidak dieksekusi atau diamati langsung |
| ❓ **Belum dipastikan** | Tidak diketahui dari repo ini; butuh pemilik, akses, atau pengukuran |

## Cara memelihara dokumen ini

Dokumen ini perlu diperbarui ketika salah satu hal berikut berubah:

1. Layanan baru di `docker-compose.yml` → perbarui **03** dan **07**.
2. Basis data/skema Prisma keempat → perbarui **02**, **04**, **06**.
3. Integrasi luar baru (gerbang bayar, penyedia surel) → perbarui **04** dan **05**.
4. Rezim autentikasi baru (selain sesi/Bearer/operator) → perbarui **05**.
5. Temuan di **08** yang sudah ditutup → pindahkan ke riwayat, jangan hapus.
   Temuan yang hilang tanpa jejak akan ditemukan ulang oleh orang berikutnya.
6. Putusan di **10** (PostgreSQL, pemisahan container) → bila pemicunya
   terjadi, perbarui putusannya beserta pemicu yang terpenuhi, supaya
   perubahannya bisa ditinjau.
7. **10 memuat putusan, 11 memuat rencana.** Keduanya sengaja dipisah:
   putusan "jangan sekarang" tidak menghapus rencananya, dan adanya rencana
   tidak berarti sudah disetujui.

Angka runtime (jumlah tenant, status cadangan, nomor migration) dicantumkan
beserta tanggal pengambilannya, supaya pembaca tahu kapan angka itu perlu
dicek ulang.
