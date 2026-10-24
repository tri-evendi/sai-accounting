# Standar Database & Penamaan — SAI Accounting

> **Multi-perusahaan (issue #104).** Skema `packages/db/prisma/company/schema.prisma`
> adalah skema satu perusahaan, dan sejak #104 ia digandakan: satu basis data
> per PT. Pengguna, perusahaan, dan keanggotaan ada di skema terpisah
> (`packages/db/prisma/control/schema.prisma`). Aturan lintas-basis-data ada di
> `docs/MULTI-COMPANY.md`. Yang terpenting: tidak ada FK ke `users` dari basis
> data perusahaan, dan migration diterapkan dengan `bun run db:migrate:all`.
>
> **Basis data platform (issue #137).** Skema ketiga,
> `packages/db/prisma/platform/schema.prisma`, menjadi basis data `sai_platform`:
> langganan dan penagihan SaaS, yaitu data bisnis penyedia, bukan buku
> customer. Ia opsional untuk pemasangan multi-PT satu grup usaha. Aturan
> operasionalnya di §11.

Aturan ini wajib untuk setiap perubahan skema (model Prisma, migration, query).
Tujuannya konsistensi, keamanan data keuangan, dan kemudahan pemeliharaan.
Standar ini mengodifikasikan konvensi yang sudah dipakai di
`packages/db/prisma/company/schema.prisma` dan menutup celahnya.

> Ringkas: Bahasa Inggris · `snake_case` di DB · tabel jamak · uang `Decimal` (jangan Float) · setiap tabel punya `id` + `created_at` + `updated_at`.

---

## 1. Prinsip
1. **Akurasi keuangan** — nilai uang dan kuantitas tidak boleh floating point.
2. **Konsisten > kreatif** — ikuti pola yang ada; jangan buat gaya penamaan baru.
3. **Jangan hard-delete data yang direferensikan** — master data dinonaktifkan (`is_active = false`).
4. **DB adalah sumber kebenaran tipe** — validasi Zod mencerminkan constraint DB.

---

## 2. Penamaan

### Tabel
- `snake_case`, jamak, Bahasa Inggris: `accounts`, `contracts`, `cash_accounts`, `supplier_transactions`.
  Jamak pada kata **intinya**, bukan selalu pada kata terakhir:
  `bills_of_material` benar (yang jamak "bills"), begitu juga
  `tenant_slug_history` — "histories" justru salah untuk kata benda massa.
- Tanpa prefix (prefix legacy `tb_` sudah dihapus).
- Tabel baris-detail: `<parent-singular>_items` atau `<domain>_lines` (mis. `invoice_items`, `journal_lines`).
- Di Prisma: model PascalCase singular + `@@map("plural_snake_case")`.
  ```prisma
  model Account { /* ... */ @@map("accounts") }
  ```

### Kolom
- `snake_case` di DB, `camelCase` di Prisma via `@map`:
  ```prisma
  supplierId Int @map("supplier_id")
  createdAt  DateTime @default(now()) @map("created_at")
  ```
- **Primary key**: selalu `id` — `Int @id @default(autoincrement())`.
- **Foreign key**: `<referenced_singular>_id` → `supplier_id`, `account_id`, `parent_id`.
- **Boolean**: prefix `is_`/`has_` → `is_active`, `is_posted`.
- **Tanggal/waktu**: `*_at` (timestamp) atau `*_date` (tanggal transaksi) → `created_at`, `posted_at`, `due_date`.
- **Uang**: nama jelas, plus pendamping mata uang bila valas (lihat §4) → `amount`, `debit`, `credit`, `total`, `base_amount`.
- **Kode/nomor**: `code` (master, mis. COA), `number`/`no` (dokumen, mis. `invoice_no`). Dokumen dan kode memakai `@unique`.

### Enum-like (status, tipe)
- Pola yang dipakai: `String @db.VarChar(n)` dengan daftar nilai terdokumentasi, divalidasi `z.enum([...])` di layer Zod. Proyek ini belum memakai Prisma `enum`; jangan mencampurnya tanpa alasan.
- Nilai enum: lowercase `snake_case` (`pending`, `partial`, `paid`, `kas_besar`).

#### Setiap pintu masuk data wajib memvalidasi, termasuk impor (issue #111)

Kolomnya `VARCHAR`, jadi basis data menerima nilai apa pun. Zod menjaga
formulir, tetapi tidak menjaga impor/ETL. Impor legacy pernah menyalin
`'IN'`/`'OUT'`/`'PROCESS'` dan `'Kas Kecil'`/`'Rp'`/`'USD'`/`'CNY'` apa adanya
tanpa error. Hasilnya saldo stok nol untuk 33 barang, dan 18.689 baris kas
terposting ke akun kas bawaan.

Collation basis data kini `C` (PostgreSQL, sejak 15 Okt 2026), jadi
perbandingan SQL peka huruf besar-kecil, sama seperti JavaScript. Akibatnya:
filter Prisma `contains` perlu `mode: "insensitive"` untuk masukan bebas
(`abadi` harus menemukan `PT ABADI`), dan `@unique` pada kode/nomor menerima
`ABC` dan `abc` sekaligus, jadi normalkan sebelum menulis. Lihat
[`arsitektur/07-RIWAYAT.md`](./arsitektur/07-RIWAYAT.md#yang-masih-terbuka).

Aturannya:
- Daftar nilai ada di satu tempat (`packages/core/src/constants.ts`) dan dipakai
  `z.enum(...)` maupun guard impor. Jangan diketik ulang.
- Skrip impor memetakan lewat `src/lib/legacy-values.ts` dan melempar error
  untuk nilai tak dikenal. Menebak (mis. jatuh ke `'in'`) menghasilkan angka
  salah tanpa jejak.
- `bun run check-data-conformance` (juga peran `conformance` di layanan `svc-worker`) memeriksa
  data yang sudah tertulis terhadap kosakata ini.

---

## 3. Kolom wajib di setiap tabel
| Kolom | Prisma | Catatan |
|---|---|---|
| `id` | `Int @id @default(autoincrement())` | PK |
| `created_at` | `DateTime @default(now()) @map("created_at")` | |
| `updated_at` | `DateTime @updatedAt @map("updated_at")` | |

> **Pengecualian tunggal: tabel HANYA-TAMBAH.** Jejak audit
> (`audit_logs`, `tenant_audit_logs`, `operator_audit_logs`) tidak punya
> `updated_at`, dan itu bukan kelalaian — baris jejak audit yang bisa
> diperbarui bukan jejak audit. Tabel hanya-tambah baru **wajib menyatakan
> sifat itu** di komentar modelnya, supaya pengecualiannya terbaca sebagai
> keputusan, bukan sebagai kolom yang lupa.
| `is_active` *(master data)* | `Boolean @default(true) @map("is_active")` | untuk nonaktif, bukan hapus |

---

## 4. Tipe data (ketat)
| Jenis | Tipe Prisma | Alasan |
|---|---|---|
| **Uang / nominal** | `Decimal @db.Decimal(15, 2)` | **JANGAN Float/Int** — floating point salah untuk uang |
| **Kuantitas** (kg, bag) | `Decimal @db.Decimal(15, 3)` | pecahan (kg) akurat |
| **Kurs / rate** | `Decimal @db.Decimal(18, 6)` | presisi tinggi konversi |
| **Persen / diskon** | `Decimal @db.Decimal(7, 4)` | |
| Teks pendek | `String @db.VarChar(n)` | selalu batasi panjang |
| Teks panjang | `String @db.Text` | alamat, catatan |
| Tanggal+waktu | `DateTime` (`TIMESTAMP(3)`) | |
| Boolean | `Boolean` (`BOOLEAN`) | |
| Mata uang | `String @db.VarChar(5)` | kode ISO (`IDR`,`USD`,`CNY`) |

**Berkas gambar di basis data** (`brand_assets` di platform, `company_logos`
di buku PT): `Bytes` (`BYTEA`) beserta `mime_type`, `sha256` (`CHAR(64)`),
`width`, `height`, `byte_size`. CHECK menegakkan format (PNG/JPEG saja),
`byte_size = octet_length(content)`, dan batas ukurannya; indeks unik parsial
`WHERE is_active` menjamin satu yang aktif. Mengganti = menonaktifkan yang lama
dan membuat baris baru dalam satu transaksi, jadi riwayatnya tetap ada. Isi
berkas divalidasi dari kepalanya (`@sai/core/image-file`), bukan dari nama atau
MIME kiriman peramban. Hanya untuk berkas kecil (≤ 512 KB); dokumen unggahan
pengguna tetap di disk (`lib/document-storage.ts`).

**Aturan uang multi-mata uang:** setiap nilai valas menyimpan tiga hal:
1. `amount` (nilai mata uang asli) + `currency`,
2. `rate` (kurs ke IDR pada tanggal transaksi),
3. `base_amount` (nilai dalam IDR), dasar buku besar dan laporan.

**Kolom waktu `TIMESTAMP(3)` tanpa zona: isinya bergantung pada SIAPA yang
menulisnya.** Satu konvensi untuk semua tabel kecuali satu:

| Tabel | Isi kolom waktu | Siapa menulisnya |
|---|---|---|
| semua tabel **kecuali `jobs`** | jam dinding **UTC** | Prisma (model, dan parameter `Date` di `$queryRaw`); SQL mentah wajib `now() AT TIME ZONE 'UTC'`; Go mengirim teks UTC `$n::timestamp` |
| `jobs` | jam dinding `now()` **zona sesi** | `now()`/`LOCALTIMESTAMP` di kedua bahasa + DEFAULT `CURRENT_TIMESTAMP`; dibaca lewat `(col AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'` (#741/#744) |

Zona sesi = zona bawaan server (`TZ` container `pg`, `Asia/Jakarta` di
produksi), sebab node-pg, `@prisma/adapter-pg`, dan pgx tidak menyetelnya.

**Prisma mengisi `@default(now())` dan `@updatedAt` SENDIRI**, dengan jam UTC
proses, dan menyebut kolomnya di setiap `INSERT`: DEFAULT `CURRENT_TIMESTAMP`
di DDL tidak pernah menyala untuk tulisan Prisma. Diukur di produksi 23 Okt
2026 (hanya-baca): 273 tabel berisi yang punya `created_at`+`updated_at` di 19 basis data,
35 239 baris, **nol** baris yang kedua kolomnya berselisih tujuh jam; kolom
yang nilainya jatuh di jendela "masa depan UTC" (jejak jam WIB yang baru
ditulis) hanya ada di `jobs`. Tanggal akuntansi (`journals.date`,
`invoices.date`, `cash_movements.date`, …) adalah tengah malam UTC hari
kalendernya (diukur: 26 170 baris `sai_production`, semuanya 00:00 kecuali
7 baris alur produksi 30 Agu 2026 yang tanggalnya instan UTC `new Date()` — selaras dengan `created_at`-nya — dan 1 baris warisan impor), ditulis Prisma, dan tidak tersentuh
zona sesi sama sekali. Layar memformat semuanya dengan `BUSINESS_TIME_ZONE`
(`@sai/core/business-date`), jadi tampilan sudah benar.

Yang menulis jam ZONA SESI ke tabel selain `jobs` hanya tiga bentuk, dan
ketiganya ditolak `tests/sql-clock-utc.test.ts`:

1. `now()` / `CURRENT_TIMESTAMP` / `LOCALTIMESTAMP` polos di SQL mentah — tulis
   `now() AT TIME ZONE 'UTC'`. (Satu-satunya pelanggar sampai 23 Okt 2026:
   `rate-limit-persistent.ts`; diperbaiki tanpa migrasi data, baris lamanya
   terbaca "di masa depan" dan diperlakukan sebagai jendela kedaluwarsa.)
2. `INSERT` mentah yang tidak menyebut `created_at`, sehingga DEFAULT
   `CURRENT_TIMESTAMP` menyala — sebut `created_at` (dan `updated_at`)
   dengan bentuk UTC.
3. Data yang diisi migration (`INSERT … SELECT … CURRENT_TIMESTAMP`) —
   aturannya sama; migration lama yang sudah diterapkan tidak disunting.

`tests/sql-clock-utc.integration.test.ts` membuktikan ketiganya terhadap
PostgreSQL sungguhan dengan zona sesi × zona proses {UTC, New York, Jakarta}.
Integrator Go mematuhi konvensi yang sama (`internal/trail/backup.go`,
`internal/jobs/queue.go`): ia tidak pernah mengikat `time.Time` ke kolom
seperti itu, sebab pgx mengodekannya menurut mode koneksi (jam proses atau
zona sesi). Penjaganya `tests/services-go.test.ts`.

**Yang sengaja TIDAK dilakukan (keputusan 23 Okt 2026):**

- **Zona basis data/sesi tidak diubah ke UTC** (`ALTER DATABASE … SET timezone`).
  Untuk tabel selain `jobs` tidak ada yang diperbaiki olehnya (Prisma tidak
  bersandar pada DEFAULT), sementara untuk `jobs` ia memindah jam `now()` tujuh
  jam di tengah antrean yang hidup: `run_after` baris `queued` mendadak tujuh
  jam di masa depan dan lease yang sedang dipegang tampak berumur negatif,
  sampai setiap koneksi di pool Node, pgx, dan PgBouncer berganti — yang
  waktunya tidak bisa dikendalikan. Pemasangan on-premise dengan zona lain
  sudah benar tanpa itu, sebab kodenya tidak bergantung pada zona sesi.
- **DEFAULT DDL tidak diganti** menjadi `(now() AT TIME ZONE 'UTC')`, dan
  `@default(now())` tidak menjadi `dbgenerated(...)`. Mengganti DEFAULT
  ±100 tabel × 19 basis data mengambil kunci `ACCESS EXCLUSIVE` per tabel di
  basis data yang hidup demi kolom yang tidak pernah diisi DEFAULT-nya; yang
  bisa memicunya (SQL mentah dan Go) dijaga di sumbernya.
- **Tidak ada migrasi data.** Tidak ada baris yang terbukti salah selain
  `jobs` (yang benar menurut konvensinya sendiri) dan `rate_limit_counters`
  (penghitung berumur pendek yang memulihkan dirinya). Pengurangan tujuh jam
  "hanya pada yang ditulis DEFAULT" tidak bisa dibuktikan per baris, dan
  migration memang tidak boleh menulis data (§7.1).

---

## 5. Relasi & index
- Deklarasikan relasi Prisma beserta `onDelete`:
  - Baris-detail milik header → `onDelete: Cascade`.
  - Referensi ke master (account/partner) → `Restrict`, supaya master yang dipakai tidak terhapus.
- Beri index pada kolom yang sering difilter atau di-join: FK, `date`, `status`, `code`, `number`.
- **Setiap kolom FK wajib punya `@@index`** (atau tercakup `@@unique`/`@id`)
  dan `CREATE INDEX` di migration-nya. PostgreSQL tidak membuat index untuk
  `FOREIGN KEY` secara otomatis; MariaDB/InnoDB dulu membuatnya sendiri. Tanpa
  deklarasi, kueri join melambat tanpa error. Dijaga
  `tests/index-fk-parity.test.ts`.
  ```prisma
  @@index([accountId])
  @@index([date])
  @@unique([code])
  ```

---

## 6. Aturan akuntansi
- **Chart of Accounts**: `code` unik (`@unique`), `parent_id` (hierarki self-relation), `type` (enum-like), `normal_balance` (`debit`/`credit`).
- **Dokumen**: `number` unik + `status` (enum-like: `draft`/`posted`/`paid`/...). Pola header + lines (`*_items`/`*_lines`), lines `onDelete: Cascade`.
- **Jurnal**: `journals` (header) + `journal_lines` (`account_id`, `debit`, `credit`, `currency`, `base_amount`). Invarian Σ debit = Σ credit divalidasi di service layer, tidak hanya di UI.
- Transaksi yang sudah diposting atau berada di periode tertutup tidak dihapus; buat jurnal balik.
- **Tarif PPN (issue #368)**: `tax_rates` (`rate` `Decimal(5,2)`, `effective_from`
  `@db.Date` unik) + `company_settings.is_pkp`. Tarif adalah data
  ber-efektif-tanggal, bukan konstanta kode. Dua aturannya:
  1. **Tanggal baris tarif tidak pernah disunting.** Mengubah tarif berarti
     menambah baris dengan `effective_from` baru. Menyunting `effective_from`
     baris lama mengubah cara setiap dokumen di antara dua tanggal dibaca
     ulang, yaitu menulis ulang masa lalu dari layar pengaturan.
  2. **Dokumen membawa tarifnya sendiri** (`invoices.tax_rate`), dan mesin
     posting membaca kolom itu, tidak membaca tabel ini. Tarif baru karena itu
     tidak mengubah angka yang sudah terbit di laporan; yang berubah hanya
     bawaan formulir berikutnya.

  `packages/core/src/tax.ts` tetap memuat `DEFAULT_TAX_RATE` untuk dua hal yang
  bukan milik customer: benih tarif pertama perusahaan baru, dan PPN tingkat
  platform (tagihan langganan kita sendiri, lihat §11).
  `tests/tax-rates.test.ts` menolak formulir dokumen yang mengimpornya kembali.

---

## 7. Migrations (workflow proyek ini)
> **Mesin: PostgreSQL 17 sejak 15 Okt 2026.** Riwayat MariaDB (`prisma/_arsip-mariadb/company/` 0001–0065, `prisma/_arsip-mariadb/control/`, `prisma/_arsip-mariadb/platform/` — sampai #636 di `prisma/migrations/` dan `prisma/{control,platform}/migrations/`) adalah arsip hanya-baca; MariaDB sendiri dicabut 22 Okt 2026 (#636). Berkas baru di sana tidak akan diterapkan. Latar dan validasinya: [`arsitektur/07-RIWAYAT.md`](./arsitektur/07-RIWAYAT.md).

- Proyek ini tidak memakai `prisma migrate dev`. Migration ditulis tangan sebagai folder berurutan di `prisma/postgresql/<db>/NNNN_<nama>/migration.sql`, dengan `<db>` = `company` (buku tiap PT), `control`, atau `platform`. Contoh: `prisma/postgresql/control/0002_slug_permanen`.
- Diterapkan via `prisma migrate deploy`: `bun run db:migrate:all` (control → platform → setiap PT). Di produksi `migrate` menyambung langsung ke `pg`, tidak lewat PgBouncer, karena advisory lock Prisma terikat sesi.
- Gaya DDL mengikuti `prisma/postgresql/company/0001_baseline`: identifier berkutip ganda (`"created_at"`), `SERIAL` untuk `id`, `TIMESTAMP(3)`, `DECIMAL(15,2)`, FK ditambahkan via `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE ... ON UPDATE ...`. Prisma tidak membangkitkan trigger: tulis tangan, dan `tests/pg-trigger-parity.test.ts` menjaganya.
- Setelah menulis model dan SQL, jalankan `bun run db:generate` (Prisma client). Perbarui `prisma/seed.ts` bila perlu data awal.

### 7.1 Setiap migration WAJIB expand-only — dijaga `tests/expand-contract.test.ts`

Satu pertanyaan memutuskan boleh atau tidaknya sebuah pernyataan:

> **Bisakah versi aplikasi yang BERJALAN SEKARANG — yang belum tahu apa-apa
> tentang migration ini — tetap membaca dan menulis setelah ia diterapkan?**

Itu bukan kerapian. Migration diterapkan ke **19 basis data**, dan selama
putarannya berjalan ada instans yang sudah bermigrasi dan ada yang belum,
sementara aplikasinya satu. Rancangan §6 menyebut aturan ini **prasyarat** bagi
apa pun yang memindahkan penerapan keluar dari gerbang pemblokir.

**Yang DILARANG, beserta kode lama yang dipatahkannya:**

| Dilarang | Kode lama patah sebab |
|---|---|
| `DROP TABLE` · `DROP COLUMN` | ia masih menyebutnya, di `SELECT` maupun `INSERT` |
| `RENAME` (tabel/kolom) | ganti nama = DROP + ADD dalam satu langkah; tak ada saat di mana nama lama dan baru sama-sama benar |
| `ALTER COLUMN ... SET NOT NULL` | ia menulis tanpa kolom itu; `INSERT`-nya mulai gagal |
| `ADD COLUMN ... NOT NULL` **tanpa** `DEFAULT` | idem, **dan** gagal seketika pada tabel yang sudah berisi baris |
| `ALTER COLUMN ... TYPE` | penyempitan memotong data; pelebaran pun mengubah apa yang dipulangkan driver (Decimal→Float = uang yang berubah nilainya) |
| `CREATE UNIQUE INDEX` pada tabel yang **sudah ada** | ia tidak tahu nilainya harus unik dan akan menulis duplikat |
| `UPDATE` / `DELETE` data | migration adalah perubahan SKEMA. Backfill berjalan sekali, tanpa transaksi yang bisa dibatalkan per tenant, tanpa jejak audit — ia **skrip**, dengan pemiliknya sendiri |

**Yang JUSTRU AMAN, dan daftarnya tidak simetris dengan sengaja:** `ADD COLUMN`
nullable · `ADD COLUMN ... NOT NULL DEFAULT ...` · `CREATE INDEX` non-unik ·
`CREATE TABLE` (termasuk `NOT NULL` di dalamnya, dan indeks unik atas tabel yang
dibuat migration **yang sama**) · `DROP CONSTRAINT` · `DROP INDEX` ·
`ALTER COLUMN ... DROP NOT NULL`.

Ketidaksimetrisannya satu kalimat: **melepas** batasan aman — kode lama tidak
pernah bergantung pada sesuatu DITOLAK — sementara **menambah** batasan tidak.

**Kalau memang harus mengontraksi:** pecah jadi dua rilis. Paruh *expand*
sekarang (tambah yang baru, biarkan yang lama, tulis ke keduanya); paruh
*contract* sesudah tak ada lagi instans yang memakai bentuk lama — lalu
daftarkan di `KONTRAKSI_DIIZINKAN` beserta **rilis tempat paruh expand-nya
terkirim**. Rilis itu wajib disebut sebab ia satu-satunya yang membuat kontraksi
aman, dan satu-satunya yang tidak tersimpan di berkas SQL mana pun.

⚠ Pada pemasangan **on-premise** pernyataan "tak ada lagi instans yang memakai
bentuk lama" tidak bisa diperiksa dari repo ini. Itu sebabnya jendela dukungan
(09 §12) harus tertulis sebelum kontraksi pertama.

**Arah sebaliknya dijaga GERBANG, bukan aturan ini.** Expand-only menjamin
kode LAMA di skema BARU. Sejak 23 Okt 2026 (`db:migrate:release`, 09 §6) ada
juga keadaan kode BARU di buku yang belum termigrasi — buku yang gagal tidak
lagi menahan rilis. Aturan migration tidak bisa membuat itu aman (kode baru
memang boleh memakai kolom barunya); yang membuatnya aman adalah gerbang skema
per perusahaan (`src/lib/company-schema-gate.ts`), yang menutup buku itu
sampai migration-nya sampai. Jadi: **jangan pernah melonggarkan gerbang itu
dengan alasan "migration-nya expand-only"** — keduanya menjaga arah yang
berbeda.

---

## 8. Prisma (konvensi teknis)
- Generator: `provider = "prisma-client"`, output `packages/db/generated/company`. Datasource `postgresql` tanpa `url`; koneksi lewat `@prisma/adapter-pg`, dipilih dari skema URL di `packages/db/src/engine.ts`. Klien yang dibangkitkan terikat dialek `provider`, jadi image ini tidak bisa bicara ke `mysql://`.
- Import client selalu lewat `import { prisma } from "@/lib/prisma"` (singleton). Class dari `@sai/db/client/company`.
- Field opsional pakai `?`; default via `@default(...)`.

---

## 9. Checklist tabel baru (wajib)
- [ ] Nama tabel `snake_case` jamak + `@@map`; model PascalCase singular.
- [ ] `id`, `created_at`, `updated_at` ada; master data punya `is_active`.
- [ ] Kolom `snake_case` via `@map`; FK `<entity>_id`.
- [ ] Uang `Decimal(15,2)`, kuantitas `Decimal(15,3)`, kurs `Decimal(18,6)` — tidak ada Float.
- **`rate` bukan satu hal.** `Decimal(18,6)` berlaku untuk **kurs mata uang**;
  **persentase** (tarif pajak, diskon, margin) `Decimal(5,2)`. Namai kolomnya
  sesuai jenisnya — `exchange_rate` dan `tax_rate_percent` — karena satu nama
  `rate` untuk dua jenis angka adalah asal mula presisi yang salah.
- [ ] Valas menyimpan `currency` + `rate` + `base_amount`.
- [ ] Enum-like = `String @db.VarChar` + `z.enum` di Zod; nilai `snake_case` lowercase.
- [ ] Kolom tersandi selalu **bertiga**: `<subjek>_ciphertext` ·
      `<subjek>_iv` · `<subjek>_tag`. Jangan menyandikan ke satu kolom gabungan.
- [ ] Kolom data pribadi diberi klasifikasi `/// @pii <kelas>` di komentar
      modelnya (kontak · alamat · identitas-pajak · kredensial · perilaku).
- [ ] `@unique` untuk code/number; `@@index` untuk date/status.
- [ ] Setiap kolom FK punya `@@index` + `CREATE INDEX` di migration (PostgreSQL tidak membuatnya otomatis; `tests/index-fk-parity.test.ts`).
- [ ] `onDelete`: Cascade (lines), Restrict (master).
- [ ] Migration `prisma/postgresql/<db>/NNNN_<nama>/migration.sql` ditulis (dialek PostgreSQL: kutip ganda/`TIMESTAMP(3)`/ALTER FK).
- [ ] Skema Zod mencerminkan constraint DB (panjang, required, enum).
- [ ] `bun run db:generate` dijalankan.

### 9.1 Tabel `outbox` (buku PT, migration `0005_outbox`) — satu pintu tulis

`outbox` adalah satu-satunya tabel buku yang ditulis oleh DUA pihak dengan
aturan berbeda (09 §4):

- **Menulis baris baru HANYA lewat `emitOutboxEvent(tx, …)`** di
  `src/lib/outbox.ts`, dengan klien TRANSAKSI domainnya — ia melempar untuk
  klien biasa, dan `tests/outbox-write-door.test.ts` menolak `outbox.create*`
  atau `INSERT INTO outbox` di tempat lain. Peristiwa yang ditulis di luar
  transaksi domainnya bisa terbit untuk tulisan yang di-rollback.
- **Relay** (`src/lib/outbox-relay.ts`) hanya `UPDATE` (`published_at`,
  `attempts`, `last_error`, `next_attempt_at`) dan `DELETE` baris yang SUDAH
  terbit (retensi). Ia tidak pernah `INSERT`.
- `event_type` = `VarChar` + `z.enum` dari `contract/kinds.yaml` →
  `outbox.events`, tanpa CHECK (pola `jobs.kind`). `dedupe_key` UNIK.
- Jam: kolom waktunya UTC (Prisma, atau `now() AT TIME ZONE 'UTC'` di relay) —
  `outbox` bukan `jobs` (§4 "Kolom waktu").

Jejak relay per buku ada di KENDALI (`outbox_relay_books`, migration `0012`),
bukan di buku: pembaca kesehatan tidak boleh menyapu setiap buku PT.

---

### 9.2 Bentuk usaha — `companies.legal_form` (kendali 0014) + `company_partners` (buku 0006)

Keputusan pemilik 24 Okt 2026: selain PT, buku harus benar untuk PT
Perorangan, CV, Firma, dan usaha perorangan (UD).

- **`companies.legal_form`** (KENDALI) — `pt` · `pt_perorangan` · `cv` ·
  `firma` · `perorangan` · `lainnya`, `NOT NULL DEFAULT 'pt'` + CHECK. Di
  registry, bukan di `company_settings`, karena dipilih saat perusahaan DIBUAT
  — sebelum buku punya baris setelan — dan terbaca konsol operator. Kosakata &
  model ekuitas: `packages/core/src/legal-form.ts`.
- **`company_partners`** (BUKU) — pemilik/sekutu: `name`, `role`
  (`aktif`/`komanditer`, CV saja), `share_bp` (porsi laba, basis poin, jumlah
  sekutu AKTIF tepat 10000 — dijaga `src/lib/partners.ts`, CHECK tidak bisa
  lintas baris), `capital_account_id` / `drawing_account_id` (FK RESTRICT ke
  `accounts`), `sort_order`, `is_active`. Di buku, bukan di kendali, karena
  menunjuk akun buku itu (FK tidak menyeberangi basis data), dibaca DI DALAM
  transaksi tutup buku, ikut pindah bersama bukunya, dan dibaca pembaca laporan
  Go yang hanya menjangkau basis data perusahaan. PT tidak punya baris.
- **Mengganti bentuk usaha tidak menulis ulang jurnal** dan tidak mengubah
  bagan akun yang ada; ia hanya memengaruhi tutup buku tahunan berikutnya dan
  rincian Laporan Perubahan Ekuitas. Templat ekuitas per bentuk hanya disemai
  sekali, saat buku dibuat (`coa-template.ts`, `EquityTemplateInput`):
  penyalaan modul belakangan menyemai TANPA akun ekuitas (`null`).
- **Tutup buku:** PT/PT Perorangan/lainnya → slot `retained_earnings` (tidak
  berubah). CV/Firma/perorangan → laba dibagi ke modal sekutu aktif per porsi
  dalam sen bulat (`allocateByShare`: dipotong ke arah nol, sisa ke porsi
  TERBESAR, seri → `sort_order` terkecil), lalu prive tiap sekutu ditutup ke
  modalnya (D Modal, K Prive) — `planPartnerYearClose`.

---

## 10. Deviasi skema (tech debt) — lunas

Deviasi lama (kolom waktu atau `is_active` yang hilang, index kurang, nama tabel
menyesatkan, boolean ber-`Int`, valas tanpa `rate`/`base_amount`, presisi tak
seragam) ditutup di migration MariaDB 0026–0041 (issue #9/#23/#104). Penutupan
itu dilakukan sebelum skema digandakan per perusahaan, karena sesudahnya satu
perbaikan harus diterapkan ke N basis data. Tabel baru wajib patuh sejak awal.
Entri audit lama tetap menyebut nama lama (`cash_account`/`stock`) dengan
sengaja: log mencatat keadaan saat itu.

> Prinsip: master yang direferensikan tidak di-hard-delete, melainkan dinonaktifkan (`is_active = false`). Route DELETE master (`consignees`, `suppliers`, `customers`) hanya menghapus baris yang belum pernah dipakai; selebihnya menonaktifkan dan mengembalikan `{ deactivated: true }`. `items` tidak punya DELETE sama sekali: menghapusnya akan menghapus gerakan stoknya (FK CASCADE), yaitu dasar HPP yang sudah masuk laporan.

---

## 11. Basis data platform `sai_platform` (issue #137) — operasional

Lapisan ketiga di samping control dan perusahaan (rancangan dan alasannya:
`docs/MULTI-TENANT.md` §4A). Isinya `plans`, `subscriptions`, `payments`,
`platform_invoices`, `usage_counters`, `mail_settings`, dan tabel situs publik:
data bisnis penyedia SaaS, tanpa angka akuntansi customer. Skema
`packages/db/prisma/platform/schema.prisma` → klien
`packages/db/generated/platform`; konfigurasi `prisma.platform.config.ts`; klien
runtime `packages/platform/src/platform-db.ts`.

⚠ **Jejak putaran BUKAN di sini.** `scheduler_runs`, `conformance_runs`, dan
`backup_runs` tinggal di basis data **kendali** (migration kendali
`0005_jejak_putaran`) — alasannya di komentar model `SchedulerRun`, dan sama
dengan yang menempatkan `operator_accounts` di sana.

**Basis data ini boleh tidak ada**, dan itu sudah ditegakkan di kode: pembaca
situs publik (`site_settings`, `status_notices`, `brand_assets`) dan
`mail_settings` semuanya **gagal-lunak** — platform yang hilang membuat halaman
pendaratan kembali ke kalimat bawaan dan surel kembali ke konfigurasi env, bukan
membuat permintaan gagal. `operator_audit_logs` hanya dibaca konsol, yang tidak
dipasang di on-premise. Jangan menambahkan pembaca yang **melempar** ke jalur
yang melayani permintaan: itu mengubah "tanpa penagihan" menjadi "aplikasi
mati".

**Menyediakannya** (opsional; pemasangan multi-PT satu grup usaha tidak butuh):

```sql
-- PostgreSQL (mesin sejak 15 Okt 2026), dijalankan sebagai superuser di `pg`:
CREATE ROLE sai_billing LOGIN PASSWORD '<sandi-tersendiri>';
CREATE DATABASE sai_platform OWNER sai_billing
  TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C';
```

Collation `C` sama dengan yang dipakai `ServerPostgres`
(`packages/db/src/server.ts`) untuk buku PT. Lalu set `PLATFORM_DATABASE_URL`
di `.env` (lihat `.env.docker.example`) dan jalankan
`bun run db:migrate:platform`, atau `db:migrate:all`, yang menyertakannya di
antara control dan perusahaan.

**Aturan:**

- **Pengguna basis data aplikasi tidak menyentuh `sai_platform` di jalur
  permintaan biasa.** Yang menentukan adalah kredensialnya:
  `PLATFORM_DATABASE_URL` memakai pengguna tersendiri (`sai_billing`) yang hanya
  berhak atas `sai_platform`, bukan pengguna `sai` milik buku besar.
- **Tidak ada FK lintas-basis-data.** Kolom `tenant_id` di setiap tabel platform
  adalah `Int` biasa tanpa FK, sama dengan pola `periods.closed_by_id`.
- **Urutan tulis:** alur yang menulis ke platform dan control menulis ke
  platform dulu, control belakangan. Selisihnya ditemukan
  `bun run reconcile:platform` (empat pemeriksaan sejak #140, termasuk
  kecocokan status dan `usage_counters`).
- **Penagihan mati tidak boleh mematikan login.**
  `packages/platform/src/platform-db.ts` dimuat malas (lazy) dan hanya boleh
  diimpor kode penagihan, tidak dari guard, sesi, atau jalur lain yang
  berjalan pada setiap permintaan. `db:migrate:all` melewati platform dengan
  peringatan bila `PLATFORM_DATABASE_URL` tidak diset
  (`scripts/migrate-platform.ts`), tetapi gagal bila diset dan migration-nya
  gagal.
- **Cache data platform dikunci per `tenant_id`** (perluasan aturan cache #104);
  pakai `TenantKeyedCache` (`packages/core/src/tenant-cache.ts`). Pengecualiannya
  `mail_settings` (#169): singleton milik penyedia, jadi cache-nya
  (`packages/platform/src/mail-settings.ts`, TTL 60 detik) tunggal.
  `brand_assets` (logo produk, migration platform 0005) sama: singleton milik
  penyedia, cache tunggal 60 detik di `packages/platform/src/brand-assets.ts`.
- **Isi halaman depan (migration platform 0008): draf → terbit, dengan
  riwayat.** `site_content_entries` memegang paling banyak satu baris
  `published` dan satu `draft` per kunci+bahasa (UNIQUE `locale, content_key,
  status`); draf `value = NULL` berarti "kembali ke bawaan saat terbit".
  Setiap penerbitan menulis satu `site_content_publications` dan satu
  `site_content_revisions` per kunci+bahasa yang berubah (nilai sebelum dan
  sesudah; NULL = bawaan kamus). Mengembalikan versi lama membuat draf dari
  revisi, lalu diterbitkan seperti suntingan lain, jadi yang tayang hanya
  punya satu jalur tulis (`publishSiteContentDrafts`). `site_content_previews`
  menyimpan SHA-256 token pratinjau (30 menit); draf hanya dibaca jalur publik
  lewat token itu. Satu-satunya penulis `packages/platform/src/site-content-store.ts`.
  Cache baca di `app-customer` tunggal (milik penyedia, bukan tenant) dan
  dibatalkan lewat sinyal `site-content` di `cache_signals` (di bawah):
  penerbitan tampil dalam 5 detik, dan angka itulah yang dikatakan konsol.

  **Expand/contract — SELESAI.** `site_contents` (bentuk lama) ditulis ulang
  di transaksi yang sama selama rilis 0.18.x (dual-write), supaya image
  sebelum 0008 menampilkan kalimat yang sama bila rilis di-rollback. Paruh
  contract-nya migration platform `0010_drop_site_contents`: dual-write dan
  model `SiteContent` dicabut, `DROP TABLE "site_contents"`, didaftarkan di
  `KONTRAKSI_DIIZINKAN` dengan `expandDiRilis` 0.18.0. Syaratnya diperiksa di
  produksi 23 Okt 2026 (hanya-baca): image yang berjalan 0.19.1, kedua tabel
  0 baris. Konsekuensinya: rollback ke image SEBELUM 0.18.0 kini menampilkan
  kalimat bawaan kamus.
- **`cache_signals` (migration platform 0009): sinyal invalidasi cache lintas
  proses.** Satu baris per nama cache (`CACHE_SIGNAL_NAMES` di
  `packages/core/src/cache-signals.ts`; CHECK menutup bentuk namanya). Nilai
  yang ditulis konsol (`app-operator`) atau skrip tetapi dibaca proses lain
  (`app-customer`, `svc-worker`) — pengaturan situs, isi halaman depan,
  katalog paket, logo, pengumuman status, pengaturan surel — menaikkan
  `version` sesudah tulisannya berhasil (`bumpCacheSignal`); pembaca membaca
  seluruh tabel paling sering sekali per 5 detik per proses
  (`cacheSignalVersion`) dan membaca ulang sumbernya begitu versinya berubah.
  `updateTag`/`invalidate*()` hanya membuang cache proses penulis, jadi
  tanpa sinyal ini halaman publik menunggu umur cache-nya. Bukan data: tabel
  kosong = versi 0, jadi tanpa `is_active`. Tabel yang belum ada / tak
  terbaca = kembali ke umur cache saja (gagal-lunak). Nilai baru yang
  ditulis satu proses dan di-cache proses lain wajib menambah nama di sana;
  `tests/cache-signals.test.ts` menolak nama tanpa penulis atau tanpa pembaca.
- **Register lisensi on-premise (`licence_customers`, `licence_register_entries`,
  migration platform 0006) adalah ARSIP.** Satu-satunya penulis & pembaca
  `packages/platform/src/licence-register-store.ts`, dipanggil konsol operator
  saja; tidak ada yang membacanya untuk memutuskan status lisensi (kewenangan
  ada pada tanda tangan berkas — 06-KEAMANAN §3.7). `source_tenant_id` = id
  tenant kendali tanpa FK, untuk customer yang pindah dari SaaS.
- **Satu-satunya rahasia di basis data adalah `mail_settings.password_ciphertext` (#169).**
  Kredensial lain tetap hidup di environment. Kolom ini disegel AES-256-GCM
  dengan kunci yang tetap di env (`SETTINGS_ENCRYPTION_KEY`, 64 karakter hex).
  Bila kuncinya hilang atau salah bentuk, penyimpanan kata sandi ditolak; kata
  sandi tidak pernah disimpan mentah. `mailer-core` membaca pengaturan surel
  dengan urutan basis data → environment → `file`, supaya platform yang mati
  tidak mematikan undangan dan atur-ulang sandi.

**Siklus hidup langganan (issue #140).** Mesin keputusannya fungsi murni di
`packages/billing/src/subscription-lifecycle.ts` (teruji tuntas). Status
`suspended`/`cancelled` membuat buku besar hanya-baca di lapisan guard: setiap
izin tulis ditolak, baca dan ekspor tetap jalan, dan tidak ada data yang dihapus
otomatis pada keadaan mana pun. Guard membaca status dari salinan di
`tenants` (control) lewat cache per-perusahaan
(`packages/platform/src/tenant-state.ts`), tidak pernah dari `sai_platform` di
jalur permintaan.

**Scheduler.** `bun run scheduler:subscriptions` menjalankan satu putaran: trial
habis (+ tagihan pertama), dunning, suspensi setelah tenggang, pengingat
H-7/H-3/H-1, sinkronisasi `usage_counters`, deteksi basis data yatim (lapor
saja), dan rekonsiliasi. Ia idempoten (nomor tagihan deterministik +
`reminder_logs` unik), jadi dua kali jalan tidak menagih atau mengirim dua kali.
Di produksi ia dijalankan tiap jam oleh peran `scheduler` di layanan compose `svc-worker`, dan
hanya menagih tenant dengan `billing_mode` otomatis (lihat
`docs/KOMERSIALISASI.md`).

Paket bawaan: `bun run db:seed:plans`. Ganti paket sebuah tenant (operator,
sampai gateway #141): `bun run change-plan -- --tenant <slug> --plan <key>`.
Kuota disalin ke `tenants` (pola snapshot), dan platform ditulis lebih dulu.

**Penagihan Indonesia (issue #141).** Gate pembayaran ada di
`packages/billing/src/payment-gateway.ts`: Midtrans (VA + QRIS) di balik
abstraksi kecil, `manual` sebagai bawaan, dan transport `mock` di luar produksi
(tanpa jaringan, VA deterministik). Kredensial nyata hanya lewat env
(`PAYMENT_GATEWAY`, `MIDTRANS_SERVER_KEY`, lihat `.env.docker.example`) dan
bawaannya tidak terpasang.

Webhook `/api/billing/webhook` memverifikasi tanda tangan SHA-512 (503
fail-closed tanpa kunci di produksi), idempoten pada UNIQUE
`payments.gateway_ref`, dan menulis platform dulu lalu control. Gagal bayar
menjadi `past_due`, tidak pernah langsung `suspended`.

PPN tagihan platform dihitung lewat `packages/core/src/tax.ts`; sakelar
`PLATFORM_PPN_DISABLED` adalah mekanisme untuk keputusan penasihat pajak.
e-Faktur: `bun run efaktur:platform` memakai mesin `packages/core/src/efaktur.ts`,
dengan NPWP pembeli dari `tenant_billing_profiles` (diisi customer di
/platform, dulu /tenant, issue #172). Data kartu tidak disimpan; yang disimpan
hanya referensi gate, nomor VA, dan payload QR.
