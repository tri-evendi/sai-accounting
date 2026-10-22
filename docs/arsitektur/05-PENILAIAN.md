# 05 — Penilaian & Risiko

> Status 18 Okt 2026 (`main@ca0cd038`) · penilaian pertama 11 Okt 2026 ·
> [indeks](./README.md)

Setiap temuan menyebut buktinya, dampaknya, dan apa yang akan mengubah
penilaiannya. Sebagian "kelemahan" adalah harga yang sudah diterima dengan
sadar, dan ditandai begitu. Yang terbuka di prioritas tertinggi adalah
ketahanan data, bukan struktur.

## 1. Kekuatan yang sebaiknya dipertahankan

| Kekuatan | Isinya |
|---|---|
| Mode kegagalan dipilih sengaja | Kegagalan yang tidak terlihat diubah jadi kegagalan yang terlihat — tabel di bawah |
| Isolasi buku besar secara fisik | Kueri yang lupa `WHERE company_id` tidak bisa memulangkan baris PT lain, karena baris itu tidak ada di basis data tersebut |
| Satu pintu menuju buku besar | Gate persetujuan dan kunci periode di `postForSource`, bukan di route |
| Aturan dijaga tes | 360 berkas tes (22 Okt 2026); banyak menjaga aturan arsitektural, bukan perilaku |
| Skrip pembuktian, bukan laporan | `prove-*` memeriksa keadaan nyata; migrasi dibuktikan lewat angka pra/pasca |
| Pemeriksa kesesuaian data | Menyapu jalur yang tidak melewati zod; lahir dari enam kelas cacat nyata |
| Dokumentasi di dekat keputusannya | Komentar menyimpan ukuran dan tanggal, sehingga bisa ditinjau ulang |
| Degradasi berjenjang konsisten | #137 di tiga tingkat: impor, klien, probe |
| Skema patuh standarnya sendiri | Diukur 19 Okt 2026 atas 95 model: `@@map`, `snake_case`, `id` Int, dan larangan `Float` untuk uang — **nol pelanggaran**. Tiga yang tampak melanggar ternyata cacat pada standarnya, dan standarnya yang diperbaiki |
| Kolom tersandi berpola tunggal | Selalu bertiga: `<subjek>_ciphertext` · `_iv` · `_tag`. Empat tempat, nol penyimpangan |
| Hak PDP terpenuhi secara struktural | Ekspor mandiri menyapu `information_schema`, jadi kolom PII **baru** ikut terbawa tanpa seseorang harus ingat; penghapusan menganonimkan dan menyisakan baris supaya jejak audit tidak menunjuk kekosongan |

