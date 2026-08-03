/**
 * Kulit `/platform` — PENDARATAN pasca-masuk, bukan layar pra-aplikasi.
 *
 * ══ KENAPA BUKAN `AuthShell` ═══════════════════════════════════════════════
 * Sampai issue #172 halaman ini beralamat `/tenant` dan memang layar
 * pra-aplikasi: satu tugas, satu kartu. `AuthShell` — yang kepala berkasnya
 * menyebut dirinya sendiri "kulit layar PRA-APLIKASI (masuk, ganti kata sandi,
 * pilih perusahaan…)" — menaruh isinya di kolom `max-w-md`, yaitu 448px, dan
 * dengan `p-8` menyisakan 384px ruang isi. Itu ukuran yang benar untuk sebuah
 * formulir masuk.
 *
 * Ia menjadi ukuran yang salah pada hari halaman ini berhenti mengerjakan satu
 * tugas. Pendaratan pasca-masuk membawa, dalam satu layar: keadaan langganan,
 * daftar perusahaan, undangan staf, TABEL TAGIHAN LIMA KOLOM, formulir profil
 * penagihan, dan permintaan penghapusan akun. Tabel lima kolom di dalam 384px
 * tidak "menyesuaikan diri" — ia menggeser dirinya sendiri secara mendatar di
 * dalam sumur sempit, DI LAYAR 1440px, dengan dua pertiga layar kosong di kiri
 * dan kanannya. Kolom sempit bukan penyederhanaan di sini; ia memampatkan
 * seluruh isi menjadi satu gulungan panjang yang tidak bisa dipindai.
 *
 * ══ APA YANG TETAP DIWARISI ════════════════════════════════════════════════
 * Halaman ini tetap TANPA chrome aplikasi — tidak ada menu samping dan tidak
 * ada menu avatar, sebab pengunjungnya boleh jadi belum punya satu pun PT
 * (`(tenant)/layout.tsx`). Karena itu tiga hal dari layar pra-aplikasi ikut,
 * dan ketiganya punya alasan yang sama — di sini tidak ada tempat lain yang
 * menyediakannya:
 *
 *   • pemilih BAHASA & TEMA di bilah atas — di aplikasi keduanya tinggal di
 *     menu akun, chrome yang tidak ada di halaman ini;
 *   • identitas produk (`APP_NAME`, bukan nama PT — lihat catatan kepala
 *     `auth-shell.tsx`: di sini aplikasi belum tentu tahu tenant mana yang
 *     datang, dan nilai cadangannya adalah nama pemasang pertama);
 *   • JALAN KELUAR. MASTER.md §Orientasi Perusahaan mewajibkannya untuk layar
 *     tanpa chrome. Di sini ia tidak dititipkan ke kaki halaman: halamannya
 *     sendiri menaruh `SignedInAs` di kartu "Akun" paling atas, sebab kaki
 *     halaman ada di bawah tabel tagihan — dan "saya masuk sebagai akun yang
 *     salah" adalah hal yang harus bisa diperbaiki tanpa menggulung dulu.
 *
 * Lebar `max-w-5xl` (1024px), bukan penuh: baris teks selebar layar 1440px
 * tidak terbaca, dan isi halaman ini adalah kalimat penjelas sebanyak data.
 */
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface PlatformShellProps {
  children: React.ReactNode;
  heading: string;
  description?: string;
  icon?: React.ReactNode;
}

export function PlatformShell({ children, heading, description, icon }: PlatformShellProps) {
  return (
    /* `bg-background`, BUKAN `bg-muted`: di tema gelap `--muted` dan
     * `--secondary` bernilai sama, dan kartu (`--card`) justru menjadi lebih
     * gelap daripada halamannya — terbalik dari maksudnya. */
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size="sm" />
            <span className="truncate text-sm font-semibold text-foreground">{APP_NAME}</span>
          </div>
          {/* Bahasa & tema — terjangkau tanpa chrome aplikasi. `flex-wrap` +
              `justify-end` membuatnya turun sendiri di layar 375px. */}
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <LocaleToggle />
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-8 flex items-start gap-4">
          {icon && (
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-ring sm:flex">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {/* `h1` sungguhan. Di kulit lama judul halaman adalah `h2` yang
                sederajat dengan judul setiap bagiannya, dan halaman ini tidak
                punya `h1` sama sekali — struktur yang datar bagi pembaca layar
                justru pada halaman yang isinya paling banyak bercabang. */}
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading}</h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">{children}</div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {APP_NAME}
          {" · v"}
          {APP_VERSION}
        </p>
      </footer>
    </div>
  );
}
