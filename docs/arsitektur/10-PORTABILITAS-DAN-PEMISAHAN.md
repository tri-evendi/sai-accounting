# 10 — Portabilitas, Pemisahan Layanan & Pilihan Basis Data

> **ARSIP: asesmen 11 Oktober 2026** · v0.9.0 · [indeks](./README.md)
>
> Sesudahnya: PostgreSQL 15 Okt 2026 ([dok 11](./11-RENCANA-POSTGRESQL.md)),
> monorepo 18 Okt 2026 ([dok 14](./14-RENCANA-MONOREPO.md)). Status terkini
> per 18 Okt 2026 (`main@ca0cd038`): container operator ✅ (kini aplikasi dan image
> sendiri), PostgreSQL ✅, backup lokal ✅ / luar-mesin ❌, pemasaran tetap
> tidak dipisah. Ringkasan di [§6](#6-ringkasan-apa-yang-dikerjakan-apa-yang-tidak).
>
> **Pertanyaan yang dijawab dokumen ini.** Empat pertanyaan pemilik, dijawab
> dengan bukti dari sistem yang berjalan:
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
| Pisahkan container **operator** | ✅ Selesai: container sendiri (11 Okt), lalu aplikasi dan image sendiri (18 Okt, [dok 14](./14-RENCANA-MONOREPO.md)) | `decideOperatorRouting` memutuskan plane murni dari env + Host |
| Pisahkan container **pemasaran** | ❌ Jangan | Batasnya memotong funnel; nol beban terukur; tanpa alasan keamanan |
| Pindah ke **PostgreSQL** | ✅ Dikerjakan 15 Okt 2026 atas putusan pemilik (asesmen semula: jangan sekarang) | [Dok 11](./11-RENCANA-POSTGRESQL.md) |
| **Portabilitas VM** | 🟢 Sudah ~80% siap | Image di registry, named volume, skema deklaratif |
| **DC/DRC** | ⏸ Belum bisa dibicarakan | Prasyaratnya backup luar-mesin terverifikasi + WAL/PITR + secret di luar kotak |

Satu hal mengikat semuanya: **backup luar-mesin yang belum ada adalah
penghalang utama migrasi VM, dan juga prasyarat DC/DRC.**

Migrasi VM memakai backup itu: dump seluruh basis data + `data/documents` +
`data/audit`, terenkripsi, di luar mesin. Artefak lokal harian sudah ada dan
terbukti bisa di-restore. Yang belum ada adalah salinannya di luar mesin dan
kuncinya di luar server. P0-1/P0-2 di [dok 08](./08-PENILAIAN-ARSITEKTUR.md)
karena itu sekaligus pekerjaan portabilitas dan DRC.

## 1. Portabilitas ke VM baru

### Yang sudah benar

Sifat berikut lahir dari keputusan yang sudah diambil. Dicatat supaya tidak
dibatalkan tanpa sengaja:

| Sifat | Akibatnya saat pindah VM |
|---|---|
| Image di **GHCR**, bukan dibangun di server | Pindah = `docker compose pull`, bukan build ~10 menit |
| **Named volume**, tanpa bind-mount host | Tidak ada jalur absolut yang mengikat ke mesin ini |
| Skema **deklaratif**, `db:migrate:all` idempoten | VM baru bisa dibangun dari nol, berulang |
| `.env.docker.example` ada | Inventaris variabel terdokumentasi |
| Traefik lewat **label**, bukan berkas konfigurasi | Routing ikut pindah bersama `docker-compose.yml` |
| `app-*` dan `job-*` **stateless** | Seluruh state ada di `pg` + volume `documents`, `audit`, `backup` |
| Kredensial basis data **dari environment**, bukan dari tabel | Satu `.env` baru cukup; tidak ada URL tertanam di data |

### Yang menghalangi

| # | Penghalang | Status |
|---|---|---|
| 1 | **Backup luar-mesin** | 🟠 lokal ✅ (harian, terbukti bisa di-restore sejak 12 Okt) / luar-mesin ❌ (`BACKUP_S3_BUCKET` kosong); lihat P0-1 |
| 2 | **Kunci enkripsi 🔶 hanya di mesin ini** | 🔴 lihat P0-2 |
| 3 | Prosedur restore belum pernah dilatih | 🟠 diwajibkan kuartalan di `package.json`; ❓ tanpa bukti dijalankan |
| 4 | Rencana cutover DNS | ❓ belum ada |
| 5 | Traefik diasumsikan sudah ada di mesin tujuan | 🟡 jaringan `traefik_default` eksternal; VM baru perlu Traefik lebih dulu |
| 6 | Secret hanya di `.env` di disk yang sama dengan data | 🟠 lihat dok 08 Tier 3 |

### Bentuk migrasi VM, bila dilakukan hari ini

🔶 Tersimpulkan. Belum pernah dijalankan, jadi ini rancangan, belum prosedur
terbukti:

```mermaid
sequenceDiagram
    participant L as VM lama
    participant S as Penyimpanan S3
    participant B as VM baru
    participant D as DNS

    Note over B: 1. siapkan: Docker + Traefik + jaringan traefik_default
    L->>S: 2. backup terakhir (terverifikasi prove-backup-restore)
    L->>L: 3. BEKUKAN tulisan (hentikan app-* + job-*; pg tetap hidup)
    L->>S: 4. backup FINAL sesudah pembekuan
    S->>B: 5. tarik arsip + buka segel
    B->>B: 6. muat dump; pulihkan volume documents & audit
    B->>B: 7. salin .env (kredensial baru untuk db)
    B->>B: 8. compose pull + db:migrate:all (no-op bila skema sama)
    B->>B: 9. BUKTIKAN: /api/health + jumlah baris pra/pasca
    D->>B: 10. cutover DNS
    Note over L: 11. tahan VM lama (jangan hapus) sampai yakin
```

Langkah 9 wajib: buktikan lewat angka pra/pasca yang dibaca sendiri, jangan lewat
laporan skrip. Aturan ini sudah berlaku di repo ini untuk migration.

Rancangan ini belum menjadi prosedur karena tujuan S3 di langkah 2, 4, dan 5
belum ada (per 18 Okt hanya artefak lokal di volume `backup`), dan
prosedurnya belum pernah dilatih ujung-ke-ujung.

## 2. PostgreSQL — ✅ dikerjakan 15 Okt 2026

Asesmen 11 Okt menilai "jangan sekarang". Tidak ada keluhan terukur yang
diselesaikan PostgreSQL, P0 backup masih terbuka, dan biaya terbesarnya adalah
koneksi: PostgreSQL memakai satu proses per koneksi, puncak terukur 62, sehingga
PgBouncer wajib. Pemilik memutuskan pindah. Sejak 15 Okt 2026 produksi berjalan
di PostgreSQL 17 + PgBouncer, dengan isolasi fisik #104 dipertahankan: satu
basis data per PT, bukan *schema-per-tenant*. Keadaan akhir, keputusan, dan
risiko yang masih terbuka ada di [dok 11](./11-RENCANA-POSTGRESQL.md); MariaDB
`db` masih hidup sebagai jalan mundur sampai issue #636.

## 3. Pemisahan container operator: selesai, lalu menjadi aplikasi tersendiri

**Langkah pertama (11 Okt, Tier 1):** dua container dari image yang SAMA
(`app-customer` / `app-operator`), beda `OPERATOR_HOST` + label Traefik, nol kode
berubah. Terukur sebelum pemisahan: `sai-web` 57,6 MiB dengan 719 MB tersedia,
jadi container kedua ≈ 60 MB (8 % headroom). Volume `documents` tidak dipasang
di operator.

**Kekurangan yang dicatat saat itu**, yaitu image operator masih memuat seluruh
kode pelanggan, ditutup 18 Okt 2026 oleh monorepo
([dok 14](./14-RENCANA-MONOREPO.md)): konsol kini aplikasi Next tersendiri
(`apps/operator`) dengan image sendiri (`…-operator`, standalone 69 MB vs 299 MB),
dan build pelanggan tidak memuat rute operator.

**Keadaan 18 Okt 2026:**

| | |
|---|---|
| Image | empat dari satu commit: aplikasi pelanggan, `-operator`, `-migrator`, `-backup`; kedua aplikasi wajib dari `sha-` yang sama |
| Plane | ditentukan host saja. Konsol di `ops.saiaccounting.id` tanpa prefix `/operator`; `/operator/*` → 308 |
| Konsol (`apps/operator/src/proxy.ts`) | `OPERATOR_HOST` kosong → seluruh konsol 404; host lain → 404 (bukan rute pelanggan); IP di luar `OPERATOR_IP_ALLOWLIST` → 404; tanpa sesi → `/login` |
| Pelanggan (`src/proxy.ts`) | host operator yang sampai ke sini (Traefik salah arah) → 404; tidak ada rute operator di binarinya |
| Aturan plane | satu fungsi murni, `decideOperatorRouting` di `packages/core/src/operator-plane.ts`, dipakai kedua aplikasi |
| Volume konsol | hanya `audit` |

Asesmen ini dulu mencatat satu celah: container operator melayani rute
pelanggan bila dihubungi dengan `Host:` lain. Celah itu ikut tertutup, karena
binari konsol tidak punya rute pelanggan dan proxy-nya menjawab 404.

Yang didapat sejak langkah pertama tetap berlaku: blast radius, restart, batas
sumber daya, dan log terpisah per plane.

## 4. Pemisahan halaman pemasaran

### Kenapa jawabannya berbeda dari operator

| | Operator | Pemasaran |
|---|---|---|
| Alasan | Keamanan: pemisahan hak istimewa | Hanya performa/ketersediaan |
| Beban terukur | — | 162–185 ms hangat · 1.337 ms dingin |
| Batas plane tegas? | Ya: host + fail-closed 404 | Tidak: funnel terbelah |
| Putusan | ✅ Lakukan | ❌ Jangan |

### Alasan utama: batasnya memotong funnel

Permukaan `(marketing)` hanya tiga halaman: `/`, `/pricing`, `/status`. Alur
konversinya menyeberangi tiga grup rute:

```
/            →   /register   →   /verify-email   →   /t/{t}/{c}/setup
(marketing)      └──────── (auth), 13 halaman ────┘   └── (setup) ──┘
```

`/register` dan `/verify-email` ada di `(auth)`, bukan di `(marketing)`.
Memisahkan pemasaran menghasilkan container yang hanya melayani tiga halaman,
sementara pendaftaran, yang menghasilkan pelanggan, tetap di container
pelanggan. Batas itu memotong funnel di tengah.

### Statis/CDN juga tidak bisa, karena i18n

Ketiga halaman pemasaran `force-dynamic`. Penghalangnya bukan `await auth()` di
`/`, melainkan i18n:

```
packages/platform/src/i18n/server.ts:40   const cookieStore = await cookies();
packages/platform/src/i18n/server.ts:41   const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
packages/platform/src/i18n/server.ts:44   const headerStore = await headers();   // Accept-Language
```

Locale datang dari cookie (keputusan sengaja, tanpa rute `[lang]`; lihat
arsitektur i18n), sehingga setiap halaman dirender per permintaan. Mencabut
`auth()` pun tidak menghasilkan halaman statis.

Halaman statis menuntut locale pindah ke jalur URL. Itu perubahan arsitektur
i18n yang jauh lebih besar daripada memisahkan container, untuk tiga halaman.

### Yang sudah benar

CMS pendaratan (`packages/platform/src/site-content-store.ts`) membaca basis
data platform, dan degradasinya dirancang dengan benar. Komentarnya menyebut
jebakannya:

> *"Kalau `{}` hasil kegagalan masuk ke cache, satu detik platform tak
> terjangkau akan membeku menjadi seluruh umur cache sesudah platformnya
> pulih."*

Karena itu kegagalan tidak di-cache, dan jawabannya `{}` (bukan `null`) sehingga
pendaratan memakai bawaan di kamus i18n. Platform mati tidak mematikan
pendaratan (doktrin #137).

Catatan keadaan per 11 Okt 2026: `site_contents` dan `site_settings`
keduanya 0 baris — CMS-nya sudah dibangun (PR #573) tapi belum dipakai; isi
pendaratan datang dari kamus.

### Pemicu yang akan mengubah jawaban

| Pisahkan pemasaran bila… |
|---|
| Lalu lintas perayap/bot terukur bersaing dengan permintaan pelanggan |
| Butuh edge caching lintas wilayah (menuntut i18n pindah ke jalur URL lebih dulu) |
| `(marketing)` + `(auth)` dipisah bersama sebagai satu "plane akuisisi" |

Bila nanti perlu, opsi ketiga itulah batas yang tepat: pisahkan plane akuisisi,
bukan hanya halaman pemasaran.

## 5. DC/DRC: prasyarat dulu

DC/DRC belum bisa dibicarakan sebelum tiga hal ini ada:

| # | Prasyarat | Kenapa | Tier |
|---|---|---|---|
| 1 | **Backup luar-mesin terverifikasi** | DRC tanpa backup terbukti hanyalah VM kedua yang kosong. Per 18 Okt yang ada baru artefak lokal | 0 |
| 2 | **PITR (WAL archiving PostgreSQL)** | RPO harian = kehilangan sampai 24 jam pembukuan. Untuk data retensi 10 tahun, pengiriman WAL (`archive_command`, mis. wal-g/pgBackRest) lebih murah daripada replika penuh dan sudah cukup. *(Sebelum 15 Okt: binlog MariaDB)* | 2 |
| 3 | **Secret di luar kotak** | Dua VM berarti dua `.env`; menyalin rahasia dengan tangan rawan bocor | 2–3 |

Sesudah itu baru *streaming replication* PostgreSQL asinkron ke DRC, dengan promosi manual (`pg_promote()`).

> ⚠ **Jangan mulai dari replikasi.** Replika dari basis data tanpa backup ikut
> menyalin setiap kesalahan: satu `DROP DATABASE` yang salah sasaran sampai ke
> DRC dalam hitungan detik. Backup luar-mesin melindungi dari kesalahan seperti
> itu; replikasi tidak.

🔶 Urutan yang disarankan bila nanti dikerjakan: backup luar-mesin
terverifikasi → WAL/PITR → VM kedua sebagai target restore dingin (bukan
replika) → baru replikasi asinkron bila RTO menuntutnya. Setiap langkah berguna
walaupun langkah berikutnya tidak pernah dikerjakan.

## 6. Ringkasan: apa yang dikerjakan, apa yang tidak

*Status per 18 Okt 2026.*

| Pekerjaan | Putusan | Tier | Biaya |
|---|---|---|---|
| Backup jalan + kunci keluar mesin | 🟠 lokal ✅ / luar-mesin ❌ · kunci ❌ | 0 | Rendah (3 env) |
| Pisahkan container operator | ✅ selesai; sejak 18 Okt aplikasi dan image sendiri | 1 | — |
| Pindahkan pemantulan `/` ke proxy | ✅ selesai 11 Okt (dok 08 P3-4) | 1 | — |
| WAL/PITR | ✅ disarankan | 2 | Sedang |
| VM kedua sebagai target restore dingin | ✅ disarankan | 2–4 | Sedang |
| Replikasi → DRC | ⏸ | 4 | Tinggi; hanya bila RTO menuntut |
| Pisahkan pemasaran | ❌ | — | Batas memotong funnel |
| Pisahkan pemasaran + auth bersama | ⏸ | 4 | Hanya bila ada beban terukur |
| PostgreSQL | ✅ dikerjakan 15 Okt 2026 atas putusan pemilik | — | — |
| Mikrolayanan / Kubernetes | ❌ | — | Satu kotak 3,6 GB |

Lanjut: [08 Penilaian](./08-PENILAIAN-ARSITEKTUR.md) · [09 Peta Jalan](./09-PETA-JALAN.md)
