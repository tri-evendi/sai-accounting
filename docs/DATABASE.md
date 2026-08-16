# Standar Database & Penamaan — SAI Accounting

> **Multi-perusahaan (issue #104).** Skema di `prisma/schema.prisma` adalah skema
> **satu perusahaan**, dan sejak #104 ia digandakan: satu basis data per PT.
> Pengguna/perusahaan/keanggotaan hidup di skema terpisah
> (`prisma/control/schema.prisma`). Aturan lintas-basis-data ada di
> `docs/MULTI-COMPANY.md` — terutama: **tidak ada FK ke `users` dari basis data
> perusahaan**, dan migration diterapkan dengan `bun run db:migrate:all`.
>
> **Basis data platform (issue #137).** Sejak #137 ada skema KETIGA:
> `prisma/platform/schema.prisma` → basis data `sai_platform` (langganan &
> penagihan SaaS — data bisnis KAMI, bukan buku pelanggan). Ia **opsional**
> untuk pemasangan multi-PT satu grup usaha. Aturan operasionalnya di §11.

Aturan **wajib** untuk setiap perubahan skema (model Prisma, migration, query). Tujuan: konsisten, aman untuk data keuangan, dan mudah dipelihara. Standar ini mengodifikasikan konvensi yang **sudah** dipakai di `prisma/schema.prisma` + menutup celah.

> Ringkas: **Bahasa Inggris · `snake_case` di DB · tabel jamak · uang `Decimal` (jangan Float) · setiap tabel punya `id` + `created_at` + `updated_at`.**

---

## 1. Prinsip
1. **Akurasi keuangan di atas segalanya** — nilai uang & kuantitas **tidak boleh** floating point.
2. **Konsisten > kreatif** — ikuti pola yang ada; jangan buat gaya penamaan baru.
3. **Jangan hard-delete data yang direferensikan** — nonaktifkan (`is_active = false`) untuk master data.
4. **DB adalah sumber kebenaran tipe** — validasi Zod harus mencerminkan constraint DB.

---

## 2. Penamaan

### Tabel
- **`snake_case`, jamak, Bahasa Inggris**: `accounts`, `contracts`, `cash_accounts`, `supplier_transactions`.
- Tanpa prefix (legacy `tb_` **dihapus**).
- Tabel baris-detail: `<parent-singular>_items` atau `<domain>_lines` (mis. `invoice_items`, `journal_lines`).
- Di Prisma: model **PascalCase singular** + `@@map("plural_snake_case")`.
  ```prisma
  model Account { /* ... */ @@map("accounts") }
  ```

### Kolom
- **`snake_case` di DB**, **`camelCase` di Prisma** via `@map`:
  ```prisma
  supplierId Int @map("supplier_id")
  createdAt  DateTime @default(now()) @map("created_at")
  ```
- **Primary key**: selalu `id` — `Int @id @default(autoincrement())`.
- **Foreign key**: `<referenced_singular>_id` → `supplier_id`, `account_id`, `parent_id`.
- **Boolean**: awalan `is_`/`has_` → `is_active`, `is_posted`.
- **Tanggal/waktu**: `*_at` (timestamp) atau `*_date` (tanggal transaksi) → `created_at`, `posted_at`, `due_date`.
- **Uang**: nama jelas + pendamping mata uang bila valas (lihat §4) → `amount`, `debit`, `credit`, `total`, `base_amount`.
- **Kode/nomor**: `code` (master, mis. COA), `number`/`no` (dokumen, mis. `invoice_no`). Dokumen & kode = **`@unique`**.

### Enum-like (status, tipe)
- Ikuti pola existing: **`String @db.VarChar(n)`** dengan **daftar nilai terdokumentasi** + divalidasi `z.enum([...])` di layer Zod. (Belum pakai Prisma `enum` di proyek ini — jangan campur tanpa alasan.)
- Nilai enum: **lowercase `snake_case`** (`pending`, `partial`, `paid`, `kas_besar`).

#### Setiap pintu masuk data wajib memvalidasi — bukan cuma formulir (issue #111)

Kolomnya `VARCHAR`, jadi basis data **tidak menolak apa pun**. Zod menjaga
formulir; yang tidak dijaga adalah pintu kedua: **impor/ETL**. Impor legacy
menyalin `'IN'`/`'OUT'`/`'PROCESS'` dan `'Kas Kecil'`/`'Rp'`/`'USD'`/`'CNY'` apa
adanya, berhasil tanpa satu pun galat, dan menghasilkan saldo stok **nol** untuk
33 barang serta 18.689 baris kas yang terposting ke akun kas bawaan.

Kenapa tak pernah berbunyi: collation `utf8mb4_unicode_ci` membuat
`WHERE type = 'in'` **cocok** dengan `'IN'`, sedangkan `s.type === "in"` di
JavaScript **tidak** — dan saldo dihitung di JavaScript. Setiap pemeriksaan
lewat SQL akan bilang "bersih".

Aturannya:
- Daftar nilai hidup di **satu tempat** (`src/lib/constants.ts`), dipakai
  `z.enum(...)` maupun penjaga impor — jangan diketik ulang.
- Skrip impor memetakan lewat `src/lib/legacy-values.ts` dan **melempar** untuk
  nilai tak dikenal. Menebak (mis. jatuh ke `'in'`) menghasilkan angka salah
  tanpa jejak.
- Memeriksa data yang sudah ada: `bun run check:legacy-values` (BINARY, jadi
  perbedaan huruf besar/kecil terlihat) — jalankan pada gladi resik rilis.

---

## 3. Kolom wajib di SETIAP tabel
| Kolom | Prisma | Catatan |
|---|---|---|
| `id` | `Int @id @default(autoincrement())` | PK |
| `created_at` | `DateTime @default(now()) @map("created_at")` | |
| `updated_at` | `DateTime @updatedAt @map("updated_at")` | |
| `is_active` *(master data)* | `Boolean @default(true) @map("is_active")` | untuk nonaktif, bukan hapus |

---

## 4. Tipe Data (KETAT)
| Jenis | Tipe Prisma | Alasan |
|---|---|---|
| **Uang / nominal** | `Decimal @db.Decimal(15, 2)` | **JANGAN Float/Int** — floating point salah untuk uang |
| **Kuantitas** (kg, bag) | `Decimal @db.Decimal(15, 3)` | pecahan (kg) akurat |
| **Kurs / rate** | `Decimal @db.Decimal(18, 6)` | presisi tinggi konversi |
| **Persen / diskon** | `Decimal @db.Decimal(7, 4)` | |
| Teks pendek | `String @db.VarChar(n)` | selalu batasi panjang |
| Teks panjang | `String @db.Text` | alamat, catatan |
| Tanggal+waktu | `DateTime` (`DATETIME(3)`) | |
| Boolean | `Boolean` (`TINYINT(1)`) | |
| Mata uang | `String @db.VarChar(5)` | kode ISO (`IDR`,`USD`,`CNY`) |

**Aturan uang multi-mata uang (WAJIB untuk akuntansi):** setiap nilai valas simpan **tiga** hal:
1. `amount` (nilai mata uang asli) + `currency`,
2. `rate` (kurs ke IDR pada tanggal transaksi),
3. `base_amount` (nilai dalam **IDR base**) — dasar buku besar & laporan.

---

## 5. Relasi & Index
- Deklarasikan relasi Prisma + `onDelete`:
  - Baris-detail milik header → `onDelete: Cascade`.
  - Referensi ke master (account/partner) → **`Restrict`** (jangan hapus master yang dipakai).
- **Index** kolom yang sering difilter/join: FK, `date`, `status`, `code`, `number`.
  ```prisma
  @@index([accountId])
  @@index([date])
  @@unique([code])
  ```

---

## 6. Aturan Akuntansi
- **Chart of Accounts**: `code` unik (`@unique`), `parent_id` (hierarki self-relation), `type` (enum-like), `normal_balance` (`debit`/`credit`).
- **Dokumen**: `number` unik + `status` (enum-like: `draft`/`posted`/`paid`/...). Pola **header + lines** (`*_items`/`*_lines`), lines `onDelete: Cascade`.
- **Jurnal**: `journals` (header) + `journal_lines` (`account_id`, `debit`, `credit`, `currency`, `base_amount`). Invarian: **Σ debit = Σ credit** (validasi di service layer, jangan hanya UI).
- **Jangan hapus** transaksi yang sudah diposting/di-periode-tutup — buat jurnal balik.
- **Tarif PPN (issue #368)**: `tax_rates` (`rate` `Decimal(5,2)`, `effective_from`
  `@db.Date` **unik**) + `company_settings.is_pkp`. Tarif adalah **data
  ber-efektif-tanggal**, bukan konstanta kode. Dua aturan yang tidak boleh
  dilanggar:
  1. **Baris tarif tidak pernah disunting tanggalnya.** Mengubah tarif = MENAMBAH
     baris ber-`effective_from` baru. Menyunting `effective_from` sebuah baris
     lama akan mengubah cara setiap dokumen di antara dua tanggal dibaca ulang —
     yaitu menulis ulang masa lalu, dari layar pengaturan.
  2. **Dokumen tetap membawa tarifnya sendiri** (`invoices.tax_rate`), dan mesin
     posting membaca kolom itu — bukan tabel ini. Karena itu menambah tarif baru
     TIDAK mengubah satu pun angka yang sudah terbit di laporan; yang berubah
     hanya bawaan formulir berikutnya.

  `src/lib/tax.ts` **tetap** memuat `DEFAULT_TAX_RATE` untuk dua hal yang memang
  bukan milik pelanggan: benih tarif pertama sebuah perusahaan baru, dan PPN
  tingkat **platform** (tagihan langganan kita sendiri — lihat §11).
  `tests/tax-rates.test.ts` menolak formulir dokumen yang mengimpornya kembali.

---

## 7. Migrations (workflow proyek ini)
- **Tidak** memakai `prisma migrate dev`. Migration **ditulis tangan** sebagai folder berurutan: `prisma/migrations/NNNN_<nama>/migration.sql` (mis. `0002_add_accounts`).
- Diterapkan via **`prisma migrate deploy`** (lihat `package.json`: `db:migrate`).
- Gaya DDL (ikuti `0001_init`): `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, `DATETIME(3)`, FK ditambahkan via `ALTER TABLE ... ADD CONSTRAINT ... ON DELETE ... ON UPDATE ...`.
- Setelah menulis model + SQL: jalankan `bun run db:generate` (Prisma client). Update `prisma/seed.ts` bila perlu data awal.

---

## 8. Prisma (konvensi teknis)
- Generator: `provider = "prisma-client"`, output `src/generated/prisma`. Datasource `mysql`, **tanpa `url`** (koneksi via `@prisma/adapter-mariadb`).
- Import client **selalu**: `import { prisma } from "@/lib/prisma"` (singleton). Class dari `@/generated/prisma/client`.
- Field opsional pakai `?`; default via `@default(...)`.

---

## 9. Checklist tabel baru (WAJIB dilewati)
- [ ] Nama tabel `snake_case` jamak + `@@map`; model PascalCase singular.
- [ ] `id`, `created_at`, `updated_at` ada; master data punya `is_active`.
- [ ] Kolom `snake_case` via `@map`; FK `<entity>_id`.
- [ ] Uang `Decimal(15,2)`, kuantitas `Decimal(15,3)`, kurs `Decimal(18,6)` — **tidak ada Float**.
- [ ] Valas menyimpan `currency` + `rate` + `base_amount`.
- [ ] Enum-like = `String @db.VarChar` + `z.enum` di Zod; nilai `snake_case` lowercase.
- [ ] `@unique` untuk code/number; `@@index` untuk FK/date/status.
- [ ] `onDelete`: Cascade (lines), Restrict (master).
- [ ] Migration `NNNN_<nama>/migration.sql` ditulis (gaya utf8mb4/DATETIME(3)/ALTER FK).
- [ ] Skema Zod mencerminkan constraint DB (panjang, required, enum).
- [ ] `bun run db:generate` dijalankan.

---

## 10. Deviasi skema (tech debt) — LUNAS per migration 0037–0041

Seluruh deviasi yang pernah tercatat di sini sudah ditutup pada issue #104, tepat **sebelum** skema digandakan menjadi satu basis data per perusahaan. Alasannya praktis: setelah penggandaan, satu perbaikan skema harus diputar ulang di N basis data milik N perusahaan yang berbeda jam sibuknya — jadi kebijakan lama ("perbaiki saat disentuh, jangan big-bang") justru berbalik menjadi mahal. Tabel **baru** tetap wajib 100% patuh sejak awal.

| Deviasi (dulu) | Tabel terdampak | Selesai di |
|---|---|---|
| Tak ada `created_at`/`updated_at` | `contract_items`, `contract_payments`, `invoice_items`, `invoice_payments`, `items`, `stock_movements`, `supplier_transactions`, `currency_conversions`, `journal_lines`, `documents`; `cash_movements` (hanya `created_at`) | **0037** — di-backfill dari tanggal transaksi/header, bukan `NOW()` |
| Tak ada `is_active` | `suppliers`, `customers`, `items` | **0038** — plus DELETE yang menonaktifkan alih-alih menghapus |
| Index kurang di kolom `date`/`status` | 7 tabel | **0039** |
| Nama tabel menyesatkan (isinya gerakan, namanya akun) | `cash_accounts` → `cash_movements` | **0040** — termasuk `bank_statement_lines.cash_account_id` → `cash_movement_id` dan nilai `journals.source_type` |
| Boolean yang menyamar jadi `Int` | `users.status` → `users.must_change_password` | **0041** |
| Valas tanpa `rate` + `base_amount` (IDR) | `contract_payments`, `invoice_payments`, `supplier_transactions` | issue #9/#23 |
| Presisi tak seragam (`Decimal(10,2)`), `rate` `Decimal(15,4)` | `contract_items`, `invoice_items`, `stock_movements`, `currency_conversions` | 0026 |

**Yang sengaja DIBIARKAN, dan alasannya:**
- **Nama constraint FK lama** (`cash_accounts_*_fkey`, `stock_item_id_fkey`) tetap dipakai setelah tabelnya berganti nama. MariaDB tidak mengganti nama constraint saat `RENAME TABLE`, Prisma mencocokkan FK berdasarkan **kolom** bukan nama, dan `DROP` + `ADD` pada DDL MySQL yang non-transaksional sempat meninggalkan tabel tanpa FK di antara dua perintah. Nama yang tertinggal lebih murah daripada jendela tanpa integritas referensial.
- **FK tidak dideklarasikan `@@index`** di Prisma: InnoDB sudah membuat index untuk setiap FOREIGN KEY. Mendeklarasikannya lagi hanya melahirkan index kembar yang memperlambat INSERT tanpa mempercepat satu query pun.
- **Entri audit lama** tetap menyebut `cash_account`/`stock`. Log adalah catatan tentang apa yang benar SAAT ITU; menulis ulang isinya justru merusak nilainya sebagai jejak.

> Prinsip: **jangan hard-delete master yang direferensikan** — nonaktifkan (`is_active = false`). Route DELETE master (`consignees`, `suppliers`, `customers`) menghapus HANYA bila baris itu belum pernah dipakai; selebihnya menonaktifkan dan mengembalikan `{ deactivated: true }`. `items` tidak punya DELETE sama sekali: menghapusnya akan menghapus gerakan stoknya (FK CASCADE), yaitu dasar HPP yang sudah masuk laporan.

---

## 11. Basis data platform `sai_platform` (issue #137) — operasional

Lapisan ketiga di samping kendali dan perusahaan (rancangan & alasannya:
`docs/MULTI-TENANT.md` §4A). Isinya `plans`, `subscriptions`, `payments`,
`platform_invoices`, `usage_counters`, `scheduler_runs`, `mail_settings` —
**data bisnis penyedia SaaS**, nol angka akuntansi pelanggan. Skema:
`prisma/platform/schema.prisma` → klien
`src/generated/platform`; konfigurasi `prisma.platform.config.ts`; klien runtime
`src/lib/platform-db.ts`.

**Menyediakannya (opsional — pemasangan multi-PT satu grup usaha tidak butuh):**

```sql
CREATE DATABASE sai_platform DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
CREATE USER 'sai_billing'@'%' IDENTIFIED BY '<sandi-tersendiri>';
GRANT ALL PRIVILEGES ON `sai_platform`.* TO 'sai_billing'@'%';
FLUSH PRIVILEGES;
```

lalu set `PLATFORM_DATABASE_URL` di `.env` (lihat `.env.docker.example`) dan
jalankan `bun run db:migrate:platform` (atau `db:migrate:all`, yang sudah
menyertakannya di antara kendali dan perusahaan).

**Aturan yang tidak boleh dilanggar:**

- **Pengguna basis data aplikasi tidak menyentuh `sai_platform` di jalur
  permintaan biasa.** Pola GRANT yang dianjurkan sekarang (`sai\_t%`,
  docs/MULTI-COMPANY.md §3) memang TIDAK mencakup `sai_platform` — tetapi
  pemasangan lama memakai `sai\_%`, yang mencakupnya. Yang menentukan tetap sisi
  KREDENSIAL, bukan pola nama:
  `PLATFORM_DATABASE_URL` memakai pengguna tersendiri (`sai_billing`) yang hanya
  berhak atas `sai_platform` — bukan pengguna `sai` milik buku besar.
- **Tidak ada FK lintas-basis-data.** Kolom `tenant_id` di setiap tabel platform
  adalah `Int` biasa tanpa FK — persis pola `periods.closed_by_id`.
- **Urutan tulis:** alur yang menulis platform DAN kendali menulis ke
  **platform dulu**, kendali belakangan; selisihnya ditemukan
  `bun run reconcile:platform` (lengkap sejak #140 — empat pemeriksaan,
  termasuk kecocokan status dan usage_counters).
- **Penagihan mati ≠ login mati.** `src/lib/platform-db.ts` malas (lazy) dan
  hanya boleh diimpor kode penagihan — jangan pernah dari penjaga, sesi, atau
  jalur lain yang berjalan pada setiap permintaan. `db:migrate:all` melewati
  platform dengan peringatan bila `PLATFORM_DATABASE_URL` tidak diset
  (`scripts/migrate-platform.ts`) — tapi GAGAL bila diset dan migrationnya
  gagal.
- **Cache data platform dikunci per `tenant_id`** — aturan cache #104 diperluas;
  pakai `TenantKeyedCache` (`src/lib/tenant-cache.ts`). Pengecualian yang
  dinyatakan: `mail_settings` (#169) adalah singleton milik PENYEDIA, bukan
  milik satu tenant, jadi cache-nya (`src/lib/mail-settings.ts`, TTL 60 detik)
  memang tunggal.
- **Rahasia di basis data: hanya `mail_settings.password_ciphertext` (#169).**
  Doktrin "kredensial hidup di environment" tetap berlaku untuk yang lain;
  satu pengecualian ini disegel AES-256-GCM dengan kunci yang TETAP di env
  (`SETTINGS_ENCRYPTION_KEY`, 64 karakter hex). Kunci hilang/salah bentuk →
  penyimpanan kata sandi DITOLAK, tidak pernah disimpan mentah. Pengaturan
  surel dibaca `mailer-core` dengan urutan **basis data → environment →
  `file`**: platform mati tidak boleh mematikan undangan & atur-ulang sandi.

**Siklus hidup langganan (issue #140).** Mesin keputusannya MURNI di
`src/lib/subscription-lifecycle.ts` (teruji tuntas); `suspended`/`cancelled`
membuat buku besar **HANYA-BACA di lapisan penjaga** — setiap izin tulis
ditolak, baca & ekspor tetap jalan, TIDAK ADA data yang dihapus otomatis pada
keadaan mana pun. Penjaga membaca status dari **salinan di `tenants`**
(kendali) lewat cache per-perusahaan (`src/lib/tenant-state.ts`) — tidak
pernah dari `sai_platform` di jalur permintaan.

**Penjadwal.** `bun run scheduler:subscriptions` — satu putaran: trial habis
(+ tagihan pertama), dunning, suspensi setelah tenggang, pengingat H-7/H-3/H-1,
sinkronisasi `usage_counters`, deteksi basis data yatim (lapor saja), dan
rekonsiliasi. **Idempoten** (nomor tagihan deterministik + `reminder_logs`
unik): dijalankan dua kali tidak menagih/mengirim dua kali. Jadwalkan lewat
cron host — pemasangan compose:

```cron
17 * * * *  \
  docker compose run --rm migrate bun run scheduler:subscriptions
```

Paket bawaan: `bun run db:seed:plans`; ganti paket sebuah tenant (operator,
sampai gateway #141): `bun run change-plan -- --tenant <slug> --plan <key>` —
kuota disalin ke `tenants` (pola snapshot), platform ditulis lebih dulu.

**Penagihan Indonesia (issue #141).** Gerbang pembayaran di
`src/lib/payment-gateway.ts` — Midtrans (VA + QRIS) di balik abstraksi kecil;
`manual` bawaan; transport `mock` di luar produksi (nol jaringan, VA
deterministik) — kredensial real HANYA lewat env (`PAYMENT_GATEWAY`,
`MIDTRANS_SERVER_KEY`, lihat `.env.docker.example`; bawaan TIDAK terpasang).
Webhook `/api/billing/webhook`: tanda tangan SHA-512 diverifikasi (503
fail-closed tanpa kunci di produksi), idempoten pada UNIQUE
`payments.gateway_ref`, menulis platform DULU lalu kendali; gagal bayar →
`past_due`, tidak pernah langsung `suspended`. PPN tagihan platform dihitung
lewat `src/lib/tax.ts` (sakelar `PLATFORM_PPN_DISABLED` = mekanisme untuk
keputusan penasihat pajak); e-Faktur: `bun run efaktur:platform` memakai mesin
`src/lib/efaktur.ts`, NPWP pembeli dari `tenant_billing_profiles` (diisi
pelanggan di /platform — dulu /tenant, issue #172). **TIDAK ADA data kartu yang disimpan** — hanya
referensi gerbang, nomor VA, dan payload QR.
