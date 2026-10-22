/**
 * Hook `register` Next — dipanggil SEKALI per instans server sebelum ia
 * melayani permintaan (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 *
 * Isinya dua:
 *   • potret tunda event loop `app-customer` untuk pemicu (a) tahap 1d
 *     (09 §3.3, §9). Pengukuran itu HARUS di proses yang melayani halaman —
 *     tunda di proses lain tidak membuat siapa pun menunggu;
 *   • PERINGATAN START on-premise bila kunci publik lisensi belum ditanam di
 *     image (`LICENCE_PUBLIC_KEY_PEM = "BELUM-DISETEL"`). Tanpa baris ini
 *     keadaan itu hanya terlihat sebagai menu yang menyempit ke modul inti —
 *     gejala yang dibaca customer sebagai "lisensinya rusak", padahal yang
 *     belum ada adalah langkah pemilik SAI (docs/ONPREM-SERAH-TERIMA.md §0).
 *     PERINGATAN, bukan galat: lisensi tidak pernah menghentikan aplikasi.
 *   • MODE REPLIKA tahap 2 (`@sai/platform/replica-mode`) — hanya bila
 *     `CACHE_REDIS_URL` disetel; tanpanya modulnya bahkan tidak dimuat. Ia
 *     SATU-SATUNYA bagian hook ini yang boleh menolak start: replika di host
 *     lain tanpa penyimpanan dokumen bersama (02 §Replika).
 *
 * Runtime edge tidak punya `perf_hooks` maupun `node:crypto`, jadi keduanya
 * hanya untuk proses Node. Impornya dinamis, mengikuti saran dokumentasinya.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await warnMissingLicenceKey();

  if (process.env.CACHE_REDIS_URL) {
    const { startReplicaMode } = await import("@sai/platform/replica-mode");
    const path = await import("node:path");
    await startReplicaMode({
      app: "app-customer",
      // Hanya dokumen: jejak audit sudah di basis data (#370/#484).
      storageRoots: [{ name: "documents", dir: path.join(process.cwd(), "data", "documents") }],
    });
  }

  // Pekerja `next build` bukan proses yang melayani siapa pun; barisnya hanya
  // akan mencemari sampel.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startLoopSampler } = await import("@sai/platform/runtime-samples");
  const { APP_CUSTOMER_SOURCE } = await import("@sai/core/runtime-trigger");
  startLoopSampler(APP_CUSTOMER_SOURCE);
}

async function warnMissingLicenceKey(): Promise<void> {
  const { deployProfile } = await import("@sai/core/deploy-profile");
  const { licenceKeyInstalled } = await import("@sai/core/licence");

  let onprem = false;
  try {
    onprem = deployProfile() === "onprem";
  } catch (error) {
    // Salah tulis profil dilaporkan keras oleh pemakainya sendiri; di sini
    // cukup dicatat supaya baris pertama log sudah menyebutnya.
    console.error("[start]", error);
    return;
  }

  if (onprem && !licenceKeyInstalled()) {
    console.warn(
      "[start] ⚠ PROFIL ON-PREMISE TANPA KUNCI PUBLIK LISENSI. Image ini dibangun " +
        "dengan LICENCE_PUBLIC_KEY_PEM placeholder, jadi TIDAK ADA berkas lisensi " +
        "yang bisa sah: modul dibatasi ke inti, batas 1 perusahaan / 3 pengguna. " +
        "Pembukuan tetap terbuka. Pemilik SAI wajib menanam kunci publik produksi " +
        "lalu merilis image baru — docs/ONPREM-SERAH-TERIMA.md §0."
    );
  }
}
