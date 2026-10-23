# Rancangan Layanan — Skala Pasar, On-Premise, dan Komersial

> 🔶 **Seluruh dokumen ini RANCANGAN, bukan keadaan.** Delapan dokumen lain
> menggambarkan yang sedang berjalan; yang ini menggambarkan yang hendak dituju.
> Tidak ada bagian di sini yang sudah dibangun, kecuali yang ditandai ✅.
> Disusun 19 Oktober 2026. Tahap 1a–1c **melayani produksi sejak 21 Okt 2026**
> (`main@a8d2749d`, 0.10.0) — jalannya gelar di [07 §5](./07-RIWAYAT.md);
> tahap 1d–D dirilis 22 Okt 2026 (`main@3a6d1d35`, 0.11.0) — [07 §7](./07-RIWAYAT.md).

## 1. Yang patah lebih dulu saat tenant bertambah

Satu basis data per PT (#104) membuat **setiap operasi pemeliharaan dikalikan
jumlah tenant.** Keempatnya hari ini berurutan dan terikat *wall-clock*:

| Operasi | Sekarang | Pada ratusan tenant |
|---|---|---|
| Migration | ✅ *bounded concurrency* (tahap 1b) — masih di gerbang pemblokir | gerbangnya yang jadi pembatas, bukan jumlah langkahnya; §6 |
| Cadangan | ✅ satu objek `pg_dump -Fc` **per basis data** (tahap 1b) | satu objek per tenant per hari — ongkos penyimpanan tumbuh linear, dan itu memang ongkos yang benar |
| Kesesuaian data | ✅ *bounded concurrency* + jejak per basis data (§6) — masih peran `conformance` di `svc-worker` | jendela mingguan menjadi pembatas bila konkurensinya tak lagi cukup |
| Penjadwal | delapan langkah berurutan, tiap jam | satu putaran tidak muat dalam satu jam |

Yang hilang dulu bukan hanya waktu, tapi satu kemampuan: **`pg_dumpall` berarti
satu tenant tidak bisa dipulihkan tanpa menyentuh tenant lain** — padahal
"pulihkan data kami saja ke keadaan Selasa" (kata customer) adalah permintaan
biasa di SaaS berbayar. ✅ Itu tertutup tahap 1b; prosedurnya di `PRODUCTION.md`.

⚠ Dua baris yang sudah ✅ tetap di tabel ini, dan sengaja: tabel ini menamai
**kelas masalahnya**, dan dua baris yang tersisa punya bentuk yang sama. Baris
yang dihapus akan membuat pembaca berikutnya mengira hanya dua operasi yang
pernah dikalikan jumlah tenant.

## 2. Tiga invarian

Ukuran benar-salah setiap penambahan layanan.

> **I-1 · Jumlah tenant tidak boleh menambah pekerjaan *wall-clock*.** Setiap
> fan-out per basis data wajib *bounded concurrency*, berjejak per basis data,
> dan dapat dilanjutkan dari tengah.

> **I-2 · Yang tunggal tetap tunggal: pintu posting dan penulis primary.**
> Penskalaan menambah pembaca dan pekerja — tidak pernah menambah penulis.

> **I-3 · Layanan tidak saling memanggil.** Koordinasi hanya lewat basis data
> bersama. Tabel `jobs` adalah satu-satunya pertemuan `app-customer` dan
> `svc-integrator`.

Akibat I-3, tiga hal didapat sekaligus: integrator mati tidak membuat aplikasi
gagal (permintaan menumpuk sebagai baris), bahasa integrator bisa ditukar per
`kind`, dan tidak ada *dual-write* karena tidak ada pihak kedua yang harus ikut
berhasil.

Setiap dimensi beban punya satu tempat untuk tumbuh:

| Beban yang tumbuh | Yang ditambah |
|---|---|
| Pengguna serentak | replika `app-customer` |
| Pekerjaan per jam | replika `svc-integrator` |
| **Jumlah tenant** | paralelisme jalur `schema` & `tenant`, lalu pecah instans `db-postgres` |
| Volume data per tenant | replika baca, dump per tenant |

## 3. Bentuk layanan target

```mermaid
graph TB
    TR[Traefik] --> AC[app-customer]
    TR --> AO[app-operator]

    AC --> POOL[svc-pooler]
    AO --> POOL
    I[svc-integrator] --> POOL

    subgraph pg[db-postgres — satu instans]
        subgraph ctl[control]
            JOBS[(jobs)]
            REG[(tenant · perusahaan · pengguna · jejak putaran)]
        end
        PLAT[(platform)]
        BOOKS[(basis data perusahaan)]
    end

    POOL --> JOBS
    POOL --> REG
    POOL --> PLAT
    POOL --> BOOKS
    I -.-> BOOKS

    AC --> R[(cache-redis)]
    I --> R
    I --> OBJ[Penyimpanan objek]

    style JOBS fill:#eef7ee,stroke:#5a8f5a,stroke-width:3px
    style OBJ fill:#fff4e6,stroke:#c9873d
```

| | Arti |
|---|---|
| `db-postgres` | **satu** instans PostgreSQL. `control`, `platform`, dan 17 basis data perusahaan adalah **basis data di dalamnya** — bukan layanan tersendiri |
| `basis data perusahaan` | satu basis data per PT (`sai_<slug>`, #104): buku besar dan seluruh dokumen operasionalnya |
| **`jobs`** | tabel di dalam `control`, dan **satu-satunya tempat `app-customer` dan `svc-integrator` bertemu**: aplikasi menerbitkan baris, integrator mengklaimnya, kemajuan dibaca dari `progress`. Keduanya tidak pernah saling memanggil (I-3) — itu sebabnya ia satu-satunya kotak bergaris tebal |
| Garis putus-putus | **langsung**, melewati pooler — hanya jalur `tenant` dan `schema`, karena dump dan DDL lewat pooler mode `transaction` adalah hal yang salah |
| `cache-redis` | tanpa garis ke `db-postgres`: ia tak pernah menjadi sumber apa pun |

**Lima komponen yang diurus sehari-hari**, dan dua hal di luar kelimanya:

| Komponen | Tanggung jawab | Status |
|---|---|---|
| `app-customer` | HTTP, render, validasi, tulis lewat pintu posting | ✅ ada |
| `app-operator` | konsol internal | ✅ ada |
| `svc-integrator` | **seluruh pekerjaan asinkron** — impor, ekspor, dokumen, email borongan, penjadwalan, kesesuaian, migration, cadangan, integrasi luar | baru |
| `cache-redis` | cache bersama antar-replika — **bukan antrean** | baru |
| `db-postgres` | sumber kebenaran; primary (+ standby) | ✅ primary ada |
| `svc-pooler` | **sidecar** PgBouncer, bukan entitas sendiri | ✅ ada, dinamai ulang |
| Penyimpanan objek | luar: dokumen jadi, dump, arsip WAL | baru |

**Image: tiga milik SAI, sisanya hulu.** Lima layanan tidak berarti lima image:

| Komponen | Image | Asal |
|---|---|---|
| `app-customer` | tahap `runner` — keluaran `standalone` Next.js | **SAI** |
| `svc-integrator` | **Go** — binary statis + `postgresql-client-17`; menggantikan `migrator` dan `backup` | **SAI** |
| jalur Node (`ledger` + dokumen) | Node, dari pohon sumber yang sama dengan `app-customer` — hari ini image `-migrator`, layanan `svc-worker` (§3.2) | **SAI** |
| `app-operator` | tahap `runner-operator` | SAI, **hanya SaaS** |
| `db-postgres` · `svc-pooler` · `cache-redis` | `postgres:17-alpine` · `edoburu/pgbouncer` · `redis:<versi>-alpine` | hulu, **versi dipatok** |

⚠ **Ketiganya image terpisah, dan bahasanya pun berbeda.** Yang wajib sama bukan
image-nya melainkan **commit dan tag**-nya: itulah yang membuat gerbang skema
saat boot (§3.2) dan kontrak bangkitan di `contract/` (§3.5) bisa dipercaya.

### `db-postgres` satu server, 19 basis data

`control` dan `platform` **bukan** layanan tersendiri — ketiga URL menunjuk host
dan port yang sama (`pg:5432`), yang berbeda hanya nama basis datanya.

| Basis data | Isinya | Jumlah |
|---|---|---|
| `control` | pengguna, tenant, perusahaan, keanggotaan, token, jejak audit tenant — **dan tabel `jobs`** | 1 |
| `platform` | komersial, jejak putaran, situs publik, operasional — §7 | 1 |
| basis data perusahaan | satu per PT | 17 |

Pemisahan `platform` **doktrinal, bukan fisik**: ia ada supaya penagihan yang
mati tidak menjatuhkan aplikasi, dan itu ditegakkan di tingkat **impor**
(`platform-db` dilarang dari jalur panas akuntansi, dijaga tes). Instans
terpisah tidak menambah apa pun pada jaminan itu. Pemicu memecahnya: tahap 4.

### 3.1 Unit isolasinya JALUR, bukan layanan

> Sesuatu pantas dipisah bila **salah satu** dari empat ini berbeda: **image**,
> **rahasia yang dipegangnya**, **jalur koneksinya**, atau **jumlah instans yang
> benar**. Yang dipisah adalah **container jalur**, bukan layanan — keempatnya
> bisa dinyatakan per container, jadi layanan baru tidak pernah menjadi harganya.

Itu sebabnya migration dan cadangan hidup di `svc-integrator`:

| Pembeda | Cara jalur memenuhinya |
|---|---|
| Rahasia | `BACKUP_ENCRYPTION_KEY` + kredensial S3 hanya DIBACA jalur `tenant` — sejak 22 Okt 2026 jalur itu seproses dengan `interactive` sisi Go di `svc-integrator` (keputusan pemilik, §3.2) |
| Jalur koneksi | jalur `tenant` dan `schema` menunjuk `db-postgres` langsung; jalur lain lewat pooler |
| Jumlah instans | `schedule` dan `schema` berjalan satu; `interactive` dan `bulk` berapa pun |
| Image | satu image Go untuk jalur yang sudah pindah; jalur Node (`ledger`, dokumen) image tersendiri — §3.3 |

Yang berbahaya bukan adanya `pg_dump` di dalam image — pekerja mana pun sudah
punya akses basis data — melainkan **kunci enkripsi dan kredensial unggah**.
Keduanya env, dan env dinyatakan per container, jadi properti itu bertahan utuh.
Harganya: image Go membawa `postgresql-client-17` untuk `pg_dump`, dan
`interactive` membawa perkakas yang tak dipakainya — tanpa kunci, jadi ia tidak
bisa mengirim apa pun keluar. `awscli` dan `openssl` **tidak** ikut: SDK S3 dan
kripto native Go menggantikannya.

**`svc-pooler` wajib, bukan penyetelan:** PostgreSQL satu proses per koneksi,
dan pola klien per-perusahaan membuat koneksi tumbuh mengikuti jumlah perusahaan
aktif, bukan jumlah pengguna. Penempatannya di sisi aplikasi karena *failover* —
pooler yang menumpang host basis data ikut mati bersama primary.

⚠ Anggarannya hari ini timpang: `DEFAULT_POOL_SIZE: 20` berlaku per pasangan
(basis data, pengguna) dengan 19 basis data — sampai 380 koneksi dituntut,
sementara `max_connections` tetap **100** dan tidak ada `MAX_DB_CONNECTIONS`
sebagai batas global. Ketiga setelan itu **prasyarat replika kedua**.

### 3.2 Jalur di dalam integrator

Pembedanya **jalur** (*lane*) — kelas `kind` yang diklaim lewat satu klausa
`WHERE kind IN (…)`. **Setiap jalur adalah PROSES tersendiri dari image yang
sama**, bukan anggaran di dalam satu proses: satu ekspor yang kehabisan memori
hanya menjatuhkan proses jalur `bulk`, dan pengguna yang menunggu unduhan di
jalur `interactive` tidak merasakan apa pun. Operasionalnya tetap satu layanan —
satu commit, beberapa `command`.

| Jalur | Bahasa | Isinya | Instans | Rahasia | Koneksi | Keadaan |
|---|---|---|---|---|---|---|
| `interactive` | Node → Go¹ | ekspor & dokumen yang ditunggu pengguna; penyediaan PT baru (`company.provision`, Node, Okt 2026) | berapa pun | sisi Node: kredensial PEMILIK `PROVISION_DATABASE_URL` (06 §3.10) | pooler | tahap 1c |
| `bulk` | Node → Go¹ | impor besar, paket laporan, email borongan | berapa pun | — | pooler | tahap 1c |
| `schedule` | Go | denyut penerbitan tiap jam | **satu** | — | pooler | tahap 1c — penerbitan hari ini masih langkah di peran `scheduler` (`svc-worker`) |
| `tenant` | **Go** + Node² | cadangan per basis data **(Go)**, kesesuaian data **(Node)** | **satu** per bahasa | kunci enkripsi + kredensial unggah | **langsung** | ✅ `svc-integrator` (Go) + peran `conformance` di `svc-worker` (Node) |
| `schema` | TypeScript³ | migration setiap perusahaan | **satu**, sekali jalan | — | **langsung** | ✅ `migrate`, *bounded concurrency* |
| `ledger` | **Node** | pekerjaan yang **menulis** buku: dokumen berulang, dunning | **satu** | — | pooler (pagar: **langsung**) | ✅ peran `ledger` di `svc-worker` |

¹ Dimulai sebagai proses Node terpisah, pindah ke Go per generator bila ada
pemicunya — §3.3 menjelaskan kenapa jalur yang **menghitung angka akuntansi**
tidak ikut gelombang pertama.

² **Satu jalur, DUA bahasa** — satu-satunya di tabel ini, dan hanya selama
transisinya. Pelari karena itu mengklaim `kind` yang punya handler padanya,
bukan seluruh `kind` jalurnya; lubang yang dibuka keputusan itu (`kind` yang
diterbitkan tanpa pengklaim) ditutup `tests/kind-punya-pengklaim.test.ts`.

³ TypeScript, dan itu keputusan — lihat §3.3 dan §6. `schema` memang sudah
dirancang **tidak** diterbitkan ke antrean (paragraf terakhir bagian ini), jadi
yang tersisa hanya pilihan bahasa penerapnya — dan penerap kedua atas pembukuan
`_prisma_migrations` tidak membeli apa pun yang belum ada.

Hanya satu jalur MEMBACA rahasia — jalur `tenant`. Sampai 22 Okt 2026 ia juga
satu-satunya container yang memegangnya, dan container itu tidak memproses
masukan pengguna. **Itu tidak lagi benar**, dengan keputusan — lihat di bawah.

#### Keputusan 22 Okt 2026 — "1 image = 1 container"

**Diputuskan pemilik** sesudah diberi tahu harganya. Sebelumnya image
`-migrator` menjalankan EMPAT container (`svc-ledger`, `svc-interactive`,
`job-scheduler`, `job-conformance`) dan image `-integrator` DUA (`svc-tenant`,
`svc-interactive-go`). Sesudahnya satu layanan per image:

| Image | Layanan | Isinya | Cara menyatukan |
|---|---|---|---|
| `-migrator` | **`svc-worker`** | peran `scheduler`, `conformance`, `ledger`, `interactive` — empat PROSES | penyelia `scripts/run-workers.ts` (bun, tanpa dependensi): grup proses per peran, SIGTERM diteruskan, awalan log per peran, satu peran berakhir → container keluar bukan-nol |
| `-integrator` | **`svc-integrator`** | jalur `tenant` + jalur `interactive` sisi Go — SATU proses | `cmd/integrator`: kedua pelari bersamaan, satu berakhir → yang lain dihentikan → keluar bukan-nol; logika di `internal/tenantlane` & `internal/interactivelane` |

Yang **tetap** dari rancangan ini: setiap jalur Node masih PROSES tersendiri
(satu ekspor yang kehabisan heap tidak menjatuhkan proses pelari `ledger`),
skrip tiap peran masih satu salinan di compose, dan pagar jalur tunggal
(`ledger`, `tenant`) tetap advisory lock di koneksi langsung —
`CONTROL_DATABASE_DIRECT_URL`, kini disetel compose dasar untuk kedua layanan.
Dua jalan koneksi di `svc-integrator` sengaja dipertahankan: `tenant` langsung
ke `pg` (`CONTROL_DATABASE_DIRECT_URL`), `interactive` lewat PgBouncer
(`CONTROL_DATABASE_URL`).

**Risiko yang DITERIMA, dan bukan disembunyikan:**

1. **Rahasia cadangan seproses dengan masukan pengguna.** `BACKUP_ENCRYPTION_KEY`,
   kredensial S3, dan sambungan LANGSUNG ke `pg` (yang bisa mencacah seluruh
   basis data) kini hidup di proses yang juga mengurai parameter laporan
   (`report.export_go`). Klaim lama "TANPA RAHASIA" di kepala pelari
   `interactive` Go karena itu dicabut. Yang tersisa sebagai batas: muatan
   diurai ke struktur bertipe sempit (`reportId` yang wajib ada di register
   bangkitan, `asOf` yang diurai sebagai tanggal) dan tidak pernah dirangkai ke
   SQL maupun perintah; paket `interactivelane` tidak mengimpor
   `internal/backup` dan tidak membaca variabel cadangan. Celah memori Go (atau
   satu dependensi yang bisa dipaksa membaca berkas/env) kini cukup untuk
   membocorkan kunci yang membuka SELURUH cadangan.
2. **Satu peran jatuh = semua peran restart.** OOM di peran `interactive` kini
   juga memutus putaran penjadwal dan pelari `ledger` yang sedang bekerja
   (lease yang menjaga pekerjaannya; putarannya diulang sejak awal). Dan karena
   putaran `conformance` mulai SAAT container naik, setiap restart memicu satu
   sapuan kesesuaian penuh — crash-loop berarti sapuan berulang.
3. **Skala tidak lagi per jalur.** `--scale` menggandakan keempat peran; peran
   tunggal di replika kedua hanya aman di profil HA (`WORKER_LEADER_ROLES`
   membungkusnya dengan leader election).
4. **Satu `mem_limit` untuk empat proses.** Batas memori per jalur — yang dulu
   bisa dinyatakan per container — kini tidak bisa.
5. **Kredensial PEMILIK seproses-container dengan empat peran (Okt 2026).**
   Penyediaan PT (`company.provision`) pindah dari `app-customer` ke peran
   `interactive`, jadi `PROVISION_DATABASE_URL` (`sai_owner`) kini ada di
   environment `svc-worker` — dan penyelia mewariskan environment yang SAMA ke
   keempat perannya, termasuk yang mengurai parameter ekspor pengguna. Itu
   pertukaran yang dipilih: kredensial itu keluar dari satu-satunya container
   yang menghadap internet. Mencabutnya dari tiga peran lain (`env -u` di
   skrip compose-nya) adalah penguatan murah berikutnya bila diperlukan.

**Pemicu MEMISAHKAN lagi** (salah satunya cukup; memisahkannya kembali =
satu layanan compose + `command` per peran, kodenya tidak berubah):

- jalur `interactive` sisi Go menerima masukan pengguna yang lebih kaya
  daripada `reportId` + tanggal (filter bebas, templat, unggahan) — atau
  laporan Go kedua ber-parameter teks bebas;
- customer, auditor, atau sertifikasi menuntut pemisahan rahasia per proses;
- OOM atau crash-loop satu peran terukur menunda penjadwal / pelari `ledger`
  (restart `sai-svc-worker` > 1× sepekan di luar rilis), atau sapuan
  `conformance` yang berulang karena restart terlihat di `conformance_runs`;
- jalur `interactive` perlu diskalakan sendiri (antrean ekspor menumpuk
  sementara peran lain menganggur).

**Gerbang skemanya sudah terpasang**, dan ia prasyarat pemindahan ini: begitu
pekerjaan latar menjadi layanan yang berjalan terus, tidak ada lagi apa pun yang
"selesai" untuk ditunggu `service_completed_successfully`. Aturan dan arah
vonisnya kini **keadaan**, bukan rancangan — [02 §12](./02-LAYANAN-INFRA.md).
Yang belum: gerbangnya masih per-image, bukan **per perusahaan**, dan
expand/contract (§6) menuntut yang kedua.

Jalur `schema` tetap dijalankan **sekali** saat rilis (`docker compose run --rm`),
bukan diterbitkan ke antrean: migration adalah langkah rilis, dan pelaksananya
harus melihat kode keluarnya. Di on-premise, pelaksananya customer.

### 3.3 Bahasa & runtime: Go

✅ **Keputusan dan modulnya kini KEADAAN** — `services/integrator` ada, bersama
pohon poliglotnya, dua aturan yang menahannya, batas Go, dan ketiga gerbang
rilisnya: [01 §10](./01-ARSITEKTUR.md). Yang dibeli memang terukur: image jalur
`tenant` **185 MB** melawan image `backup` yang mewarisi seluruh
`node_modules`, biner statis 12 MB, dan `awscli` + Python keluar dari jalur
cadangan.

Yang tinggal di sini: pembagian jalur yang **belum** pindah, dan batas yang
menahan sebagiannya.

| Jalur | Bahasa | Keadaan |
|---|---|---|
| `tenant` — cadangan | **Go** | ✅ `svc-integrator` (jalur `tenant`), tahap 1b — [02 §5](./02-LAYANAN-INFRA.md) |
| `tenant` — kesesuaian data | TypeScript | **tertahan** — 2 dari 11 pemeriksaannya menghitung materialitas; pemicunya sama dengan 1d (§9) |
| `schema` — migration | TypeScript | **tertahan** — Prisma pemilik pembukuan skema; §6 menahan asinkronisitasnya sampai *expand/contract* berlaku |
| Integrasi luar (e-faktur, feed bank) | **Go** | belum dibangun — HTTP+XML, SFTP; tidak menyentuh pembukuan |
| `schedule` — penerbitan | **Go** | belum dibangun — hanya menerbitkan baris `jobs`. Penerbitan hari ini masih langkah di peran `scheduler` (`svc-worker`, Node), dan itu memadai |
| `interactive` · `bulk` — ekspor & dokumen | **Go, bersyarat** | tidak menulis ke buku, tapi **menghitung angka akuntansi**; lihat batas di bawah. **Tahap 1d dimulai 22 Okt 2026**: Neraca Saldo punya implementasi Go (`internal/ledgerread`), paritas produksi lulus hari yang sama, dan ia kini `go` — lembar sebarnya dihasilkan jalur `interactive` Go di `svc-integrator` (`report.export_go`), jalur berkas TS-nya dicabut, layar dan PDF-nya tetap TS (§9) |
| Pekerjaan yang MENULIS buku besar | **tetap Node** | ✅ jalur `ledger`, dan pintu posting satu-satunya alasan keberadaannya |

⚠ **Batas yang berlaku: Go berhenti sebelum perhitungan akuntansi, sampai ada
pemicu.** Aturannya sendiri kini di [01 §10](./01-ARSITEKTUR.md) bersama dua
pemindahan yang sudah ditahannya. Yang tinggal di sini ONGKOSNYA, sebab ia
argumen tentang 1d — dan 1d belum dibangun:

| Ongkos | Bentuknya |
|---|---|
| **Ini penulisan ulang aturan, bukan pemindahan proses** | **39 berkas · 12.623 baris TS** (`bun run report:count`, 22 Okt 2026 — daftar berkasnya tertulis di skripnya). Angka lama "45 berkas · 14.625 baris" tidak punya daftar, jadi tak bisa diulang maupun dibantah. `contract/` (§3.5) membangkitkan **konstanta**, bukan **aturan**: dua implementasi "laba ditahan periode ini" bisa sama-sama konsisten di dalam dirinya dan tetap berbeda hasilnya |
| **Dua implementasi hidup berdampingan selama transisi** | `app-customer` memakai tumpukan laporan yang sama untuk tampilan di layar — **48 berkas di `src/app`** mengimpornya langsung (skrip yang sama; angka lama "174 pengimpor" tanpa definisi yang bisa diulang) — dan layar tidak bisa menunggu pekerjaan. Jadi TS untuk layar, Go untuk berkas — kelas kegagalan yang I-2 ada untuk mencegah |
| **Node sudah terbukti bisa di server** | `src/lib/invoice-send.ts` menjalankan jsPDF **di Node** hari ini (impor dinamis, `server-only`). Jadi §5 tidak menuntut Go — ia hanya menuntut generatornya pindah dari peramban ke server |
| **25 penjaga tidak melihat Go** | dari 306 berkas tes, 25 memindai kode untuk menegakkan aturan struktural dan semuanya berhenti di batas `services/`. Permukaan Go wajib punya penjaga Go-nya sendiri |

⚠ **Ongkos baris kedua kini DIBAYAR per laporan, bukan sekaligus.** Selama
transisi, satu laporan boleh punya dua implementasi HANYA bila register
`src/lib/report-engine.ts` menyebutnya dan skrip paritasnya ada — dan layar
tetap TS sampai diputuskan lain. Dua implementasi tanpa pembanding adalah
kelas kegagalan di atas; dua implementasi yang dibandingkan baris demi baris
terhadap buku sungguhan adalah migrasi yang bisa diperiksa.

Maka: **tahap 1d (§9) dibuka oleh pengukuran, bukan oleh rencana.** Pemicunya
satu dari dua — jalur ekspor memblokir event loop sampai p95 permintaan interaktif
terpengaruh, atau memori jalur dokumen memaksa `--max-old-space-size` lagi. Sejak
22 Okt 2026 keduanya **diukur** dan vonisnya terbaca di konsol `/scheduler` — bentuk
pengukurannya di §11. Sebelum pemicu itu terbaca, jalur `interactive` dan `bulk` berjalan sebagai **proses Node
terpisah** di luar `app-customer`: itu sudah membeli paralelisme dan isolasi
memori yang dicari, tanpa menyentuh satu aturan akuntansi pun.

⚠ **Baris keempat tabel ongkos di atas sudah dibayar sebagian, dan hasilnya
bukan yang diperkirakan.** "25 penjaga tidak melihat Go" dijawab tahap 1b dengan
penjaga Go-nya sendiri — tapi yang ditulis bukan 25 pemindai Go. Yang ditulis
penjaga **TypeScript** yang memindai teks Go (`tests/services-go.test.ts`,
`kind-punya-pengklaim`, `go-image-version`), sebab gerbang yang tidak pernah
dilewati orang adalah `bun run verify` — bukan gerbang yang paling dekat dengan
kodenya. Sisi Go menjaga PERILAKU yang hanya bisa dibuktikan dengan
menjalankannya. Pembagian itu pantas dipakai ulang di 1d.

Runtime Node yang tersisa tetap **Node, bukan Bun**: pagar
`--max-old-space-size` diabaikan JavaScriptCore.

### 3.4 Batas `cache-redis`

| Redis **boleh** | Redis **tidak boleh** |
|---|---|
| Cache bersama antar-replika (`cacheHandler`) | **Antrean pekerjaan** |
| Koordinasi sekilas: lease, pembatas laju | Sumber kebenaran apa pun |

> **Apa pun yang hilang bila Redis dikosongkan harus boleh hilang.** Redis mati
> = aplikasi melambat. Redis mati ≠ pekerjaan hilang atau tagihan terlewat.

Yang kini ada di Redis (kode tahap 2, opt-in — [02 §19](./02-LAYANAN-INFRA.md)),
dan ke mana masing-masing jatuh tanpanya:

| Isi | Tanpa Redis |
|---|---|
| Pesan invalidasi 8 cache data kendali (izin, registry, surel, entitlement…) | cache **dilewati** sampai langganan pulih, lalu dikosongkan — lebih lambat, tidak basi |
| Penghitung pembatas laju bersesi | penghitung memori per replika — longgar, tetap berbatas |
| Buku tag Next (`updateTag`) | tag berlaku lokal; replika lain menyusul lewat `revalidate` |
| Sewa sidik penyimpanan bersama | peringatan saat start, bukan penolakan |

Tanpa persistensi (`--save ""`, tanpa AOF) dan dengan pengusiran LRU —
konfigurasinya sendiri menyatakan bahwa isinya boleh hilang.

### 3.5 Kontrak lintas bahasa — yang belum dibangkitkan

✅ **Struktur pohonnya dan aturan "setiap konstanta dua-bahasa DIBANGKITKAN"
kini KEADAAN** — [01 §10](./01-ARSITEKTUR.md). `contract/kinds.yaml` → TS +
Go, generatornya menolak kombinasi yang tidak konsisten, dan berkas bangkitan
yang basi ditolak gerbang (`contract:gen --cek`).

Yang tinggal di sini: kontrak yang **belum** ada, beserta pemakai pertamanya.

| Kontrak | Dibangkitkan jadi | Pemakai pertamanya |
|---|---|---|
| `contract/jobs.sql` → `sqlc` | kueri Go bertipe atas tabel `jobs` | belum ada. SQL antrean Go hari ini ditulis tangan dengan parameter terikat, dan bentuknya dijaga `tests/services-go.test.ts` — `sqlc` membeli pengetikan, bukan keamanan yang belum ada |
| `contract/accounting.yaml` — sisanya | ambang materialitas, **saldo normal per tipe akun** | laporan Go yang membacanya: materialitas bersama kesesuaian data. (Kategori, sisi laporan, band Laba Rugi, jenis jurnal penutup, mata uang, dan status dokumen SUDAH masuk — lihat di bawah) |
| `internal/document/` | ✅ lahir 22 Okt 2026 — penulis XLSX pustaka baku + penyimpanan hasil; kalimat/kolom/format/rupa dibaca dari `internal/contract/report_layout_gen.go`, yang DIBANGKITKAN dari `statement-layout.ts` + `report-export.ts` (sumber tunggal layar, PDF, dan lembar sebar) | lembar sebar Neraca Saldo. Dokumen satuan (PDF) belum — menunggu keputusannya sendiri |

✅ **`contract/accounting.yaml` LAHIR 22 Okt 2026, dengan dua kunci saja**:
`money.scale` (2 — `Decimal(15,2)`) dan `account_types` (17 nilai, urutan
formulir). Keduanya punya pembaca Go hari ini — `internal/ledgerread` mengurai
NUMERIC ke sen dengan skala itu dan melaporkan akun bertipe asing — dan sisi
TS-nya MEMBACA bangkitan, bukan daftar sendiri: `ACCOUNT_TYPES` di
`src/lib/accounting.ts` kini dirakit dari `ACCOUNT_TYPE_VALUES` bangkitan +
peta `Record<AccountType, …>` (label/kategori/saldo normal), jadi tipe baru di
kontrak tanpa label adalah galat `tsc`, dan vonis seimbang `reports.ts` memakai
`MONEY_SCALE`. Generatornya menolak duplikat, nilai bukan `snake_case`, dan
skala di luar 0..6 (int64 sen).

⚠ **Aturan "nol pembaca" kini DITEGAKKAN, bukan hanya ditulis.**
`tests/contract-accounting.test.ts` menolak kunci baru di `accounting.yaml`
yang tidak punya pembaca di Go tulisan tangan, dan menolak nilai tipe akun yang
ditulis sebagai teks di luar berkas bangkitan. Itu sebabnya kategori tipe akun
BELUM masuk: Neraca Saldo menaruh saldo di sisi yang ditunjuk TANDA selisihnya,
bukan di sisi normal tipenya — ia tidak membaca kategori sama sekali.

✅ **Kategori masuk BERSAMA Laba Rugi & Neraca Go (22 Okt 2026), dalam commit
yang sama — persis seperti yang dijanjikan paragraf di atas.** Lima kunci baru,
masing-masing dengan pembaca Go di `ledgerread/statements.go` dan pembaca TS:
`account_categories` + `account_type_categories` (`accountCategoryFor` —
`ACCOUNT_TYPE_TRAITS` tidak lagi mengetik kategori), `category_statement_side`
(tanda per KATEGORI: `debit` = debit − kredit; `reports.ts` lewat
`statementAmount`), `income_statement` (urutan band, penimpa per tipe, band
bawaan per kategori; `incomeStatementSectionFor`), dan `closing_journal_type`
(`year-close.ts`). Generatornya menolak peta yang tidak LENGKAP (tipe tanpa
kategori, kategori tanpa sisi) dan penimpa band untuk tipe yang bukan laba
rugi. Yang tetap di luar: **saldo normal** — tidak satu laporan Go pun
membacanya, dan `accumulated_depreciation` (aset bersaldo normal kredit)
membuktikan ia bukan turunan kategori.

✅ **Mata uang & status dokumen masuk 23 Okt 2026 — sebagai PENGECUALIAN YANG
DISEBUT dari aturan "nol pembaca", atas keputusan pemilik.** Tiga kunci:
`currencies` (`values` ISO 4217 + `base`), `invoice_statuses` (3), dan
`contract_statuses` (4 — `completed` disahkan hari yang sama, temuan S3).
`@sai/core/constants` me-re-ekspor bangkitannya (impor lama tetap bekerja),
zod `validations/{contract,invoice,fx}.ts` dan `check-data-conformance`
membacanya; label & warna tetap di TS. Generatornya menolak kode bukan ISO,
duplikat, `base` di luar `values`, dan status kontrak yang tidak DIAWALI
status faktur persis (posisi menentukan warna donat). Pembaca Go-nya BELUM ada
— yang pertama adalah pemeriksa kesesuaian data bila ia pindah ke Go — dan
`tests/contract-accounting.test.ts` menjaga pengecualian itu tetap jujur: ia
merah begitu Go tulisan tangan memakai salah satu kunci itu, supaya kuncinya
dicoret dari pengecualian dan pembacanya ikut dijaga. Kolom
`contracts.status` kini juga dijaga CHECK constraint (migration perusahaan
0003) yang daftarnya wajib sama dengan kontrak.

## 4. Yang belum terbangun dari antrean

**Tabel `jobs` sudah ada**, dan bersamanya: kontrak `kind`/status yang
dibangkitkan, klaim satu-pernyataan ber-`FOR UPDATE SKIP LOCKED`, *lease* yang
diperpanjang, *reclaim*, *backoff* ber-jitter, indeks berpredikat, pengarsipan
baris `done`, dan jalur `ledger` sebagai layanan. Bentuk tabelnya, daur hidup
statusnya, dan sebabnya ia tinggal di `control` kini **keadaan** —
[04 §1.2 dan §8.9](./04-ALIRAN-DATA.md); layanannya di
[02 §5](./02-LAYANAN-INFRA.md); metriknya di
[02 §14](./02-LAYANAN-INFRA.md).

✅ **Otorisasi hasil pekerjaan sudah jadi (tahap 1c).** Ketiga aturannya kini
kode, bukan asumsi — permukaannya di [03 §1](./03-API-INTEGRASI.md), kontrolnya
di [06 §3](./06-KEAMANAN.md). Yang paling mudah terlewat di antara ketiganya
ternyata yang KEEMPAT, dan ia ditemukan dengan menabraknya: izin JENIS tidak
cukup — `report.export` menjawab "boleh mengekspor laporan", bukan "boleh
mengekspor laporan INI" (#355), sehingga pekerjaan yang terbit ketika sebuah
modul masih aktif tetap bisa diunduh sesudah modul itu dimatikan.

Yang **belum**, dan ia satu — bukan dua:

**Dua jawaban untuk *dual-write*.** Karena `jobs` di `control` sementara tulisan
domain di basis data perusahaan, penerbitan tidak satu transaksi dengan tulisan
domainnya. Rancangan ini memakai keduanya, masing-masing di tempatnya:

| Pola | Bentuknya | Dipakai untuk |
|---|---|---|
| **Transactional outbox** | tabel `outbox` di basis data perusahaan, ditulis dalam **transaksi yang sama** dengan jurnalnya; satu *relay* memindahkannya ke `jobs` | pekerjaan yang lahir dari satu tulisan domain — "faktur diposting → terbitkan dokumen & email" |
| **Rekonsiliasi** | pekerja membaca keadaan domain dan menyimpulkan sendiri apa yang jatuh tempo | produser berjadwal — pengingat, dokumen berulang, dunning |

Outbox memberi atomisitas yang rekonsiliasi tidak bisa: tanpanya "posting
berhasil tapi dokumennya tak pernah terbit" mungkin terjadi, dan tak ada putaran
berikutnya yang akan menyadarinya. Sebaliknya rekonsiliasi lebih kuat untuk yang
berjadwal — ia menyusul sendiri setelah pemadaman, dan **sudah** jadi cara kerja
produser hari ini. Konsekuensi outbox: pengiriman **sekurang-kurangnya sekali**,
jadi setiap pemakai wajib idempoten — dan `dedupe_key` unik itulah yang
menjadikannya demikian. Relay memakai polling berinterval pendek, bukan CDC.

> **Satu aturan yang tetap:** pekerjaan demi kenyamanan pengguna (ekspor, impor)
> tidak butuh keduanya — yang hilang hanya berarti pengguna mengklik lagi.

⚠ **Outbox TIDAK dibangun di tahap 1c, dan itu keputusan — bukan sisa.**
Paragraf di atas menyebut sendiri bahwa ia "menunggu pemakai pertamanya", dan
pemakai yang dinamainya adalah **"faktur diposting → terbitkan dokumen &
email"** — yaitu fitur yang `src/lib/invoice-send.ts` sengaja menolak
mengotomatiskan:

> *"TIDAK ADA YANG DIKIRIM OTOMATIS DI SINI. Setiap fungsi di modul ini berawal
> dari seseorang yang menekan tombol. Pengingat otomatis adalah #467, dan
> digabung sekarang berarti satu bug di sini mengirimkan surel ke pelanggan
> sungguhan tanpa ada yang memintanya."*

Membangun mekanisme untuk konsumen yang sengaja absen menghasilkan jalur yang
tidak pernah dijalankan satu kali pun — dan jalur yang tidak pernah dijalankan
tidak bisa dibedakan dari jalur yang rusak. Alasan yang sama menahan
`contract/accounting.yaml` (§3.5).

**Pemicunya karena itu BUKAN tahap, melainkan satu keputusan produk:** hari
pertama ada pengiriman dokumen yang terjadi TANPA seseorang menekan tombol.
Sebelum itu, rekonsiliasi sudah cukup untuk setiap produser yang ada.

## 5. Dokumen dibuat di server

✅ **Sebagian besar sudah jadi (tahap 1c).** Permukaannya di
[03 §1](./03-API-INTEGRASI.md); jalur berantrenya di
[02 §5](./02-LAYANAN-INFRA.md).

| Dokumen | Sesudah | Keadaan |
|---|---|---|
| Satu faktur, surat jalan, kontrak, retur | server, sinkron, di-stream — milidetik | ✅ setiap dokumen satuan, dari ID-nya |
| Laporan pendek yang sudah tampil di layar | server, sinkron | ✅ `/api/reports/pdf` & `/api/reports/export` |
| Ekspor besar | **pekerjaan** → penyimpanan objek → pengguna mengunduh tautan | ✅ jalur `interactive`; di atas ambang penyerahan |
| **Paket laporan** (banyak laporan satu periode jadi satu berkas) | pekerjaan `report.package` | **belum** — ia FITUR BARU, bukan pemindahan |
| Peramban | tidak menghasilkan apa pun | sebagian: tiga generator LAPORAN masih di sana |

**Yang tersisa dua, dan keduanya bukan "pemindahan yang belum selesai":**

| Tersisa | Kenapa ia bukan sekadar sisa |
|---|---|
| Tiga generator laporan di peramban (`finance-report`, `opname-sheet`, `stock-report`) | ketiganya LAPORAN, bukan dokumen satuan — jalur mereka `/api/reports/pdf`, dan memindahkannya menuntut pembangun payload per laporan, bukan satu pemuat per dokumen |
| `report.package` | tidak pernah ada di aplikasi ini. Membangunnya berarti **menambah fitur** di bawah nama "pindah ke server", dan itu dua keputusan yang digabung menjadi satu |

⚠ **Satu klaim di §5 ini DIUKUR dan ternyata punya batas.** "Byte tetap
identik" dipakai untuk menyimpulkan pemindahan ini tidak menuntut Go, dan
kesimpulannya benar — tapi dua instance jsPDF atas muatan yang sama TIDAK
menghasilkan byte yang sama: mereka berbeda pada `/ID` di trailer (pengenal
berkas acak, 60 byte) dan, bila jamnya berjalan, `/CreationDate`. Isinya
identik.

Jadi syarat audit ("server menyimpan byte yang persis sama dengan yang dikirim
ke customer") dipenuhi dengan **membangkitkan sekali** dan memakai buffer itu
untuk kedua tujuan — bukan dengan membangkitkan ulang lalu membandingkan.
Angkanya dan penjaganya di [08 §2](./08-GLOSARIUM.md).

⚠ **Ongkosnya CPU yang hari ini gratis — dan ia sudah dibayar sebagian.**
Perakitan PDF dulu berjalan di mesin pengguna: satu peramban per pengguna,
paralel sempurna, nol beban server. Memindahkannya memindahkan beban itu ke
mesin 2 vCPU · 8 GB yang dibagi enam aplikasi.

Yang dibangun karena itu membelah pembayarannya menurut ONGKOS, bukan menurut
jenis dokumen — dan pembelahnya satu angka: `EXPORT_QUEUE_HANDOFF_ROWS`. Di
bawahnya sinkron (milidetik, satu permintaan); di atasnya diserahkan ke antrean.
§5 dulu menyiratkan seluruh jalur dokumen harus lewat antrean; yang terukur
ternyata lebih tajam — **yang perlu antrean bukan "dokumen" melainkan yang
besar**, dan antrean untuk satu faktur hanya menambah penantian beserta satu
tombol yang harus menunggu.

Angkanya sendiri (5.000 baris) masih **dikarang**, dan sekarang ada alat untuk
memperbaikinya: histogram durasi per jalur sudah terbaca (§11). Yang belum ada
sampelnya — ambang disetel dari pengukuran, bukan dari hari pertama pengukuran
itu menyala.

✅ **Pemindahan ini memang tidak menuntut Go, dan itu terbukti.**
`src/lib/invoice-send.ts` sudah menjalankan jsPDF di Node sejak #465; tahap 1c
memakai generator yang SAMA di rute server dan di jalur `interactive`. Menulis
ulang generatornya di Go akan menambah jendela dua-implementasi §3.3 untuk
setiap dokumen yang pindah. Urutannya tetap: **Node dulu, Go menyusul per
generator bila ada pemicunya** — dan sampai hari ini tidak ada.

## 6. Fan-out per tenant

Menutup §1, dan inilah pekerjaan yang paling menentukan kesiapan pasar.

| Operasi | Jalur | Perubahan | Keadaan |
|---|---|---|---|
| Migration | `schema` | `for` loop → *bounded concurrency*, hasil per perusahaan dicatat, rilis dapat dilanjutkan dari tengah | ✅ ketiganya ada (tahap 1b) — tapi masih di gerbang pemblokir, dan masih TypeScript. Alasannya di bawah |
| **Cadangan** | `tenant` | `pg_dumpall` → **`pg_dump` per basis data** + satu `pg_dumpall --globals-only`. Satu tenant bisa dipulihkan tanpa menyentuh yang lain | ✅ [02 §5](./02-LAYANAN-INFRA.md) · celah on-premise #5 tertutup |
| Kesesuaian | `tenant` | *bounded concurrency* + baris jejak per basis data | ✅ **selesai 20 Okt 2026** — `CONFORMANCE_CONCURRENCY` (bawaan 3, plafon 8) + catatan per buku di jejaknya, terbaca di konsol. Masih peran `conformance` di `svc-worker`, bukan jalur tersendiri: belum ada `kind` yang diterbitkan untuknya |
| Denyut jam | `schedule` | menerbitkan satu pekerjaan per (tenant, langkah) — §4 | sebagian: dua langkah sudah MENERBITKAN (`recurring:publish`, `backup:publish`), tapi penerbitnya masih langkah di peran `scheduler` (`svc-worker`), bukan jalur `schedule` tersendiri |

✅ **Bukti kelengkapan cadangan sudah diperluas**: setiap basis data terdaftar
wajib punya objek dumpnya sendiri, bukan hanya hadir di dalam satu dump besar —
dan basis data terdaftar yang HILANG dari server menggagalkan putaran sebelum
satu objek pun dikirim. Pembuktinya memeriksa setiap objek, bukan satu.

**Memparalelkan migration tidak cukup — skemanya yang harus berubah.** Selama
rilis memblokir sampai setiap basis data termigrasi, waktu padam tetap tumbuh
mengikuti jumlah tenant. Jawaban bakunya **expand/contract** (*parallel change*):

> **Setiap migration wajib menghasilkan skema yang bekerja untuk kode LAMA dan
> kode BARU sekaligus.** Perubahan yang memutus kompatibilitas dipecah jadi tiga
> rilis: **expand** → **migrate** → **contract**.

Tiga hal yang didapat, dan tidak bisa diperoleh dengan cara lain: rilis berhenti
memblokir, rollback tidak menyentuh skema, dan gerbangnya berubah dari "semua
perusahaan siap" menjadi "perusahaan ini siap" — satu yang gagal tidak lagi
menahan 16 lainnya. Harganya: struktur lama dan baru hidup berdampingan beberapa
rilis, jadi fase `contract` **wajib punya nomor issue saat `expand` ditulis**.

✅ Aturannya **berlaku sejak 20 Okt 2026** — ditegakkan `tests/expand-contract.test.ts`,
rinciannya di `docs/DATABASE.md` §7.1. Yang belum adalah **memindahkan
penerapannya** keluar dari gerbang pemblokir, dan pemicunya ongkos: pada 17
perusahaan gerbang itu masih murah — **24 detik** pada gelar 21 Okt 2026
(`COMPANY_MIGRATE_CONCURRENCY=2`), detik, bukan menit. Ia dijadikan aturan **sebelum** jumlahnya
membuatnya mahal, karena mengubah kebiasaan migration lebih lambat daripada
menambah tenant.

⚠ **Dan ia PRASYARAT, bukan pelengkap — itu yang ditemukan tahap 1b.**
Memindahkan migration ke antrean tanpa expand/contract berarti aplikasi melayani
buku yang skemanya lebih tua daripada kodenya, yaitu persis keadaan yang
expand/contract ada untuk membuatnya aman. Jadi urutannya terbalik dari yang
terbaca di tabel §9: **expand/contract lebih dulu, jalur `schema` menyusul.**
Sampai itu, yang dibutuhkan §6 dari jalur ini sudah ada tanpa penerap migration
kedua — dan penerap kedua atas pembukuan `_prisma_migrations` adalah kelas
kerusakan yang tidak menghasilkan galat (§3.5: Prisma tetap pemilik skema).

## 7. Dua profil penyebaran: SaaS dan On-Premise

Satu commit, dua profil. Bedanya konfigurasi, bukan kode.

| | SaaS | On-Premise |
|---|---|---|
| Tenant | banyak | satu |
| Basis data `platform` | ya | **tidak ada** |
| Penagihan | penjadwal langganan | mati; diganti lisensi |
| Entitlement | `plan_key` + modul per perusahaan | **berkas lisensi** → modul per perusahaan |
| Cadangan & kuncinya | SAI | customer, tertulis di serah terima |
| Pembaruan | SAI men-deploy | tag versi; customer menarik |

### SaaS vs On-Premise

```mermaid
graph LR
    subgraph inti[Inti bersama — satu commit, dua image]
        AC[app-customer]
        I[svc-integrator]
        POOL[svc-pooler]
        JOBS[(jobs)]
        REG[(control)]
        BOOKS[(basis data perusahaan)]
        VOL[Volume dokumen + jejak audit]
        AC --> POOL
        I --> POOL
        POOL --> JOBS
        POOL --> REG
        POOL --> BOOKS
        AC --> VOL
        I --> VOL
    end

    TR[Traefik] --> AC
    OPS[app-operator] --> POOL
    REG --- PLAT[(platform)]
    AC --> R[(cache-redis)]
    I --> R
    I --> OURS[Penyimpanan objek SAI]

    RP[Reverse proxy customer] --> AC
    LIC[Berkas lisensi] --> AC
    LIC --> I
    I --> CUST[Volume cadangan customer]

    classDef saas fill:#eaf1fb,stroke:#4a6fa5
    classDef ded fill:#fff4e6,stroke:#c9873d
    class TR,OPS,PLAT,OURS,R saas
    class RP,LIC,CUST ded
    style JOBS fill:#eef7ee,stroke:#5a8f5a,stroke-width:3px
```

| | Arti |
|---|---|
| Kotak dalam `inti` | ada di **kedua** profil, dari commit yang sama |
| 🔵 biru · 🟠 jingga | **hanya SaaS** · **hanya on-premise** |
| Garis **tanpa arah** | "berada di dalam" — `platform` adalah basis data di instans `db-postgres` yang sama. Ketiadaannya di on-premise berarti satu basis data tidak dibuat, bukan satu layanan tidak dipasang |

### Yang dipasang di on-premise

```
docker compose -f docker-compose.yml -f docker-compose.onprem.yml up -d
```

| Dipasang | Wajib? |
|---|---|
| `app-customer` · `svc-integrator` · `db-postgres` | **wajib** |
| `svc-pooler` | dipasang untuk **keseragaman konfigurasi**, bukan untuk beban |
| Reverse proxy **milik customer** | **wajib** — TLS harus berhenti di suatu tempat; Traefik SAI tidak dikirim |
| Volume `pg_data` · `documents` · `audit` · cadangan | **wajib** — dokumen dan jejak audit **tidak** ada di basis data |
| Berkas lisensi | **wajib**, hanya-baca ke `app-customer` dan jalur `schedule` (hari ini `svc-worker`) — [06 §3.7](./06-KEAMANAN.md). Yang di-mount **direktori** `${SAI_LICENCE_DIR:-./lisensi}` → `/etc/sai:ro`, bukan berkasnya: bind-mount satu berkas mematok inode, jadi lisensi pengganti tidak terlihat sampai restart |
| Jalur `schema` | **wajib setiap pembaruan**, dijalankan customer |
| `cache-redis` · `app-operator` · basis data `platform` | **tidak dipasang** |

Dua komponen sering dikira wajib, dan keduanya gugur di profil ini:

| Komponen | Kenapa gugur |
|---|---|
| `cache-redis` | tugasnya cache bersama **antar-replika**; on-premise satu replika, jadi cache dalam-proses memadai. Pembatas laju endpoint publik **sudah** memakai `control` dan sengaja bukan Redis (#138) |
| `svc-pooler` | aritmetikanya berbeda: satu tenant menuntut belasan koneksi (`COMPANY_CLIENT_POOL_MAX` 4 × `DB_CONNECTION_LIMIT` 2 + `control` 2) terhadap `max_connections` 100 — bukan 380 lawan 100 |

**Fondasinya sudah ada**, dan yang paling menentukan bukan yang baru dibangun:
isolasi data per perusahaan (#104) membuat hal tersulit di profil ini selesai
sebelum dimulai, entitlement modul **sudah** per perusahaan sehingga langsung
bisa digerakkan lisensi, dan doktrin #137 sudah menjaga batas plane penagihan.
Compose on-premise, tag versi wajib, profil penyebaran, jejak putaran di
`control`, dan bundel diagnostik kini **keadaan, bukan rancangan** — semuanya
dijelaskan di [02](./02-LAYANAN-INFRA.md). Begitu pula **artefak lisensi** dan
**penegakan entitlement di satu pintu**: kriptografi dan kustodi kuncinya di
[06 §3.7](./06-KEAMANAN.md), pintunya di [01 §8](./01-ARSITEKTUR.md).

✅ **Kelima celah on-premise tertutup, 20 Okt 2026.** Nomor pensiun dan tidak
dipakai ulang. Yang terakhir, **#5 cadangan per tenant**, ditutup tahap 1b:
`pg_dumpall` diganti satu objek `pg_dump -Fc` **per basis data** + satu
`pg_dumpall --globals-only` + satu manifest, sehingga satu tenant bisa
dipulihkan tanpa menyentuh tenant lain. Keadaannya kini
[02 §5 `svc-integrator`](./02-LAYANAN-INFRA.md); prosedur pemulihan satu PT ada di
`PRODUCTION.md`.

Profil ini yang membutuhkannya paling dulu, dan itu terbukti dua kali: di
on-premise tidak ada bucket milik SAI dan seringkali tidak ada S3 sama sekali,
jadi direktori `cadangan` di mesin customer adalah satu-satunya salinan yang
ada — yang juga membuat aturan "yang terbaru tidak pernah dibuang" berlaku di
kedua tujuan, bukan hanya di jalur lokal.

Hanya tiga hal menyeberang batas customer, dan ketiganya **manual**: image rilis
bertag versi (masuk), berkas lisensi (masuk), bundel diagnostik (keluar).

✅ **Tahap D — kode lengkap, 22 Okt 2026.** Yang ditambahkan:

| Butir | Keadaan |
|---|---|
| Mount lisensi | hanya-baca ke `app-customer` + `svc-worker`, `LICENCE_FILE` disetel profil (`tests/onprem-profile.test.ts`) |
| Batas lisensi | ditegakkan di titik **pembuatan** PT dan undangan/penerimaan pengguna lewat `creationQuotaFor` / `seatQuotaOverride` (`src/lib/entitlement-source.ts`); di on-premise dihitung atas seluruh pemasangan. SaaS tidak berubah. Yang sudah ada tidak pernah ditutup (`tests/licence-limits.test.ts`) |
| Dukungan & versi | `supportEndsAt` lewat / versi berjalan > `maxVersion` → pita **informasi** di `/platform` bagi pengelola + `licence` di `/api/health` (ikut bundel diagnostik) |
| Saluran rilis | tag git `v*` → image `:<versi>` (tanpa `:latest`, tag ≠ `package.json` ditolak) + bundel luring `docker save` + `SHA256SUMS` + compose sebagai aset GitHub Release (`tests/release-channel.test.ts`) |
| Kunci publik belum ditanam | peringatan `[start]` (`src/instrumentation.ts`), `licence.status: "key-not-set"` di probe & bundel |
| Serah terima | templat [`docs/ONPREM-SERAH-TERIMA.md`](../ONPREM-SERAH-TERIMA.md) — kunci cadangan, reverse proxy/TLS, bantahan DRC |
| Register lisensi (sisi SAI) | konsol operator `/licences` (migration platform 0006, izin `licence.register`): menyusun perintah `licence:issue`, mengarsipkan berkas `.sai` yang ditandatangani luring — **arsip, bukan kewenangan** ([06 §3.7](./06-KEAMANAN.md)) |
| Pindah dari SaaS | runbook [`docs/ONPREM-PINDAH-DARI-SAAS.md`](../ONPREM-PINDAH-DARI-SAAS.md): `tenant:export-onprem` (bekukan + bundel bersandi) → `tenant:import-onprem` (pemasangan kosong) → `tenant:mark-migrated-out`; jalan balik `tenant:unfreeze`; bukti `tenant:prove-onprem`. Migration kendali 0010 (`frozen_at`, `migrated_out_at`, status `migrated_out`) |

⚠ **Satu langkah tersisa, dan sengaja bukan kode:** kunci publik produksi.
`LICENCE_PUBLIC_KEY_PEM` masih `"BELUM-DISETEL"` sampai pemilik membuat pasangan
kunci di mesin luring dan menempel kunci publiknya ([serah terima
§0](../ONPREM-SERAH-TERIMA.md)). Kunci privat tidak pernah dibuat oleh agen,
CI, atau di repo.

### DC/DRC customer menggantikan HA SAI — bukan cadangannya

Yang benar disimpulkan: **lapisan HA SAI tidak dikirim** — tanpa standby
sinkron, tanpa witness, tanpa Patroni/etcd. Yang **tidak** benar: bahwa jalur
cadangan jadi tidak perlu.

| DC/DRC menjawab | Cadangan menjawab |
|---|---|
| mesin atau situs hilang | **kesalahan manusia**, migration yang merusak, korupsi data |
| keadaan **sekarang** | keadaan **pada suatu titik waktu** |
| seluruh kluster | **satu tenant saja** |
| berkas basis data | berkas basis data **+ dokumen + jejak audit** |

Sebabnya: **replikasi menyalin perintah yang salah dengan patuh.** Satu `UPDATE`
tanpa `WHERE` sampai di DRC dalam hitungan detik. Ditambah dua hal khas
pemasangan ini: arsip wajib bertahan **sepuluh tahun**, dan replika bukan arsip.

**Jalur cadangan boleh dimatikan** hanya bila perkakas customer lolos dua uji —
memulangkan pembukuan **satu** tenant ke titik waktu pilihan tanpa menyentuh
tenant lain, dan membuktikan setiap basis data terdaftar **beserta** dokumen dan
jejak audit ada di dalam artefaknya. Asumsi "sudah punya DRC jadi cadangan tidak
perlu" harus **tertulis dan dibantah** di dokumen serah terima.

> ⚠ **Perpetual berarti aplikasinya tidak boleh berhenti bekerja.** Yang berakhir
> adalah hak atas versi baru dan dukungan — bukan akses ke pembukuan. Lisensi
> yang mematikan buku adalah kesalahan kategori untuk produk akuntansi.

**Kesimpulan: arsitekturnya siap, produknya belum.** Yang kurang pipa komersial,
bukan desain ulang. Sejak 22 Okt 2026 dua potong pipa itu ada di kode — register lisensi
dan jalur pindah dari SaaS (tabel di atas); yang tersisa kunci publik produksi
dan customer on-premise pertama.

> §8 pensiun 20 Okt 2026: entitlement sudah terbangun dan pindah ke
> [01 §8](./01-ARSITEKTUR.md). Nomor bagian **tidak dipakai ulang**, mengikuti
> aturan yang sama dengan nomor celah di §7 — rujukan dari kode, `AGENTS.md`,
> dan riwayat commit menunjuk nomor, dan menggesernya membatalkan semuanya
> sekaligus demi kerapian yang tidak dibaca siapa pun.

## 9. Tahapan & pemicu

✅ **Tahap 1a selesai 20 Okt 2026** dan karena itu tidak lagi di tabel ini: tabel
`jobs`, `contract/` + generator, jalur `ledger` sebagai layanan, gerbang skema
saat boot, batas ekspor & periode laporan, semver + tag tetap. Tempatnya
sekarang [02](./02-LAYANAN-INFRA.md) dan [04](./04-ALIRAN-DATA.md).

✅ **Tahap 1b selesai 20 Okt 2026.** Yang dibangun: modul Go
`services/integrator` (di luar workspace bun, dependensi dua), kontrak lintas
bahasa diperluas ke **angka** antrean dan dibangkitkan ke keduanya, SQL antrean
+ pelari jalur di Go, jalur `tenant` sebagai `svc-tenant` (kini di `svc-integrator`) dengan **cadangan per
basis data** (celah #5), gerbang rilis ketiga (`go:test` + `go:lint`), dan
*bounded concurrency* pada fan-out migration. Tempatnya sekarang
[01 §10](./01-ARSITEKTUR.md) (pohon poliglot, dua aturan yang menahannya, batas
Go) dan [02 §5](./02-LAYANAN-INFRA.md) (layanan & keputusannya).

⚠ **Dua hal yang 1b sengaja TIDAK pindahkan, dan pemicunya bukan jadwal.**
Keduanya ditahan oleh ⚠ yang ditulis rancangan ini sendiri, jadi keduanya tidak
menjadi tahap baru — mereka melipat ke pemicu yang sudah ada:

| Tertahan | Ditahan oleh | Pemicunya |
|---|---|---|
| Kesesuaian data (`tenant.conformance`) ke Go | §3.3 — "Go berhenti sebelum perhitungan akuntansi" | 2 dari 11 pemeriksaannya memanggil pagar materialitas (#444/#445): penilaian, bukan konstanta. Pemicunya SAMA dengan 1d |
| Jalur `schema` lewat antrean | §6 — *expand/contract* "belum berlaku hari ini" | Migration di luar gerbang pemblokir berarti aplikasi melayani buku yang skemanya lebih tua daripada kodenya. §6 juga sudah mengukur harga menunggu: pada 17 perusahaan gerbang pemblokir masih murah |

Yang §6 butuhkan dari jalur `schema` ada tiga, dan ketiganya kini ada **tanpa**
penerap migration kedua: *bounded concurrency*, hasil per perusahaan yang bisa
ditanyai (`vonisVersi` di konsol `/backup`, dibaca dari `_prisma_migrations`
sendiri — bukan dari tabel jejak yang bisa berbohong tentang apa yang sungguh
ada di basis datanya), dan dapat dilanjutkan dari tengah.

✅ **Tahap 1c selesai 20 Okt 2026, untuk dokumen.** Yang dibangun: otorisasi
hasil pekerjaan (pintu unduhan, izin per `kind` + gerbang kedua per laporan),
penyimpanan hasil beserta pembersih yatimnya, jalur `interactive` sebagai proses
Node terpisah, dan **setiap dokumen satuan** dirender di server dari ID-nya —
faktur, kontrak, dua surat jalan, dua arah retur. Tempatnya sekarang
[02 §5](./02-LAYANAN-INFRA.md), [03 §1 & §6](./03-API-INTEGRASI.md), dan
[06 §3](./06-KEAMANAN.md).

⚠ **Tiga hal yang 1c sengaja TIDAK bangun**, dan tidak satu pun karena
kehabisan waktu:

| Tertahan | Kenapa, dan pemicunya |
|---|---|
| **Outbox + relay** | §4 menyebut sendiri ia "menunggu pemakai pertamanya", dan pemakai yang dinamainya adalah fitur yang `invoice-send.ts` SENGAJA menolak mengotomatiskan. Pemicunya keputusan produk, bukan tahap: hari pertama ada pengiriman dokumen tanpa seseorang menekan tombol |
| **`report.package`** | tidak pernah ada di aplikasi ini. Membangunnya berarti menambah FITUR di bawah nama "pindah ke server" — dua keputusan yang digabung menjadi satu |
| Jalur `bulk` & `schedule` sebagai proses sendiri | belum ada `kind` yang diterbitkan untuk keduanya. Penerbitan hari ini masih langkah di peran `scheduler` (`svc-worker`) dan itu memadai; pelari tanpa penerbit adalah kode mati yang terlihat hidup |

Tiga generator LAPORAN masih di peramban (`finance-report`, `opname-sheet`,
`stock-report`) — ketiganya bukan dokumen satuan, dan jalurnya `/api/reports/pdf`
(§5). Jumlahnya DICACAH penjaga, jadi ia tidak bisa diam-diam berubah menjadi
"sudah semuanya".

🔶 **Tahap 1d DIMULAI 22 Okt 2026 — laporan PERTAMA sudah dipindah (`go`).**
Pengukurannya (§11, vonis di `/scheduler`) sudah ada, dan pemilik meminta
seluruh tahap dikerjakan. Yang dibangun untuk laporan PERTAMA, Neraca Saldo:

| Bagian | Di mana |
|---|---|
| Pembaca buku baca-saja: satu kolam per PT (template kredensial & urutan env SAMA dengan `company-clients.ts`), transaksi `READ ONLY` + `REPEATABLE READ`, nama kosong MELEMPAR | `services/integrator/internal/ledgerread/open.go` |
| Neraca Saldo dalam **sen `int64`** — NUMERIC diurai TEPAT dari teks, tanpa float; `asOf` dikirim sebagai teks UTC `::timestamp` supaya mode PgBouncer & zona sesi tidak mengubahnya | `ledgerread/trial_balance.go` · `money.go` |
| Perkakas paritas (bukan layanan, tanpa tahap Dockerfile) | `services/integrator/cmd/parity` |
| Pembanding baris demi baris: kode & URUTAN akun, nama, debit, kredit, kedua total, vonis seimbang — pada ketelitian sen kontrak | `src/lib/trial-balance-parity.ts` · `bun run parity:trial-balance` |
| Register pemilik jalur berkas per laporan: `ts` · `go-parity` · `go` | `src/lib/report-engine.ts`, dijaga `tests/report-engine.test.ts` |

**Register itu yang menyatakan keadaan peralihan, bukan saklar env.** Arti
ketiga nilainya:

| Nilai | Jalur BERKAS | Layar | Syarat masuk |
|---|---|---|---|
| `ts` (bawaan) | TypeScript | TypeScript | — |
| `go-parity` | TypeScript | TypeScript | implementasi Go + skrip paritas ADA (penjaga memeriksa keduanya) |
| `go` | **Go** — versi TS untuk berkas dicabut | TypeScript sampai diputuskan | `parityProven: { date, books }` di entri yang sama, dari paritas atas buku **produksi** |

Paritas lokal sudah lulus (22 Okt 2026, Postgres sekali pakai, 2 buku × 3
tanggal): 3.000 jurnal berpecahan sen, valas ber-`base_*`, akun netral 0/0,
baris bernilai nol, kode berhuruf campuran, tipe akun asing, retur bersaldo
abnormal, jurnal penutup tahunan (IKUT, #555), batas tanggal tepat
`23:59:59.999` lawan `00:00` hari berikutnya, buku timpang satu sen — juga di
bawah `TZ=Asia/Jakarta` dan mode `pgbouncer=true`. **Yang BELUM: paritas atas
buku produksi** — langkah sesi utama, dan satu-satunya syarat `go-parity` → `go`:

```bash
# 1. biner statis dari checkout yang memuat tahap ini
(cd services/integrator && CGO_ENABLED=0 go build -trimpath -o /tmp/sai-parity ./cmd/parity)
# 2. di jaringan compose, lewat migrator (DATABASE_URL langsung ke `pg`, bukan PgBouncer)
docker compose run --rm --no-deps \
  -v /tmp/sai-parity:/usr/local/bin/sai-parity:ro \
  migrate bun run parity:trial-balance -- \
    --go-bin /usr/local/bin/sai-parity --as-of "$(date +%F),2025-12-31"
```

Image migrator harus sudah memuat `scripts/parity-trial-balance.ts` (yaitu
SESUDAH rilis); sebelum itu, pasang sumber checkout di atasnya (`-v
"$PWD/scripts:/app/scripts:ro" -v "$PWD/src:/app/src:ro" -v
"$PWD/package.json:/app/package.json:ro" -v
"$PWD/packages/core:/app/packages/core:ro"`).
Keduanya HANYA MEMBACA. Keluar bukan-nol pada satu selisih atau satu buku yang
gagal dibaca.

✅ **Paritas produksi LULUS 22 Okt 2026** (sesi utama): `bun run
parity:trial-balance` → "17 buku × 3 tanggal: 51 setara · 0 berselisih · 0
gagal". Buktinya tercatat di entri register yang sama
(`parityProven: { date: "2026-10-22", books: 17 }`), dan Neraca Saldo
berpindah `go-parity` → `go` pada hari yang sama.

#### Peralihan pertama: lembar sebar Neraca Saldo dihasilkan Go

| Bagian | Di mana |
|---|---|
| Register `go` + bukti paritas; `exportJobKind(id)` — satu tempat "TS atau Go" menjadi antrean | `src/lib/report-engine.ts` |
| Rute ekspor membaca register SEBELUM merakit: laporan `go` **selalu** diterbitkan ke `report.export_go` (202), berapa pun barisnya; tanpa `?id=` dijawab 400, tidak pernah dirakit TS | `src/app/api/reports/export/route.ts` · `src/lib/report-export-go.ts` |
| Pelari Node MENOLAK laporan `go` yang datang lewat `report.export` (pekerjaan lama dari sebelum peralihan) | `workers/interactive.ts` |
| `kind` baru `report.export_go`, jalur `interactive`; izin unduh & gerbang kedua SAMA dengan `report.export` | `contract/kinds.yaml` · `packages/core/src/job-result.ts` · `src/lib/job-result-gate.ts` |
| Pelari Go jalur `interactive` — registry → buku PT (READ ONLY) → XLSX → volume `hasil`; menolak laporan yang register-nya bukan `go` | `services/integrator/internal/interactivelane` → `svc-integrator` (sampai 22 Okt 2026 `cmd/interactive` → `svc-interactive-go`) |
| Penulis XLSX pustaka baku + penyimpanan hasil berbentuk sama dengan `job-result-store` | `internal/document` |
| Kalimat, kolom, lebar, format angka, rupa kepala lembar, nama bulan, id laporan `go` — DIBANGKITKAN dari modul TS-nya | `internal/contract/report_layout_gen.go` (`bun run contract:gen`) |
| Paritas ISI lembar sebar (definisinya: nilai & tipe tiap sel — angka pada sen —, format angka, tebal, ukuran/warna huruf, isi, perataan, lebar kolom, nama lembar, pembuat) | `src/lib/xlsx-content-parity.ts` · `bun run parity:trial-balance-xlsx` (buku sungguhan) · `tests/trial-balance-xlsx-golden.test.ts` (berkas emas Go dari fixture bersama, di setiap `verify`) |

**Tiga keputusan yang patut diketahui orang berikutnya:**

1. **Selalu antre, tidak ada jalur sinkron "kecil".** Ekspor sinkron di bawah
   `EXPORT_QUEUE_HANDOFF_ROWS` ADALAH versi TS-nya; menyisakannya berarti dua
   implementasi berkas hidup berdampingan tanpa pembanding — persis yang
   register ini ada untuk mencegah. Harganya beberapa detik penantian (klien
   sudah menunggu di rute hasil untuk ekspor besar; tidak ada UI baru).
2. **Instan batas tanggal dihitung PENERBIT.** `asOfInstant` = `resolveAsOf`
   yang sama dengan layar, dikirim sebagai ISO UTC; Go tidak menghitung "akhir
   hari" sendiri, jadi zona waktu container Go tidak bisa memindahkan satu
   jurnal pun ke sisi lain batas (temuan paritas lokal di atas).
3. **"Berkas" = lembar sebar.** PDF Neraca Saldo (`/api/reports/pdf`) tetap TS,
   digambar dari muatan layar seperti layarnya. Memindahkannya keputusan
   tersendiri.

⚠ **Temuan di jalan, dan ia bukan Go:** pelari jalur berjalan sebagai ROOT
sementara `app-customer` membaca volume `hasil` sebagai `node`; hasil 0600 di
direktori 0700 milik root tidak terbaca, jadi SETIAP hasil berantre — termasuk
ekspor besar `svc-interactive` sejak 1c — dijawab 404. Kedua pelari kini
`chown` ke `contract/kinds.yaml` → `results` (uid/gid 1000 = `node`). Paritas
isi lokal (Postgres sekali pakai, 2 buku × 3 tanggal, buku berwizard + buku
kosong ber-registry `&"…"`): 6 setara; temuan pertamanya: baris "Belum ada
saldo" TEBAL di TS, dan Go sudah mengikutinya.

**Dirilis 22 Okt 2026** (0.11.0, `main@3a6d1d35`), saat itu dengan
`svc-interactive-go` sebagai container sendiri; sejak penyatuan §3.2 pelari itu
jalur di `svc-integrator`. ❓ Paritas ISI (`bun run parity:trial-balance-xlsx`,
subperintah `trial-balance-xlsx` dari biner yang sama) atas buku **produksi**
belum tercatat di sini — yang tercatat hanya paritas lokal di atas.

✅ **Batas tanggal laporan = jam Jakarta (keputusan pemilik, 22 Okt 2026).**
Dulu `resolveAsOf` membuat `asOf` = akhir hari menurut zona PROSES, jadi buku
yang sama per `2026-06-30` pernah memberi 14 baris di `TZ=Asia/Jakarta` dan 15
di UTC. Kini batas per tanggal dan periode laporan, beranda, buku besar, dan
umur piutang/utang memakai offset eksplisit +07:00 (`@sai/core/business-date`),
apa pun zona proses — CI, skrip dari host, dan perkakas paritas memberi angka
yang sama dengan `app-customer`. Hitungan kalender yang masih memakai jam lokal
(tahun buku di `year-close.ts`, periode stok) dijaga oleh `TZ=Asia/Jakarta`
bawaan di Dockerfile. Data produksi tidak bergeser: tidak ada jurnal yang
tersimpan pukul 17.00 UTC ke atas, dan produksi sudah berjalan di WIB.

✅ **Penjaga "jalur ekspor BELUM memanggil Go" sudah DIGANTI, bukan dihapus.**
`tests/report-engine.test.ts` kini menuntut: rute ekspor membaca register
sebelum merakit, laporan `go` diterbitkan ke `report.export_go`, pelari Node
menolak laporan `go`, pelari Go menolak yang bukan `go`, halaman laporan `go`
mengirim asalnya, dan pola segmen hasil Go = `SEGMEN` TS. Laporan berikutnya
mengikuti pola yang sama, satu per satu: implementasi Go + kunci kontrak yang
dibacanya + skrip paritas (angka DAN isi berkas) + entri `go-parity` → `go`.

#### Laporan kedua & ketiga: Laba Rugi dan Neraca (`go` sejak 22 Okt 2026)

✅ **Paritas produksi LULUS 22 Okt 2026** (sesi utama, hanya baca, 17 buku): Laba Rugi angka 102 setara · isi XLSX 153 setara (3 periode × tanpa/`preceding`/`previous_year`) · pusat biaya `unassigned` 51 setara; Neraca angka 51 setara · isi XLSX 153 setara — 0 berselisih · 0 gagal. Register dialihkan ke `go` dengan `parityProven: { date: "2026-10-22", books: 17 }`.

Keputusan pemilik 22 Okt 2026: lebih banyak laporan pindah ke Go. Keduanya
mengikuti jalur Neraca Saldo selangkah demi selangkah, dan BERHENTI di
`go-parity` — berkas tetap TS sampai sesi utama menjalankan paritas atas buku
produksi.

| Bagian | Di mana |
|---|---|
| Laba Rugi bertingkat + Neraca (dengan pecahan laba tahun berjalan / tahun lalu yang belum ditutup, #555), sen `int64`, SATU kueri `netsSQL` berparameter untuk setiap penyaring (tanggal, jurnal penutup, pusat biaya `IS NOT DISTINCT FROM`) | `ledgerread/statements.go` |
| Kategori, sisi laporan, band, jurnal penutup — dari `contract/accounting.yaml` | `internal/contract/accounting_gen.go` |
| Lembar sebar keduanya (kalimat, pola label periode & pusat biaya, pemisah angka id-ID, zona bisnis DIBANGKITKAN dari modul TS) | `internal/document/statements.go` · `report_layout_gen.go` |
| Tepian JS yang ditiru teks laporan: `.trim()`, `Math.round` (setengah ke atas, −0), `Intl` id-ID | `internal/jscompat` |
| Penghasil berkas di pelari `interactive` — DITOLAK selama `go-parity` (`GoEngineReports` hanya memuat `go`) | `internal/interactivelane` |
| Bentuk muatan berperiode (`fromInstant`/`toInstant` dari `resolvePeriod`) — diuji, belum diterbitkan | `src/lib/report-export-go.ts` (`goExportPayloadShape`) |
| Pembanding angka (baris per band/seksi, subtotal, anak tangga, tampilan datar, arah hasil, pecahan #555, vonis seimbang) | `src/lib/statement-parity.ts` |
| Paritas atas buku sungguhan, READ ONLY di KEDUA sisi | `bun run parity:income-statement` · `parity:income-statement-xlsx` · `parity:balance-sheet` · `parity:balance-sheet-xlsx` |
| Berkas emas lintas bahasa atas buku fixture bersama (kosong, timpang satu sen, valas, retur, kontra-aset, tipe asing, penutup, lintas tahun, batas hari WIB, tahun buku April, pusat biaya) | `ledgerread/testdata/statement_books.json` → `go test -update` → `tests/statements-golden.test.ts` (angka DAN isi berkas, setiap `verify`) |

**Jebakan semantik yang disalin APA ADANYA (bukan diperbaiki):**

1. **Batas tahun buku Neraca mengikuti zona PROSES di TS** (`fiscalYearBounds`
   memakai `new Date(y, m, d)` lokal). Produksi `TZ=Asia/Jakarta`; Go memakai
   `Asia/Jakarta` eksplisit (`time/tzdata` di dalam biner). Di proses UTC,
   `fiscal_year_start` yang tersimpan sebagai tengah malam WIB terbaca SEHARI
   lebih awal dan pecahan laba tahun berjalan bergeser — `tests/statements-golden.test.ts`
   memaku zonanya (dan MERAH di UTC tanpa paku itu), skrip paritas Neraca
   menolak zona lain.
2. **Berkas Neraca TIDAK memuat pecahan #555.** Muatan ekspor (`buildReportPayload`)
   dan muatan halaman sama-sama tidak membawa `currentYearIncome` /
   `priorUnclosedIncome`, jadi lembar sebar selalu SATU baris "Akumulasi
   Laba/Rugi". Go meniru itu; pecahannya tetap dihitung dan dibandingkan
   (`parity:balance-sheet`).
3. ✅ **Kolom pembanding (#557) sampai ke SEMUA jalur berkas** (22 Okt 2026,
   "bangun pembanding di Go dulu" — keputusan pemilik). Lihat
   [Kolom pembanding](#kolom-pembanding-557-di-jalur-berkas-22-okt-2026) di
   bawah. Yang ditemukan di tengah jalan lebih buruk daripada yang dicari:
   `statementPayloadSchema` tidak menyebut `priorPeriod`/`prior`, `z.object`
   membuangnya, dan ekspor SINKRON halaman — Excel maupun PDF — sudah SATU
   kolom sejak rute memvalidasi muatannya. Peralihan ke `go` tidak akan
   menghilangkan kolom pembanding; kolomnya sudah hilang, tanpa satu galat.
4. ✅ **Laba Rugi bersaring pusat biaya kini bisa dirakit di luar permintaan
   HTTP.** `costCenterFilterLabel` dulu memanggil `getT()` → `cookies()` lebih
   dulu, untuk penyaring apa pun, dan pekerja `report.export` gagal. Jalur
   berkas (`buildReportPayload`) kini menyerahkan label cetaknya sendiri
   (`COST_CENTER_UNASSIGNED_PRINT_LABEL`, bahasa dokumen cetak — sumber pola
   Go yang sama), dan `getT()` hanya dipanggil halaman untuk "belum
   ditetapkan". Berkas emas memalsukan `getT()` MELEMPAR, bukan kamus
   palsu. Label Go: "Belum ditetapkan", "KODE — Nama" (juga untuk pusat biaya
   nonaktif), atau `#<id>`; "unassigned" dicocokkan pada teks MENTAH seperti
   TS (" unassigned" menyaring benar tetapi berlabel `#unassigned`). Beda yang
   DISENGAJA: halaman berbahasa Inggris mencetak "Unassigned" di berkas
   sinkronnya; berkas berantre (TS atau Go) selalu "Belum ditetapkan".
5. **Neraca membaca `company_settings` TANPA urutan** (`findFirst` tanpa
   `orderBy`), sementara kop berkas memakai `ORDER BY id`. Disalin.
6. **Arah hasil "Laba"/"Rugi" dan marjin kotor dihitung dari float di TS.**
   Laba bersih yang impas bisa menjadi −0,0000001 di TS ("Rugi") dan 0 di Go
   ("Laba"); marjin −0,04% tercetak "-0%" di keduanya (`Math.round` → −0,
   `Intl` mencetak "-0"). Pembanding melaporkan arah hasil tersendiri.

#### Kolom pembanding (#557) di jalur berkas (22 Okt 2026)

| Bagian | Di mana |
|---|---|
| Skema rute ekspor/PDF MEMBAWA `priorPeriod` + `prior` (berbatas `rows()` seperti muatan berjalan), termasuk pecahan #555 pembanding | `src/lib/validations/report-export.ts` · `tests/report-export-compare.test.ts` |
| Bagian pembanding muatan disusun SATU fungsi untuk halaman dan jalur berkas | `incomeStatementPrior` / `balanceSheetPrior` (`src/lib/report-payload.ts`) |
| `?compare=` dibawa pekerja `report.export` (`buildReportPayload`), rute payload Pusat Laporan, dan penerbit Go (`compare` + `priorFromInstant`/`priorToInstant` atau `priorAsOfInstant` — instan dari `comparisonRange`/`comparisonDate` TS; mode tak dikenal DIBUANG, laporan tanpa pembanding tidak membawanya) | `src/lib/report-export-go.ts` (`COMPARABLE_REPORTS`) |
| Pelari Go: muatan setengah-setengah (mode tanpa instan, instan tanpa mode, mode asing) DITOLAK | `interactivelane/runner.go` (`comparative`) |
| Lembar empat kolom (gabungan baris kedua periode, `localeCompare` untuk baris yang hanya ada di pembanding, persen `percentChange`, band dari periode berjalan) | `internal/document/compare.go` |
| Kalimat & kosakata dibangkitkan: judul kolom pembanding, "Perubahan" + lebarnya, pola persen, `ComparisonModes`, tabel `localeCompare` ASCII dari `Intl.Collator` | `report_layout_gen.go` (`contract:gen`) · `internal/jscompat` (`LocaleCompare`) |
| Halaman Laba Rugi & Neraca mengirim `sumber` BESERTA `compare` ke tombol Excel — SELAGI `go-parity`, supaya peralihan hanya menyunting register | `tests/report-engine.test.ts` |
| Berkas emas: 13 kasus pembanding atas buku fixture bersama (`incomeComparisons`/`balanceComparisons`, buku baru `buku-banding`) — angka kedua periode, instan pembanding, dan ISI lembar, juga sesudah melewati skema rute sinkron | `tests/statements-golden.test.ts` |
| Paritas atas buku sungguhan: `--compare none,preceding,previous_year` (bawaan: ketiganya) | `parity:income-statement-xlsx` · `parity:balance-sheet-xlsx` |

**Jebakan yang disalin APA ADANYA (bukan diperbaiki):**

7. **Blok ekuitas Neraca PEMBANDING bisa terpecah sementara yang berjalan
   tidak.** Halaman (dan kini jalur berkas, lewat fungsi yang sama) mengirim
   `prior` = hasil `getBalanceSheet` UTUH, berikut pecahan #555; muatan
   berjalan tidak. `balanceSheetLayout` memasangkan baris ekuitas sintetis
   menurut URUTAN, jadi "Akumulasi Laba/Rugi" berjalan bersanding dengan
   "Laba/Rugi Tahun Lalu" pembanding, dan laba tahun berjalan pembanding
   tidak tercetak.
8. **…dan kebenaran pecahan itu kebenaran FLOAT.** TS memecah bila
   `priorUnclosedIncome` ≠ 0 sebagai float; pada buku yang tahun lalunya SUDAH
   ditutup, laba sepanjang buku dan laba tahun berjalan dijumlahkan dari
   jumlah per akun yang berbeda (100,4 − 0,3 = 100,10000000000001 ≠ 100,1):
   sen-nya nol, `!!1.4e-14` benar — baris "Akumulasi" pembanding tercetak
   Rp 0. Go meniru kebenarannya (`EquitySplitJS`, penjumlahan float dalam
   urutan akun TS), `parity:balance-sheet` membandingkannya, dan buku fixture
   `buku-banding` memuatnya.
9. **Band Laba Rugi diputuskan periode BERJALAN saja**: HPP atau pendapatan/
   beban lain-lain yang hanya ada di periode pembanding tidak tercetak, dan
   kolom pembanding tidak lagi berjumlah laba bersihnya.
10. **Baris yang hanya ada di pembanding diurutkan `localeCompare`**, bukan
   urutan basis data: `4_01` < `4101` < `4a01` < `4B01`. Go: tabel bobot
   ASCII dari `Intl.Collator` (dibangkitkan); kode non-ASCII diurutkan
   titik kode SESUDAH huruf — perkiraan yang akan terlihat sebagai selisih
   urutan di paritas isi, bukan lolos diam-diam.

Perintah paritas produksi (sesi utama, SESUDAH `go-parity` ini dirilis, dengan
biner dari checkout yang sama — pola Neraca Saldo di atas). Skrip `-xlsx`
memeriksa ketiga bentuk lembar (satu kolom, `preceding`, `previous_year`)
untuk setiap periode/tanggal:

```bash
(cd services/integrator && CGO_ENABLED=0 go build -trimpath -o /tmp/sai-parity ./cmd/parity)
for s in parity:income-statement parity:income-statement-xlsx; do
  docker compose run --rm --no-deps -v /tmp/sai-parity:/usr/local/bin/sai-parity:ro \
    migrate bun run "$s" -- --go-bin /usr/local/bin/sai-parity \
      --period "$(date +%Y)-01-01..$(date +%F),$(( $(date +%Y)-1 ))-01-01..$(( $(date +%Y)-1 ))-12-31,$(( $(date +%Y)-1 ))-07-01..$(date +%Y)-06-30"
done
for s in parity:balance-sheet parity:balance-sheet-xlsx; do
  docker compose run --rm --no-deps -v /tmp/sai-parity:/usr/local/bin/sai-parity:ro \
    migrate bun run "$s" -- --go-bin /usr/local/bin/sai-parity \
      --as-of "$(date +%F),$(( $(date +%Y)-1 ))-12-31,$(( $(date +%Y)-1 ))-06-30"
done
```

Lulus keempatnya → `parityProven` di entri register yang sama, lalu `go-parity`
→ `go`. Halaman keduanya SUDAH mengirim `sumber` (beserta `compare`) ke tombol
Excel — peralihannya hanya menyunting `src/lib/report-engine.ts` lalu
`bun run contract:gen` (`GoEngineReports`).

#### Laporan keempat & kelima: Umur Piutang dan Umur Utang (`go-parity`, 23 Okt 2026)

Laporan tahap 1d PERTAMA yang tidak membaca baris jurnal, melainkan DOKUMEN
sub-buku — faktur, kontrak, pembayaran, uang muka yang dikompensasikan, retur,
transaksi pemasok beserta alokasinya. Aturannya disalin dari
`src/lib/receivables.ts`, bukan dirancang ulang.

| Bagian | Di mana |
|---|---|
| Pembaca: rupiah dasar (`base_amount` → `amount` IDR → `amount × rate` → TIDAK ADA), status turunan, umur hari kalender Jakarta, potret historis, bagian kontrak yang sudah difakturkan (penjodohan NAMA, #15), alokasi tercatat lalu FIFO (#37), urutan tanggal ↓ id ↓ | `ledgerread/aging.go` |
| Lembar sebar (kolom `?cols=`, saringan `?overdue=1`, ringkasan ember, catatan kaki) | `document/aging.go` |
| Ember umur (batas atas inklusif 30/60/90) | `contract/accounting.yaml` → `aging` — dibaca `receivables.ts` DAN Go |
| Kalimat, judul, lebar, label ember & status, kolom katalog | `statement-layout.ts` / `report-export.ts` / `report-catalog.ts` → `contract/aging_layout_gen.go` (berkas bangkitan tersendiri) |
| Paritas | `parity:receivables` · `parity:receivables-xlsx` · `parity:payables` · `parity:payables-xlsx` (`scripts/parity-aging*.ts`, `src/lib/aging-parity.ts`) |

Keputusan & temuan yang lahir di jalan:

1. **Aritmetika EKSAK, bukan float.** Go mengurai NUMERIC menjadi rasional
   (`math/big`) dan membulatkan ke sen PERSIS di titik `round2` TS (setengah
   ke atas, `Math.round`). Hasilnya sama dengan TS di mana pun KECUALI nilai
   eksak yang TEPAT setengah sen — `5,01 USD × 15.750,5 = 78.910,005`: double
   terdekatnya sedikit di bawah, TS turun ke ,00 sementara Go naik ke ,01. Go
   menandai dokumen yang pembulatannya menyentuh titik seri (`halfCentTie`),
   dan pembanding menulis selisihnya dengan penanda
   `[seri setengah sen — float TS]` — **tetap dihitung berselisih**. Seri
   hanya mungkin pada baris yang nilai IDR-nya dihitung `amount × rate`
   (tanpa `base_amount`) atau kuantitas berdesimal × harga.
2. **Urutan bertanggal sama kini ditentukan.** `getReceivables`/`getPayables`
   dulu `orderBy: { date: "desc" }` saja — dokumen sehari keluar dalam urutan
   sesuka PostgreSQL. Kini `[date desc, id desc]` (`NEWEST_FIRST`) di TS dan Go.
   Hanya urutan tampilan; angka tidak berubah.
3. **`?overdue=1` ikut berkas yang dihitung dari parameter.** `buildReportPayload`
   dulu mengabaikannya, jadi ekspor berantre dari halaman ber-saringan memuat
   SEMUA dokumen. Kini dibaca dengan bunyi URL halaman, dan halaman keduanya
   mengirim `sumber` (`asOf`, `cols`, `overdue`).
4. **Penjodohan bagian kontrak yang difakturkan memakai NAMA saja** — receivables
   tidak meneruskan `itemId` ke `buildContractOutstanding`, berbeda dengan
   halaman detail kontrak (#491). Disalin apa adanya ke Go; dilaporkan, tidak
   diubah.

Paritas LOKAL (23 Okt 2026, PostgreSQL 17 sekali pakai, buku sintetis +
buku kosong; tepi ember 30/31/60/61/90/91, jatuh tempo hari ini, jatuh tempo
00:00 WIB vs 23:59:59.999 WIB, valas dengan/tanpa kurs, `base_amount` vs kurs,
bayar sebagian/lebih/tepat/dalam setengah sen, dibatalkan/`completed`, retur
diposting/dibatalkan/sesudah asOf, uang muka, faktur tarikan kontrak, faktur
tanpa pelanggan, transaksi `adjustment`, alokasi berlebih, pembayaran valas
tanpa kurs): 4 skrip × 5 tanggal (angka) / 3 tanggal × 3 pilihan kolom
(berkas) × 2 saringan — **0 selisih**; dengan satu dokumen seri sengaja ditanam,
satu-satunya selisih adalah dokumen itu (bertanda). Lewat PgBouncer 1.26 mode
transaksi dengan `timezone` sesi `America/New_York`: sama. Keluaran Go di
`TZ` UTC / Los Angeles / Jakarta: identik byte demi byte.

Perintah paritas produksi (sesi utama, buku PRODUKSI, hanya baca; biner dan
skrip dari checkout yang sama — image `migrate` yang sedang berjalan belum
memuat skripnya):

```bash
(cd services/integrator && CGO_ENABLED=0 go build -trimpath -o /tmp/sai-parity ./cmd/parity)
for s in parity:receivables parity:payables parity:receivables-xlsx parity:payables-xlsx; do
  docker compose run --rm --no-deps -v /tmp/sai-parity:/usr/local/bin/sai-parity:ro \
    -v $PWD/scripts:/app/scripts:ro -v $PWD/src:/app/src:ro -v $PWD/package.json:/app/package.json:ro \
    -v $PWD/packages/core:/app/packages/core:ro -v $PWD/packages/billing:/app/packages/billing:ro \
    -v $PWD/packages/platform:/app/packages/platform:ro -v $PWD/contract:/app/contract:ro \
    migrate bun run "$s" -- --go-bin /usr/local/bin/sai-parity
done
```

Bawaannya tiga tanggal (hari ini, 30 Juni, 31 Desember tahun lalu) × dua
saringan (semua, hanya jatuh tempo); `-xlsx` juga × tiga pilihan kolom
(bawaan, `party` saja, sebagian). Lulus keempatnya → `parityProven` di entri
register, lalu `go-parity` → `go` + `bun run contract:gen`.

| Tahap | Pemicu | Isi | VM |
|---|---|---|---|
| **1d — Go ke perhitungan laporan** 🔶 Neraca Saldo, Laba Rugi & Neraca `go` (22 Okt 2026, paritas produksi lulus); Umur Piutang & Umur Utang `go-parity` (23 Okt 2026, menunggu paritas produksi) | **pengukuran**, bukan jadwal: event loop ekspor memengaruhi p95 interaktif, atau memori memaksa `--max-old-space-size` lagi — vonisnya di konsol `/scheduler` (§11) | generator per laporan pindah ke Go · **paritas dibuktikan per laporan, lalu versi TS dicabut** | 1 |
| **2 — pasar awal** | tenant berbayar, SLA pertama | replika `app-customer` kedua · **`cache-redis` + cache bersama** · `db-postgres` pindah host · **standby** — ✅ kode siap 22 Okt 2026, opt-in ([02 §19](./02-LAYANAN-INFRA.md)); tersisa host-nya | 3–4 |
| **3 — pasar tumbuh** | putaran fan-out tak muat di jendelanya | witness & *failover* otomatis · replika baca · replika `svc-integrator` — **kode & konfigurasi siap 22 Okt 2026, opt-in, belum digelar** (di bawah) | 5–7 |
| **4 — besar** | satu instans tidak cukup | tenant dipecah ke beberapa instans `db-postgres` — ✅ kode lengkap 22 Okt 2026, **opt-in** (di bawah). Cadangan Go per instans ✅ lolos gerbang Go 23 Okt 2026; pemindahan pertama menunggu peran cadangan di server instansnya | — |
| **D — on-premise** | customer on-prem pertama | ✅ kode lengkap 22 Okt 2026 (§7). Tersisa langkah pemilik: kunci publik lisensi | di customer |

**Tahap 3: yang sudah ada, dan yang hanya bisa dibuktikan di tiga host.**
Semuanya opt-in lewat `docker-compose.ha.yml` dan tiga variabel yang tidak ada
di `.env` produksi; tanpa keduanya tidak satu perilaku pun berubah. Rinciannya
dan runbook-nya di [02 §15.1](./02-LAYANAN-INFRA.md).

| Butir | Wujudnya | Bukti di satu VM |
|---|---|---|
| *Leader election* peran tunggal `svc-worker` (`scheduler`, `ledger`, `conformance`) | `scripts/run-as-leader.ts` dipanggil penyelia untuk peran di `WORKER_LEADER_ROLES` (override HA); kunci sesi di koneksi LANGSUNG yang dibuktikan ulang tiap denyut (`@sai/db/session-lock`) | tes unit: satu replika = perintah sama, sekali, kode keluar sama; kandidat tak menjalankan apa pun; kunci hilang → putaran dihentikan sebelum pemilihan ulang |
| Pagar jalur tunggal-instans | Node: koneksi langsung bila `CONTROL_DATABASE_DIRECT_URL` ada. Go (`jobs.LaneLock`): koneksi langsung yang dibuktikan ulang tiap denyut — kunci hilang → klaim berhenti, proses keluar 1. Waktu denyut kedua bahasa dari `contract/kinds.yaml` (`lane_lock_*`) | penjaga: advisory lock TS hanya di dua berkas, URL HA lolos penolak pooler; cacat jalan lama DIREPRODUKSI terhadap PgBouncer sekali-pakai (02 §15.1); tes Go jalan kehilangan tanpa basis data |
| Replika baca | `runReadOnly` → replika bila sudah memutar WAL sampai LSN primary, selain itu primary; tulisan ditolak | tes unit atas aturan LSN, penolakan tulisan, konteks PT yang hilang tetap melempar; daftar-izin pemanggil |
| *Failover* otomatis | Patroni + etcd (witness di host ketiga) + `pg` sebagai HAProxy | `docker compose config` saja — **failover sungguhan belum pernah terjadi** |
| Replika `svc-integrator` | jalur jamak: `--scale`; jalur tunggal: kandidat panas lewat restart | — |

⚠ **Satu temuan di jalan, dan ia bukan tahap 3.** Pagar jalur `ledger` di Node
mengambil kunci SESI lewat PgBouncer mode TRANSAKSI — cacat yang sama dengan
P1002 `migrate` 15 Okt 2026, hanya tanpa gejala karena satu replika dan
PgBouncer yang memakai ulang backend yang sama. Ia diperbaiki hanya di profil
HA; menyalakannya di produksi satu-VM adalah keputusan terpisah (satu baris
`environment:` di `svc-ledger`), bukan bagian diam-diam dari tahap ini.
✅ **Diputuskan 22 Okt 2026** (pemilik): `CONTROL_DATABASE_DIRECT_URL` kini
disetel compose dasar di `svc-worker`, bersama penyatuan "1 image = 1
container" (§3.2), dan dijaga `tests/leader-election.test.ts`.

⚠ **Tahap 1 dipecah empat, dan urutannya mengikuti satu garis: aturan akuntansi
disentuh paling akhir.** 1a membangun fondasi antreannya tanpa satu baris Go.
1b memindahkan ke Go apa yang nol aturan akuntansi dan bisa dibatalkan tanpa
jejak — cadangan tidak meninggalkan angka di buku. 1c memindahkan dokumen ke
server **tanpa mengganti bahasanya**, jadi tidak ada perhitungan yang punya dua
implementasi — dan itu terbukti: generator yang dipakai rute server, jalur
antrean, dan lampiran surel adalah satu fungsi yang sama. 1d satu-satunya yang menulis
ulang aturan, dan karena itu ia **dibuka pengukuran, bukan rencana** (§3.3).

Urutan itu terbukti berguna pada 1b, dan bukan di tempat yang diperkirakan:
toolchain, image, CI, dan kontrak bangkitan memang bekerja — tapi yang paling
berharga adalah bahwa garis "nol aturan akuntansi" ternyata **memotong lebih
dalam** daripada yang ditulis tabel di atas. Jalur `tenant` tidak seluruhnya
nol aturan akuntansi (kesesuaian data menghitung materialitas), dan jalur
`schema` punya pemilik pembukuan yang belum boleh punya penulis kedua. Garis
itu ditemukan dengan menabraknya, bukan dengan merencanakannya — dan itu
sebabnya 1b dikerjakan sebelum 1d, bukan sesudahnya.

⚠ **`cache-redis` pindah dari tahap 1 ke tahap 2**, karena tahap 1 berjalan satu
replika dan cache bersama tidak membeli apa pun sebelum ada replika kedua —
alasan yang sama yang membuatnya gugur di on-premise (§7). Memasangnya lebih awal
berarti satu layanan berjaga untuk manfaat nol.

⚠ **Standby pindah dari tahap 3 ke tahap 2**, dan ini koreksi urutan: tahap 2
adalah tahap "SLA pertama", jadi rancangan sebelumnya menjanjikan SLA di atas
primary tunggal tanpa salinan panas. Yang boleh menyusul di tahap 3 hanyalah
*failover* **otomatis** (witness, leader election) — bukan keberadaan
standby-nya.

Tahap 1 seluruhnya di **satu VM yang sudah ada**. Sesudahnya, tahap 2 dan 3
menjadi perubahan konfigurasi — bukan penulisan ulang. Itu arti "siap secara
desain". Tahap 4 mungkin karena #104 — satu basis data per PT — tetapi tidak
"tanpa menyentuh kode" seperti yang dulu ditulis di sini: rumus URL buku PT
ternyata disalin di delapan tempat, dan setiap salinan hanya mengenal satu
server.

✅ **Tahap 4, kode lengkap 22 Okt 2026, opt-in.** Yang dibangun:

| Bagian | Bentuk |
|---|---|
| Registry | `db_instances` + `companies.db_instance_key` (kendali 0009, expand saja). `NULL` = instans bawaan, jadi tabel kosong = perilaku hari ini |
| Penyelesai | `@sai/db/company-url` — SATU penyusun URL buku PT untuk aplikasi, fan-out migration, kesesuaian, penyediaan, konsol, dan skrip. Instans tak terselesaikan **melempar**, tidak jatuh ke bawaan. Kunci kolam = instans + basis data |
| Penyediaan | `provisionCompany({ dbInstanceKey })`; tanpa itu instans bawaan. Sejak Okt 2026 dijalankan pekerjaan `company.provision` di `svc-worker` — layar `/companies/new` belum menawarkan pilihan instans, jadi PT dari layar selalu lahir di instans bawaan; instans lain lewat perkakas atau `tenant:move` |
| Fan-out | `db:migrate:all` dan sapuan kesesuaian melapor per instans; instans yang tak terselesaikan menggagalkan PT-nya saja |
| Pemindahan | `bun run tenant:move` — pratinjau bawaan, menolak PT aktif, `pg_dump \| pg_restore`, bandingkan jumlah baris per tabel, balik registry, ganti nama salinan asal (jalan balik) |
| Penjaga | `tests/company-url-resolver.test.ts` (pemindai + penyelesai), `tests/tenant-move.test.ts` |

✅ **Cadangan Go per instans — lolos `go:test` + `go:lint` 23 Okt 2026.**
Kodenya masuk 22 Okt bersama tahap 4, tetapi waktu itu toolchain Go tidak ada
di mesin pembangunnya, jadi blok ini dulu menahannya. 23 Okt ia dijalankan:
gerbang Go hijau, dan uji integrasi terhadap DUA server PostgreSQL 17 sekali
pakai lolos ujung ke ujung (`pg_dump`/`pg_dumpall` sungguhan, objek dibuka
dengan `openssl`). Yang ditambahkan sesudah pengukuran itu:

| Bagian | Bentuk |
|---|---|
| Kontrak | pola kunci & nama env var instans, label `default`, dan awalan objek `instans/` dibangkitkan dari `contract/db-instances.yaml` — sebelumnya regex yang sama ditulis TIGA kali (TS, `internal/db`, `internal/ledgerread`) |
| Hak peran | peran template instans tambahan yang bukan superuser dan tidak mewarisi `pg_read_all_data` ditolak DI DEPAN — terukur: pemilik NOSUPERUSER bisa `pg_dump` bukunya tetapi `pg_dumpall --globals-only` ditolak `pg_authid` |
| Isolasi di tengah putaran | dump/globals instans tambahan yang gagal SESUDAH tercacah kini menandai instans itu saja (`instansGagal`), bukan menghentikan seluruh putaran tanpa manifest — galat bawaan, tujuan, dan pembatalan tetap menghentikan |

Tanpa satu baris `db_instances` pun, pembuka instans tidak pernah dipanggil
dan nama objek serta manifest sama byte demi byte dengan sebelum tahap 4
(uji `TestTanpaBarisDbInstancesTIDAKADAInstansYangDibuka` terhadap server
sungguhan, `TestTanpaInstansNamaObjekDanManifestSAMADenganSebelumTahap4`).
Syarat pemindahan pertama di produksi tinggal operasional — peran cadangan di
server instans dan satu putaran tanpa `instansGagal`:
[MULTI-COMPANY §6](../MULTI-COMPANY.md#peran-cadangan-per-instans).

⚠ Replika baca (tahap 3) hanya melayani instans **bawaan**. PT di instans lain
membaca primary-nya sendiri sampai instans itu punya standby sendiri.

⚠ `cacheHandler`-nya **ditulis sendiri**, apa pun penyimpanannya: pustaka yang
beredar menyasar Next 13–15, sementara versi di sini memakai model
`updateTags`/`refreshTags` yang baru. Terbangun 22 Okt 2026
(`@sai/platform/next-cache-tags`), dengan dua keputusan yang tidak tertulis di
sini sebelumnya: yang dibagi **buku tag**, bukan isi cache (tiga `unstable_cache`
masing-masing satu baris kecil — yang salah dengan dua replika invalidasinya,
bukan biaya bacanya); dan handler dipasang lewat kait global Next saat
`register`, bukan lewat `next.config.ts`, supaya image yang sama berperilaku
identik dengan bawaan Next selama `CACHE_REDIS_URL` tidak disetel.

✅ **Tahap 2 siap sebagai konfigurasi, 22 Okt 2026** — tanpa satu pun yang
dinyalakan di produksi. Satu VM tidak bisa membuktikan bagian yang paling
penting: dua replika Next sungguhan di belakang Traefik, standby yang
melindungi sesuatu (di VM yang sama ia berbagi disk dengan primary), dan
penyimpanan dokumen bersama lintas host. Daftar lengkap yang sudah dan belum
terbukti: [02 §19](./02-LAYANAN-INFRA.md).

## 10. Nomenklatur

Aturannya kini mengikat di `AGENTS.md` (penamaan) dan `DATABASE.md` (skema,
kolom tersandi, klasifikasi PII). Yang tinggal di sini rencana memindahkan nama
lama ke aturan itu. Keadaan terukur hari ini:

| Lapis | Keadaan |
|---|---|
| Skrip (55) | **35 pakai pola `<domain>:<aksi>`, 20 tidak** |
| Volume (6) | `pg_data`, `db_data` · `documents`, `audit` · **`cadangan`** (Indonesia) |
| Service | `app-*`/`svc-*`/`job-*` konsisten (sejak 22 Okt 2026 latar = `svc-worker` + `svc-integrator`); `db`, `pg`, `pgbouncer`, `migrate` tidak — dan **`db` vs `pg` aktif menyesatkan** |
| Env var | `DATABASE_URL` tanpa prefiks padahal saudaranya berprefiks |

Sebabnya: lapisan basis data punya aturan tertulis dan patuh (95 model, nol
pelanggaran), sementara lapisan aplikasi belum punya — dan karena itu melayang.

**Rencana rename — empat gelombang, yang lebih berisiko selalu sesudah yang
lebih aman:**

| # | Lingkup | Kuncinya |
|---|---|---|
| 1 | Pengenal kode, nama berkas & tes | tanpa menyentuh produksi; dijaga `tsc` |
| 2 | Env var | **satu pembaca env terpusat lebih dulu** — menerima nama baru, jatuh ke nama lama sambil memperingatkan. Sesudah itu rename jadi satu baris |
| 3 | Nama service compose | nama service adalah **nama DNS**, jadi seluruh URL basis data berubah pada rilis yang sama. Prasyarat pencabutan `db` (MariaDB) sudah terpenuhi (#636, 22 Okt 2026) |
| 4 | Nama volume | volume Docker tidak bisa diganti nama — isinya disalin, lalu volume lama dibuang setelah terbukti. Perlu jendela pemeliharaan |

> ⚠ Satu catatan terhadap gelombang 4: **`pg_data` memuat seluruh basis data.**
> Menggantinya namanya tidak membeli apa pun selain konsistensi, sementara satu
> langkah salah berarti kehilangan data — dan kekaburan `pg_data` vs `db_data`
> hilang sendiri begitu `db_data` dicabut. Bila tetap dijalankan: hanya sesudah
> P0-1 dan P0-2 selesai.

## 11. Observabilitas — yang belum terukur

**Sinyal utamanya sudah terpasang:** umur pekerjaan tertua yang belum jalan,
per jalur, dengan ambang 7/10 menit yang hanya berlaku bila ada yang menunggu —
berpasangan dengan denyut penerbit yang tidak bergantung pada isi antrean.
Keduanya kini **keadaan**: [02 §14](./02-LAYANAN-INFRA.md).

✅ **Ketiganya sudah jadi (20 Okt 2026)** — kedalaman, laju terbit & selesai,
dan histogram p50/p95/p99 per jalur, di konsol operator. Tempatnya sekarang
[02 §14](./02-LAYANAN-INFRA.md).

⚠ **Dan premis §11 ini ternyata SALAH — itu temuan terpentingnya.** Paragraf di
atas dulu berbunyi *"ketiganya butuh penyimpan riwayat yang belum dipilih"*,
sebab *"laju menuntut dua titik waktu, jadi menuntut riwayat"*. Itu benar untuk
metrik berbentuk **counter** — angka yang hanya naik, yang lajunya hanya terbaca
dengan mengurangi dua pembacaan, yang karena itu menuntut sesuatu yang menyimpan
pembacaan sebelumnya.

Tapi baris `jobs` **bukan counter**. Ia peristiwa yang membawa cap waktunya
sendiri, dan laju atas peristiwa bercap waktu adalah satu `COUNT(*)` berjendela:

```sql
COUNT(*) FILTER (WHERE created_at > now() - interval '15 min')
```

Riwayat yang §11 cari karena itu **sudah ada di tabelnya**, lengkap dengan
retensinya (`archiveDoneJobs`, 14 hari). Yang sungguh kurang hanya **satu
kolom** — dan bukan kolom yang mudah diduga.

**Yang kurang itu `started_at`, dan sebabnya halus.** Durasi tidak bisa dihitung
dari kolom mana pun yang sudah ada: `claimed_at` DIPERPANJANG berkala selama
pekerjaan berjalan (*lease* yang diperbarui), jadi `finished_at - claimed_at`
adalah jarak dari perpanjangan terakhir. Diukur terhadap PostgreSQL sungguhan,
sepuluh pekerjaan berdurasi 100–1000 ms dengan lease diperpanjang 30 detik
sebelum selesai:

| Dihitung dari | p50 | p95 |
|---|---|---|
| `started_at` (benar) | 550 ms | 955 ms |
| `claimed_at` (salah) | 30.000 ms | **30.000 ms** |

`p50 = p95` pada baris kedua adalah intinya: ia tidak sekadar salah angkanya, ia
kehilangan seluruh **sebaran** — satu-satunya hal yang dicari histogram. Satu
jenis yang melambat tidak akan pernah terlihat, dan tidak ada gejala yang
memberi tahu pembacanya.

**Konsekuensi keputusan ini besar dan disebut apa adanya: tidak ada Prometheus,
tidak ada Grafana, tidak ada layanan tambahan.** Kotak ini 8 GB RAM dibagi enam aplikasi, dengan
produksi hidup di atasnya; dua proses lagi untuk menyimpan angka yang sudah
tersimpan adalah ongkos yang dibayar tanpa membeli apa pun. Yang hilang satu dan
nyata: **tren di luar 14 hari tidak bisa dijawab.** Itu diterima karena bukan
pertanyaan yang §11 ajukan — ambang disetel dari minggu terakhir, bukan dari
kuartal lalu. **Pemicu** untuk membangun rollup per jam: ada orang yang sungguh
menanyakan tren lebih panjang daripada retensinya.

⚠ **Ambang per-jalur masih BELUM disetel, dan itu bukan kelalaian.** Histogramnya
baru ada hari ini, jadi ia belum punya sampel — dan `samples` ditampilkan di
samping setiap persentil justru karena itu: **p95 atas tiga pekerjaan adalah
angka, bukan fakta.** Tujuh jalur tetap memakai satu pasang ambang sampai
angkanya layak dipercaya. Pemicunya pengukuran, sama seperti 1d.

✅ **Pemicu 1d kini diukur (22 Okt 2026)** — tabel kendali `runtime_samples`
(migration `0008`), panel ketiga di `/scheduler`. Rinciannya keadaan, jadi
tempatnya [02 §14](./02-LAYANAN-INFRA.md). Dua hal yang ternyata tidak seperti
yang ditulis pemicunya:

- **"`--max-old-space-size` lagi" tidak bisa dibaca harfiah di jalur dokumen.**
  Pelari jalur berjalan di **Bun**, yang mengabaikan flag itu — tidak ada batas
  heap yang bisa didekati. Yang dinilai karena itu **puncak RSS** per pekerjaan
  terhadap 768 MiB, pagar yang sudah terbukti wajib di kotak ini (Dockerfile).
- **Node dan Bun mencatat histogram event loop dengan dasar berbeda.** Diukur:
  Node menyertakan resolusinya (p50 10,11 ms saat menganggur), Bun tidak
  (0,09 ms). Tanpa koreksi, dua proses yang sama sehatnya terbaca berbeda 10 ms.

Penamaannya mengikuti konvensi OpenTelemetry (`queue.items.age`,
`queue.items.size`, `job.duration`) dengan dimensi nama jalur.

## 12. Tata kelola

Gerbang rilis dan register keputusan sudah utuh. Yang berlubang:

| Bidang | Hilang |
|---|---|
| **Versi** | **definisi GA**. Semver + tag versi sudah ada (tahap 1a: setiap image juga ber-tag versi `package.json`, kini `0.10.0`) — yang belum adalah janji apa yang membuat sebuah versi "umum" |
| ~~Rollback skema~~ | ✅ **selesai 20 Okt 2026** — expand/contract ditegakkan `tests/expand-contract.test.ts`, aturannya di [`docs/DATABASE.md` §7.1](../DATABASE.md). Prasyarat §6 karena itu terpenuhi; yang tersisa dari §6 adalah memindahkan penerapannya keluar dari gerbang pemblokir |
| **Insiden** | severity **insiden** (yang ada baru severity temuan P0–P3), siapa dihubungi |
| **SLO** | satu sasaran per permukaan + ***error budget***-nya; tanpa itu metrik §11 hanya grafik |
| ~~Keamanan~~ | ✅ `SECURITY.md` ada (22 Okt 2026) — **kontak & sasaran waktunya masih placeholder** yang wajib diisi pemilik |
| Deprecation | jendela tertulis: ditandai satu rilis minor, dicabut sesudahnya |
| Data | retensi tertulis per jenis data + perjanjian pengolahan data |
| On-premise | jendela dukungan, kebijakan backport. Serah terima kunci ✅ sebagai templat: [`docs/ONPREM-SERAH-TERIMA.md`](../ONPREM-SERAH-TERIMA.md) |
| ~~Kepemilikan kode~~ | ✅ `.github/CODEOWNERS` (P3-3), satu pemilik: `@tri-evendi` |

Dua di antaranya memblokir komersialisasi, bukan sekadar kerapian: **disiplin
versi** — tanpa artefak bernomor tidak ada yang bisa dijual atau didukung — dan
**severity insiden**, tanpanya tidak ada SLA yang bisa dijanjikan.

⚠ **Delapan sisanya KEBIJAKAN, bukan kode — dan itu sebabnya ia tidak
dikerjakan di sini.** Jendela dukungan, retensi data, severity insiden, sasaran
SLO, definisi GA: semuanya menyatakan apa yang DIJANJIKAN kepada orang di luar
repo ini, dan janji yang ditulis oleh yang bukan penjanjinya adalah janji yang
tidak mengikat siapa pun. Yang bisa dikerjakan di sini sudah: satu-satunya
baris di tabel itu yang berbentuk **penjaga** kini ada.

Satu kaitan pantas disebut: **kontraksi skema pertama menuntut jendela dukungan
lebih dulu tertulis.** Daftar-izin kontraksi menuntut penyebutan rilis tempat
paruh expand-nya terkirim — dan pada pemasangan on-premise pernyataan "tak ada
lagi instans yang memakai bentuk lama" tidak bisa diperiksa dari repo ini.

## 13. Yang sengaja TIDAK dirancang

| Tidak diusulkan | Alasan |
|---|---|
| Broker pesan sebagai antrean — Kafka, Rabbit, Redis | baris pekerjaan harus hidup di basis data yang sama dengan jejaknya dan ikut cadangan yang sama; broker terpisah mengembalikan *dual-write* — §4 |
| Perender PDF berbasis Chromium | generator yang ada sudah memadai untuk tata letak ini; Chromium menukar satu kenyamanan dengan 100–300 MB RAM per render — §5 |
| Memecah domain akuntansi jadi mikrolayanan | batasnya tidak nyata: setiap pekerja butuh konteks perusahaan dan tiga klien yang sama |
| **Pintu posting kedua di Go** | I-2 menuntut satu pintu, dan `app-customer` memposting sinkron dari Next.js. Itu sebabnya jalur `ledger` tetap Node — §3.3 |
| **Konstanta akuntansi ditulis tangan di dua bahasa** | dibangkitkan dari `contract/accounting.yaml`; dua daftar tulis tangan menyimpang tanpa galat — §3.5 |
| **Aturan laporan ditulis di dua bahasa tanpa pemicu terukur** | `contract/` membangkitkan konstanta, bukan aturan. Perhitungan pindah ke Go per generator, dan hanya setelah pengukuran membukanya — §3.3, tahap 1d |
| Layanan tersendiri per jenis pekerjaan | keempat pembeda bisa dinyatakan **per container jalur** — §3.1 |
| Lapisan HA SAI di on-premise | DC/DRC customer sudah menjawabnya — §7 |
| Instans basis data tersendiri untuk `platform` | doktrin #137 ditegakkan di tingkat **impor**, bukan oleh batas jaringan. Satu-satunya pemicunya tahap 4 — §3 |
| Tenant-baris / schema-per-tenant | membatalkan isolasi fisik, yang justru membuat tahap 4 dan profil on-premise mungkin |
| Lisensi yang mematikan aplikasi | kesalahan kategori untuk produk akuntansi — §7 |
