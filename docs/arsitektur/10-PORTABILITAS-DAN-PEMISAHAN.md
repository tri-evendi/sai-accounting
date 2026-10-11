# 10 — Portabilitas, Pemisahan Layanan & Pilihan Basis Data

> Asesmen 11 Oktober 2026 · v0.9.0 · [indeks](./README.md)
>
> **Pertanyaan yang dijawab dokumen ini.** Empat pertanyaan pemilik, dijawab
> dengan bukti dari sistem yang berjalan — bukan dengan praktik umum:
>
> 1. Kalau nanti pindah ke VM baru, seberapa sulit?
> 2. Perlukah pindah ke PostgreSQL?
> 3. Perlukah container operator dipisah dari pelanggan?
> 4. Perlukah halaman pemasaran dipisah juga?
>
> Ditambah: apa prasyarat DC/DRC.

## 0. Putusan ringkas

| Pertanyaan | Putusan | Dasar |
|---|---|---|
| Pisahkan container **operator** | ✅ **SUDAH DIKERJAKAN** — tanpa satu baris kode berubah | `decideOperatorRouting` memutuskan bidang murni dari env + Host |
| Pisahkan container **pemasaran** | ❌ **Jangan** | Batasnya memotong funnel; nol beban terukur; tanpa alasan keamanan |
| Pindah ke **PostgreSQL** | ❌ **Jangan** | 99 migration + 25 titik raw SQL + arsitektur koneksi; nol masalah terukur yang diselesaikannya |
| **Portabilitas VM** | 🟢 **Sudah ~80% siap** | Image di registry, named volume, skema deklaratif |
| **DC/DRC** | ⏸ **Belum bisa dibicarakan** | Prasyaratnya cadangan terverifikasi + PITR + secret di luar kotak |

Satu benang merah yang mengikat semuanya, dan ia layak dibaca lebih dulu:

> **Cadangan yang belum pernah berhasil adalah penghalang migrasi VM nomor
> satu — dan sekaligus prasyarat DC/DRC.**
>
> Mekanisme migrasi VM Anda **adalah** cadangan itu: dump seluruh basis data +
> `data/documents` + `data/audit`, terenkripsi, di luar mesin. Tanpa itu,
> "pindah VM" berarti `scp` manual sambil produksi hidup, tanpa cara
> memverifikasi apa yang sampai. Jadi P0-1/P0-2 di
> [dok 08](./08-PENILAIAN-ARSITEKTUR.md) bukan hanya soal kehilangan data — ia
> juga pekerjaan portabilitas dan pekerjaan DRC, sekaligus.

## 1. Portabilitas ke VM baru

### Yang sudah benar

Bukan kebetulan — ini hasil keputusan yang sudah diambil, dan layak dinyatakan
supaya tidak ada yang membatalkannya tanpa sadar:

| Sifat | Akibatnya saat pindah VM |
|---|---|
| Image di **GHCR**, bukan dibangun di server | Pindah = `docker compose pull`, bukan build ~10 menit |
| **Named volume**, tanpa bind-mount host | Tidak ada jalur absolut yang mengikat ke mesin ini |
| Skema **deklaratif**, `db:migrate:all` idempoten | VM baru bisa dibangun dari nol, berulang |
| `.env.docker.example` ada | Inventaris variabel terdokumentasi |
| Traefik lewat **label**, bukan berkas konfigurasi | Routing ikut pindah bersama `docker-compose.yml` |
| `app-*` dan `job-*` **stateless** | Seluruh state ada di `db` + dua volume |
| Kredensial basis data **dari environment**, bukan dari tabel | Satu `.env` baru cukup; tidak ada URL tertanam di data |

### Yang menghalangi

