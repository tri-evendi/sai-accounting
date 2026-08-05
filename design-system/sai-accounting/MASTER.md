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
1. **Light-first**, tenang, kontras tinggi. Sidebar gelap sebagai aksen (sesuai app saat ini). Dark mode **sudah aktif** — pilihan Terang / Gelap / Ikut sistem di menu akun dan di layar pra-aplikasi — tetapi **bawaannya tetap terang**: `DEFAULT_THEME` di `src/lib/theme/config.ts` adalah `light`, dan menjadikannya `system` berarti setiap pengguna ber-OS gelap membuka aplikasi keuangan ini dalam mode yang belum ditinjau halaman demi halaman.
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

**Aturannya tidak berhenti di badge — ia berlaku untuk TEKS BERWARNA apa pun.** Di atas `--card` putih, warna penuh gagal ambang teks biasa: `--success` #16A34A hanya **3,30:1** dan `--warning` #D97706 **3,19:1** (hanya `--destructive` #DC2626 lolos, 4,83:1). Yang menyelamatkannya selama ini adalah ukuran, bukan warnanya:

| Tempat | Ambang | Boleh |
|--------|--------|-------|
| Angka besar (`text-2xl`/`text-3xl` **tebal** ≥ 18,66px bold) | 3:1 (teks besar) | `text-success` / `text-warning` |
| **Sel tabel & teks 14px** (primitif `Table` = `text-sm`) | **4,5:1** | **hanya** `-strong` (7,1–8,3:1) |
| Ikon & isian pekat | 3:1 (non-teks) | warna penuh |

Kolom nominal di beranda pernah memakai `text-success` pada sel `text-sm` — benar warnanya, gagal kontrasnya. **Kolom uang berwarna memakai `text-success-strong` / `text-destructive-strong`.**

**Penjaga lint mengenal sisi arah.** Pola di `eslint.config.mjs` semula hanya mencocokkan `border-` yang langsung diikuti warna, sehingga `border-l-4 border-l-blue-500` (garis aksen kiri kartu — justru bentuk paling umum) lolos berbulan-bulan dan tidak ikut berganti di tema gelap. Pola itu kini mencakup `border-l-`, `border-t-`, `bg-x-`, dst. Kalau muncul bentuk penulisan warna baru yang lolos, **perbaiki polanya**, bukan hanya kelasnya — satu kelas yang diperbaiki akan kembali lewat PR berikutnya.

*Dark mode:* surface naik ke `#0F172A`/`#1E293B`, rasio kontras & semantik warna tetap sama. Pasangan soft/strong versi gelap ada di blok `.dark` (kontras 8,5–10,6:1). Kelas `.dark` dipasang **root layout dari cookie** (`src/lib/theme/`), jadi sudah menempel pada HTML pertama — tidak ada kedipan sebelum hydrate.

**Dua jebakan token yang sudah memakan korban** — palet gelap membuat beberapa token bernilai SAMA, dan komponen yang mengandalkan selisihnya diam-diam runtuh saat tema berganti:

| Token | Terang | Gelap | Akibatnya |
|-------|--------|-------|-----------|
| `--muted` / `--secondary` | `#F1F5F9` / `#F1F5F9` | **`#334155` / `#334155`** | Sakelar aktif (varian `secondary`) di atas latar `bg-muted` jadi tak terlihat sama sekali |
| `--sidebar` / `--background` | `#0F172A` / `#F8FAFC` | **`#0F172A` / `#0F172A`** | Panel gelap melebur dengan halaman; pembagian kolomnya hilang |

Karena itu: **latar halaman memakai `bg-background`, bukan `bg-muted`** (kartu harus lebih terang dari halamannya di kedua tema), dan **batas antar-bidang yang sewarna di tema gelap wajib punya `border`**, bukan hanya mengandalkan beda warna. Tinjau UI baru di KEDUA tema sebelum menyerahkannya.

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

