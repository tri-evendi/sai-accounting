/**
 * Kerangka muat untuk grup rute `(setup)`.
 *
 * `/setup` adalah `force-dynamic` dan menjalankan enam pembacaan sebelum
 * merender apa pun (setting perusahaan, identitas, jumlah COA, akun kas,
 * pelanggan, pemasok). Ia juga layar WAJIB PERTAMA bagi pengguna baru, jadi
 * jeda kosong di sini adalah kesan pertama aplikasi ini.
 *
 * Dirender DI DALAM `SetupShell` (kepala ramping sudah tergambar oleh layout),
 * jadi yang perlu ditahan hanya ruang isinya: kepala halaman + panel wizard.
 */
export default function SetupLoading() {
  return (
    <div className="w-full animate-pulse" aria-hidden="true">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-72 rounded bg-border" />
        <div className="h-4 w-full max-w-lg rounded bg-border" />
      </div>

      {/* Baris langkah wizard */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-2 flex-1 rounded-full bg-border" />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="h-5 w-40 rounded bg-border" />
        <div className="mt-6 space-y-5">
          <div className="h-10 w-full rounded-lg bg-border" />
          <div className="h-10 w-full rounded-lg bg-border" />
          <div className="h-10 w-2/3 rounded-lg bg-border" />
        </div>
      </div>
    </div>
  );
}
