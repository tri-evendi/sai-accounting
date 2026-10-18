# 09 — Peta Jalan & Pertimbangan Perencanaan

> Diperbarui 18 Okt 2026 (`main@ca0cd038`) · disusun pertama 11 Okt 2026 · [indeks](./README.md)

**Dasar dokumen ini.** Setiap butir merujuk temuan di
[dok 08](./08-PENILAIAN-ARSITEKTUR.md) (kode P0–P3). Bentuk sistemnya sehat.
Pekerjaan yang tersisa hampir seluruhnya soal ketahanan data dan kemampuan
sistem melaporkan kegagalannya, bukan soal struktur. Nomor butir lama (0.1, 2.2, …) dipertahankan
karena dirujuk dari kode dan dokumen lain.

Pekerjaan konsol operator 17–18 Okt (bantuan pengguna, perpanjangan H-60,
penawaran → hak pakai, kesehatan tenant, gate di `/settings`, …) tercatat di
[`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md), tidak disalin di sini.

---

## 1. Yang sengaja tidak diusulkan

| Tidak diusulkan | Alasan |
|---|---|
| Pecah jadi mikrolayanan | Satu mesin ~3,6 GB berbagi beberapa aplikasi. Mikrolayanan menambah ongkos tanpa pembeli |
| Tambah antrean pesan | Idempotensi sudah menutup kebutuhannya. Pemicunya di §3 |
| Kembalikan `companyId` ke sesi | Ia menutupi route yang lupa lingkup PT; dicabut dengan sengaja (#158) |
| Basis data perusahaan bertenant-baris / *schema-per-tenant* | Membatalkan isolasi fisik, janji inti #104. Isolasi ini dipertahankan juga saat pindah ke PostgreSQL |
| Hidupkan pemeriksaan tipe di `next build` | Terukur tidak sanggup di mesin ini. Pemeriksaan tipe dijalankan di `verify` |
| Kembalikan Tailwind / `className` | Dicabut #203; dijaga ESLint & tes |
| Replika `app-customer` sekarang | Prasyaratnya belum ada: cache dalam-memori akan berbeda antar-replika (P2-3) |
| Lingkungan staging penuh | 🔶 Mungkin belum sepadan. Keputusan pemilik (§5 #8) |
| Pisahkan container pemasaran | Batasnya memotong funnel: `/register` ada di `(auth)`. Nol beban terukur. [Dok 10 §4](./10-PORTABILITAS-DAN-PEMISAHAN.md) |
| Mulai DC/DRC dari replikasi | Replika dari basis data tanpa backup luar-mesin ikut menyalin setiap kesalahan, jadi kegagalannya berkorelasi. [Dok 10 §5](./10-PORTABILITAS-DAN-PEMISAHAN.md) |
| Pecah repo menjadi dua | Monorepo cukup; lihat [dok 14 §3](./14-RENCANA-MONOREPO.md) |

---

## 2. Terbuka

### 0.1 Backup luar-mesin → P0-1 — 🟠 lokal ✅ / luar-mesin ❌

**Sudah berjalan.** `job-backup` membuat artefak terenkripsi harian di volume
`backup` (`pg_dumpall` langsung ke `pg`) dan merekam putarannya `local`, jadi
`/api/health` → `backup.status = "local_only"`. Sejak 12 Okt artefak lokal
terbukti bisa di-restore lewat `prove-backup-restore`. `watch:health` mengirim
peringatan selama status itu bertahan.

**Belum.** Salinan di luar mesin: `BACKUP_S3_BUCKET` dan kredensialnya masih
kosong. Kebakaran, cakram rusak, atau akun yang hilang akan menghapus data
beserta salinannya.

```bash
# 1. Lengkapi .env: AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · BACKUP_S3_BUCKET (+ region bila perlu)
docker compose run --rm job-backup sh scripts/backup.sh --dry-run   # 2. kering
docker compose run --rm job-backup sh scripts/backup.sh             # 3. sungguhan
docker compose run --rm job-backup bun run prove-backup-restore     # 4. BUKTIKAN
docker exec sai-app-customer node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(j.backup))"
```

**Selesai bila** `backup.status = "ok"`, `lastSuccessAt` terisi, dan
`prove-backup-restore` lulus atas artefak S3. `local_only` sengaja tidak dihitung
lulus.

### 0.2 Kunci enkripsi di luar mesin → P0-2 — ❌

Dikerjakan bersama 0.1. Backup luar-mesin yang kuncinya hanya ada di `.env`
server ini tidak bisa dibuka setelah mesinnya hilang.

1. Salin `BACKUP_ENCRYPTION_KEY` ke penyimpanan rahasia di luar mesin.
2. Catat lokasinya (bukan nilainya) di `PRODUCTION.md`.
3. Buktikan: buka backup di mesin yang tidak punya `.env` produksi.

**Prasyarat:** ❓ pemilik memilih pengelola rahasia (§5 #1).

### #636: cabut MariaDB, paling cepat 22 Okt 2026

Service `db` (`mariadb:11`) masih hidup sebagai jalan mundur sejak penukaran
15 Okt. Lingkup dan prasyaratnya (dump terakhir disimpan di luar mesin, image `sha-`
terakhir dicatat) ada di issue #636. Keadaan akhir ada di
[dok 11 §1](./11-RENCANA-POSTGRESQL.md).

### Risiko PostgreSQL yang masih terbuka

[Dok 11 §10.2](./11-RENCANA-POSTGRESQL.md#102-validasi-pasca-penukaran-16-okt-2026)
butir 4–7: aplikasi tersambung sebagai superuser; pencarian kini peka huruf
besar-kecil; collation `C`; tiga skrip operator masih berdialek MySQL.
Ditambah login username yang belum dinormalkan (`src/lib/auth.ts:116`).
Sebaiknya ditutup sebelum #636.

### 2.2 Buku uji/demo → P2-1 (menunggu pemilik)

Klasifikasi selesai 11 Okt ([dok 12](./12-KLASIFIKASI-BUKU.md)); `is_demo` bukan
penandanya, dan buku uji tetap ikut dicadangkan. Dua keputusan pemilik tersisa:
(a) apakah buku uji dikecualikan dari laporan kesesuaian; (b) apakah buku
`kosong` / `semai-dibersihkan` dirapikan. Penghapusan basis data tidak bisa
dibalik dan tidak boleh didasarkan pada nama.

### Residu yang sengaja ditunda

| Butir | Keadaan |
|---|---|
| **P2-2** jejak per-langkah scheduler | Hanya `scheduler:subscriptions` menulis `scheduler_runs`; enam langkah lain hanya tercetak di log. Menutupnya hampir sama dengan membangun antrean, jadi ditunda bersama pemicu antrean |
| **P2-4** `script-src 'unsafe-inline'` | Jalur nonce + `strict-dynamic` terdokumentasi di `packages/core/src/security-headers.ts`; proyek tersendiri. `style-src 'unsafe-inline'` struktural (#203) |
| **P3-1** beban tipe | Batas heap `typecheck` 2048 MB sejak 17 Okt (jalan dingin OOM di 1536). Kamus i18n belum dipecah; pemicu berikutnya OOM di 2048 |
| **P3-3** `CODEOWNERS` | Sengaja tidak, sampai ada orang kedua |
| **`develop` tanpa proteksi** | `verify` berjalan dan terlihat di PR ke `develop`, tetapi tidak memblokir. Disengaja; `main` sudah digerbangi |

---

## 3. Pemicu, bukan rencana

Butir di sini baru dikerjakan bila pemicunya terjadi.

| Pekerjaan | Pemicu terukur | Prasyarat | Rujukan |
|---|---|---|---|
| **Antrean pekerjaan** | Satu putaran scheduler tidak muat dalam 1 jam, atau satu produser butuh *retry* < 1 jam | Pilihan antrean + penyimpanan | P2-2 |
| **Replika `app-customer`** | CPU/memori jadi pembatas, atau butuh deploy tanpa henti | Cache bersama, dan tinjau `max_connections` + pool PgBouncer | P2-3 |
| **Replika baca PostgreSQL** | Laporan mulai memperlambat tulisan | Pemantauan yang bisa menunjukkan itu | SPOF-1 |
| **Mesin kedua / HA** | RTO yang dapat diterima < waktu bangun ulang manual | ❓ RTO dari pemilik | SPOF-3 |
| **Staging** | Perubahan skema mulai butuh latihan sebelum produksi | Keputusan ongkos | P2-1 |
| **Metrik/dasbor** | "Apakah ini melambat?" ditanyakan dan tak terjawab | — | Dok 07 |
| **Pecah kamus i18n / berkas besar** | `typecheck` dingin OOM di 2048 MB | — | P3-1 |
| **Kanal peringatan kedua** | Satu kegagalan surel membuat P1-1 terulang | — | P1-1 |
| **Pisahkan plane akuisisi** (`(marketing)`+`(auth)` bersama) | Lalu lintas perayap terukur bersaing dengan pelanggan | — | Dok 10 §4 |
| **WAL/PITR** | RPO 24 jam tidak lagi dapat diterima pemilik | 0.1 selesai | Dok 10 §5 |
| **VM kedua sebagai target restore dingin** | Butuh jalan pulang dari kehilangan mesin | 0.1 + 0.2 | Dok 10 §5 |
| **Replikasi → DRC** | RTO menuntutnya, dan restore dingin sudah terbukti | VM kedua | Dok 10 §5 |

Setiap butir menjawab masalah yang belum dialami sistem ini. Mengerjakannya
sekarang menambah komponen yang bisa gagal tanpa terlihat di mesin yang sudah
padat.

---

## 4. Kendala arsitektural yang membatasi perencanaan

| Kendala | Akibatnya pada rencana |
|---|---|
| **RAM ~3,6 GB, banyak aplikasi** | Tidak ada proses jangka-panjang baru tanpa mengukur. Tidak ada build di server; image dibangun di CI |
| **`max_connections` PostgreSQL (100) + pool PgBouncer** | Setiap klien baru mengurangi anggaran yang lain; tiap koneksi backend adalah satu proses |
| **Tanpa FK lintas basis data** | Setiap alur multi-lapis butuh urutan tulis + rekonsiliasi |
| **Konteks PT wajib eksplisit** | Setiap pekerjaan latar baru wajib memakai `runWithCompany()` |
| **Platform tak boleh di jalur panas** | Keputusan jalur panas dibaca dari snapshot di control |
| **Migration N× per rilis** | Perubahan skema berbiaya linear terhadap jumlah buku |
| **Tipe tidak diperiksa saat build** | `bun run verify` harus selalu bisa dijalankan |
| **Dua aplikasi, satu skema** | Kedua image aplikasi wajib dari `sha-` yang sama ([dok 14](./14-RENCANA-MONOREPO.md)) |
| **Modul tak boleh men-gate buku besar** | Fitur baru harus memisahkan "antarmuka" dari "data historis" |
| **`db:migrate` tunggal berbahaya** | Otomasi apa pun wajib memakai `db:migrate:all` |
| **Jejak audit harus selamat dari penghapusan** | `tenant_audit_logs` sengaja tanpa FK; jangan "dirapikan" |

---

## 5. Keputusan terbuka (pemilik)

| # | Pertanyaan | Memblokir |
|---|---|---|
| 1 | Pengelola rahasia mana untuk `BACKUP_ENCRYPTION_KEY`? | 0.2 |
| 2 | RTO yang dapat diterima? | Penilaian SPOF, §3 |
| 3 | Latihan restore kuartalan: siapa, kapan? | Kredibilitas restore |
| 4 | Buku uji di produksi: kecualikan dari kesesuaian? rapikan? | 2.2 |
| 6 | Siapa/apa yang membaca `/api/health` selain `watch:health`? | Lingkup pemantauan |
| 7 | Kapan `billing_mode` dibuka dari `none`? | [`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md) |
| 8 | Staging sepadan pada skala ini? | §3 |
| 9 | `timestamptz` untuk kolom peristiwa? | [Dok 13 §5.1](./13-AUDIT-SKEMA.md) |
| 10 | Kosakata status kontrak: `completed` sah, atau dipetakan ke `signed`? | S3, [dok 13 §4](./13-AUDIT-SKEMA.md) |

