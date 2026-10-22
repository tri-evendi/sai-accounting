/**
 * Hook `register` Next — dipanggil SEKALI per instans server sebelum ia
 * melayani permintaan (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 *
 * Satu-satunya isinya: potret tunda event loop `app-customer` untuk pemicu (a)
 * tahap 1d (09 §3.3, §9). Pengukuran itu HARUS di proses yang melayani halaman
 * — tunda di proses lain tidak membuat siapa pun menunggu.
 *
 * Dua pagar, keduanya karena `register` dipanggil di lebih banyak tempat
 * daripada server produksi:
 *   • `NEXT_RUNTIME === "nodejs"` — runtime edge tidak punya `perf_hooks`;
 *   • bukan fase build — pekerja `next build` bukan proses yang melayani
 *     siapa pun, dan barisnya hanya akan mencemari sampel.
 *
 * Impornya dinamis, mengikuti saran dokumentasinya: modul Node-only tidak
 * boleh ikut terevaluasi di runtime yang tidak mendukungnya.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startLoopSampler } = await import("@sai/platform/runtime-samples");
  const { APP_CUSTOMER_SOURCE } = await import("@sai/core/runtime-trigger");
  startLoopSampler(APP_CUSTOMER_SOURCE);
}
