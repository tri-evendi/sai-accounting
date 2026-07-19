# Standar Database & Penamaan — SAI Accounting

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

---

## 7. Migrations (workflow proyek ini)
- **Tidak** memakai `prisma migrate dev`. Migration **ditulis tangan** sebagai folder berurutan: `prisma/migrations/NNNN_<nama>/migration.sql` (mis. `0002_add_accounts`).
- Diterapkan via **`prisma migrate deploy`** (lihat `package.json`: `db:migrate`).
- Gaya DDL (ikuti `0001_init`): `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, `DATETIME(3)`, FK ditambahkan via `ALTER TABLE ... ADD CONSTRAINT ... ON DELETE ... ON UPDATE ...`.
- Setelah menulis model + SQL: jalankan `npm run db:generate` (Prisma client). Update `prisma/seed.ts` bila perlu data awal.

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
- [ ] `npm run db:generate` dijalankan.

---

## 10. Deviasi skema saat ini (tech debt) & kebijakan retrofit

Skema existing sebagian besar patuh, tapi ada celah berikut. **Kebijakan: perbaiki saat disentuh (incremental), BUKAN big-bang** — hindari migrasi masif berisiko pada data produksi. Tabel **baru** wajib 100% patuh sejak awal.

| Deviasi | Tabel terdampak | Rencana |
|---|---|---|
| Tak ada `created_at`/`updated_at` | `contract_items`, `invoice_items`, `*_payments`, `items`, `stock`, `currency_conversions`; `cash_accounts` (hanya created_at) | Tambah saat tabel disentuh fitur terkait |
| Valas tanpa `rate` + `base_amount` (IDR) | `contract_payments`, `invoice_payments`, `supplier_transactions` | **Tambah saat membangun engine jurnal/FX (issue #9/#23)** — penting untuk buku besar |
| Presisi tak seragam (`Decimal(10,2)`) | `contract_items`, `invoice_items`, `stock` | Kuantitas → `Decimal(15,3)` saat disentuh |
| `rate` `Decimal(15,4)` | `currency_conversions` | → `Decimal(18,6)` saat disentuh |
| Tak ada `is_active` | `suppliers`, `customers`, `items` | Tambah saat fitur nonaktif master |
| `status` sebagai `Int` | `users` | Biarkan (legacy), atau migrasi ke enum-like string bila menyentuh auth |

> Prinsip: **jangan hard-delete master yang direferensikan**; gunakan `is_active` begitu kolomnya tersedia.