| # | Penghalang | Status |
|---|---|---|
| 1 | **Cadangan belum pernah berhasil** | 🔴 54 percobaan, `lastSuccessAt: null` — lihat P0-1 |
| 2 | **Kunci enkripsi 🔶 hanya di mesin ini** | 🔴 lihat P0-2 |
| 3 | Prosedur restore **belum pernah dilatih** | 🟠 diwajibkan kuartalan di `package.json`; ❓ tanpa bukti dijalankan |
| 4 | Rencana cutover DNS | ❓ belum ada |
| 5 | Traefik diasumsikan **sudah ada** di mesin tujuan | 🟡 jaringan `traefik_default` eksternal; VM baru perlu Traefik lebih dulu |
| 6 | Secret hanya di `.env` di disk yang sama dengan data | 🟠 lihat dok 08 Tier 3 |

### Bentuk migrasi VM, bila dilakukan hari ini

🔶 **Tersimpulkan** — belum pernah dijalankan, jadi ini rancangan, bukan prosedur
terbukti:

```mermaid
sequenceDiagram
    participant L as VM lama
    participant S as Penyimpanan S3
    participant B as VM baru
    participant D as DNS

    Note over B: 1. siapkan: Docker + Traefik + jaringan traefik_default
    L->>S: 2. cadangan terakhir (terverifikasi prove-backup-restore)
    L->>L: 3. BEKUKAN tulisan (hentikan web+scheduler; db tetap hidup)
    L->>S: 4. cadangan FINAL sesudah pembekuan
    S->>B: 5. tarik arsip + buka segel
    B->>B: 6. muat dump; pulihkan volume documents & audit
    B->>B: 7. salin .env (kredensial baru untuk db)
    B->>B: 8. compose pull + db:migrate:all (no-op bila skema sama)
    B->>B: 9. BUKTIKAN: /api/health + jumlah baris pra/pasca
    D->>B: 10. cutover DNS
    Note over L: 11. tahan VM lama (jangan hapus) sampai yakin
```

Langkah 9 wajib: **buktikan lewat angka pra/pasca yang dibaca sendiri**, bukan
lewat laporan skrip — doktrin yang sudah berlaku di repo ini untuk migration.

Yang membuat rancangan ini belum jadi prosedur: langkah 2, 4, dan 5 **belum
pernah berhasil sekali pun**.

## 2. PostgreSQL — asesmen

### Biaya migrasi, terukur

| Yang harus diubah | Jumlah |
|---|---|
| `provider = "mysql"` di skema Prisma | **3** (perusahaan, kendali, platform) |
| Berkas `migration.sql` tulisan tangan | **99** — **semuanya** memakai identifier backtick; **14** di antaranya memuat `INSERT`/`UPDATE` data sungguhan |
| …di antaranya memakai `AUTO_INCREMENT` | **48** |
| …di antaranya memakai `ENGINE=InnoDB` | **5** |
| Titik raw SQL tulisan tangan | **25** |
| Kueri `information_schema` | **7 tempat** — nama kolom & semantik PG berbeda |
| Pemeriksaan SQL di `check-data-conformance` | **12** — ✅ **ternyata PORTABEL apa adanya** (diverifikasi 11 Okt: derived table-nya BERALIAS `x`, `CONCAT`/`UNION ALL`/`NOT IN` semuanya ada di PG) |
| `CREATE DATABASE … utf8mb4 COLLATE utf8mb4_unicode_ci` | provisioning + `create-company.ts` — sintaks beda total |
| `DROP DATABASE` penghapusan tenant | 1 |
| Trigger immutability slug | PG butuh function + trigger terpisah |
| Adapter | `@prisma/adapter-mariadb` → `@prisma/adapter-pg` |
| Cadangan & pembuktiannya | `mariadb-dump --all-databases` → `pg_dumpall`; `prove-backup-restore.ts` mencari penanda dump MySQL |

### Dan satu masalah arsitektural, bukan sintaksis

> PostgreSQL memakai **proses per koneksi** (~5–10 MB), bukan thread. Dengan
> **17 basis data** dan kolam klien per-PT, di kotak 3,6 GB ia **menuntut**
> PgBouncer — satu komponen lagi yang bisa mati diam-diam.
>
> Dan di PostgreSQL kueri **tidak bisa** menyeberangi basis data sama sekali.
> Di MySQL/MariaDB "database" = "schema", jadi penyeberangan masih mungkin.
> Pola idiomatis PG adalah **schema-per-tenant** dalam satu basis data — yang
> justru **melemahkan isolasi fisik** yang sengaja dipilih di #104, janji inti
> arsitektur ini.

