# Tata Kelola — DRAF untuk diputuskan pemilik

> **Status: DRAF, 23 Okt 2026.** Setiap angka di bawah adalah **usulan** yang
> ditandai 🔶 sampai pemilik mengesahkannya. Dokumen ini menjawab tabel
> "Hilang" di [`arsitektur/09-RANCANGAN-LAYANAN.md` §12](./arsitektur/09-RANCANGAN-LAYANAN.md):
> delapan butir yang berupa **kebijakan, bukan kode**. Kode sudah menyediakan
> alatnya (semver + tag image, expand/contract, alarm tiga denyut, jejak
> audit, retensi 10 tahun); yang belum ada adalah janji tertulis tentang
> bagaimana alat itu dipakai.
>
> Cara mengesahkan: ganti 🔶 dengan ✅ beserta tanggal, atau coret dan tulis
> angka pengganti. Yang sudah disahkan dirujuk dari `SECURITY.md`,
> `ONPREM-SERAH-TERIMA.md`, dan perjanjian customer.

## 1. Versi & definisi GA

| Butir | Usulan |
|---|---|
| Skema versi | SemVer `MAJOR.MINOR.PATCH`, sumbernya `package.json`; setiap image ber-tag versi dan sha (sudah berjalan) |
| PATCH | perbaikan tanpa perubahan skema yang tidak bisa dibalik dan tanpa perubahan perilaku yang terlihat pengguna selain bug yang diperbaiki |
| MINOR | fitur baru, migration *expand*, perubahan perilaku yang diumumkan di catatan rilis |
| MAJOR | migration *contract* yang memutus versi lama, perubahan format ekspor/impor, perubahan kontrak API `/api/v1` |
| 🔶 **GA (1.0.0)** | dicapai ketika: (a) cadangan luar-server berjalan dan latihan restore kuartalan pertama lulus (P0-1, P0-2); (b) SLO §2 diukur 30 hari berturut-turut tanpa melewati *error budget*; (c) satu customer berbayar berjalan 60 hari tanpa insiden Sev-1; (d) `SECURITY.md` tanpa placeholder |
| Sebelum GA | versi `0.x` boleh mengubah perilaku di MINOR; customer on-premise diberi tahu di catatan rilis |

## 2. SLO & *error budget*

Pengukurannya sudah ada (alarm tiga denyut, `runtime_samples`, histogram antrean
di `/scheduler`); yang diusulkan di sini adalah sasarannya.

| Permukaan | SLI | 🔶 Sasaran (30 hari bergulir) | *Error budget* |
|---|---|---|---|
| Aplikasi customer | `/api/health` = ok dari luar, per menit | 99,5% | ±3 jam 36 menit / 30 hari |
| Posting jurnal | permintaan posting yang berhasil / semua (di luar galat validasi) | 99,9% | — |
| Ekspor laporan (antrean `interactive`) | p95 `started_at → finished_at` | < 10 detik | 5% pekerjaan boleh melampaui |
| Cadangan | putaran berhasil dalam 26 jam terakhir | 100% hari | 1 hari terlewat / kuartal memicu kaji ulang |
| Konsol operator | tidak diberi SLO | — | — |

**Bila *error budget* habis:** rilis fitur dibekukan sampai sebabnya diperbaiki;
hanya rilis perbaikan dan keamanan yang lolos.

## 3. Insiden

| 🔶 Tingkat | Contoh | Respons pertama | Kabar ke customer |
|---|---|---|---|
| **Sev-1** | aplikasi mati untuk semua tenant; data satu PT tertulis ke PT lain; kebocoran data; cadangan rusak saat dibutuhkan | 30 menit, kapan pun | dalam 2 jam, lalu tiap 4 jam |
| **Sev-2** | satu fitur inti mati (posting, ekspor, login) untuk sebagian tenant; cadangan gagal 2 hari berturut-turut | 4 jam kerja | dalam 1 hari kerja |
| **Sev-3** | gangguan dengan jalan memutar; laporan lambat | 1 hari kerja | di catatan rilis |

Tingkat insiden **bukan** tingkat temuan P0–P3 (yang dipakai audit): P menilai
risiko yang belum terjadi, Sev menilai kejadian yang sedang berlangsung.

