# Design System Master File — SAI Accounting

> **LOGIC:** Saat membangun halaman tertentu, cek dulu `design-system/sai-accounting/pages/[page-name].md`.
> Jika ada, aturannya **meng-override** file Master ini. Jika tidak, ikuti aturan di bawah.

> **Catatan kurasi:** Base dihasilkan oleh skill `ui-ux-pro-max` (kategori *Financial Dashboard*), lalu **dikurasikan manual** agar sesuai konteks: aplikasi **akuntansi internal untuk pengguna awam**, bukan landing page. Pilihan flashy (dark-default, exaggerated minimalism, pola landing/CTA) sengaja **ditolak**. Untuk deep-dive per-dimensi, jalankan:
> `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs`

**Project:** SAI Accounting — ERP/pembukuan internal (trading/ekspor komoditas)
**Prinsip:** *Simple surface, standard engine* — tampilan tenang & mudah untuk staff amatir; integritas akuntansi tetap baku.
**Stack:** Next.js 16 (App Router) · Tailwind CSS v4 · **shadcn/ui + CVA** di `src/components/ui` (Radix di baliknya untuk overlay) · form `react-hook-form` + `zod` · tabel `@tanstack/react-table` · ikon `lucide-react` · chart `recharts`. **Warna hanya dari token semantik** (`bg-primary`, `text-muted-foreground`, …) — kelas palet mentah (`bg-blue-600`) ditolak lint (issue #54).
**Dials:** Variance 3/10 (minimal, profesional) · Motion 2/10 (halus) · Density 6/10 (nyaman untuk data, tidak sesak).

---

## Prinsip Inti (khusus app akuntansi ramah-amatir)
1. **Light-first**, tenang, kontras tinggi. Sidebar gelap sebagai aksen (sesuai app saat ini). Dark mode penuh = fase lanjutan, bukan default.
2. **Semantik warna uang** — hijau = uang masuk/lunas/positif; merah = uang keluar/jatuh tempo/negatif; biru = brand/aksi netral; amber = menunggu/peringatan. **Jangan pernah mengandalkan warna saja** — selalu sertakan tanda (+/−), label, atau ikon.
3. **Angka rapi & jujur** — gunakan `font-variant-numeric: tabular-nums`, **rata kanan** di tabel, format `id-ID` (mis. `Rp 1.234.567`), nilai negatif merah dengan `(...)` atau tanda minus. Tampilkan **mata uang** eksplisit (IDR/USD/CNY).
4. **Ramah amatir** — label bahasa tugas (lihat issue #1), target sentuh ≥ 40px, teks dasar 16px, hindari jargon di permukaan (tooltip untuk istilah akuntansi).
5. **Reuse, jangan fork** — pakai & perluas komponen di `src/components/ui` (button, card, input, badge, dll). Jangan bikin varian baru tanpa alasan.

---

## Color Palette (light-first, token → `globals.css`)

Nama variabel mengikuti konvensi shadcn (didefinisikan di `src/app/globals.css`; utility Tailwind: `bg-primary`, `text-success`, `border-border`, dst.).

| Role | Hex | CSS Variable | Catatan |
|------|-----|--------------|---------|
| Primary (brand/aksi) | `#1E40AF` | `--primary` | Trust blue |
| On Primary | `#FFFFFF` | `--primary-foreground` | |
| Background | `#F8FAFC` | `--background` | Abu sangat terang |
| Surface / Card | `#FFFFFF` | `--card` | |
| Foreground (teks) | `#0F172A` | `--foreground` | Kontras ≥ 4.5:1 |
| Muted (teks sekunder) | `#64748B` | `--muted-foreground` | |
| Border | `#E2E8F0` | `--border` | |
| **Positif / Uang Masuk / Lunas** | `#16A34A` | `--success` | Hijau |
| **Negatif / Uang Keluar / Jatuh Tempo** | `#DC2626` | `--destructive` | Merah (utility `bg-destructive`/`text-destructive`) |
| **Menunggu / Peringatan** | `#D97706` | `--warning` | Amber |
| Sidebar (gelap, aksen) | `#0F172A` | `--sidebar` | Sesuai app |
| Ring (fokus) | `#1E40AF` | `--ring` | Fokus a11y wajib terlihat |

### Pasangan status "soft / strong" (badge & penanda di atas permukaan terang)

Warna penuh di atas cocok untuk isian pekat, ikon, dan garis — **bukan** untuk teks kecil di atas latar sangat terang. Menaruh `--success` di atas `success/10` hanya menghasilkan kontras **2,96:1** (warning 2,86:1, destructive 4,13:1), jauh di bawah ambang 4.5:1 di bawah. Karena itu badge status memakai pasangan khusus:

| Peran | Latar | Teks | Kontras |
|-------|-------|------|---------|
| Lunas / positif | `--success-soft` `#DCFCE7` | `--success-strong` `#166534` | 6,49:1 |
| Menunggu / sebagian | `--warning-soft` `#FEF3C7` | `--warning-strong` `#92400E` | 6,37:1 |
| Jatuh tempo / negatif | `--destructive-soft` `#FEE2E2` | `--destructive-strong` `#991B1B` | 6,80:1 |
| Netral | `--muted` `#F1F5F9` | `--foreground` `#0F172A` | 16,30:1 |

Utility: `bg-success-soft text-success-strong`, dst. Badge tetap **wajib berteks** — pasangan ini mengatur warna, bukan menggantikan kata.

*Dark mode (fase lanjut):* naikkan surface ke `#0F172A`/`#1E293B`, jaga rasio kontras & semantik warna tetap sama. Pasangan soft/strong versi gelap sudah disiapkan di blok `.dark` (kontras 8,5–10,6:1).

---

## Typography
- **UI / Heading & Body:** **Inter** (bersih, mudah dibaca, gratis; pakai `next/font`). Bukan monospace untuk heading.
- **Angka/nominal:** aktifkan `tabular-nums` (Inter mendukung) agar digit sejajar di tabel & laporan.
- Skala dasar **16px**; hierarki jelas (h1 ~28–32px, h2 ~22px, body 16px, caption 14px). Line-height 1.5.

---

## Spacing (Density 6/10 — nyaman)
| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Celah rapat |
| `--space-sm` | 8px | Gap ikon, inline |
| `--space-md` | 16px | Padding standar |
| `--space-lg` | 24px | Padding section |
| `--space-xl` | 32px | Gap besar |
| `--space-2xl` | 48px | Margin antar-section |

## Shadow
| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Lift halus |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Card, tombol |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modal, dropdown |

Radius: `8px` (kontrol), `12px` (card), `16px` (modal).

---

## Kepala Halaman & Breadcrumb (wajib)

Semua halaman dashboard memakai **`PageHeader`** (`src/components/ui/page-header.tsx`) — jangan menulis `<h1>` atau memanggil `<Breadcrumb>` sendiri (dijaga `tests/page-header.test.ts`).

- **Halaman tingkat-1** (item menu samping): tanpa `breadcrumbs`; `title` = label menunya persis (boleh membawa jumlah, mis. "Pelanggan (12)"); tombol utama lewat `actions`.
- **Halaman di bawahnya** (baru / ubah / rincian): `breadcrumbs` dimulai dari **label menu induk** — kata yang sama dengan menu samping (mis. "Tagihan Penjualan", bukan "Invoices") — dan item terakhir (tanpa `href`) = halaman ini.
- Badge status di samping judul lewat `badge`; kalimat penjelas lewat `description`.

## Pola Komponen (khusus domain)
- **Kartu KPI dashboard**: judul bahasa awam + angka besar tabular + delta berwarna (hijau/merah) dengan tanda +/−; sub-teks periode.
- **Tabel transaksi**: kolom nominal rata-kanan + tabular-nums; kolom status pakai **badge** (Lunas=hijau, Sebagian=amber, Belum/Jatuh Tempo=merah) — badge selalu berteks, bukan warna saja.
- **Form**: label terlihat (bukan placeholder), validasi inline dekat field, helper text, progressive disclosure ("Detail lengkap"). Tombol primer = aksi simpan; destruktif = merah + konfirmasi. **Implementasi:** `react-hook-form` + `zodResolver` dengan pola `Form` shadcn (lihat "Konvensi Form" di bawah) — bukan `useState` manual.
- **Empty state**: 1 kalimat + tombol aksi ("Belum ada faktur. Buat tagihan pertama →").
- **Uang/mata uang**: selalu tampilkan kode mata uang; konversi/kurs ditampilkan bila valas (konteks ekspor CNY/USD).

---

## Konvensi Form (issue #53)

Form ditulis dengan **`react-hook-form` + `zodResolver`** memakai pola **`Form`** shadcn (`src/components/ui/form.tsx`). Contoh acuan: `src/app/(dashboard)/customers/new/page.tsx` (master sederhana) dan `src/components/shared/payment-form.tsx` (transaksi valas).

1. **Satu skema zod, dua sisi.** Skema yang divalidasi form **wajib** skema yang sama dipakai route handler — **diimpor, bukan disalin**. Bila server menambah field (mis. `invoiceId` dari URL), pisahkan field bersama sebagai objek yang dipakai ulang (contoh: `paymentFormFields` di `lib/validations/payment.ts`, dipakai `paymentFormSchema` client dan `invoicePaymentSchema`/`contractPaymentSchema` server). Client & server tidak boleh bisa menyimpang diam-diam.
2. **Pesan error bahasa Indonesia**, ramah awam — kini ditampilkan langsung ke pengguna, bukan lagi hanya untuk server.
3. **Struktur field:** `FormField` → `FormItem` → `FormLabel` + `FormControl` + `FormDescription?` + `FormMessage`. Pautan label–input–deskripsi–error (`aria-invalid`/`aria-describedby`/`role="alert"`) terpasang otomatis. Jangan pasang `aria-*` manual.
4. **Isian di dalam `FormControl` harus telanjang** — `TextInput`/`NativeSelect`/`MoneyInput`, bukan `Input`/`Select` komposit (yang membawa label/error sendiri). `FormControl` (Radix `Slot`) meneruskan atribut ke anak tunggal, jadi anaknya harus satu elemen kontrol.
5. **Nominal pakai `MoneyInput`** — tampil `1.234.567`, payload menerima angka bersih (`1234567`). Desimal 0 untuk IDR, 2 untuk valas.
6. **Progressive disclosure di tempat yang tepat:** field yang bersyarat (mis. kurs untuk valas) hanya dirender saat relevan, dan skema hanya menuntutnya di kondisi itu (`superRefine`).
7. **Server tetap penjaga terakhir.** Kegagalan validasi server dipetakan ke `form.setError` (field bila ada `fieldErrors`, atau `root`).

---

## Motion (Subtle)
- Transisi state 150–250ms `ease`. Hover halus (tanpa menggeser layout). Hormati `prefers-reduced-motion`.
- Hindari animasi dekoratif; animasi hanya untuk memberi makna (loading, perpindahan, feedback).

---

## Anti-Patterns (JANGAN)
- ❌ Emoji sebagai ikon → pakai `lucide-react`.
- ❌ Warna sebagai satu-satunya penanda status/nominal → selalu ada tanda/teks/ikon.
- ❌ Angka rata-kiri / tanpa tabular-nums di tabel keuangan.
- ❌ Placeholder sebagai pengganti label.
- ❌ Teks < 14px untuk data penting; kontras < 4.5:1.
- ❌ Fokus keyboard tak terlihat; hover yang menggeser layout.
- ❌ Dark mode dipaksakan sebagai default; gaya "landing/marketing" (hero raksasa, CTA "Start trial") di app internal.
- ❌ Jargon akuntansi mentah di permukaan tanpa tooltip/penjelasan.

---

## Pre-Delivery Checklist (UI apa pun)
- [ ] Ikon SVG konsisten (lucide-react), tanpa emoji.
- [ ] `cursor-pointer` di semua elemen klik; hover transisi 150–250ms.
- [ ] Kontras teks ≥ 4.5:1; fokus keyboard terlihat; `prefers-reduced-motion` dihormati.
- [ ] Nominal: tabular-nums, rata kanan, format id-ID, mata uang eksplisit, negatif jelas (merah/kurung).
- [ ] Status pakai badge berteks (bukan warna saja).
- [ ] Form: label terlihat, validasi inline, helper text, progressive disclosure.
- [ ] Responsive: 375 / 768 / 1024 / 1440px; tidak ada horizontal scroll di mobile.
- [ ] Judul & breadcrumb lewat `PageHeader` (bukan `<h1>`/`<Breadcrumb>` manual); label breadcrumb = label menu samping.
- [ ] Reuse komponen `src/components/ui` (shadcn/CVA); token warna/spacing dari variabel (bukan hex mentah).
- [ ] **Tanpa kelas palet mentah** (`bg-blue-600`, `text-gray-500`, …) — `npm run lint` hijau (penjaga token menolaknya).
- [ ] Empty state bermakna + aksi.
