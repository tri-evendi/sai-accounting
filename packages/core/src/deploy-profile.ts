/**
 * PROFIL PENYEBARAN — SaaS atau on-premise (celah on-premise #1).
 *
 * Satu pemasangan on-premise berjalan TANPA basis data platform: paket,
 * langganan, dan tagihan SAI tidak ada artinya di mesin yang sudah dibeli.
 * Tapi penjadwal, pemeriksa kesesuaian, dan cadangan tetap berjalan di sana,
 * dan sampai celah ini ditutup aplikasi tidak punya cara menyatakan bedanya —
 * ia hanya bisa melaporkan "platform tak terjangkau", yang terbaca sebagai
 * kerusakan padahal itu keadaan yang BENAR.
 *
 * ══ EKSPLISIT, TIDAK PERNAH DISIMPULKAN ════════════════════════════════════
 * Profilnya dibaca dari satu variabel yang disetel sengaja, BUKAN disimpulkan
 * dari ada-tidaknya `PLATFORM_DATABASE_URL`. Perbedaannya menentukan, dan
 * arahnya tidak simetris:
 *
 *   • Kalau profil disimpulkan, pemasangan SaaS yang kehilangan variabel
 *     alamatnya — salah tempel `.env`, secret yang gagal ter-mount — berubah
 *     menjadi "on-premise" tanpa satu pun galat. Penagihan lalu diam, dan
 *     diamnya terlihat SEHAT di setiap probe. Tagihan yang tidak terbit tidak
 *     punya permukaan sendiri; ia baru ketahuan saat seseorang bertanya kenapa
 *     pendapatan bulan ini kosong.
 *   • Kalau profilnya eksplisit, kegagalan yang sama tetap berbunyi apa adanya:
 *     profil `saas` yang alamatnya hilang melaporkan platform tak terjangkau,
 *     persis seperti sebelumnya.
 *
 * ══ BAWAAN `saas`, DAN NILAI ASING MELEMPAR ════════════════════════════════
 * Tidak disetel = `saas`: itu keadaan setiap pemasangan hari ini, jadi bawaan
 * ini membuat celah ini tidak mengubah perilaku apa pun yang sudah berjalan.
 *
 * Nilai yang TIDAK dikenal melempar, dan tidak jatuh ke bawaan. `on-prem`,
 * `ONPREM `, atau `premise` adalah salah tulis yang — kalau dibiarkan jatuh ke
 * `saas` — menghasilkan pemasangan on-premise yang melaporkan penagihannya
 * rusak selamanya, dengan sebab yang tidak akan pernah dicari orang di ejaan
 * sebuah variabel. Galat saat boot jauh lebih murah.
 *
 * MURNI: tanpa Prisma, tanpa `next/*`, tanpa `server-only` — ia dibaca penjaga,
 * probe kesehatan, DAN skrip di luar Next.
 */

export type DeployProfile = "saas" | "onprem";

/** Nama variabelnya, diekspor supaya pesan galat & penjaga tidak mengetiknya ulang. */
export const DEPLOY_PROFILE_ENV = "APP_DEPLOY_PROFILE";

const DIKENAL: readonly DeployProfile[] = ["saas", "onprem"];

/**
 * Profil pemasangan ini.
 *
 * @param env sumber variabel — disuntik di tes, `process.env` di produksi.
 * @throws bila variabelnya ada tapi nilainya di luar kosakata.
 */
export function deployProfile(env: Record<string, string | undefined> = process.env): DeployProfile {
  const raw = env[DEPLOY_PROFILE_ENV]?.trim();
  if (!raw) return "saas";

  const nilai = raw.toLowerCase();
  if ((DIKENAL as readonly string[]).includes(nilai)) return nilai as DeployProfile;

  throw new Error(
    `${DEPLOY_PROFILE_ENV}="${raw}" tidak dikenal. Nilai yang sah: ${DIKENAL.join(" | ")}. ` +
      "Variabel ini TIDAK jatuh ke bawaan saat salah tulis — pemasangan on-premise " +
      "yang profilnya salah tulis akan melaporkan penagihannya rusak selamanya."
  );
}

/**
 * Apakah bidang penagihan (`sai_platform`) memang dipasang di sini?
 *
 * Dipakai untuk membedakan "tak terjangkau" (kerusakan) dari "tidak dipasang"
 * (keadaan yang benar). Ia TIDAK boleh dipakai sebagai gerbang di jalur panas:
 * doktrin #137 melarang penjaga dan middleware bergantung pada apa pun yang
 * berhubungan dengan penagihan — dan di sini tidak ada yang perlu dijaga,
 * sebab pertanyaannya hanya tentang pelaporan.
 */
export function billingPlaneInstalled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return deployProfile(env) === "saas";
}