### Apa yang PostgreSQL berikan di sini?

Jujur: sangat sedikit. MariaDB 11 sudah punya CTE, window function, fungsi JSON,
PITR lewat binlog, dan replikasi.

(Koreksi 11 Okt 2026: dua angka di tabel atas semula dilaporkan lebih buruk
daripada kenyataannya — SQL kesesuaian ternyata portabel, dan migration berisi
data ada 14, bukan 56. Biayanya **turun**, tetapi putusannya tidak berubah,
karena yang menentukan bukan biayanya melainkan ketiadaan pembelinya.) Aplikasi ini memakai uang `Decimal(15,2)`
tanpa kueri eksotis. **Tidak ada satu pun keluhan terukur di repo ini yang
PostgreSQL selesaikan.**

### Putusan

❌ **Jangan.** Ini migrasi mahal tanpa pembeli, dan ia akan memakan seluruh
anggaran rekayasa yang seharusnya menutup P0 cadangan.

**Pemicu yang akan mengubah jawaban:** butuh fitur yang MariaDB tidak punya
(JSONB terindeks, partial index, extension seperti PostGIS), atau menemukan
batas MVCC MariaDB yang **terukur** di beban nyata.

**Rencana pelaksanaannya — bila pemicu itu datang — ada di
[dok 11](./11-RENCANA-POSTGRESQL.md).** Ia disusun atas permintaan pemilik;
putusan di atas tetap "jangan sekarang", dan dok 11 menyebut gerbangnya.

## 3. Pemisahan container operator

### Kenapa ini bisa tanpa perubahan kode

`lib/operator/plane.ts` memutuskan bidang **murni dari env + Host header**:

```
OPERATOR_HOST tidak diset  →  /operator = blocked (404) di host MANA PUN
OPERATOR_HOST diset        →  di host itu: HANYA /operator + /api/health,
                              sisanya 404
```

Jadi pemisahannya cukup **dua container dari image yang SAMA**, beda env + label
Traefik. `environment:` menimpa `env_file:` di Compose:

```yaml
web:                          # bidang pelanggan
  image: …sai-accounting:latest
  environment:
    OPERATOR_HOST: ""         # → /operator 404 di sini
  labels: [ router APP_DOMAIN, router www.APP_DOMAIN ]

web-operator:                 # bidang operator — IMAGE SAMA
  image: …sai-accounting:latest
  environment:
    OPERATOR_HOST: ops.domain
  labels: [ router OPERATOR_DOMAIN ]
```

### Biayanya, terukur 11 Okt 2026

| | |
|---|---|
| `sai-web` **sebelum** pemisahan | **57,6 MiB** (terukur 11 Okt 2026) |
| Memori tersedia di kotak | **719 MB** |
| Tambahan satu container web | **~60 MB ≈ 8% headroom** |
| Image baru | **0** — tetap tiga |
| Perubahan kode | **0** |
| Perubahan migration | **0** |

### Yang didapat

- **Blast radius terpisah** — kebocoran memori, crash, atau OOM di permukaan
  pelanggan tidak menjatuhkan konsol operator, dan sebaliknya.
- **Restart independen** — menggelar perbaikan konsol tidak memutus pembukuan.
- **Batas sumber daya per bidang** (`mem_limit`), sehingga satu laporan berat
  tidak bisa menghabiskan memori yang dibutuhkan konsol.
- **Log terpisah** — `docker compose logs app-operator` hanya berisi operator.
- Latihan nyata memisahkan bidang **sebelum** ada DC/DRC.

### Yang TIDAK didapat — harus jujur

**Image operator tetap memuat seluruh kode pelanggan.** Route group Next.js
tidak bisa dieksklusi saat build, jadi ini isolasi **proses**, bukan eliminasi
kode. Satu kerentanan di dependensi tetap ada di kedua container.