- 🔶 **Siapa dihubungi:** `<NAMA/NOMOR PEMILIK>` (utama), `<CADANGAN>` — ⚠ wajib diisi.
- **Sesudah Sev-1/Sev-2:** catatan pasca-insiden tanpa menyalahkan, dalam 5 hari
  kerja, di `docs/insiden/<tanggal>-<judul>.md`: kronologi, sebab, yang
  memperpanjang, perbaikan, penjaga yang mencegah terulang.

## 4. Keamanan

Sudah ada: `SECURITY.md`. Yang wajib diisi pemilik di sana:

- 🔶 alamat surel keamanan (usul: alamat khusus, bukan surel pribadi);
- 🔶 tanda terima laporan: **2 hari kerja**; penilaian awal: **5 hari kerja**.

## 5. Deprecation

- 🔶 Fitur, endpoint `/api/v1`, opsi env, atau format berkas yang akan dicabut
  **ditandai di satu rilis MINOR** (catatan rilis + peringatan di log/antarmuka),
  dan **dicabut paling cepat di MINOR berikutnya yang berjarak ≥ 30 hari**.
- On-premise: jendela tadi dihitung dari tanggal rilis yang **dipasang**
  customer, bukan tanggal terbit.
- Skema basis data mengikuti expand/contract (`docs/DATABASE.md` §7.1): *contract*
  hanya sesudah semua versi yang masih didukung tidak lagi membaca kolom lama.

## 6. Data: retensi & pengolahan

| Jenis data | Retensi | Dasar |
|---|---|---|
| Buku besar & dokumen pembukuan | **10 tahun** sejak entri jurnal termuda (sudah di kode: `retention_until`) | kewajiban penyimpanan dokumen — lihat `COMPLIANCE.md` §1 |
| Akun pengguna setelah tenant berhenti | 🔶 tenggang 30 hari, lalu dinonaktifkan; data pribadi dihapus atas permintaan sesuai UU PDP kecuali yang wajib disimpan bersama buku | UU PDP No. 27/2022 |
| Jejak audit tenant | sama dengan bukunya | — |
| Jejak audit operator | 🔶 5 tahun | — |
| Cadangan harian | berlaku hari ini: **30 hari** (`BACKUP_RETENTION_DAYS`, bawaan di `tenantlane/runner.go`). 🔶 usul tambahan: 12 salinan bulanan di penyimpanan luar-server | butuh S3 dulu (P0-1) |
| Baris antrean `jobs` selesai | 14 hari (`done_retention_days`, `contract/kinds.yaml`) | operasional |
| Berkas ekspor (`hasil`) | 🔶 7 hari — ⚠ periksa nilai yang berlaku di kode sebelum disahkan | operasional |

- 🔶 **Perjanjian pengolahan data (DPA):** templat untuk customer SaaS — SAI
  sebagai pemroses, customer sebagai pengendali; sub-pemroses yang disebut:
  penyedia VM, penyedia penyimpanan objek cadangan, penyedia surel.
  ⚠ Disusun bersama penasihat hukum; dokumen ini hanya menetapkan bahwa ia wajib
  ada sebelum customer SaaS berbayar pertama.

## 7. On-premise

| Butir | 🔶 Usulan |
|---|---|
| Jendela dukungan | versi MINOR didukung **12 bulan** sejak rilis, atau selama `supportEndsAt` lisensi — mana yang lebih pendek |
| Backport | hanya perbaikan **keamanan dan integritas data** (Sev-1/Sev-2) ke MINOR yang masih didukung; fitur tidak di-backport |
| Pembaruan | customer memasang rilis lewat runbook `ONPREM-SERAH-TERIMA.md`; SAI tidak memegang akses ke server customer kecuali diberi untuk satu sesi dukungan |
| Diagnostik | lewat `scripts/support-bundle.sh` (tanpa isi pembukuan) |

## 8. Infrastruktur yang punya tanggal kedaluwarsa

**P0-3 ([05-PENILAIAN](./arsitektur/05-PENILAIAN.md)): masa aktif VM berakhir
3 Juni 2027.** ✅ Diputuskan pemilik 23 Okt 2026: perpanjangan dilakukan
**manual**, perpanjangan otomatis tetap mati. Risiko yang diterima: satu tanggal
yang terlewat menghapus server produksi beserta cadangan lokalnya — selama
cadangan luar-server (P0-1) belum ada, itu berarti seluruh data.