## Orientasi Perusahaan (chrome, wajib — issue #104)

Sejak buku besar tiap PT hidup di basis datanya sendiri, satu pertanyaan berdiri di atas semua pertanyaan tampilan lain: **buku siapa yang sedang saya tulis?** Mencatat ke PT yang salah tidak berbunyi saat terjadi — ia muncul berbulan-bulan kemudian sebagai neraca yang tidak cocok.

- **Nama perusahaan aktif selalu terlihat di top bar** (`CompanyIndicator`), di semua ukuran layar, tanpa perlu membuka menu apa pun. Namanya dibawa **sesi** (`session.user.companyName`), bukan diambil lewat permintaan — supaya ia hadir pada render pertama, bukan berkedip masuk setelah orang mulai mengetik.
- Penanda itu **orientasi, bukan kendali**. Berganti perusahaan tinggal di menu avatar, dan hanya muncul bila pengguna memang memegang lebih dari satu PT.
- Di layar sempit yang boleh menyempit adalah **namanya** (truncate + `title`), bukan target sentuh aksi di sebelah kanan.
- **Identitas yang dicetak** (kop faktur/kontrak/surat jalan) diambil berurutan: setting perusahaan → nama di registry kendali → konstanta. Jangan pernah memundurkannya ke konstanta lebih awal: isinya nama pemasang pertama, dan mencetaknya di dokumen PT lain menghasilkan surat yang terlihat sah padahal salah badan hukum.
- Layar pra-aplikasi (`/select-company`, `/setup-required`, `/feature-inactive`) **wajib punya jalan keluar** — tombol keluar atau tautan kembali. Layar tanpa kendali apa pun adalah jalan buntu bagi orang yang aksesnya baru dicabut.

## Pola Komponen (khusus domain)
- **Kartu KPI dashboard**: judul bahasa awam + angka besar tabular + delta berwarna (hijau/merah) dengan tanda +/−; sub-teks periode.
- **Tabel transaksi**: kolom nominal rata-kanan + tabular-nums; kolom status pakai **badge** (Lunas=hijau, Sebagian=amber, Belum/Jatuh Tempo=merah) — badge selalu berteks, bukan warna saja.
- **Form**: label terlihat (bukan placeholder), validasi inline dekat field, helper text, progressive disclosure ("Detail lengkap"). Tombol primer = aksi simpan; destruktif = merah + konfirmasi. **Implementasi:** `react-hook-form` + `zodResolver` dengan pola `Form` shadcn (lihat "Konvensi Form" di bawah) — bukan `useState` manual.
- **Empty state**: 1 kalimat + tombol aksi ("Belum ada faktur. Buat tagihan pertama →").
- **Uang/mata uang**: selalu tampilkan kode mata uang; konversi/kurs ditampilkan bila valas (konteks ekspor CNY/USD).

## Pusat Laporan: dialog parameter

Laporan **tidak dibuka langsung dari kartunya**. Menekan kartu membuka dialog parameter (`components/reports/report-launch-dialog.tsx`) yang menanyakan periode/saringan/kolom lebih dulu, lalu menawarkan tiga jalan keluar: **Pratinjau** (halaman laporan), **Unduh PDF**, **Unduh Excel**. Alasannya bukan gaya: membuka dulu dengan periode bawaan berarti menghitung dan merender laporan yang salah, lalu menghitungnya lagi setelah penyaring di atas tabel diubah.