⚠ **Pertahanan berlapis yang perlu diperhatikan.** Container operator dengan
`OPERATOR_HOST` diset akan **melayani rute pelanggan** bila dihubungi dengan
`Host:` lain (`decideOperatorRouting` menjawab `{kind:"customer"}` untuk host
tak dikenal). Traefik tidak akan mengarahkan ke sana, tapi siapa pun yang
menjangkau jaringan internal langsung bisa. Pagarnya: **jangan** beri container
operator label router `APP_DOMAIN`, dan pertimbangkan jaringan Docker terpisah.

### Putusan

✅ **SUDAH DIKERJAKAN** (`docker-compose.yml`, Tier 1).

Bentuk yang digelar: service `app-customer` + `app-operator`, container
`sai-app-customer` + `sai-app-operator`, image SAMA, `OPERATOR_HOST` dikosongkan
lewat `environment:` pada bidang pelanggan, dan nama service Traefik dipisah
(`sai-app` vs `sai-ops`). Volume `documents` **tidak** dipasang di operator.
Langkah penggelaran sekali-jalan — termasuk `--remove-orphans` yang WAJIB —
ada di `PRODUCTION.md` §One-time.

Alasan aslinya tetap berlaku: Rasio manfaat/biaya terbaik di dokumen ini: nol kode,
~60 MB, dan satu-satunya opsi pemisahan di sini yang punya **alasan keamanan**
(pemisahan hak istimewa), bukan sekadar performa.

Ditaruh di Tier 1 dan bukan Tier 0 justru karena meski murah, **ia tidak
melindungi dari apa pun yang sedang mengancam hari ini.**

## 4. Pemisahan halaman pemasaran

### Kenapa jawabannya berbeda dari operator

| | Operator | Pemasaran |
|---|---|---|
| Alasan | **Keamanan** — pemisahan hak istimewa | Hanya performa/ketersediaan |
| Beban terukur | — | **162–185 ms** hangat · 1.337 ms dingin |
| Batas bidang tegas? | Ya — host + fail-closed 404 | **Tidak** — funnel terbelah |
| Putusan | ✅ Lakukan | ❌ Jangan |

### Alasan utama: batasnya memotong funnel

Permukaan `(marketing)` hanya tiga halaman — `/`, `/pricing`, `/status`. Tetapi
alur konversi sebenarnya menyeberangi tiga grup rute:

```
/            →   /register   →   /verify-email   →   /t/{t}/{c}/setup
(marketing)      └──────── (auth), 13 halaman ────┘   └── (setup) ──┘
```

`/register` dan `/verify-email` hidup di `(auth)`, **bukan** `(marketing)`. Jadi
memisahkan pemasaran memberi container yang melayani **tiga halaman**, sementara
pendaftaran — bagian yang benar-benar menghasilkan uang — tetap di container
pelanggan. **Batas yang memotong funnel di tengah bukan batas.**

### Statis/CDN juga tertutup — dan alasannya lebih dalam dari pemeriksaan sesi

Ketiga halaman pemasaran `force-dynamic`. Dugaan pertama: penghalangnya
`await auth()` di `/`. Bukan — penghalang yang lebih dalam adalah **i18n**:

```
src/lib/i18n/server.ts:40   const cookieStore = await cookies();
src/lib/i18n/server.ts:41   const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
src/lib/i18n/server.ts:44   const headerStore = await headers();   // Accept-Language
```

Locale datang dari **cookie** (keputusan sadar, bukan rute `[lang]` — lihat
arsitektur i18n). Itu membuat setiap halaman per-permintaan **secara
konstruksi**. Mencabut `auth()` pun tidak menghasilkan halaman statis.

Statis menuntut locale pindah ke jalur URL — perubahan arsitektur i18n yang
jauh lebih besar daripada memisahkan container, demi tiga halaman.

### Yang sudah benar dan jangan diutak-atik

CMS pendaratan (`lib/site-content-store.ts`) membaca DB **platform**, tapi
degradasinya dirancang betul, dan komentarnya menyebut jebakannya sendiri:

