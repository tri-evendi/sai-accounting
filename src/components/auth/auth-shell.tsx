"use client";

/**
 * Kulit layar PRA-APLIKASI (masuk, ganti kata sandi, pilih perusahaan, setup
 * belum jalan, fitur nonaktif).
 *
 * ── Kenapa TIDAK ada nama PT di sini ──────────────────────────────────────
 *
 * Sampai audit ini, panel brand menampilkan `useCompanyIdentity()`. Di layar
 * masuk hasilnya SELALU salah, dan salahnya senyap: hook itu mengambil
 * `/api/company/identity`, sementara `proxy.ts` menjawab 401 untuk setiap
 * `/api/*` tanpa token. Permintaannya karena itu tidak pernah berhasil sebelum
 * orang masuk, context jatuh ke nilai cadangan, dan nilai cadangan itu adalah
 * konstanta nama perusahaan di `constants.ts` — nama PT PEMASANG PERTAMA.
 * Setiap tenant melihat layar masuk (dan baris hak cipta) beratas-nama badan
 * hukum orang lain, persis kesalahan yang dilarang MASTER.md §Orientasi
 * Perusahaan untuk dokumen tercetak.
 *
 * Menambalnya dengan membuka endpoint identitas untuk publik hanya memindahkan
 * masalahnya: pada pemasangan multi-PT, aplikasi memang BELUM BISA TAHU tenant
 * mana yang sedang datang — pertanyaan itu baru terjawab setelah masuk (dan
 * kadang baru setelah `/select-company`). Jadi layar pra-aplikasi memakai
 * identitas PRODUK saja. Nama perusahaan muncul pertama kali di chrome
 * aplikasi (`CompanyIndicator`), tempat ia sudah bisa benar.
 */

import Link from "next/link";
import { AlertCircle, Check } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

interface AuthShellProps {
  children: React.ReactNode;
  heading: string;
  description?: string;
  error?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}

