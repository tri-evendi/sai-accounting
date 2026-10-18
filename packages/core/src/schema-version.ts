/**
 * Vonis versi skema SATU basis data terhadap migration yang diharapkan —
 * MURNI, dipakai `/backup` konsol operator.
 *
 * Lima keadaan, bukan dua, karena "tidak mutakhir" punya sebab yang
 * tindakannya berbeda:
 *   - `menggantung`: ada migration yang MULAI tapi tidak selesai. Paling
 *     mendesak: `migrate deploy` berikutnya menolak berjalan (P3009) sampai
 *     manusia memutuskan, dan rilis berikutnya macet di basis data ini.
 *   - `tertinggal`: terapan terakhir lebih lama dari yang diharapkan kode —
 *     `db:migrate:all` terlewat atau gagal untuk buku ini.
 *   - `mendahului`: basis data sudah memuat migration yang TIDAK dikenal image
 *     ini — image lebih tua dari skemanya (gelar setengah jalan, atau jalan
 *     mundur `SAI_TAG=` tanpa memikirkan skemanya).
 *   - `tak_terbaca`: koneksi gagal atau `_prisma_migrations` belum ada. Bukan
 *     "mutakhir": basis data yang tidak terperiksa bukan basis data yang sehat.
 *   - `mutakhir`.
 *
 * Nama migration berawalan `NNNN_` empat digit, jadi urutan teks = urutan
 * penerapan.
 */
export interface RingkasanMigrasiDb {
  terapan: number;
  menggantung: number;
  terakhir: string | null;
}

export type StatusVersi = "mutakhir" | "tertinggal" | "mendahului" | "menggantung" | "tak_terbaca";

export function vonisVersi(ringkasan: RingkasanMigrasiDb | null, diharapkan: string): StatusVersi {
  if (!ringkasan) return "tak_terbaca";
  if (ringkasan.menggantung > 0) return "menggantung";
  if (ringkasan.terakhir === null) return "tertinggal";
  if (ringkasan.terakhir === diharapkan) return "mutakhir";
  return ringkasan.terakhir < diharapkan ? "tertinggal" : "mendahului";
}

/** Keadaan yang menuntut tindakan — untuk ringkasan "N perlu diperiksa". */
export function perluTindakan(status: StatusVersi): boolean {
  return status !== "mutakhir";
}