Keputusan komersial ada di [`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md)
dan [`docs/PRICING.md`](../PRICING.md); kepatuhan di
[`docs/COMPLIANCE.md §5`](../COMPLIANCE.md).

---

## 6. Selesai

| Butir | Selesai | Hasil |
|---|---|---|
| 0.4 CI → P0-3 | 11 Okt | `.github/workflows/verify.yml`; `verify` *required status check* pada `main` (`strict: false`, `app_id` dipin) |
| 0.5 Dokumen deploy → P1-3 | 11–12 Okt | satu jalur hidup (`PRODUCTION.md` §Updates); perkakas standalone, PM2, `build-standalone.yml`, `HOSTING*.md`, `DOCKER.md` dicabut |
| 0.3 Peringatan → P1-1 | 12–13 Okt | `watch:health` (`scripts/watch-health.ts`, langkah ke-6 `job-scheduler`): backup, scheduler (termasuk putaran `error`), kesesuaian; peredam per komponen |
| 1.1 Container operator dipisah | di-deploy | sejak 18 Okt menjadi aplikasi dan image tersendiri (`apps/operator`, `-operator`); [dok 14](./14-RENCANA-MONOREPO.md) |
| 1.2 Jalan pintas `/` di proxy → P3-4 | 11 Okt | satu pantulan bila token membawa kedua slug; `tests/proxy-landing-shortcut.test.ts` |
| 1.3 Jejak kesesuaian → P1-2 | 11 Okt | `conformance_runs`, medan `/api/health`, halaman konsol `/conformance` |
| 1.4 Uji proxy → P3-2 | sudah ada | `tests/proxy-bearer-api.test.ts` |
| 1.5 Pemangkasan jejak → P2-5 | 11 Okt | 4 aturan (baris terakhir & `ok` terakhir selalu tinggal); langkah terakhir scheduler |
| 2.1 Klasifikasi buku → P2-1 | 11 Okt | `bun run classify:books`; [dok 12](./12-KLASIFIKASI-BUKU.md) |
| 3.1 CSP → P2-4 | 11 Okt | `unsafe-eval` dicabut di produksi; `tests/security-headers.test.ts` |
| PostgreSQL | 15 Okt | atas putusan pemilik; [dok 11](./11-RENCANA-POSTGRESQL.md) |
| Monorepo | 17–18 Okt | `src/` + `apps/operator` + `packages/{db,core,ui,billing,platform}`; [dok 14](./14-RENCANA-MONOREPO.md) |

---

## 7. Ringkasan & langkah berikutnya

**Apa yang ada.** Aplikasi akuntansi SaaS berbahasa Indonesia, monorepo bun:
aplikasi pelanggan (`src/`) dan konsol operator (`apps/operator`, di
`ops.saiaccounting.id`) di atas paket bersama. Empat image GHCR dari satu
commit (aplikasi, `-operator`, `-migrator`, `-backup`), di-deploy di satu mesin
lewat Docker Compose di belakang Traefik. Satu basis data PostgreSQL 17 per
PT (ditambah control dan platform) di balik PgBouncer; MariaDB `db` masih hidup sebagai
jalan mundur sampai #636.

**Apa yang sehat.** Bentuk arsitekturnya: mode kegagalan dipilih dengan sengaja
(konteks PT yang hilang melempar error, plane operator fail-closed), satu
pintu menuju buku besar, aturan arsitektural ditegakkan tes, dan keputusan sulit
tertulis beserta ukuran dan tanggalnya.

**Prioritas tertinggi yang masih terbuka:** backup luar-mesin (P0-1; bagian
lokal sudah ✅) dan kunci di luar mesin (P0-2). P1-1 sudah ditutup
`watch:health`.

| # | Langkah | Usaha | Rujukan |
|---|---|---|---|
| 1 | Setel 3 env S3, jalankan backup, buktikan dengan `prove-backup-restore` | Rendah | 0.1 / P0-1 |
| 2 | Simpan `BACKUP_ENCRYPTION_KEY` di luar mesin + catat di mana | Rendah | 0.2 / P0-2 |
| 3 | Tutup risiko PostgreSQL dok 11 §10.2 butir 4–7 (+ `auth.ts:116`) | Rendah–sedang | dok 11 §5 |
| 4 | #636: cabut MariaDB (≥ 22 Okt 2026), dump terakhir disimpan di luar mesin | Sedang | dok 11 §1 |
| 5 | Jawab dua keputusan pemilik di 2.2 | — | [dok 12 §6](./12-KLASIFIKASI-BUKU.md) |

Nomor 1 dan 2 dikerjakan bersama. Langkah pembuktian jangan dilewati:
gate-nya `lastSuccessAt != null` dan `prove-backup-restore` lulus. Laporan
"sukses" dari skrip tidak cukup.