- **Kendali dirender dari katalog, bukan ditulis per laporan.** `paramKind`, `filters`, `columns`, dan `payloadKind` di `lib/report-catalog.ts` adalah satu-satunya sumber bagi dialog, halaman, dan berkas ekspornya.
- **`paramKind` menyatakan parameter yang BENAR-BENAR dibaca halaman tujuan** — bukan bentuk periode yang secara konsep cocok. Kendali yang isian­nya diabaikan diam-diam adalah kendali yang berbohong (tiga entri katalog pernah begitu).
- **Tombol unduh hanya muncul bila laporannya punya `payloadKind`.** Entri yang menunjuk halaman modul interaktif menawarkan "Buka" saja, dengan kalimat yang mengatakan kenapa.
- **Pemilihan kolom hanya untuk laporan bertipe daftar.** Susunan Laba/Rugi, Neraca, dan Arus Kas ditentukan standar akuntansi; centang kolom di sana adalah kendali yang tak mengubah apa pun. Kolom identitas baris selalu ikut (`fixed`), dan pilihan pengguna hanya boleh MENGURANGI kolom — tak pernah memunculkan kolom yang laporannya memang tak punya isinya.
- **Satu penentu kolom untuk tiga permukaan** (`stockMovementColumns`, `partyRecapColumns`, `agingColumns`, `stockValueColumns`, `cashBankColumns` di `lib/statement-layout.ts`): layar, PDF, dan lembar sebar. Pratinjau yang memperlihatkan kolom berbeda dari berkasnya adalah laporan yang tidak dipercaya dua kali.
- **Kartu mendarat di LAPORANNYA, bukan di halaman kerja atau persimpangan.** Halaman modul (`/inventory`, `/finance`) terpaginasi dan disaring untuk bekerja; sepuluh baris pertama bukan laporan, dan totalnya akan salah. Hub (`/budget`) menunda laporannya satu klik lagi. Laporan yang tidak punya view sendiri mendapat halamannya di bawah `/reports`, dengan izin mengikuti DATANYA (`inventory.read`, `cash.read`) — sebuah laporan tidak melonggarkan siapa yang boleh melihat isinya.
- **Nilai yang tidak diketahui ditulis kosong atau "—", tak pernah 0.** Dokumen valas tanpa kurs, barang tanpa dasar biaya: nol menyatakan "tidak ada nilai", yang berbeda dari "nilainya belum diketahui" — dan menjumlahkannya sebagai nol menyusutkan total tanpa satu pun tanda di layar. Jumlah yang dikecualikan selalu disebutkan sebagai catatan.

---

## Konvensi Form (issue #53)

Form ditulis dengan **`react-hook-form` + `zodResolver`** memakai pola **`Form`** (`src/components/ui/form.tsx`). Contoh acuan: `src/app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/new/customer-form.tsx` (master sederhana) dan `src/components/shared/payment-form.tsx` (transaksi valas).

1. **Satu skema zod, dua sisi.** Skema yang divalidasi form **wajib** skema yang sama dipakai route handler — **diimpor, bukan disalin**. Bila server menambah field (mis. `invoiceId` dari URL), pisahkan field bersama sebagai objek yang dipakai ulang (contoh: `paymentFormFields` di `lib/validations/payment.ts`, dipakai `paymentFormSchema` client dan `invoicePaymentSchema`/`contractPaymentSchema` server). Client & server tidak boleh bisa menyimpang diam-diam.
2. **Pesan error lewat KUNCI kamus, ramah awam.** Skema tidak menulis kalimat, melainkan kunci bertipe: `z.string().min(1, vmsg("validation.dateRequired"))` (`@/lib/i18n/validation`). Alasannya: pesan zod dipanggang saat modul dimuat sehingga tidak bisa ikut berganti bahasa — sedangkan mengubahnya menjadi pabrik `make…Schema(t)` melanggar aturan 1, dan `z.setErrorMap()` global membocorkan bahasa antar-permintaan yang berjalan bersamaan. Kalimatnya karena itu disusun di **batas tampilan**: `FormMessage` di client, `translateFieldErrors()` di route handler, `humanizeFieldMessage()` di jalur pesan API. Kunci salah ketik ditolak `tsc` (tipe `ValidationKey`); `tests/i18n-validation.test.tsx` menolak kalimat yang tertinggal di dalam skema. Pesan yang membawa nominal memakai `vissue("…", { … })` — kunci + nilainya ikut sebagai `params` zod, bukan sandi yang diselundupkan ke dalam teks pesan.

   Pola baku jawaban 400 di route handler (acuan: `src/app/api/invoices/route.ts`, `src/app/api/{invoices,contracts}/[id]/payments/route.ts`):

   ```ts
   if (!parsed.success) {
     const { dictionary, t } = await getRequestI18n();               // @/lib/i18n/server
     return NextResponse.json(
       {
         error: t("validation.invalidInput"),
         details: translateFieldErrors(parsed.error, dictionary),    // @/lib/i18n/validation
       },
       { status: 400 }
     );
   }
   ```