| Keputusan | Yang digantikan |
|---|---|
| Konteks PT hilang → melempar | Jatuh ke basis data bawaan → tulisan silang-PT tanpa jejak |
| `companyId` dicabut dari JWT (#158) | Jaring pengaman yang membuat route lupa-lingkup tetap bekerja |
| `OPERATOR_HOST` kosong → 404 di mana pun | Konsol operator terbuka diam-diam |
| Daftar IP kosong → tolak semua | Terbuka bagi siapa pun |
| Webhook tanpa kunci di produksi → tolak semua | Menerima webhook palsu |
| Rantai proxy lebih pendek dari hitungan hop → ditolak | Mempercayai entri kiriman klien |
| `migrate-platform.ts` dilewati dengan peringatan | Dilewati diam-diam |
| Scheduler jadi layanan, bukan crontab (#373) | Baris cron hilang → tagihan tak terbit, nol error |
| Terjemahan hilang = error tsc | Teks bahasa Inggris bocor ke UI |

## 2. Temuan yang masih terbuka

### 🟠 P0-1 — Backup: lokal ✅ / luar-mesin ❌

**Bukti.** `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
kosong. `/api/health` → `backup: local_only`, `lastSuccessAt: null`.

**Yang sudah berjalan.** Sejak 12 Okt artefak terenkripsi harian dibuat di
volume `cadangan`, dan artefak itu **terbukti bisa di-restore** (fingerprint
cocok, dekripsi berhasil, 19 basis data ikut). Sejak 20 Okt pelakunya
`svc-tenant` (sejak 22 Okt 2026 jalur `tenant` di `svc-integrator`) dan bentuknya **satu objek per basis data** — lihat
[02 §5](./02-LAYANAN-INFRA.md); itu yang menutup P1-1, dan ia TIDAK mengubah
temuan ini: satu objek per basis data di cakram yang sama tetap bukan salinan
di luar mesin.

**Yang belum.** Salinan di luar mesin. Kerusakan disk, kebakaran, atau akun
yang hilang akan menghapus data **beserta** salinannya. Risikonya juga hukum:
pembukuan wajib disimpan sepuluh tahun (UU KUP).

```bash
# 1. Lengkapi .env: AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · BACKUP_S3_BUCKET
# 2. Putaran berikutnya diterbitkan penjadwal sendiri (backup:publish, berbutir hari).
#    Untuk memaksa sekarang — hapus baris `jobs` hari ini, atau tunggu tengah malam UTC.
docker compose logs svc-integrator --tail 60                        # ← apa yang ia kerjakan
docker compose run --rm job-backup bun run prove-backup-restore     # ← BUKTIKAN
```

**Selesai bila** `backup.status = "ok"`, `lastSuccessAt` terisi, dan
`prove-backup-restore` lulus **atas artefak S3**. `local_only` tidak dihitung
lulus. Usaha: **rendah** (3 env).

### 🔴 P0-2 — Kunci enkripsi backup 🔶 kemungkinan hanya ada di mesin yang sama

`BACKUP_ENCRYPTION_KEY` ada di `.env` mesin produksi; ❓ tidak ada petunjuk di
repo bahwa kunci itu disalin ke luar. Bila kuncinya hilang bersama mesinnya,
backup tidak bisa dibuka — padahal kita mengira punya jalan restore.

**Perbaikan.** Simpan di pengelola rahasia di luar mesin, catat **lokasinya**
(bukan nilainya) di `PRODUCTION.md`, lalu buktikan dengan membuka backup di
mesin yang tidak punya `.env` produksi. ❓ Prasyarat: pemilik memilih pengelola
rahasia.

> **P0-1 dan P0-2 harus selesai bersama.** P0-1 tanpa P0-2 memberi rasa aman
> yang keliru.

### 🟠 P0-3 — Masa aktif VM berakhir 3 Juni 2027, perpanjangan otomatis mati

**Bukti.** Konsol penyedia, 19 Okt 2026: `Expiry 2027-06-03`, sakelar *Auto
Renew* mati.

**Dampak.** VM kedaluwarsa = pemadaman total, dan di sebagian penyedia disknya
ikut dilepas. Digabung dengan P0-1, satu tanggal yang terlewat bisa menghapus
pembukuan 17 PT sekaligus. Ini satu-satunya risiko yang punya tanggal pasti dan
tidak butuh kejadian apa pun untuk terpicu.

**Perbaikan.** Nyalakan perpanjangan otomatis, atau pasang pengingat yang tidak
bergantung pada ingatan seseorang. Usaha: satu sakelar.

### 🟡 P2-5 — Dua jalur berkas tanpa batas, dipicu pengguna

| Jalur | Yang tidak dibatasi |
|---|---|
| `/api/reports/export` | Workbook disusun utuh di memori (`lib/xlsx.ts`), dan skema payload tidak punya batas jumlah baris |
| `/api/reports/payload` | Rentang periode dipilih pengguna tanpa batas; laporan arus kas membaca seluruh `journalLine` rentang itu (`lib/reports.ts:574`, tanpa `take`) |

Ekspor mandiri tenant sudah di-stream, jadi ia bukan bagian dari temuan ini —
tetapi CSV-nya masih utuh di memori.

Pada 227 MB total hari ini tak ada yang terasa. Keduanya tumbuh linear terhadap
isi buku, dan keduanya dipicu satu klik dari pengguna yang berhak.

**Perbaikannya murah dan tidak menuntut infrastruktur baru:** batas baris pada
ekspor, batas rentang pada payload, keduanya dengan pesan yang menyebut
batasnya. Penulisan ulang ke bentuk aliran menunggu `svc-integrator`, karena jalur
aliran ExcelJS berat CPU dan memblokir proses yang sedang melayani permintaan.

### 🟡 P2-1 — Basis data uji/demo hidup di instans produksi

Empat dari 17 buku berpola nama uji, semuanya `is_active = 1`. 🔶 Tidak ada
staging, jadi pengujian dilakukan di produksi. Dampaknya: buku uji ikut dump
seluruh server, dan temuan kesesuaiannya bercampur dengan temuan atas data
sungguhan.

Klasifikasi berdasarkan **isi**, bukan nama, selesai 11 Okt: **2 dari 17 buku**
berisi data sungguhan. Juga terbukti tidak ada basis data yatim.

Menunggu pemilik: apakah buku uji dikecualikan dari laporan kesesuaian, dan
apakah buku kosong dirapikan.

> ⚠ **Jangan menghapus berdasarkan nama.** Penghapusan basis data tidak bisa
> dibalik, dan "tampaknya tidak dipakai" bukan dasar yang memadai.

### 🟡 P2-2 — Tidak ada pemulihan per-pekerjaan di jalur latar

Tidak ada antrean; lima produser berjalan berurutan tiap jam dengan `|| true` +
`timeout`. Produser yang gagal menunggu satu jam; yang dihentikan `timeout`
kehilangan putaran itu.

**Kenapa ini P2.** Idempotensi dikerjakan serius: `dedupe_key`, kunci unik
`(invoice_id, reminder_kind, reminder_due_key)` dan `(template_id,
occurrence_date)`. Putaran berikutnya menyusulkan yang tertinggal. Putaran yang
merekam `status = "error"` kini mengirim peringatan.

**Sisanya.** Hanya `scheduler:subscriptions` yang menulis `scheduler_runs`
(kini di basis data kendali). Enam langkah lain tidak meninggalkan jejak
sendiri, jadi salah satunya bisa gagal setiap jam sementara putarannya tetap
tercatat `ok`.

**Perbaikan: jangan menambah antrean sekarang.** Menutupnya berarti setiap
langkah menulis hasilnya sendiri — tabel baru, migration, pembungkus di compose
— hampir sama besarnya dengan membangun antrean.

### 🟡 P2-3 — Satu container `app-customer`, tanpa jalur penskalaan

> **22 Okt 2026:** jalurnya kini ada sebagai konfigurasi opt-in — bus
> invalidasi cache, buku tag Next bersama, batas PgBouncer per pengguna
> (`MAX_USER_CONNECTIONS`, bukan `MAX_DB_CONNECTIONS` yang per basis data),
> standby. Belum dinyalakan; yang belum terbukti tanpa host kedua:
> [02 §19](./02-LAYANAN-INFRA.md). Temuan di bawah tetap potret 19 Okt.

Cache dalam-memori: pengaturan surel (TTL 60s), keadaan tenant (TTL 60s),
override izin pengguna, pool klien LRU, penyimpan konteks per permintaan — dan
**cache data Next** untuk isi & pengaturan situs (`unstable_cache`, TTL 300s).
Yang terakhir ini paling mudah terlewat: `updateTag` hanya membatalkan cache di
instans yang melayani panggilannya, jadi operator mengubah satu pengaturan dan
replika lain menyajikan nilai lama sampai lima menit. Dokumentasi Next sendiri
menyatakan cache-nya per-instans dan menuntut `cacheHandler` bersama.

Replika tambahan akan punya cache sendiri yang bisa berbeda, sehingga pengaturan
tampak berubah tergantung replika yang melayani.

Anggaran koneksi per proses aplikasi dihitung eksplisit (8+2+1 = 11). Yang
**belum** dianggarkan adalah agregatnya, dan angkanya timpang: PgBouncer
`DEFAULT_POOL_SIZE: 20` berlaku **per pasangan (basis data, pengguna)** dan ada
19 basis data — sampai 380 koneksi server dituntut, sementara `max_connections`
tidak pernah ditimpa di `docker-compose.yml` sehingga tetap **100**. Tidak ada
`MAX_DB_CONNECTIONS` sebagai batas global.

Hari ini tidak terasa (puncak terukur 62), dan itulah sebabnya ia tercatat di
sini alih-alih sebagai insiden. Pooler kedua menggandakan tuntutannya, jadi
tiga hal ini **prasyarat** replika pertama, bukan pekerjaan sesudahnya: cache
bersama, `MAX_DB_CONNECTIONS` + `DEFAULT_POOL_SIZE` yang disetel ulang, dan
`max_connections` yang dinaikkan dengan sengaja beserta `shared_buffers`-nya.

### 🟡 P2-6 — Data pribadi tanpa klasifikasi, dan IP tersimpan selamanya

Inventaris 19 Okt 2026: 10 kolom kontak, 13 alamat, 3 NPWP, 3 `ip_address` di
jejak audit. Kredensial semuanya ter-hash atau tersandi, dan hak akses serta
hak hapus sudah terpenuhi secara struktural — sapuan `information_schema` pada
ekspor mandiri, dan anonimisasi pada eksekusi penghapusan.

| # | Yang terbuka | Perbaikan |
|---|---|---|
| 1 | Tak ada cara **mesin** mengetahui kolom mana data pribadi; tinjauan PII bergantung pada ingatan | konvensi `/// @pii <kelas>` + penjaga yang menolak kolom berpola PII tanpa klasifikasi |
| 2 | `ip_address` di tiga jejak audit **tanpa batas waktu** — jejak audit sengaja tidak pernah dipangkas, dan itu benar | retensi pada **kolomnya**, bukan barisnya: kosongkan sesudah ambang; peristiwanya tetap utuh |
| 3 | NPWP & alamat polos di cakram, **tanpa keputusan tercatat** | boleh tetap polos — yang tidak boleh adalah tidak ada keputusannya |

Ketiganya murah, dan dua di antaranya sudah punya tempatnya: konvensi
`/// @pii` dan pola kolom tersandi kini tertulis di
[`DATABASE.md`](../DATABASE.md).

### 🟡 P2-4 — CSP masih memakai `script-src 'unsafe-inline'`

Pertahanan XSS melemah, padahal aplikasi menampilkan nama pelanggan, catatan,
dan nama berkas unggahan.

`style-src 'unsafe-inline'` **harus tetap ada** — struktural sejak #203, karena
nonce hanya bisa menandai elemen `<style>`, bukan **atribut** `style`. Yang
tersisa adalah `script-src`.

**Jalan keluarnya nonce + `strict-dynamic`, dan itu proyek tersendiri:** CSP
pindah dari `headers()` ke `proxy.ts` (nonce baru per permintaan), setiap
halaman dirender dinamis, `StyleProvider` AntD diberi nonce yang sama, dan
`strict-dynamic` diuji terhadap Recharts serta pratinjau PDF blob — kerusakan
di dua bagian itu sulit dikenali: grafik kosong dan pratinjau gagal tidak
menjatuhkan halaman.

### 🟢 P3-1 — Beban tipe dari berkas besar

`statement-layout.ts` 79 KB · `docs-content.ts` 68 KB · `posting/index.ts`
1.867 baris · `wizard.ts` 44 KB · `receivables.ts` 39 KB, plus kamus i18n
~2.500 kunci bertipe. Batas heap `typecheck` naik 768 → 1536 → **2048 MB**.

`posting/index.ts` besar karena keputusan yang benar, dan bagian murninya sudah
dipisah. **Pemicunya: cold run OOM di 2048 MB. Saat itu kamus i18n dipecah** —
jangan hanya menaikkan batas lagi, karena separuh resep itu sudah dipakai sekali.

### 🟢 P3-3 — Tidak ada kepemilikan tercatat

Tidak ada `CODEOWNERS`; satu penulis commit, *bus factor* = 1. Yang
mengurangi risikonya: alasan tiap keputusan tertulis di dekat kodenya.
`CODEOWNERS` bila nanti ada orang kedua. **Sengaja ditunda.**

## 3. Ringkasan prioritas

| # | Temuan | Keadaan | Usaha sisa |
|---|---|---|---|
| **P0-1** | Backup | 🟠 lokal ✅ terbukti bisa di-restore / luar-mesin ❌ | Rendah (3 env) |
| **P0-2** | Kunci backup 🔶 di mesin yang sama | ❌ terbuka | Rendah |
| **P0-3** | Masa aktif VM berakhir 3 Jun 2027 | ❌ terbuka | Satu sakelar |
| **P2-1** | Basis data uji di produksi | 🟡 terklasifikasi; 2 keputusan menunggu pemilik | Rendah |
| **P2-2** | Tanpa pemulihan per-pekerjaan | 🟡 putaran `error` sudah berbunyi | Tinggi |
| **P2-3** | Satu `app-customer` | Batas diketahui, belum tercapai | Tinggi |
| **P2-4** | CSP `script-src 'unsafe-inline'` | 🟡 `unsafe-eval` dicabut; `style-src` struktural | Tinggi |
| **P2-5** | Ekspor & payload laporan tanpa batas | ❌ terbuka | Rendah (batas) |
| **P2-6** | PII tanpa klasifikasi; IP audit tanpa retensi | ❌ terbuka | Rendah |
| **P3-1** | Beban tipe | 🟡 batas 2048 MB; kamus i18n belum dipecah | Tinggi |
| **P3-3** | Tanpa `CODEOWNERS` | Sengaja ditunda | Rendah |

## 4. Portabilitas VM & DC/DRC

**Portabilitas ke VM baru — 🟢 ~80% siap.** Sifat berikut lahir dari keputusan
yang sudah diambil, dan tidak boleh dibatalkan tanpa sengaja:

| Sifat | Akibatnya saat pindah VM |
|---|---|
| Image di GHCR, bukan dibangun di server | Pindah = `docker compose pull` |
| Named volume, tanpa bind-mount host | Tidak ada jalur absolut yang mengikat ke mesin ini |
| Skema deklaratif, `db:migrate:all` idempoten | VM baru bisa dibangun dari nol, berulang |
| Traefik lewat label | Routing ikut pindah bersama `docker-compose.yml` |
| `app-*` dan layanan latar (`svc-worker`, `svc-integrator`) stateless | Seluruh state di `pg` + tiga volume |
| Kredensial dari environment | Satu `.env` baru cukup |

Yang menghalangi: backup luar-mesin (P0-1) · kunci enkripsi (P0-2) · prosedur
restore belum pernah dilatih · ❓ rencana cutover DNS · Traefik diasumsikan ada
di mesin tujuan · secret hanya di `.env`.

🔶 Bentuk migrasinya bila dilakukan hari ini: siapkan Docker + Traefik di VM
baru → backup terakhir terverifikasi → **bekukan tulisan** → backup final →
muat dump + pulihkan volume → salin `.env` → `compose pull` + `db:migrate:all`
→ **buktikan lewat angka pra/pasca** → cutover DNS → **tahan VM lama** sampai
yakin.

**DC/DRC — prasyarat dulu:** backup luar-mesin terverifikasi (DRC tanpa backup
terbukti hanyalah VM kedua yang kosong) · PITR · secret di luar kotak.

> ⚠ **Jangan mulai dari replikasi.** Replika dari basis data tanpa backup ikut
> menyalin setiap kesalahan: satu `DROP DATABASE` yang salah sasaran sampai ke
> DRC dalam hitungan detik.

**Kenapa pemasaran TIDAK dipisah.** Operator dipisah karena keamanan; pemasaran
tidak, karena alasannya hanya performa dan **batasnya memotong funnel**:

```
/            →   /register   →   /verify-email   →   /t/{t}/{c}/setup
(marketing)      └──────── (auth), 13 halaman ────┘   └── (setup) ──┘
```

Memisahkan pemasaran menghasilkan container yang hanya melayani **tiga
halaman**, sementara pendaftaran tetap di container customer. Beban terukur:
162–185 ms hangat, 1.337 ms cold. Statis/CDN juga tidak bisa karena locale
datang dari **cookie**, sehingga ketiga halaman `force-dynamic`. Bila nanti
perlu, batas yang tepat adalah **plane akuisisi** (`(marketing)` + `(auth)`
bersama).

## 5. Pemicu, bukan rencana

Butir di sini baru dikerjakan bila pemicunya terjadi.

| Pekerjaan | Pemicu terukur | Prasyarat |
|---|---|---|
| Antrean pekerjaan | Satu putaran scheduler tidak muat dalam 1 jam, atau satu produser butuh *retry* < 1 jam | Pilihan antrean + penyimpanan |
| Replika `app-customer` | CPU/memori jadi pembatas, atau butuh deploy tanpa henti | Cache bersama + tinjau `max_connections` |
| Replika baca PostgreSQL | Laporan mulai memperlambat tulisan | Pemantauan yang bisa menunjukkannya |
| Mesin kedua / HA | RTO yang dapat diterima < waktu bangun ulang manual | ❓ RTO dari pemilik |
| Staging | Perubahan skema mulai butuh latihan sebelum produksi | Keputusan ongkos |
| Metrik/dasbor | "Apakah ini melambat?" ditanyakan dan tak terjawab | — |
| Redis | ≥ 2 replika **dan** keusangan lintas-replika terukur, sesudah `cacheHandler` beralas Postgres dinilai tak memadai | Replika aplikasi |
| Ekspor berbentuk aliran | Batas baris mulai menolak permintaan yang sah | `svc-integrator` (jalur aliran memblokir proses) |
| Pecah kamus i18n | `typecheck` cold run OOM di 2048 MB | — |
| Kanal peringatan kedua | Satu kegagalan surel membuat kegagalan latar kembali tak terdengar | — |
| Pisahkan plane akuisisi | Lalu lintas crawler terukur bersaing dengan customer | — |
| WAL/PITR | RPO 24 jam tidak lagi dapat diterima | P0-1 selesai |
| VM kedua (restore dingin) | Butuh jalan pulang dari kehilangan mesin | P0-1 + P0-2 |
| Replikasi → DRC | RTO menuntutnya, dan restore dingin sudah terbukti | VM kedua |

## 6. Kendala yang membatasi perencanaan

| Kendala | Akibatnya pada rencana |
|---|---|
| 2 vCPU · 8 GB, dibagi enam aplikasi | Tidak ada proses jangka-panjang baru tanpa mengukur. Tidak ada build di server |
| `max_connections` 100 + pool PgBouncer | Setiap klien baru mengurangi anggaran yang lain |
| Tanpa FK lintas basis data | Setiap alur multi-lapis butuh urutan tulis + rekonsiliasi |
| Konteks PT wajib eksplisit | Setiap pekerjaan latar baru wajib `runWithCompany()` |
| Platform tak boleh di hot path | Keputusan hot path dibaca dari snapshot di control |
| Migration N× per rilis | Perubahan skema berbiaya linear terhadap jumlah buku |
| Tipe tidak diperiksa saat build | `bun run verify` harus selalu bisa dijalankan |
| Dua aplikasi, satu skema | Kedua image wajib dari `sha-` yang sama |
| Modul tak boleh men-gate buku besar | Fitur baru harus memisahkan antarmuka dari data historis |
| `db:migrate` tunggal berbahaya | Otomasi apa pun wajib `db:migrate:all` |
| Jejak audit harus selamat dari penghapusan | `tenant_audit_logs` sengaja tanpa FK |

## 7. Yang sengaja TIDAK diusulkan

| Tidak diusulkan | Alasan |
|---|---|
| Pecah jadi mikrolayanan | Satu VM berbagi dengan lima aplikasi lain |
| Broker pesan (Kafka/Rabbit/Redis) | Mengembalikan tulis-ganda: commit berhasil, publish gagal, dan tak ada yang tahu apakah mengulang memperbaiki atau menduplikasi |
| Mikrolayanan per domain akuntansi | Batasnya tidak nyata — setiap pekerja butuh konteks perusahaan, pintu posting, dan tiga klien yang sama |
| Kembalikan `companyId` ke sesi | Ia menutupi route yang lupa lingkup PT (#158) |
| Tenant-baris / *schema-per-tenant* | Membatalkan isolasi fisik, janji inti #104 |
| Pemeriksaan tipe di `next build` | Terukur tidak sanggup di mesin ini |
| Kembalikan Tailwind / `className` | Dicabut #203; dijaga ESLint & tes |
| Replika `app-customer` sekarang | Prasyaratnya belum ada (P2-3) |
| Staging penuh | 🔶 Mungkin belum sepadan; keputusan pemilik |
| Pisahkan container pemasaran | Batasnya memotong funnel pendaftaran |
| Mulai DC/DRC dari replikasi | Replika ikut menyalin kesalahan; backup dulu |
| Pecah repo jadi dua | Monorepo cukup |

## 8. Keputusan yang menunggu pemilik

| # | Pertanyaan | Memblokir |
|---|---|---|
| 1 | Pengelola rahasia mana untuk `BACKUP_ENCRYPTION_KEY`? | P0-2 |
| 2 | RTO yang dapat diterima? | Seluruh urutan HA |
| 3 | Latihan restore kuartalan: siapa, kapan? | Kredibilitas restore |
| 4 | Buku uji di produksi: kecualikan dari kesesuaian? rapikan? | P2-1 |
| 5 | Staging sepadan pada skala ini? | Latihan migration |
| 6 | Siapa/apa yang membaca `/api/health` selain `watch:health`? | Lingkup pemantauan |
| 7 | Kapan `billing_mode` dibuka dari `none`? | [`KOMERSIALISASI.md`](../KOMERSIALISASI.md) |
| 8 | `timestamptz` untuk kolom peristiwa? | Temuan S3 |
| 9 | Kosakata status kontrak: `completed` sah, atau dipetakan ke `signed`? | Temuan S3 |

## 9. Langkah berikutnya

| # | Langkah | Usaha |
|---|---|---|
| 1 | Nyalakan perpanjangan otomatis VM, atau pasang pengingat sebelum 3 Jun 2027 | Satu sakelar |
| 2 | Setel 3 env S3, jalankan backup, buktikan dengan `prove-backup-restore` | Rendah |
| 3 | Simpan `BACKUP_ENCRYPTION_KEY` di luar mesin + catat lokasinya | Rendah |
| 4 | Tutup risiko PostgreSQL yang terbuka (superuser, pencarian peka huruf, 3 skrip berdialek MySQL, login username) | Rendah–sedang |
| 5 | #636: cabut MariaDB (≥ 22 Okt 2026), dump terakhir di luar mesin | Sedang |
| 6 | Jawab dua keputusan pemilik soal buku uji | — |

Nomor 2 dan 3 dikerjakan **bersama**, dan langkah pembuktiannya jangan
dilewati: gate-nya `lastSuccessAt != null` dan `prove-backup-restore` lulus.
Laporan "sukses" dari skrip tidak cukup.
