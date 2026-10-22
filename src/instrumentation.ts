/**
 * Kait start server Next (`register` dipanggil SEKALI per proses).
 *
 * Isinya hari ini satu: PERINGATAN START on-premise bila kunci publik lisensi
 * belum ditanam di image (`LICENCE_PUBLIC_KEY_PEM = "BELUM-DISETEL"`). Tanpa
 * baris ini keadaan itu hanya terlihat sebagai menu yang menyempit ke modul
 * inti — gejala yang dibaca customer sebagai "lisensinya rusak", padahal yang
 * belum ada adalah langkah pemilik SAI (docs/ONPREM-SERAH-TERIMA.md §0).
 *
 * PERINGATAN, bukan galat: lisensi tidak pernah menghentikan aplikasi
 * (`packages/core/src/licence.ts`). Pemasangan tanpa kunci tetap start,
 * tetap membuka buku, dan memakai entitlement tersempit.
 */
export async function register(): Promise<void> {
  // Runtime edge tidak punya `node:crypto`; peringatannya milik proses Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
