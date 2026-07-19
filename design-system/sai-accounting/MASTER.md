# Design System Master File — SAI Accounting

> **LOGIC:** Saat membangun halaman tertentu, cek dulu `design-system/sai-accounting/pages/[page-name].md`.
> Jika ada, aturannya **meng-override** file Master ini. Jika tidak, ikuti aturan di bawah.

> **Catatan kurasi:** Base dihasilkan oleh skill `ui-ux-pro-max` (kategori *Financial Dashboard*), lalu **dikurasikan manual** agar sesuai konteks: aplikasi **akuntansi internal untuk pengguna awam**, bukan landing page. Pilihan flashy (dark-default, exaggerated minimalism, pola landing/CTA) sengaja **ditolak**. Untuk deep-dive per-dimensi, jalankan:
> `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs`

**Project:** SAI Accounting — ERP/pembukuan internal (trading/ekspor komoditas)
**Prinsip:** *Simple surface, standard engine* — tampilan tenang & mudah untuk staff amatir; integritas akuntansi tetap baku.
**Stack:** Next.js 16 (App Router) · Tailwind CSS v4 · komponen CVA di `src/components/ui` · ikon `lucide-react` · chart `recharts`.
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

| Role | Hex | CSS Variable | Catatan |
|------|-----|--------------|---------|
| Primary (brand/aksi) | `#1E40AF` | `--color-primary` | Trust blue |
| On Primary | `#FFFFFF` | `--color-on-primary` | |
| Background | `#F8FAFC` | `--color-background` | Abu sangat terang |
| Surface / Card | `#FFFFFF` | `--color-surface` | |
| Foreground (teks) | `#0F172A` | `--color-foreground` | Kontras ≥ 4.5:1 |
| Muted (teks sekunder) | `#64748B` | `--color-muted-foreground` | |
| Border | `#E2E8F0` | `--color-border` | |
| **Positif / Uang Masuk / Lunas** | `#16A34A` | `--color-success` | Hijau |
| **Negatif / Uang Keluar / Jatuh Tempo** | `#DC2626` | `--color-danger` | Merah |
| **Menunggu / Peringatan** | `#D97706` | `--color-warning` | Amber |
| Sidebar (gelap, aksen) | `#0F172A` | `--color-sidebar` | Sesuai app |
| Ring (fokus) | `#1E40AF` | `--color-ring` | Fokus a11y wajib terlihat |

*Dark mode (fase lanjut):* naikkan surface ke `#0F172A`/`#1E293B`, jaga rasio kontras & semantik warna tetap sama.

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

## Pola Komponen (khusus domain)
- **Kartu KPI dashboard**: judul bahasa awam + angka besar tabular + delta berwarna (hijau/merah) dengan tanda +/−; sub-teks periode.
- **Tabel transaksi**: kolom nominal rata-kanan + tabular-nums; kolom status pakai **badge** (Lunas=hijau, Sebagian=amber, Belum/Jatuh Tempo=merah) — badge selalu berteks, bukan warna saja.
- **Form**: label terlihat (bukan placeholder), validasi inline dekat field, helper text, progressive disclosure ("Detail lengkap"). Tombol primer = aksi simpan; destruktif = merah + konfirmasi.
- **Empty state**: 1 kalimat + tombol aksi ("Belum ada faktur. Buat tagihan pertama →").
- **Uang/mata uang**: selalu tampilkan kode mata uang; konversi/kurs ditampilkan bila valas (konteks ekspor CNY/USD).

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
- [ ] Reuse komponen `src/components/ui`; token warna/spacing dari variabel (bukan hex mentah).
- [ ] Empty state bermakna + aksi.