function BrandPanel({ className }: { className?: string }) {
  const t = useT();

  return (
    <div
      className={cn(
        // Panel brand sengaja gelap di KEDUA tema (seperti sidebar), jadi pakai
        // token permukaan-gelap permanen `sidebar`, bukan `bg-foreground`+putih
        // yang akan terbalik (teks putih di atas latar terang) saat mode gelap.
        // Isi panel ditengahkan tegak (`flex-1` + `justify-center` di bawah),
        // baris hak cipta menempel di dasar. Versi `justify-between` yang lebih
        // sederhana meninggalkan ±450px kekosongan di antara keduanya pada
        // layar 900px — terlihat seperti panel yang belum selesai dimuat.
        // Tepi kanan yang eksplisit, dan ia hanya BEKERJA di tema gelap —
        // di sanalah `--sidebar` dan `--background` kebetulan bernilai sama
        // (#0F172A), sehingga tanpa garis ini panel dan halaman melebur jadi
        // satu bidang gelap dan pembagian dua kolomnya hilang sama sekali.
        // Di tema terang garisnya praktis tak terlihat: tepi panel gelap di
        // atas halaman terang sudah punya kontras sendiri.
        "relative flex flex-col overflow-hidden border-border bg-sidebar px-8 py-10 text-sidebar-foreground lg:border-r",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.18),_transparent_55%)]"
        aria-hidden
      />
      <div className="relative flex flex-1 flex-col justify-center">
        {/* JALAN PULANG. Sejak `/` menjadi halaman pendaratan publik, orang
            yang menekan "Daftar" dari sana dan ingin membaca ulang harga atau
            daftar modulnya tidak punya jalan kembali selain tombol Back
            peramban — dan lambang produk adalah tempat pertama yang dicoba
            siapa pun untuk pulang. Untuk yang SUDAH bersesi, `/` memantulkan
            ke tujuan pasca-masuknya, jadi tautan ini tidak pernah menjadi
            jalan buntu di layar mana pun yang memakai kulit ini. */}
        <Link
          href="/"
          aria-label={t("auth.backToHome")}
          className="mb-6 inline-flex w-fit rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <BrandMark size="lg" className="shadow-lg shadow-primary/30" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-sidebar-foreground/70">
          {t("auth.brandTagline")}
        </p>

        {/*
         * Tiga kemampuan, bukan tiga janji pemasaran.
         *
         * Ruang ini dulu diisi alamat kantor — yang salah tenant (lihat catatan
         * kepala berkas) dan, kalaupun benar, tidak menjawab pertanyaan siapa
         * pun yang sedang berdiri di layar masuk. Yang menggantikannya harus
         * lolos satu syarat: setiap barisnya benar untuk SETIAP pemasangan,
         * karena di sini aplikasi belum tahu tenant mana yang datang. Ketiganya
         * karena itu menyebut kemampuan PRODUK — pembukuan berpasangan, valas,
         * dan pemisahan buku antar-PT — bukan angka, pelanggan, atau klaim yang
         * hanya berlaku pada sebagian pemasangan.
         *
         * Bukan gaya landing (MASTER.md §Anti-Patterns): tidak ada hero, tidak
         * ada lencana, tidak ada CTA. Tiga baris teks kecil dengan centang.
         */}
        <ul className="mt-8 space-y-3">
          {(["brandPoint1", "brandPoint2", "brandPoint3"] as const).map((key) => (
            <li
              key={key}
              className="flex items-start gap-2.5 text-sm text-sidebar-foreground/80"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-primary-foreground/90"
                strokeWidth={3}
                aria-hidden
              />
              <span className="max-w-xs leading-snug">{t(`auth.${key}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-sidebar-foreground/60">
        &copy; {new Date().getFullYear()} {APP_NAME}
        {" · v"}
        {APP_VERSION}
      </p>
    </div>
  );
}

export function AuthShell({
  children,
  heading,
  description,
  error,
  icon,
  footer,
}: AuthShellProps) {
  const t = useT();

  /*
   * Permukaan halaman = `bg-background`, BUKAN `bg-muted`.
   *
   * `muted` tampak setara di tema terang (#F1F5F9 vs #F8FAFC) dan runtuh di
   * tema gelap, karena palet gelap memberi `--muted` dan `--secondary` nilai
   * yang SAMA (#334155):
   *   • kartu (`--card` #1E293B) jadi LEBIH GELAP daripada halamannya —
   *     terbalik dari maksudnya, kartu seharusnya permukaan yang terangkat;
   *   • sakelar aktif (varian `secondary`) mendapat latar yang persis sama
   *     dengan halaman, jadi "sedang dipilih" tidak terlihat sama sekali.
   * `--background` (#F8FAFC / #0F172A) adalah token yang memang ditugaskan
   * MASTER.md untuk latar halaman, dan ia benar di kedua tema.
   */
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <BrandPanel className="hidden lg:flex lg:w-[30%] lg:min-w-[280px] lg:max-w-sm lg:shrink-0" />

      <div className="flex flex-1 flex-col">
        {/* Kepala layar sempit — lambang + nama + posisi produk. Ketiga poin
            kemampuan TIDAK ikut: di layar 375px mereka mendorong formulirnya
            ke bawah lipatan, dan yang datang ke sini datang untuk masuk. */}
        <div className="flex items-center gap-3 border-b border-border bg-sidebar px-6 py-5 lg:hidden">
          <BrandMark size="md" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-sidebar-foreground">{APP_NAME}</p>
            <p className="text-sm text-sidebar-foreground/70">{t("auth.brandTagline")}</p>
          </div>
        </div>

        {/*
         * Preferensi tampilan, DI ATAS kartu dan di luar alurnya.
         *
         * Keduanya harus terjangkau SEBELUM masuk: pemilih bahasa selama ini
         * hanya hidup di menu akun — chrome yang baru ada setelah orang
         * berhasil melewati layar ini — sehingga pembaca yang tidak mengerti
         * bahasanya terkunci di luar oleh satu-satunya layar yang bisa
         * membebaskannya.
         *
         * Ditaruh di kanan atas dan bukan di dalam kartu: kartu itu satu
         * tugas (masuk), dan menyelipkan enam sakelar preferensi di antara
         * "Kata Sandi" dan tombol kirim menjadikan pilihan menonton sebagai
         * penghalang pekerjaan. `justify-end` + `flex-wrap` membuatnya turun
         * sendiri ke baris berikutnya di layar sempit.
         */}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-4 pt-4 sm:px-6 lg:px-12">
          <LocaleToggle />
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-4 sm:px-6 lg:px-12">
          <div className="w-full max-w-md">
            <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-8">
                {icon && (
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-ring">
                    {icon}
                  </div>
                )}
                <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
                {description && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-6 flex gap-3 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-strong"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <p>{error}</p>
                </div>
              )}

              {children}

              {footer && <div className="mt-6 border-t border-border pt-5">{footer}</div>}
            </div>

            {/* Panel brand sudah membawa baris hak cipta di layar lebar —
                di sini hanya untuk layar sempit yang tidak melihat panel itu. */}
            <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">
              &copy; {new Date().getFullYear()} {APP_NAME} · v{APP_VERSION}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