> *"Kalau `{}` hasil kegagalan masuk ke cache, satu detik platform tak
> terjangkau akan membeku menjadi seluruh umur cache sesudah platformnya
> pulih."*

Jadi **kegagalan tidak di-cache**, dan ia menjawab `{}` (bukan `null`) sehingga
pendaratan jatuh ke bawaan di kamus i18n. **Platform mati ≠ pendaratan mati** —
doktrin #137 tegak di sini.

Catatan keadaan: `site_contents` dan `site_settings` keduanya **0 baris**.
CMS-nya sudah dibangun (PR #573) tapi **belum dipakai**; seluruh isi pendaratan
masih datang dari kamus.

### Pemicu yang akan mengubah jawaban

| Pisahkan pemasaran bila… |
|---|
| Lalu lintas perayap/bot **terukur** bersaing dengan permintaan pelanggan |
| Butuh edge caching lintas wilayah — menuntut i18n pindah ke jalur URL lebih dulu |
| **`(marketing)` + `(auth)` dipisah BERSAMA** sebagai satu "bidang akuisisi" |

Opsi ketiga itulah batas yang benar bila nanti memang perlu: pisahkan **bidang
akuisisi**, bukan halaman pemasarannya saja.

## 5. DC/DRC — prasyarat, bukan proyek

DC/DRC belum bisa dibicarakan sebelum tiga hal ini ada:

| # | Prasyarat | Kenapa | Tier |
|---|---|---|---|
| 1 | **Cadangan terverifikasi** | DRC tanpa cadangan terbukti hanyalah VM kedua yang kosong | 0 |
| 2 | **PITR (binlog MariaDB)** | RPO harian = kehilangan sampai 24 jam pembukuan. Untuk data retensi 10 tahun, binlog shipping lebih murah daripada replika penuh dan sudah cukup | 2 |
| 3 | **Secret di luar kotak** | Dua VM = dua `.env`; menyalin rahasia dengan tangan adalah cara kebocoran lahir | 2–3 |

Baru sesudah itu: replikasi MariaDB asinkron ke DRC → **promosi manual**.

> ⚠ **Jangan mulai dari replikasi.** Replika yang menyalin basis data yang tidak
> pernah dicadangkan hanya melipatgandakan satu titik kegagalan menjadi dua yang
> berkorelasi: satu `DROP DATABASE` yang salah sasaran tereplikasi ke DRC dalam
> hitungan detik. Cadangan luar-mesin melindungi dari kelas kesalahan yang
> replikasi **tidak** lindungi.

🔶 Urutan yang disarankan bila nanti dikerjakan: cadangan terverifikasi → binlog
PITR → VM kedua sebagai **target restore dingin** (bukan replika) → baru
replikasi asinkron bila RTO menuntutnya. Setiap langkah berguna sendiri walau
langkah berikutnya tidak pernah datang.

## 6. Ringkasan: apa yang dikerjakan, apa yang tidak

| Pekerjaan | Putusan | Tier | Biaya |
|---|---|---|---|
| Cadangan jalan + kunci keluar mesin | ✅ | **0** | Rendah (3 env) |
| Pisahkan container operator | ✅ **selesai** | **1** | ~60 MB, nol kode |
| Pindahkan pemantulan `/` ke proxy | ✅ | **1** | Satu baris — lihat dok 08 P3-4 |
| Binlog/PITR | ✅ | 2 | Sedang |
| VM kedua sebagai target restore dingin | ✅ | 2–4 | Sedang |
| Replikasi → DRC | ⏸ | 4 | Tinggi — hanya bila RTO menuntut |
| Pisahkan pemasaran | ❌ | — | Batas memotong funnel |
| Pisahkan pemasaran **+ auth** bersama | ⏸ | 4 | Hanya bila ada beban terukur |
| **PostgreSQL** | ❌ | — | Tinggi, tanpa pembeli |
| Mikrolayanan / Kubernetes | ❌ | — | Satu kotak 3,6 GB |

Lanjut: [08 Penilaian](./08-PENILAIAN-ARSITEKTUR.md) · [09 Peta Jalan](./09-PETA-JALAN.md)
