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
- `bun run check-data-conformance` (juga layanan `job-conformance`) memeriksa
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
> **Mesin: PostgreSQL 17 sejak 15 Okt 2026.** Riwayat MariaDB (`prisma/migrations/` 0001–0065, `prisma/control/migrations/`, `prisma/platform/migrations/`) adalah arsip hanya-baca. Berkas baru di sana tidak akan diterapkan. Latar dan validasinya: [`arsitektur/07-RIWAYAT.md`](./arsitektur/07-RIWAYAT.md).

- Proyek ini tidak memakai `prisma migrate dev`. Migration ditulis tangan sebagai folder berurutan di `prisma/postgresql/<db>/NNNN_<nama>/migration.sql`, dengan `<db>` = `company` (buku tiap PT), `control`, atau `platform`. Contoh: `prisma/postgresql/control/0002_slug_permanen`.
- Diterapkan via `prisma migrate deploy`: `bun run db:migrate:all` (control → platform → setiap PT). Di produksi `migrate` menyambung langsung ke `pg`, tidak lewat PgBouncer, karena advisory lock Prisma terikat sesi.
- Gaya DDL mengikuti `prisma/postgresql/company/0001_baseline`: identifier berkutip ganda (`"created_at"`), `SERIAL` untuk `id`, `TIMESTAMP(3)`, `DECIMAL(15,2)`, FK ditambahkan via `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE ... ON UPDATE ...`. Prisma tidak membangkitkan trigger: tulis tangan, dan `tests/pg-trigger-parity.test.ts` menjaganya.
- Setelah menulis model dan SQL, jalankan `bun run db:generate` (Prisma client). Perbarui `prisma/seed.ts` bila perlu data awal.

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
Di produksi ia dijalankan tiap jam oleh layanan compose `job-scheduler`, dan
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
