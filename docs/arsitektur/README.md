# Arsitektur & Peta Layanan — SAI Accounting

> **Apa ini.** Potret **keadaan yang BERJALAN HARI INI**, dibuat dengan membaca
> kode, konfigurasi, dan bukti runtime — bukan rencana, bukan cita-cita.
> Tanggal potret: **11 Oktober 2026**. Rujukan versi: **v0.9.0**
> (`origin/main@a2eecf7c`), yaitu image yang sedang melayani produksi.
>
> **Apa ini BUKAN.** Bukan pengganti dokumen domain yang sudah ada. Dokumen di
> sini menjawab *"bentuknya apa, tersambung ke apa, dan di mana risikonya"*;
> *"kenapa aturannya begitu"* tetap dijawab dokumen aslinya, yang dirujuk
> dengan tautan alih-alih disalin. Menyalin aturan berarti membuat salinan
> kedua yang akan membusuk tanpa ada yang menyadarinya.

## Urutan baca

Tiga pintu masuk, tergantung siapa yang membaca:

| Anda | Mulai dari |
|---|---|
| Insinyur baru | [01](./01-RINGKASAN-PLATFORM.md) → [02](./02-ARSITEKTUR.md) → [06](./06-ALIRAN-DATA.md) |
| Mengambil keputusan teknis | [01](./01-RINGKASAN-PLATFORM.md) → [08](./08-PENILAIAN-ARSITEKTUR.md) → [09](./09-PETA-JALAN.md) |
| Bertugas jaga / menggelar rilis | [07](./07-INFRASTRUKTUR-DEPLOY.md) → [03](./03-INVENTARIS-LAYANAN.md) |
| Merencanakan VM baru / DC-DRC | [10](./10-PORTABILITAS-DAN-PEMISAHAN.md) → [08](./08-PENILAIAN-ARSITEKTUR.md) |
| Mempertimbangkan ganti basis data | [10 §2](./10-PORTABILITAS-DAN-PEMISAHAN.md) *(putusan)* → [11](./11-RENCANA-POSTGRESQL.md) *(rencana)* |

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
| 11 | [RENCANA-POSTGRESQL.md](./11-RENCANA-POSTGRESQL.md) | **Rencana pelaksanaan** migrasi MariaDB → PostgreSQL — fase, gerbang, jebakan collation, kewajiban pembuktian |

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
| [`PRODUCTION.md`](../../PRODUCTION.md) | Runbook penggelaran (lihat catatan kebusukan di dok 07) |
| [`design-system/sai-accounting/MASTER.md`](../../design-system/sai-accounting/MASTER.md) | Sistem desain, token, penjaga UI |

## Tiga tingkat keyakinan

Setiap klaim di dokumen ini ditandai. Tanpa penandaan = **terbukti**.

| Tanda | Arti |
|---|---|
| *(tanpa tanda)* | **TERBUKTI** — dibaca dari kode, konfigurasi, atau keluaran perintah yang dijalankan saat penyusunan |
| 🔶 **TERSIMPULKAN** | Kesimpulan yang wajar dari bukti, tetapi tidak dieksekusi/diamati langsung |
| ❓ **BELUM DIPASTIKAN** | Tidak diketahui dari repo ini — butuh pemilik, akses, atau pengukuran |

## Cara memelihara dokumen ini

Dokumen ini membusuk seperti dokumen mana pun. Yang membuatnya membusuk
**paling cepat**:

1. Layanan baru di `docker-compose.yml` → perbarui **03** dan **07**.
2. Basis data/skema Prisma keempat → perbarui **02**, **04**, **06**.
3. Integrasi luar baru (gerbang bayar, penyedia surel) → perbarui **04** dan **05**.
4. Rezim autentikasi baru (selain sesi/Bearer/operator) → perbarui **05**.
5. Temuan di **08** yang sudah ditutup → **pindahkan ke riwayat, jangan hapus**;
   temuan yang hilang tanpa jejak akan ditemukan ulang oleh orang berikutnya.
6. Putusan di **10** (PostgreSQL, pemisahan container) → bila **pemicunya**
   terjadi, perbarui putusannya **beserta pemicu yang terpenuhi**. Putusan yang
   berubah tanpa menyebut apa yang berubah tidak bisa ditinjau siapa pun.
7. **10 memegang PUTUSAN, 11 memegang RENCANA.** Keduanya sengaja dipisah:
   putusan "jangan sekarang" tidak boleh menghapus rencananya, dan adanya
   rencana tidak boleh terbaca sebagai persetujuan.

Angka runtime (jumlah tenant, status cadangan, nomor migration) **sengaja
dicantumkan beserta tanggal pengambilannya**. Angka tanpa tanggal adalah angka
yang akan dipercaya terlalu lama.
