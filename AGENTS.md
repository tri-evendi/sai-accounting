<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI/UX & Design System (WAJIB untuk pekerjaan tampilan)

Setiap kali membuat/mengubah/mereview UI (halaman, komponen, warna, tipografi, layout, chart), **ikuti proses ini**:

1. **Baca sumber kebenaran desain dulu:** `design-system/sai-accounting/MASTER.md`. Jika ada `design-system/sai-accounting/pages/<page>.md`, aturannya **meng-override** MASTER.
2. **Gunakan skill `ui-ux-pro-max`** untuk rekomendasi berbasis data (style/palet/tipografi/aksesibilitas/chart) & panduan stack:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs
   ```
   Skill terkait juga tersedia: `design-system` (token). Skill `ui-styling` **sudah DIHAPUS dari repo ini**: isinya shadcn/Tailwind, dan keduanya dicabut di issue #203 — jangan ditambahkan kembali.
3. **Patuhi prinsip app ini:** *simple surface, standard engine* — ramah pengguna awam, tapi proses akuntansi tetap baku. Light-first; semantik warna uang (hijau masuk / merah keluar) tak boleh warna-saja; angka `tabular-nums` rata-kanan format `id-ID`.
4. **Reuse** komponen `@sai/ui` (`packages/ui/src/components`, **Ant Design v6**; sejak monorepo Fase 2 — lima pembungkus yang bergantung pada aplikasi, mis. `locale-toggle` & `theme-toggle`, tetap di `src/components/ui`) & ikon `@ant-design/icons` (satu paket ikon saja; ukuran lewat `style={{ fontSize }}`, bukan prop `size`/`width`/`height` — `size={16}` LOLOS `tsc` lalu mendarat sebagai atribut DOM yang tak mengatur apa pun; lihat "Ikon" di MASTER.md). **TANPA Tailwind dan tanpa `className` sejak issue #203**: gaya ditulis SEBARIS (`style={{...}}`), warnanya `var(--ant-...)` atau `theme.useToken()`, dan nilai warna mentah (hex, `rgb()`, nama warna CSS) tidak ditulis di luar `packages/ui/src/theme/antd-tokens.ts` — **dijaga ESLint `sai/warna-token-antd`** (#204). Sebuah kelas tidak akan gagal - tidak ada lembar gaya yang memaknainya, jadi ia hanya berhenti berlaku. Yang tak punya bentuk sebaris (`:hover`, `::after`, `@media`) hidup di satu `<style href precedence>` di komponennya, menyasar atribut `data-*` (pola `landing-scale.ts` / `ui/table.tsx`). Form: `react-hook-form` + `zod` via pola `Form` (lihat "Konvensi Form" MASTER.md). Tabel: `StaticTable` (bawaan - dirender server, tanpa JS) atau `DataTable` (AntD, client, **+80 KB gzip per rute** — hanya bila memang butuh sortir/filter seketika); nominal lewat `Money`/`MoneyInput`. Tombol yang menuju ke suatu tempat: **`<ButtonLink href>`** untuk rute di dalam app (satu `<a class="ant-btn">` + navigasi sisi-klien + prefetch, #289) dan `<Button href>` untuk tautan keluar / `download` / pemuatan penuh yang disengaja. **Jangan** `<Link><Button/></Link>` — dua elemen interaktif bersarang, ditolak `tests/anchor-button-nesting.test.ts`; `asChild` **sudah dicabut** di #250 (tidak aman dari server component) dan `tests/button-no-aschild.test.ts` menolaknya kembali.
5. Sebelum menyerahkan UI, lewati **Pre-Delivery Checklist** di MASTER.md. Gerbangnya **dua**: `bun run verify` (typecheck + lint + vitest; jangan `npm`, jangan `bun test`) **dan** build yang harus `EXIT=0` — `bun run build`, ditambah `bun run build:operator` bila perubahannya menyentuh konsol atau paket (lihat §Struktur monorepo). Verify hijau TIDAK membuktikan aplikasinya bisa dibangun, dan itu sudah terjadi sekali. Aturan mana dijaga penjaga yang mana: §Penjaga di MASTER.md.

   ⚠ **Siapa yang menjalankan `bun run build`.** Gerbangnya tetap DUA — yang berubah hanya siapa yang menjalankan yang kedua. **Agent latar / sesi cabang: JANGAN jalankan `bun run build`.** Gerbang Anda `bun run verify` saja, dan ketiadaan build **ditulis apa adanya di badan PR** (*"`bun run build` tidak dijalankan — dijalankan sesi utama di atas hasil gabungan"*), bukan didiamkan: PR yang tiba-tiba menyebut satu gerbang akan terbaca sebagai kelalaian oleh orang berikutnya.

   Sebabnya mesin, bukan doktrin: kotak ini ~3,6 GB RAM dengan produksi hidup di atasnya, `next build` ~10 menit, dan dua agent yang membangun bersamaan **sudah** menghasilkan OOM (exit 137) — kegagalan yang terbaca seperti kode rusak padahal bukan. Tiga pengukuran lain di sesi yang sama juga terbuang jadi timeout karena beban, bukan karena ada yang salah.

   **Sesi utama tetap WAJIB menjalankannya, sekali, di atas `develop` hasil gabungan** — bukan di cabang mana pun. Itu justru lebih kuat daripada build per-cabang: satu-satunya build yang pernah gagal di repo ini gagal di hasil gabungan, sementara setiap cabangnya hijau sendiri-sendiri. Menghapus langkah ini berarti mempromosikan sesuatu yang belum pernah dibangun.

# Otorisasi / RBAC (WAJIB untuk halaman & API route baru)

Otorisasi berbasis **izin terpusat** — lihat `docs/RBAC.md`. Inti: matriks izin di `packages/core/src/authz.ts`; halaman memanggil `requirePagePermission("resource.action")`, API `requireApiPermission(...)`, tampilan `can(...)`. **Jangan** membandingkan string peran atau menulis daftar `["managing_director","finance_manager"]` di luar matriks — tes `authz-coverage` menolak halaman/route tanpa deklarasi izin. Sejak issue #73 matriks di kode adalah **BAWAAN**: matriks **EFEKTIF** = bawaan + override DB (`role_permission_overrides`) yang dikelola peran berakses penuh di halaman `/permissions`; penjaga memakai `canEffective` (`src/lib/authz-effective.ts`), jadi jangan tanam asumsi "peran X pasti tidak bisa Y" di luar penjaga.

# Multi-perusahaan (WAJIB dibaca sebelum menyentuh basis data)

Sejak issue #104 buku besar setiap PT hidup di **basis data sendiri**; pengguna,
daftar perusahaan, dan keanggotaan ada di **basis data kendali**. Lihat
`docs/MULTI-COMPANY.md`. Aturan yang tidak boleh dilanggar: **konteks perusahaan
yang hilang harus MELEMPAR, tidak pernah jatuh ke basis data bawaan** — jatuh ke
bawaan berarti transaksi PT A tertulis ke buku PT B tanpa galat dan tanpa jejak.
Halaman & route mendapat konteksnya dari penjaga; skrip/cron **wajib**
`runWithCompany()`. Cache tingkat modul yang isinya milik satu perusahaan
**wajib** dikunci per `companyId`. Jangan pernah membuat FK ke `users` dari basis
data perusahaan — pakai id global + `users-directory.ts`.

# Database & Skema (WAJIB untuk perubahan data)

Setiap perubahan model Prisma / migration / tabel **wajib** mengikuti `docs/DATABASE.md`. Inti:
- **Inggris · `snake_case` di DB (via `@map`) · tabel jamak (`@@map`) · Prisma camelCase.**
- Setiap tabel: `id` (Int autoincrement) + `created_at` + `updated_at`; master data + `is_active` (nonaktif, **bukan** hard-delete yang direferensikan).
- **Uang = `Decimal(15,2)`, kuantitas `Decimal(15,3)`, kurs `Decimal(18,6)` — JANGAN Float/Int.**
- Valas simpan `currency` + `rate` + `base_amount` (IDR).
- Enum-like = `String @db.VarChar` + `z.enum` (nilai `snake_case`); `@unique` untuk code/number; `@@index` untuk FK/date/status.
- **Mesinnya PostgreSQL sejak 15 Okt 2026.** Migration **ditulis tangan** di `prisma/postgresql/<company|control|platform>/NNNN_<nama>/migration.sql` (dialek PostgreSQL), diterapkan `bun run db:migrate:all` (`migrate deploy`); jalankan `bun run db:generate` setelahnya. `prisma/migrations/` dan `prisma/{control,platform}/migrations/` adalah **ARSIP MariaDB hanya-baca**: migration yang ditulis di sana tidak akan pernah diterapkan.
- **Skemanya** ada di `packages/db/prisma/<company|control|platform>/schema.prisma`; klien hasil bangkitannya diimpor lewat `@sai/db/client/<company|control|platform>`.
- Lewati **Checklist tabel baru** di `docs/DATABASE.md` sebelum commit.

# Struktur monorepo (WAJIB sebelum memindah atau menambah modul bersama)

Repo ini **bun workspaces**: DUA aplikasi Next.js — customer di `src/` dan **konsol operator di `apps/operator/`** (image sendiri, `…-operator`) — + paket di `packages/` (`@sai/db`, `@sai/core`, `@sai/ui`, `@sai/billing`, `@sai/platform`), dikirim sebagai sumber TS lewat `transpilePackages`. Peta dan arahnya: `docs/arsitektur/01-ARSITEKTUR.md`; riwayat dan rencana: `docs/arsitektur/07-RIWAYAT.md`. Aturan yang tidak boleh dilanggar:
- **Paket tidak pernah mengimpor `@/…`** atau keluar dari dirinya lewat jalur relatif. Modul yang butuh kode aplikasi tetap di `src/` — tentukan dengan menghitung penutupan dependensinya, jangan ditebak.
- **Kedua aplikasi tidak saling mengimpor.** Konsol memakai alias `@op/*` untuk dirinya sendiri dan `@sai/*` untuk selebihnya — `@/` tidak terselesaikan di sana, dan satu impor ke `src/` membundel kode customer ke image operator (dijaga `tests/operator-dependency-direction.test.ts`). Kode yang dibutuhkan keduanya pindah ke paket. Build konsol: `bun run build:operator`; gerbang build untuk perubahan yang menyentuh konsol atau paket = `bun run build` **dan** `bun run build:operator`.
- **Arah:** `src` / `apps/operator → @sai/platform → @sai/billing → @sai/core → @sai/db`, dan `@sai/ui → @sai/core`. Impor `@sai/*` sebuah paket wajib tercantum di `dependencies` manifesnya; graf tanpa siklus (dijaga `tests/packages-mandiri.test.ts`). Murni (tanpa basis data / `server-only`) → `core`/`billing`/`ui`; sisi-server → `platform`.
- **Paket baru** = baris `COPY packages/<x>/package.json packages/<x>/` di tahap `deps` Dockerfile + entri `transpilePackages`. Subpath baru = entri `exports` di manifesnya.
- **Memindah modul** = tulis ulang SETIAP pengimpor (termasuk impor relatif di `src/lib` dan `../src/lib/*` di skrip), tambahkan pasangan jalurnya ke `tests/paket-pindahan.test.ts`, dan cari rujukan jalur di tes dalam semua bentuknya (argumen `join(...)`, string penuh, relatif-`src`, `"@/…"`, regex `/@\/…/`).
- **Penjaga yang memindai kode wajib memakai `tests/akar-sumber.ts`** (`akarSumber()` = `src/` + `packages/*/src`; `uraiPaket()` untuk graf impor). Pemindai yang menyapu `src/` saja **lulus dengan nol pelanggar** begitu kodenya pindah — kegagalan diam yang sudah terjadi di Fase 2. Daftar-izin impor menyebut subpath `@sai/*` secara PERSIS bila paketnya memuat penulis basis data.


# Nomenklatur (WAJIB untuk nama baru apa pun)

Satu garis yang memutuskan semuanya: **pengenal kode Inggris, komentar &
dokumen Indonesia.** Pembaca komentar adalah tim; pembaca pengenal adalah
kompilator dan pustaka yang dipanggilnya — dan pengenal dwibahasa membuat setiap
baris terbaca dalam dua bahasa sekaligus (`const batasKoneksi = await
client.findMany()`). Lapisan basis data sudah melakukan pembelahan ini dan
terbukti nyaman; lapisan aplikasi melayang justru karena aturannya belum pernah
ditulis.

| Lapis | Bentuk | Contoh |
|---|---|---|
| Kolom & tabel DB | Inggris, `snake_case` lewat `@map`, tabel jamak | `invoice_date` · `journal_lines` |
| Model & field Prisma | Inggris, PascalCase / camelCase | `JournalLine.invoiceDate` |
| Pengenal kode (fungsi, tipe, konstanta) | **Inggris**, camelCase / PascalCase / SCREAMING_SNAKE | `buildAdapter` · `CACHE_TTL_SECONDS` |
| Berkas & berkas tes | Inggris `kebab-case`; tes menamai **aturan** yang dijaganya | `company-clients.ts` · `packages-standalone.test.ts` |
| Service compose | `<jenis>-<peran>`, jenis dari daftar di bawah | `app-customer` · `svc-integrator` · `job-backup` · `db-postgres` |
| Paket & pengenal Go | Inggris; paket pendek **tanpa garis bawah**; `gofmt` wajib | `internal/ledgerread` · `ClaimJob` |
| Volume compose | `<pemilik>_<isi>` | `postgres_data` · `app_documents` · `backup_archive` |
| Env var | `<PLANE>_<SUBJEK>_<ATRIBUT>` | `COMPANY_DATABASE_URL` · `CONTROL_DB_CONNECTION_LIMIT` |
| Skrip `package.json` | `<domain>:<aksi>[:<lingkup>]` — **selalu** berdomain | `db:migrate:all` · `backup:prove` · `user:create` |
| ID keputusan | nomor issue GitHub, permanen | `#104` |
| ID temuan | `P<tingkat>-<urut>`; **nomor pensiun, tidak pernah dipakai ulang** | `P0-3` |

**Istilah teknis baku TIDAK diterjemahkan.** Yang dicari orang di mesin pencari
tetap ditulis dalam bentuk aslinya — *dual-write*, *partial index*, *queue
depth*, *error budget*, *vacuum horizon*, *bounded concurrency*, *expand/contract*,
*failover*, *sidecar*, *leader election*, *standby*, *witness*. Menerjemahkannya
membuat konsep yang punya nama baku jadi tak bisa ditelusuri, dan pembaca
berikutnya mengira itu istilah buatan sendiri.

Sebaliknya, istilah yang **sudah menjadi kosakata repo ini** tetap dipakai apa
adanya, dan tidak di-Inggriskan ulang: *gerbang*, *cadangan*, *pemicu*,
*pembatas laju*, *jejak putaran*, *pintu posting*, *rekonsiliasi*, *tersandi*,
*penyimpanan objek*, *jendela toleransi*. Dua kosakata untuk satu hal lebih
buruk daripada pilihan mana pun di antaranya.

**Satu kata yang WAJIB dibedakan: `customer` vs `pelanggan`.** Keduanya berarti
"pelanggan" dalam bahasa sehari-hari, dan justru itu sebabnya satu di antaranya
harus berbahasa Inggris — tanpa pembedaan ini, dokumen yang sama memakai satu
kata untuk dua pihak yang kepentingannya berlawanan:

| Tulis | Artinya | Contoh |
|---|---|---|
| **`customer`** | pihak yang membeli produk **SAI** — tenant SaaS atau pembeli on-premise | `app-customer` · "customer berbayar pertama" · "reverse proxy milik customer" |
| **`pelanggan`** | pihak yang berutang ke **tenant** — entitas piutang di buku besar | `remind:customers` (surel ke pelanggan) · "umur piutang per pelanggan" · "nama pelanggan di faktur" |

Ujinya satu pertanyaan: **siapa yang mengirim uang ke siapa.** Uang ke SAI →
`customer`. Uang ke tenant → `pelanggan`. Nama tabel `customers` di buku
perusahaan tetap Inggris karena pengenal DB selalu Inggris, dan itu tidak
mengubah kata yang dipakai di prosa.

Jenis pada service compose menyatakan **apa benda itu**, bukan di mana ia
berjalan — penempatan adalah urusan dokumen penyebaran, dan nama yang mencoba
memuatnya selalu menyesatkan begitu penempatannya berubah:

| Jenis | Artinya | Contoh |
|---|---|---|
| `app-` | aplikasi yang **dikonsumsi pengguna langsung** | `app-customer` · `app-operator` |
| `svc-` | layanan internal yang berjalan terus; penggunanya layanan lain | `svc-integrator` · `svc-pooler` |
| `job-` | tugas yang berjalan lalu **keluar** — berjadwal atau sekali-jalan | `job-backup` · `job-migrate` |
| `db-` | penyimpan **tahan-lama** | `db-postgres` |
| `cache-` | penyimpan **boleh hilang** — namanya sendiri yang menjaga batas itu | `cache-redis` |

# Go di `services/` (WAJIB bila menyentuh integrator)

Integrator ditulis dalam **Go** sejak keputusan di
`docs/arsitektur/09-RANCANGAN-LAYANAN.md` §3.3. Empat aturan mengikat, dan
ketiganya ada karena **penjaga TypeScript repo ini tidak melihat Go sama
sekali** — 25 dari 306 berkas tes memindai kode untuk menegakkan aturan
struktural, dan semuanya berhenti di batas `services/`:

1. **Hanya jalur `ledger` (Node) menulis buku besar.** Kode Go membaca buku,
   menulis tabel `jobs`, dan menghasilkan berkas — tidak pernah `INSERT`/`UPDATE`
   ke tabel buku. Pintu posting wajib tunggal (invarian I-2), dan pintu itu
   TypeScript.
2. **Konstanta lintas bahasa DIBANGKITKAN dari `contract/`, tidak pernah ditulis
   dua kali.** Berlaku untuk `kind`/`status` pekerjaan **dan** konstanta
   akuntansi (tipe akun, status kontrak, mata uang, ambang materialitas). Dua
   daftar tulis tangan menyimpang tanpa galat: `kind` yang hanya dikenal satu
   sisi jadi baris yang menumpuk selamanya; tipe akun yang hanya dikenal satu
   sisi jadi laporan yang melewatkan satu kelompok akun.
3. **Gerbang rilis jadi TIGA:** `bun run verify` · `go test ./...` +
   `golangci-lint run` · build. Perubahan yang menyentuh `services/` wajib
   melewati gerbang Go, dan `bun run verify` yang hijau **tidak** membuktikan apa
   pun tentangnya.
4. **`services/` di luar workspace bun.** Glob-nya `packages/*` + `apps/*`.
   Jangan menaruh `package.json` di dalam pohon Go — itu menariknya ke graf paket
   yang penjaganya tidak memahaminya.

Nama lama yang belum sesuai **tidak** diperbaiki diam-diam sambil mengerjakan hal
lain: rename punya rencana berurutannya sendiri di
`docs/arsitektur/09-RANCANGAN-LAYANAN.md` §10, karena nama service, volume, dan
env var menyentuh produksi. Yang berlaku di sini adalah nama **baru**.
