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

/* ══ FAN-OUT MIGRATION BUKU (09 §6) ═════════════════════════════════════════
 *
 * Tiga keputusan yang menentukan apakah rilis BERHENTI, dan karena itu murni
 * dan teruji (`tests/schema-rollout.test.ts`) — bukan cabang `if` di skrip.
 */

/** Hasil satu putaran fan-out. */
export type RolloutStatus = "ok" | "partial" | "error";

/**
 * `partial` = ada buku yang gagal DAN ada buku yang SAMPAI di kepala (baru
 * dimigrasikan, atau sudah di sana sebelum putaran) — buku yang gagal ditutup
 * gerbang skema per perusahaan, sisanya siap untuk image baru.
 *
 * `error` = ada yang gagal dan TIDAK SATU buku pun di kepala. Itu bukan "satu
 * buku bermasalah" melainkan migration-nya sendiri (atau server-nya) yang
 * rusak: melanjutkan rilis berarti mengganti aplikasi lama yang masih
 * melayani setiap buku dengan aplikasi baru yang menutup setiap buku.
 *
 * Buku yang dilewati karena sudah di kepala IKUT dihitung, dan itu disengaja:
 * putaran ulang sesudah rilis parsial (16 dilewati, 1 masih gagal) harus tetap
 * `partial`. Kalau ia `error`, setiap `docker compose up -d` berikutnya —
 * yang menjalankan ulang `migrate` lewat `depends_on` — tertahan oleh satu
 * buku, persis keadaan yang 09 §6 hapus.
 */
export function rolloutStatus(c: { atHead: number; failed: number }): RolloutStatus {
  if (c.failed === 0) return "ok";
  return c.atHead > 0 ? "partial" : "error";
}

/**
 * Kode keluar penerap.
 *
 * `strict` (`db:migrate:all`, `db:migrate:companies` — manusia, CI, dev):
 * kegagalan APA PUN = 1, seperti sejak #104.
 *
 * `release` (`db:migrate:release`, CMD image migrator): `partial` = 0. Inilah
 * inti 09 §6 — gerbang rilis berubah dari "semua perusahaan siap" menjadi
 * "perusahaan ini siap": satu buku yang gagal tidak lagi menahan yang lain,
 * dan buku itu sendiri ditutup gerbang skema sampai diperbaiki. `error` tetap
 * 1 di kedua mode.
 */
export function rolloutExitCode(status: RolloutStatus, mode: "strict" | "release"): number {
  if (status === "ok") return 0;
  if (status === "partial" && mode === "release") return 0;
  return 1;
}

/**
 * Satu kata untuk `/api/health` tentang buku-buku pemasangan ini.
 *
 *  - `pending`: putaran terakhir menargetkan migration yang lebih TUA dari yang
 *    dibawa image ini — fan-out untuk rilis ini belum berjalan (atau sedang).
 *  - `partial` / `error`: putaran terakhir untuk rilis ini meninggalkan buku
 *    di belakang; buku itu ditutup sampai putaran berikutnya.
 *  - `unknown`: tidak ada putaran tercatat, atau tak terbaca — BUKAN `ok`.
 *
 * DILAPORKAN, tidak ikut memutuskan (doktrin #137): probe tetap 200.
 */
export type MigrationsHealth = "ok" | "pending" | "partial" | "error" | "unknown";

export function migrationsHealth(
  last: { status: string; targetMigration: string } | null,
  diharapkan: string
): MigrationsHealth {
  if (!last) return "unknown";
  if (last.targetMigration < diharapkan) return "pending";
  if (last.status === "ok" || last.status === "partial" || last.status === "error") return last.status;
  return "unknown";
}
