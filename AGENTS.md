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
   Skill terkait juga tersedia: `design-system` (token), `ui-styling` (shadcn/Tailwind).
3. **Patuhi prinsip app ini:** *simple surface, standard engine* — ramah pengguna awam, tapi proses akuntansi tetap baku. Light-first; semantik warna uang (hijau masuk / merah keluar) tak boleh warna-saja; angka `tabular-nums` rata-kanan format `id-ID`.
4. **Reuse** komponen `src/components/ui` (**shadcn/ui + CVA**, Radix untuk overlay) & ikon `lucide-react`. **Warna hanya dari token semantik** (`bg-primary`, `text-muted-foreground`, `bg-success-soft`, …), bukan kelas palet mentah (`bg-blue-600`) atau hex — penjaga ESLint menolaknya (issue #54). Form: `react-hook-form` + `zod` via pola `Form` (lihat "Konvensi Form" MASTER.md). Tabel: primitif `Table`/`DataTable`; nominal lewat `Money`/`MoneyInput`.
5. Sebelum menyerahkan UI, lewati **Pre-Delivery Checklist** di MASTER.md.

# Otorisasi / RBAC (WAJIB untuk halaman & API route baru)

Otorisasi berbasis **izin terpusat** — lihat `docs/RBAC.md`. Inti: matriks izin di `src/lib/authz.ts`; halaman memanggil `requirePagePermission("resource.action")`, API `requireApiPermission(...)`, tampilan `can(...)`. **Jangan** membandingkan string peran atau menulis daftar `["bos","core"]` di luar matriks — tes `authz-coverage` menolak halaman/route tanpa deklarasi izin.

# Database & Skema (WAJIB untuk perubahan data)

Setiap perubahan model Prisma / migration / tabel **wajib** mengikuti `docs/DATABASE.md`. Inti:
- **Inggris · `snake_case` di DB (via `@map`) · tabel jamak (`@@map`) · Prisma camelCase.**
- Setiap tabel: `id` (Int autoincrement) + `created_at` + `updated_at`; master data + `is_active` (nonaktif, **bukan** hard-delete yang direferensikan).
- **Uang = `Decimal(15,2)`, kuantitas `Decimal(15,3)`, kurs `Decimal(18,6)` — JANGAN Float/Int.**
- Valas simpan `currency` + `rate` + `base_amount` (IDR).
- Enum-like = `String @db.VarChar` + `z.enum` (nilai `snake_case`); `@unique` untuk code/number; `@@index` untuk FK/date/status.
- Migration **ditulis tangan** `prisma/migrations/NNNN_<nama>/migration.sql`, diterapkan `npm run db:migrate` (`migrate deploy`); jalankan `npm run db:generate` setelahnya.
- Lewati **Checklist tabel baru** di `docs/DATABASE.md` sebelum commit.