3. **Struktur field:** `FormField` → `FormItem` → `FormLabel` + `FormControl` + `FormDescription?` + `FormMessage`. Pautan label–input–deskripsi–error (`aria-invalid`/`aria-describedby`/`role="alert"`) terpasang otomatis. Jangan pasang `aria-*` manual.
4. **Isian di dalam `FormControl` harus telanjang** — `TextInput`/`NativeSelect`/`MoneyInput`, bukan `Input`/`Select` komposit (yang membawa label/error sendiri). `FormControl` (Radix `Slot`) meneruskan atribut ke anak tunggal, jadi anaknya harus satu elemen kontrol.
5. **Nominal pakai `MoneyInput`** — tampil `1.234.567`, payload menerima angka bersih (`1234567`). Desimal 0 untuk IDR, 2 untuk valas.
6. **Progressive disclosure di tempat yang tepat:** field yang bersyarat (mis. kurs untuk valas) hanya dirender saat relevan, dan skema hanya menuntutnya di kondisi itu (`superRefine`).
7. **Server tetap penjaga terakhir.** Kegagalan validasi server dipetakan ke `form.setError` (field bila ada `fieldErrors`, atau `root`). Field yang TIDAK punya isian di layar (mis. `invoiceId` yang disuntik server) naik menjadi galat formulir, bukan ditanam di field yang tak pernah dilihat siapa pun — acuan `applyPaymentServerErrors` di `payment-form.tsx`.

### Ant Design sebagai KULIT (keputusan issue #192)

`FormItem` berdiri di atas **`Form.Item` AntD, yang dipakai TANPA `Form` AntD** — tanpa `name`, tanpa `rules`, tanpa `validateMessages`. Mesin formulirnya tetap react-hook-form + zod; AntD hanya memberi tata letak label, jarak, dan keadaan error. **`Form` AntD dan `Form.useForm` tidak boleh dipakai di halaman mana pun** — memakainya berarti aturan validasi hidup di dua tempat dan aturan 1 di atas batal. Dijaga `tests/ui-form-antd.test.tsx`.

Tiga akibat nyata yang perlu diketahui sebelum menulis form baru:

- **Label ditulis tetap sebagai anak** (`<FormLabel required>`), lalu **diangkat** `FormItem` menjadi prop `label` `Form.Item` — karena di AntD label adalah prop, bukan komponen. Pengangkatan hanya menjangkau **anak langsung**; label yang ditulis di dalam `FormField` tetap dirender sebagai `<label htmlFor>` biasa di slot kendali. Keduanya benar; yang berbeda hanya letaknya.
- **Slot `help` AntD sengaja tidak dipakai.** Tanpa `name`, `Form.Item` baru merender daftar galatnya setelah sebuah `useLayoutEffect` — di render server ia hilang sama sekali. Pesan validasi karena itu tetap `FormMessage` (`role="alert"`, `text-destructive` yang lolos AA; `colorError` AntD hanya 3,27:1 sebagai teks 14px).
- **Pautan ARIA tetap milik `FormControl`.** AntD hanya menyuntikkan `aria-*` di cabang ber-`name`, yang tidak kita tempuh. Sejak #192 `FormControl` juga memasang **`aria-required`**, jadi isian wajib tidak lagi hanya bertanda `*`.

