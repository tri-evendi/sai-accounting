/**
 * Kerangka muat untuk grup rute `(auth)`.
 *
 * Dua halaman di grup ini adalah server component yang MENUNGGU sebelum ada
 * yang tampil: `/select-company` membaca daftar keanggotaan, `/setup-required`
 * memeriksa gerbang setup dan izin efektif. Tanpa berkas ini keduanya berangkat
 * dari layar putih — pada titik paling rapuh dalam perjalanan pengguna baru,
 * tepat setelah ia menekan "Masuk".
 *
 * Bentuknya sengaja MENIRU geometri `AuthShell` (panel brand kiri + kartu
 * tengah maks 28rem): ruangnya ditahan lebih dulu supaya isinya tidak melompat
 * saat tiba (CLS). Tidak ada teks sama sekali — kerangka ini muncul sebelum
 * kamus bahasa mana pun dipilih, dan menebak bahasanya lebih buruk daripada
 * diam.
 */
export default function AuthLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-muted lg:flex-row" aria-hidden="true">
      {/* Panel brand — solid, bukan berdenyut: isinya statis dan memang sudah
          benar sejak render pertama, jadi menganimasikannya hanya berbohong
          tentang apa yang sedang ditunggu. */}
      <div className="hidden bg-sidebar lg:block lg:w-[30%] lg:min-w-[280px] lg:max-w-sm lg:shrink-0" />

      <div className="flex flex-1 flex-col">
        <div className="border-b border-border bg-sidebar px-6 py-5 lg:hidden">
          <div className="h-5 w-40 rounded bg-sidebar-foreground/20" />
          <div className="mt-2 h-4 w-56 rounded bg-sidebar-foreground/10" />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
          <div className="w-full max-w-md animate-pulse">
            <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-8">
                <div className="mb-4 h-11 w-11 rounded-lg bg-muted" />
                <div className="h-6 w-48 rounded bg-muted" />
                <div className="mt-3 h-4 w-full rounded bg-muted" />
                <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
              </div>
              <div className="space-y-5">
                <div className="h-10 w-full rounded-lg bg-muted" />
                <div className="h-10 w-full rounded-lg bg-muted" />
                <div className="h-11 w-full rounded-lg bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
