# Kebijakan Keamanan

## Melaporkan kerentanan

**Jangan** membuka issue publik, PR, atau diskusi untuk kerentanan. Kirim
laporan secara privat lewat salah satu jalur berikut:

1. **GitHub Private Vulnerability Reporting** — tab *Security* → *Report a
   vulnerability* di repo ini.
2. Surel: **`<KONTAK-KEAMANAN>`** — ⚠ *placeholder: alamatnya belum ditetapkan
   pemilik repo dan WAJIB diisi sebelum dokumen ini dirujuk ke luar.*

Sertakan: versi (`package.json` atau tag image), profil (SaaS / on-premise),
langkah reproduksi, dan dampak yang Anda amati. **Jangan sertakan data
pembukuan sungguhan** — dari pemasangan on-premise, kirim bundel diagnostik
(`scripts/support-bundle.sh`), yang memang dirakit tanpa isi pembukuan.

## Yang kami janjikan

| Langkah | Sasaran |
|---|---|
| Tanda terima | **`<N>` hari kerja** — ⚠ *placeholder, ditetapkan pemilik* |
| Penilaian awal & tingkat (P0–P3) | **`<N>` hari kerja** — ⚠ *placeholder* |
| Perbaikan P0/P1 dirilis | secepatnya; tanggalnya dikabarkan kepada pelapor |

Pelapor dikabari sebelum pengungkapan publik dan, bila berkenan, disebut
namanya di catatan rilis.

## Lingkup

| Masuk lingkup | Di luar lingkup |
|---|---|
| Aplikasi customer, konsol operator, layanan `services/`, image yang diterbitkan | Serangan yang menuntut akses root ke server customer on-premise |
| Kebocoran data antar-perusahaan atau antar-tenant | Temuan pemindai otomatis tanpa bukti dampak |
| Lolos dari matriks izin (`docs/RBAC.md`) | Rekayasa sosial terhadap staf SAI |
| Verifikasi lisensi on-premise (`packages/core/src/licence.ts`) | Penolakan layanan volumetrik |

## Versi yang didukung

SaaS: hanya versi yang sedang berjalan. On-premise: versi yang dicakup lisensi
customer (`maxVersion`) selama masa dukungannya; jendela dukungan dan kebijakan
backport adalah keputusan pemilik — lihat
[`docs/arsitektur/09-RANCANGAN-LAYANAN.md` §12](docs/arsitektur/09-RANCANGAN-LAYANAN.md).