Tanda wajib `*` tetap digambar aplikasi ini (di BELAKANG teks label, sama seperti `Input`/`Select` komposit), bukan tanda bintang AntD yang digambar `::before` di depan label — dua konvensi di layar yang sama terbaca sebagai cacat.

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
- ❌ Nilai enum DB tampil mentah di UI (`purchase`, `bl`, `coo`, …) — selalu lewat peta label bahasa tugas (`Record<Type, string>` seperti `CONTRACT_STATUS_LABELS`/`DOCUMENT_TYPE_LABELS` di `src/lib/constants.ts`); `Record` bertipe penuh membuat nilai baru tanpa label ditolak `tsc` (issue #68).

---

## Primitif Wajib: Tabel & Tombol

Markup mentah yang "kelihatan sama" adalah cara paling sering aturan di dokumen ini bocor — yang hilang justru bagian tak terlihat: pembungkus geser, ring fokus keyboard, target sentuh. Karena itu dua keluarga ini **wajib** lewat primitif, dan dijaga oleh `tests/design-system-primitives.test.ts` (lingkup `src/app/(dashboard)` + `src/components`, kecuali `src/components/ui` tempat primitifnya sendiri tinggal).

- **Tabel → `StaticTable` atau `DataTable`** (sejak issue #189 primitifnya dipecah dua, dengan **satu kontrak kolom** di `src/components/ui/table-columns.tsx`):
  - **`StaticTable`** (`src/components/ui/static-table.tsx`) — **bawaan untuk laporan & daftar yang dipaginasi server.** Dirender di server, tanpa satu baris JavaScript pun. Dipakai 46 dari 66 tabel app ini.
  - **`DataTable`** (`src/components/ui/data-table.tsx`) — di atas AntD `Table`, komponen client. Dipakai **hanya** bila datanya memang sudah di client dan pengguna diuntungkan sortir/filter/paginasi seketika. Ia menyalin seluruh `dataSource` ke peramban dan menghidrasi rc-table di atasnya; untuk tabel yang cuma menampilkan, itu biaya tanpa imbalan.
  - Kolomnya sama untuk keduanya: `textColumn`/`qtyColumn` (`table-columns.tsx`), `moneyColumn` (`money-column.tsx`), `statusColumn` (`status-column.tsx`). **Pembantu yang membawa komponen client tinggal di modulnya sendiri**, supaya halaman tanpa kolom uang tidak ikut menyeret `money.tsx` ke sisi client.
  - Keduanya membawa geser-sendiri: `StaticTable` lewat pembungkus `overflow-x-auto`, `DataTable` lewat `scroll={{ x: "max-content" }}` yang dipasang primitif sebagai **bawaan**. AntD `Table` **tanpa** `scroll.x` tidak menggulung sendiri — yang menggulung halamannya. Jangan mengosongkan bawaan itu.
  - Baris total lewat prop `summary` (peta kunci kolom → isi sel) pada kedua varian; keadaan kosong lewat `empty` berisi `EmptyState`, tak pernah "No Data" bawaan AntD.
- **Primitif JSX `Table`** (`src/components/ui/table.tsx`: `TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableFooter`) kini **lapisan gaya di bawah kedua perender di atas**, bukan API yang dipanggil halaman. Ia masih dipakai langsung oleh berkas yang belum dikonversi (fase C, #193–#200); untuk tabel BARU pakai `StaticTable`/`DataTable`. Yang tetap terlarang: `<table>`/`<thead>`/`<tbody>`/`<tfoot>` mentah.
- **Nominal di tabel → `MoneyCell`** (satu sel penuh) atau **`Money`** (di dalam sel/teks). Jangan format angka sendiri: tabular-nums, rata kanan, format `id-ID`, dan mata uang eksplisit sudah di dalamnya.
- **Tombol → `Button`** (`src/components/ui/button.tsx`), termasuk pemicu `ConfirmDialog` (dipasang lewat prop `trigger`). Sejak issue #187 isinya AntD `Button`; **nama propnya tidak berubah** (`variant`/`size`/`type`). Perhatikan satu perangkap yang sengaja ditahan primitif: di AntD `type` berarti VARIAN VISUAL, di sini ia tetap berarti `submit`/`button`/`reset` seperti di HTML. Jangan "membetulkannya" dengan meneruskan `type` langsung ke AntD — 60 tombol kirim akan berhenti mengirim formulirnya tanpa satu galat pun.
- **Tombol ikon → `variant="ghost" size="icon"`** = 40px, memenuhi target sentuh minimum. Jangan rakit `p-1.5` (≈28px). Antar aksi ikon yang berdampingan pakai **`gap-2`** (8px) minimum — `gap-1` membuat dua aksi bersebelahan mudah salah tekan.
- **Tingginya datang dari token `controlHeight: 40`** di `AntdProvider`, bukan dari kelas di primitif. Itu berarti seluruh keluarga kendali (Button, Input, Select, DatePicker) naik bersama — dan juga berarti `size="sm"` adalah TURUNAN (`controlHeight × 0,75` = 30px), jadi ia tetap bukan target sentuh utama.
- **Badge status → `Badge`** (`src/components/ui/badge.tsx`), yang sejak #187 merender AntD **`Tag`** — bukan `Badge` AntD, yang itu titik notifikasi tanpa kata. Warna teksnya dari token `components.Tag` (lihat `lib/theme/antd-tokens.ts`); bawaan AntD menaruh "Lunas" pada 2,21:1. Badge tetap **wajib berteks**.
- **Pengecualian yang disahkan** (tetap `<button>` mentah, alasannya ditulis di komentar kepala file dan didaftar di `RAW_BUTTON_ALLOWLIST` penjaga): chrome aplikasi (`sidebar`, `navbar`, `accountant-mode-toggle`), dropdown rakitan tangan (`user-menu`, `help-menu`), overlay tur (`guided-tour`), penanda langkah `wizard`, dan grup chip `aria-pressed` (`glossary-browser`).
- **Bukan tombol, jadi di luar aturan ini:** `<input type="radio">` native dan `<input type="file">` tersembunyi — belum ada primitifnya dan penggunaannya tetap sah.
- **`NativeSelect` bukan lagi `<select>` native** (issue #188). Namanya bertahan supaya 39 pemanggil tidak ikut berubah di fase B, tetapi ia kini `Select` AntD. Tiga akibat yang harus diketahui sebelum memakainya:
  - **`name` tetap terkirim** — primitifnya menitipkan `<input type="hidden">` di dalam kontrolnya sendiri, jadi `new FormData(form)` dan `<form method="get">` tetap bekerja.
  - **`required` TIDAK lagi divalidasi peramban.** Yang tersisa `aria-required` + tanda `*`; penjaganya validasi server (dan zod setelah #192). Isian pilihan yang wajib harus punya validasi selain `required`.
  - **Pencarian menyala sendiri di atas 12 opsi** (`SEARCH_THRESHOLD`), bisa ditimpa lewat prop `searchable`.

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
- [ ] **Dilihat di tema TERANG dan GELAP** — lihat dua jebakan token di bagian Color Palette; sewarna-nya `--muted`/`--secondary` dan `--sidebar`/`--background` di tema gelap tidak terlihat dari kode.
- [ ] Nama produk & versi lewat `APP_NAME` / `APP_VERSION` (`src/lib/constants.ts`), lambang lewat `BrandMark` — bukan literal.
- [ ] Tabel lewat primitif `Table` + `MoneyCell`; tombol lewat `Button` (ikon = `size="icon"`, antar aksi `gap-2`) — penjaga `tests/design-system-primitives.test.ts` hijau.
- [ ] **Tanpa kelas palet mentah** (`bg-blue-600`, `text-gray-500`, …) — `bun run lint` hijau (penjaga token menolaknya).
- [ ] Empty state bermakna + aksi.
