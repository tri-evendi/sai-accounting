# 09 — Peta Jalan & Pertimbangan Perencanaan

> Potret 11 Oktober 2026 · v0.9.0 · [indeks](./README.md)

**Dasar dokumen ini.** Setiap butir merujuk temuan di
[dok 08](./08-PENILAIAN-ARSITEKTUR.md). Tidak ada usulan perombakan
arsitektur: bentuk sistemnya sehat, dan bukti dari potret ini mengarah ke
**dapat-diamati**, bukan ke struktur.

**Yang sengaja TIDAK diusulkan** — dan ini bagian terpenting dari dokumen ini:

| Tidak diusulkan | Alasan |
|---|---|
| Pecah jadi mikrolayanan | Satu mesin ~3,6 GB berbagi 6 aplikasi. Mikrolayanan menambah ongkos tanpa pembeli |
| Tambah antrean pesan | Idempotensi sudah menutup kebutuhannya pada 11 tenant. Pemicunya ada di Fase 4 |
| Kembalikan `companyId` ke sesi | Itu **jaring pengaman yang menyembunyikan cacat**; dicabut sengaja (#158) |
| Jadikan basis data perusahaan bertenant-baris | Membatalkan isolasi fisik, janji inti #104 |
| Hidupkan pemeriksaan tipe di `next build` | Terukur tidak sanggup di mesin ini. Gerbangnya sudah pindah, bukan hilang |
| Kembalikan Tailwind / `className` | Dicabut #203; dijaga ESLint & tes |
| Replika `web` sekarang | Prasyaratnya belum ada — cache dalam-memori akan menyimpang |
| Lingkungan staging penuh | 🔶 Mungkin belum sepadan pada 11 tenant. Keputusan pemilik, bukan teknis |
| **Pindah ke PostgreSQL** | 98 migration + 25 titik raw SQL + arsitektur koneksi (PG = proses per koneksi, butuh PgBouncer), demi nol masalah terukur. [Dok 10 §2](./10-PORTABILITAS-DAN-PEMISAHAN.md) |
| **Pisahkan container pemasaran** | Batasnya memotong funnel: `/register` ada di `(auth)`, bukan `(marketing)`. Nol beban terukur (162–185 ms). [Dok 10 §4](./10-PORTABILITAS-DAN-PEMISAHAN.md) |
| **Mulai DC/DRC dari replikasi** | Replika yang menyalin basis data tak tercadangkan melipatgandakan satu titik kegagalan jadi dua yang berkorelasi. [Dok 10 §5](./10-PORTABILITAS-DAN-PEMISAHAN.md) |

---

## Fase 0 — Jaring keselamatan (sekarang)

**Gerbang keluar: cadangan terbukti bisa dipulihkan, dan kegagalan berbunyi.**

Semua di fase ini berusaha **rendah** dan risiko **rendah**. Tidak ada yang
mengubah arsitektur.

### 0.1 Hidupkan cadangan → P0-1

```bash
# 1. Lengkapi .env — tiga yang hilang
#    AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · BACKUP_S3_BUCKET
#    (AWS_DEFAULT_REGION bila penyedianya menuntutnya)

# 2. Satu putaran kering — tidak menulis/menghapus apa pun
docker compose run --rm backup sh scripts/backup.sh --dry-run

# 3. Satu putaran sungguhan
docker compose run --rm backup sh scripts/backup.sh

# 4. BUKTIKAN — bukan "lihat log lalu percaya"
docker compose run --rm backup bun run prove-backup-restore

# 5. Periksa jejaknya dari luar
docker exec sai-web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(j.backup))"
```

**Selesai bila** `lastSuccessAt` **tidak** `null` **dan**
`prove-backup-restore` lulus. Keluaran skrip yang mengatakan "sukses"
**bukan** bukti — doktrin repo ini sendiri: buktikan lewat angka, bukan lewat
laporan skrip.

### 0.2 Amankan kunci enkripsi → P0-2

Harus **bersama** 0.1, bukan sesudahnya: 0.1 tanpa 0.2 menghasilkan cadangan
yang terasa ada padahal tidak bisa dibuka.

1. Salin `BACKUP_ENCRYPTION_KEY` ke penyimpanan rahasia di luar mesin.
2. Catat **di mana** ia disimpan (bukan nilainya) di `PRODUCTION.md`.
3. Buktikan: buka cadangan di mesin yang **tidak** punya `.env` produksi.

**Prasyarat:** ❓ keputusan pemilik soal pengelola rahasia mana.

### 0.3 Sambungkan peringatan → P1-1

Empat pemanggilan `alert()`. Modulnya sudah ada, benar, dan berperedam:

| Berkas | Pemicu |
|---|---|
| `scripts/backup.sh` | jalur `die` — setiap kegagalan |
| `scripts/subscription-scheduler.ts` | putaran berstatus `error` |
| `scripts/check-data-conformance.ts` | ada temuan |
| `src/lib/health-report.ts` | `company.status === "error"` |

Plus: setel `PLATFORM_ALERT_EMAIL` eksplisit alih-alih bergantung pada
cadangan `PLATFORM_CONTACT_EMAIL`.

⚠ `backup.sh` adalah **shell**, bukan TypeScript. 🔶 Jalurnya kemungkinan lewat
`record-backup-run.ts` (yang sudah dipanggil) alih-alih memanggil `alert()`
langsung dari shell — **periksa dulu** sebelum merencanakan.

**Catatan jujur:** `alert()` mengirim surel, dan surel yang gagal tidak bisa
melaporkan dirinya. Kanal kedua layak dipertimbangkan nanti — tetapi **jangan
jadikan prasyarat**. Satu kanal jauh lebih baik daripada nol.

### 0.4 CI yang menjalankan gerbang → P0-3

**Temuan terpenting yang lahir SESUDAH set dokumen ini pertama ditulis.** Tidak
ada satu pun workflow yang berpemicu `pull_request`, tidak ada yang menjalankan
`verify`/`test`/`typecheck`/`lint`, dan `main` tidak punya *required status
check* maupun syarat review. 243 berkas tes, nol otomasi.

```yaml
# .github/workflows/verify.yml
name: Verify
on:
  pull_request:
  push:
    branches: [develop]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: bun run db:generate     # TIGA klien, bukan `bunx prisma generate`
      - run: bun run verify
```

Lalu: **jadikan job `verify` required status check** pada `main` (dan sebaiknya
`develop`) lewat Settings → Branches.

Dikerjakan **lebih dulu** dari 0.1–0.3 kalau bisa, karena ia yang mencegah
ketiganya regresi diam-diam bulan depan. `bun run build` **tidak** ikut di CI
PR — ia tetap tanggung jawab sesi utama di atas hasil gabungan (`AGENTS.md`).

### 0.5 Rapikan dokumen penggelaran → P1-3

Nol perubahan kode. Dampak langsung saat insiden berikutnya.

- `PRODUCTION.md`: beri bagian §2/§4/§5 penanda warisan yang **sama** dengan
  §PM2 yang sudah ada. Pindahkan §Updates ke atas.
- `HOSTING.md`, `HOSTING-LOW-MEMORY.md`, `HOSTING-NO-NODE.md`: tandai warisan
  atau hapus — ❓ butuh keputusan apakah masih dipakai.
- `DOCKER.md`: tegaskan hubungannya dengan `PRODUCTION.md` (mana yang menang).
- `ecosystem.config*.cjs`: biarkan, tetapi rujuk §PM2 yang sudah menjelaskan
  kenapa keduanya masih ada.
- `build-standalone.yml`: ❓ putuskan nasibnya.
- `README.md`: perbaiki tiga klaim basi — §Production (`setup:prod` membangun di
  server), §Security (jejak audit sudah pindah dari `data/audit/audit.jsonl` ke
  tabel), §Scripts (`db:migrate` tanpa peringatan multi-PT).

**Gerbang keluar Fase 0:** `/api/health` → `backup.status: "ok"` ·
`prove-backup-restore` lulus · kunci tersimpan di luar mesin · satu kegagalan
buatan menghasilkan satu surel · satu jalur penggelaran di dokumentasi.

---

## Fase 1 — Dapat-diamati (setelah Fase 0)

**Gerbang keluar: setiap layanan latar meninggalkan jejak yang bisa ditanyai
dari luar.**

### 1.1 Pisahkan container operator → dok 10 §3

**Nol perubahan kode.** Dua container dari image yang SAMA, beda `OPERATOR_HOST`
+ label Traefik. Terukur: `sai-web` = 57,6 MiB, headroom 719 MB, jadi container
kedua ≈ **8% headroom**. Rinciannya beserta jebakan pertahanan-berlapisnya di
[dok 10 §3](./10-PORTABILITAS-DAN-PEMISAHAN.md).

⚠ Ini perubahan **infrastruktur produksi**: butuh persetujuan pemilik, dan
sebaiknya dilatih di luar produksi lebih dulu. Di sinilah ketiadaan staging
(§Keputusan terbuka #8) mulai berbiaya nyata.

### 1.2 Pindahkan pemantulan `/` ke proxy → P3-4

Satu baris: tambahkan `pathname === "/"` ke kondisi di `src/proxy.ts:269`,
cabut `auth()` dari halaman pendaratan, perbaiki komentar yang kedaluwarsa.
Pengguna bersesi mendarat di bukunya, bukan memantul dua kali lewat
`/dashboard`. **Bukan** perbaikan performa — lihat dok 10 §4.

### 1.3 Jejak kesesuaian data → P1-2

Menutup asimetri: `scheduler` dan `backup` punya tabel jejak, `conformance`
tidak.

1. Migration platform `00NN_conformance_runs` — sepola `scheduler_runs`
   (mulai, selesai, status, ringkasan temuan).
2. `check-data-conformance.ts` menulis satu baris per putaran.
3. Medan `conformance` di `health-report.ts` (**dilaporkan, tidak ikut
   memutuskan 503** — doktrin #137).
4. Halaman `/operator/conformance` atau bagian di `/operator/scheduler`.

**Prasyarat:** 0.3 (supaya temuannya juga berbunyi).
**Mengikuti [`docs/DATABASE.md`](../DATABASE.md)** — migration ditulis tangan,
lewati Checklist tabel baru.

### 1.4 Tutup celah uji proxy → P3-2

Satu tes: `proxy()` dengan `Authorization: Bearer …` → **tidak** dipantulkan.
Menutup kelas cacat yang sudah pernah hidup di produksi tiga pekan.

🔶 Kemungkinan cukup tes unit terhadap fungsi keputusan proxy; server sungguhan
mungkin tidak perlu.

### 1.5 Pemangkasan tabel jejak → P2-5

Di layanan `scheduler`: pangkas `scheduler_runs` > 90 hari, **tetapi pertahankan
setiap baris `error` tanpa batas waktu** — kegagalan adalah baris yang paling
berharga, dan memangkasnya berarti kehilangan satu-satunya catatan masa lalu
yang berguna.

Sekaligus: pangkas `data/mail-outbox/` (hanya artefak pengembangan).

**Prasyarat:** 1.1 selesai (supaya pola tabel jejak sudah mapan).

---

## Fase 2 — Kebersihan data (setelah Fase 1)

**Gerbang keluar: setiap basis data di instans produksi diketahui, terdaftar, dan
terklasifikasi.**

### 2.1 Klasifikasikan 17 buku → P2-1

Daftar buku di produksi memuat empat nama yang berpola uji
(`sai_t11_data_dummy`, `sai_t1_uji_wisaya_416`, `sai_t1_uji_pindahan_425`,
`sai_t2_demo`) dan dua kelompok nyaris kembar (`saro`, `pt_saro*`).

```bash
# daftar terdaftar + keaktifan
docker exec sai-db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N \
  -e "SELECT database_name, is_active FROM sai_control.companies ORDER BY 1;"'

# ukuran per buku — untuk memutuskan apakah perlu dikecualikan dari cadangan
docker exec sai-db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -e "
  SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,1) AS mb
  FROM information_schema.TABLES WHERE table_schema LIKE \"sai%\"
  GROUP BY 1 ORDER BY 2 DESC;"'

# apakah bukunya benar-benar dipakai? (ada jurnal?)
# jalankan per buku: SELECT COUNT(*) FROM <buku>.journals;
```

**Tidak perlu dicari basis data yatim** — sudah diperiksa saat menyusun dokumen
ini: 17 di MariaDB = 17 terdaftar. `sai_production` **terdaftar**.

Keluaran yang diinginkan: satu daftar yang menyatakan tiap buku **produksi**
atau **uji**, dengan dasar yang bukan namanya.

**Prasyarat:** 0.1 selesai — jangan sentuh apa pun sebelum ada cadangan.

### 2.2 Tandai buku uji/demo → P2-1

`sai_t11_data_dummy`, `sai_t1_uji_wisaya_416`, `sai_t1_uji_pindahan_425`,
`sai_t2_demo` hidup di instans produksi.

1. Tandai (kolom di `companies`, atau konvensi nama yang dibaca skrip) —
   berdasarkan klasifikasi dari 2.1, **bukan** berdasarkan nama.
2. Kecualikan dari laporan `check-data-conformance` — ❓ **tanya pemilik dulu**:
   mengecualikan berarti berhenti memeriksanya, dan buku uji yang rusak
   kadang justru pertanda masalah nyata.
3. Pertimbangkan mengecualikan dari cadangan — 🔶 **mungkin tidak**:
   `--all-databases` dipilih **justru** karena daftar tangan pasti tertinggal
   saat pelanggan baru mendaftar. Mengecualikan berarti mengembalikan daftar
   tangan. Ukur dulu ukuran dumpnya; bila kecil, biarkan.

⚠ Butir ini punya **risiko sedang**: menghapus basis data adalah tindakan tak
bisa dibalik, dan nama yang tampak seperti uji (`sai_t4_sai`, `sai_t4_selamat`,
`sai_t8_pt_saro` vs `sai_t8_pt_saroo` vs `sai_t8_pt_saro_sejati`) **belum tentu**
uji. Pastikan lewat `sai_control` dan isi bukunya, bukan lewat nama.

**Prasyarat:** 0.1 selesai (jangan sentuh apa pun sebelum ada cadangan).

---

## Fase 3 — Pengerasan (oportunistik)

**Tidak ada gerbang.** Dikerjakan saat ada ruang.

### 3.1 Tinjau CSP → P2-4

🔶 **Risiko mengubah: TINGGI** — bisa merusak UI secara halus (runtime
CSS-in-JS AntD, Recharts, pratinjau PDF blob).

Urutan yang disarankan:

1. **Tulis dulu jawabannya**, apa pun hasilnya. Ketiadaan catatan di repo yang
   mencatat segalanya adalah petunjuk bahwa ini belum pernah **ditinjau**,
   bukan bahwa sudah ditimbang.
2. Uji nonce + `strict-dynamic` di lokal; periksa setiap halaman bergrafik dan
   setiap pratinjau PDF.
3. Bila tidak bisa — **tulis alasannya di `next.config.ts`**, sepola setiap
   keputusan lain di berkas itu. Jawaban "tidak bisa, karena X" yang tertulis
   sudah kemajuan.

### 3.2 `CODEOWNERS` → P3-3

Hanya bermakna bila ada lebih dari satu orang. Sampai itu, mitigasi *bus
factor* yang nyata adalah disiplin menulis alasan — yang sudah dijalankan.

### 3.3 Pantau beban tipe → P3-1

Pemicu: `bun run typecheck` menembus 1536 MB. Saat itu, **pecah kamus i18n**
lebih berdampak daripada memecah modul domain — `next.config.ts` sudah menyebut
itu sebagai kandidat, dan ~2.500 kunci dot-path bertipe adalah sumber bebannya.

---

## Fase 4 — Pemicu, bukan rencana

Butir di sini **tidak boleh** dikerjakan sampai pemicunya terjadi. Mengerjakan
lebih awal berarti membayar ongkos tanpa pembeli.

| Pekerjaan | Pemicu terukur | Prasyarat | Rujukan |
|---|---|---|---|
| **Antrean pekerjaan** | Satu putaran penjadwal tidak muat dalam 1 jam, **atau** satu produser butuh *retry* < 1 jam | Pilihan antrean + penyimpanan | P2-2 |
| **Replika `web`** | CPU/memori `web` jadi pembatas, **atau** butuh penggelaran tanpa henti | Cache bersama (atau cabut cache dalam-memori) **dan** tinjau `max_connections` | P2-3 |
| **Replika baca MariaDB** | Laporan mulai memperlambat tulisan | Pemantauan yang bisa **menunjukkan** itu (Fase 1) | SPOF-1 |
| **Mesin kedua / HA** | RTO yang dapat diterima < waktu bangun ulang manual | ❓ RTO dari pemilik | SPOF-3 |
| **Staging** | Perubahan skema mulai butuh latihan sebelum produksi | Keputusan ongkos | P2-1 |
| **Metrik/dasbor** | "Apakah ini melambat?" ditanyakan dan tak terjawab | — | Dok 07 §9 |
| **Pecah berkas besar** | `typecheck` > 1536 MB | — | P3-1 |
| **Kanal peringatan kedua** | Satu kegagalan surel membuat P1-1 terulang | 0.3 selesai | P1-1 |
| **Pisahkan bidang akuisisi** (`(marketing)`+`(auth)` BERSAMA) | Lalu lintas perayap terukur bersaing dengan permintaan pelanggan | — | Dok 10 §4 |
| **Binlog/PITR** | RPO 24 jam tidak lagi dapat diterima pemilik | 0.1 selesai | Dok 10 §5 |
| **VM kedua sebagai target restore DINGIN** | Butuh jalan pulang dari kehilangan mesin | 0.1 + 0.2 | Dok 10 §5 |
| **Replikasi → DRC** | RTO menuntutnya, DAN restore dingin sudah terbukti | VM kedua | Dok 10 §5 |

**Kenapa dibingkai sebagai pemicu.** Setiap butir di tabel ini adalah jawaban
benar untuk masalah yang **belum dimiliki sistem ini**. Mengerjakannya sekarang
menambah bagian yang bisa mati diam-diam di kotak yang sudah padat — persis
alasan `docker-compose.yml` menolak menambah daemon cron ke dalam image.

---

## Kendala arsitektural yang membatasi perencanaan

Dibawa ke setiap rencana di atas:

| Kendala | Akibatnya pada rencana |
|---|---|
| **RAM ~3,6 GB, 6 aplikasi** | Tidak ada proses jangka-panjang baru tanpa mengukur. Tidak ada build di server |
| **`max_connections` MariaDB** | Setiap klien baru mengurangi anggaran yang lain |
| **Tanpa FK lintas basis data** | Setiap alur multi-lapis butuh urutan tulis + rekonsiliasi |
| **Konteks PT wajib eksplisit** | Setiap pekerjaan latar baru **wajib** `runWithCompany()` |
| **Platform tak boleh di jalur panas** | Keputusan jalur panas dibaca dari **snapshot** di kendali |
| **Migration N× per rilis** | Perubahan skema berbiaya linear terhadap jumlah pelanggan |
| **Tipe tidak diperiksa saat build** | `bun run verify` **harus** bisa dijalankan — selamanya |
| **Modul tak boleh gerbangi buku besar** | Fitur baru harus memisahkan "antarmuka" dari "data historis" |
| **`db:migrate` tunggal berbahaya** | Otomasi apa pun **wajib** `db:migrate:all` |
| **Jejak audit harus selamat dari penghapusan** | `tenant_audit_logs` sengaja tanpa FK; jangan "dirapikan" |

---

## Keputusan terbuka — butuh pemilik, bukan pengembang

| # | Pertanyaan | Memblokir |
|---|---|---|
| 1 | Pengelola rahasia mana untuk `BACKUP_ENCRYPTION_KEY`? | 0.2 |
| 2 | RTO yang dapat diterima? | Penilaian SPOF, Fase 4 |
| 3 | Latihan pemulihan kuartalan — siapa, kapan? | Kredibilitas pemulihan |
| 4 | Basis data uji di produksi: tandai, pindahkan, atau buang? | 2.2 |
| 5 | `HOSTING*.md` & `build-standalone.yml` masih dipakai? | 0.4 |
| 6 | Siapa/apa yang **membaca** `/api/health`? | Lingkup Fase 1 |
| 7 | Kapan `billing_mode` dibuka dari `none`? | Lihat [`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md) |
| 8 | Staging sepadan pada skala ini? | 2.1, Fase 4 |

Keputusan **komersial** (harga, fase, gerbang) sudah punya rumahnya sendiri di
[`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md) dan
[`docs/PRICING.md`](../PRICING.md) — **tidak diduplikasi di sini**. Keputusan
kepatuhan yang masih terbuka ada di
[`docs/COMPLIANCE.md §5`](../COMPLIANCE.md).

---

## Ringkasan eksekutif

**Apa yang ada.** Aplikasi akuntansi SaaS berbahasa Indonesia, v0.9.0, melayani
**11 tenant / 17 perusahaan / 13 pengguna** di produksi. Satu monolit Next.js 16
di lima container Docker di belakang Traefik, dengan **satu basis data MariaDB
per PT** untuk isolasi fisik buku besar, ditambah basis data kendali (identitas)
dan platform (penagihan). ~342.800 baris TypeScript, 141 halaman, 126 rute API,
88 model, 98 migration, 243 berkas tes.

**Apa yang sehat.** Bentuk arsitekturnya. Mode kegagalan **dipilih, bukan
diwarisi**: konteks perusahaan yang hilang melempar alih-alih menebak, bidang
operator gagal-tertutup, posting ke buku besar lewat satu pintu yang penjaganya
tak bisa dilewati route baru, dan puluhan aturan arsitektural ditegakkan **tes**
alih-alih konvensi. Hampir setiap keputusan sulit tertulis beserta **ukuran dan
tanggalnya** di dekat kodenya — itu tidak biasa, dan ia aset nyata. Skema
sepenuhnya termigrasi tanpa drift; penjadwal sehat; alur rilis lewat registry
dengan jangkar rollback otomatis.

**Apa yang tidak.** **Cadangan belum pernah berhasil sekali pun** — 54
percobaan, `lastSuccessAt: null`, karena tiga variabel lingkungan tidak ada.
Untuk pembukuan yang wajib disimpan sepuluh tahun, itu risiko **hukum**. Dan
alasan ia bisa bertahan 54 kali adalah temuan kedua: **kegagalan latar tidak
berbunyi ke siapa pun** — modul peringatan ada dan dirancang baik, tetapi hanya
dipanggil dari dua route pendaftaran. Temuan ketiga mengikuti pola yang sama:
temuan kesesuaian data mingguan hanya ada di stdout.

Dan temuan keempat, yang lahir **sesudah** set dokumen ini pertama ditulis dan
melingkupi ketiganya: **tidak ada apa pun yang menjalankan 243 berkas tes itu.**
Nol workflow berpemicu `pull_request`, nol *required status check* pada `main`,
nol syarat review — sementara `next build` sengaja tidak memeriksa tipe. Jadi
satu-satunya yang berdiri antara galat tipe dan image produksi adalah seorang
manusia yang ingat menjalankan sebuah perintah. Jalurnya bukan hipotesis: PR
#599 terbit ke GHCR tanpa satu pun pemeriksaan berjalan.

Pengamatan yang mengikat keempatnya: **tak satu pun soal arsitektur.** Tiga di
antaranya soal *dapat-diamati* — sistem ini tahu cara gagal dengan benar, yang
belum ia bisa adalah **memberi tahu kita** bahwa ia sedang gagal. Yang keempat
soal *gerbang* — tidak ada yang memeriksa kode sebelum ia terbit. Bentuk
arsitekturnya sendiri sehat, dan tidak satu pun dari keempatnya diperbaiki
dengan memecah layanan.

**Lima langkah berikutnya, berurutan.**

| # | Langkah | Usaha | Rujukan |
|---|---|---|---|
| 1 | **`.github/workflows/verify.yml` + jadikan required check** | **Rendah** | 0.4 / P0-3 |
| 2 | Setel 3 env S3, jalankan cadangan, **buktikan** dengan `prove-backup-restore` | Rendah | 0.1 / P0-1 |
| 3 | Simpan `BACKUP_ENCRYPTION_KEY` di luar mesin + catat di mana | Rendah | 0.2 / P0-2 |
| 4 | Sambungkan `alert()` ke cadangan, penjadwal, kesesuaian, kesehatan PT | Rendah | 0.3 / P1-1 |
| 5 | Satukan dokumentasi penggelaran jadi satu jalur hidup | Rendah, **nol risiko** | 0.5 / P1-3 |

Keempat yang pertama adalah **pekerjaan sore hari** yang memasang gerbang
otomatis dan menghapus satu-satunya risiko kehilangan data permanen di sistem
ini. Kerjakan berurutan: nomor 1 lebih dulu justru supaya nomor 2–5 tidak bisa
regresi diam-diam sesudahnya.

Dan jangan melewati langkah **"buktikan"** pada nomor 2 — doktrin repo ini
sendiri sudah menuliskan kenapa laporan skrip bukan bukti. Gerbangnya
`lastSuccessAt != null` **dan** `prove-backup-restore` lulus, bukan "skripnya
bilang sukses".
