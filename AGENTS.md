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
   Skill terkait juga tersedia: `design-system` (token). **`ui-styling` sudah TIDAK berlaku di repo ini** - isinya shadcn/Tailwind, dan keduanya dicabut di issue #203.
3. **Patuhi prinsip app ini:** *simple surface, standard engine* — ramah pengguna awam, tapi proses akuntansi tetap baku. Light-first; semantik warna uang (hijau masuk / merah keluar) tak boleh warna-saja; angka `tabular-nums` rata-kanan format `id-ID`.
4. **Reuse** komponen `src/components/ui` (**Ant Design v6**) & ikon `@ant-design/icons` (satu paket ikon saja; ukuran lewat `style={{ fontSize }}`, bukan prop `size`/`width`/`height` — `size={16}` LOLOS `tsc` lalu mendarat sebagai atribut DOM yang tak mengatur apa pun; lihat "Ikon" di MASTER.md). **TANPA Tailwind dan tanpa `className` sejak issue #203**: gaya ditulis SEBARIS (`style={{...}}`), warnanya `var(--ant-...)` atau `theme.useToken()`, dan nilai warna mentah (hex, `rgb()`, nama warna CSS) tidak ditulis di luar `src/lib/theme/antd-tokens.ts` — **dijaga ESLint `sai/warna-token-antd`** (#204). Sebuah kelas tidak akan gagal - tidak ada lembar gaya yang memaknainya, jadi ia hanya berhenti berlaku. Yang tak punya bentuk sebaris (`:hover`, `::after`, `@media`) hidup di satu `<style href precedence>` di komponennya, menyasar atribut `data-*` (pola `landing-scale.ts` / `ui/table.tsx`). Form: `react-hook-form` + `zod` via pola `Form` (lihat "Konvensi Form" MASTER.md). Tabel: `StaticTable` (bawaan - dirender server, tanpa JS) atau `DataTable` (AntD, client, **+80 KB gzip per rute** — hanya bila memang butuh sortir/filter seketika); nominal lewat `Money`/`MoneyInput`. Tombol yang menuju ke suatu tempat: `<Button href>` — `asChild` **sudah dicabut** di #250 (tidak aman dari server component), dan `tests/button-no-aschild.test.ts` menolaknya kembali.
5. Sebelum menyerahkan UI, lewati **Pre-Delivery Checklist** di MASTER.md. Gerbangnya **dua**: `bun run verify` (typecheck + lint + vitest; jangan `npm`, jangan `bun test`) **dan** `bun run build` yang harus `EXIT=0` — verify hijau TIDAK membuktikan aplikasinya bisa dibangun, dan itu sudah terjadi sekali. Aturan mana dijaga penjaga yang mana: §Penjaga di MASTER.md.

# Otorisasi / RBAC (WAJIB untuk halaman & API route baru)

Otorisasi berbasis **izin terpusat** — lihat `docs/RBAC.md`. Inti: matriks izin di `src/lib/authz.ts`; halaman memanggil `requirePagePermission("resource.action")`, API `requireApiPermission(...)`, tampilan `can(...)`. **Jangan** membandingkan string peran atau menulis daftar `["managing_director","finance_manager"]` di luar matriks — tes `authz-coverage` menolak halaman/route tanpa deklarasi izin. Sejak issue #73 matriks di kode adalah **BAWAAN**: matriks **EFEKTIF** = bawaan + override DB (`role_permission_overrides`) yang dikelola peran berakses penuh di halaman `/permissions`; penjaga memakai `canEffective` (`src/lib/authz-effective.ts`), jadi jangan tanam asumsi "peran X pasti tidak bisa Y" di luar penjaga.

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
- Migration **ditulis tangan** `prisma/migrations/NNNN_<nama>/migration.sql`, diterapkan `bun run db:migrate` (`migrate deploy`); jalankan `bun run db:generate` setelahnya.
- Lewati **Checklist tabel baru** di `docs/DATABASE.md` sebelum commit.
