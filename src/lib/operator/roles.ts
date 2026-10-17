/**
 * PERAN OPERATOR dan matriks izinnya — MURNI, satu sumber kebenaran.
 *
 * Sampai migration kendali 0004 setiap operator memegang hak penuh
 * (`nav.tsx`: "TIDAK ADA cabang izin"), termasuk eksekusi hapus tenant.
 * Itu wajar selama hanya ada satu orang; ia berhenti wajar pada operator
 * kedua.
 *
 * ══ YANG DIATUR: TULISAN, BUKAN BACAAN ═════════════════════════════════════
 * Semua peran boleh MEMBACA seluruh konsol. Konsol hanya memajang metadata
 * (tidak pernah isi buku besar, tidak pernah rahasia), dan operator yang tidak
 * boleh melihat keadaan platform tidak bisa membantu siapa pun. Yang dibagi
 * per peran adalah TINDAKAN — dan tiap tindakan menyebut izinnya sendiri di
 * `requireOperatorActionSession(izin)`, ditegakkan
 * `tests/operator-roles.test.ts`.
 *
 * Kosakata peran dijaga dua kali: union di sini, dan CHECK constraint di
 * `operator_accounts.role`.
 */

export const OPERATOR_ROLES = ["owner", "billing", "support", "viewer"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const OPERATOR_PERMISSIONS = [
  /** Uang: tandai lunas, perpanjangan kompensasi, ganti paket, mode penagihan. */
  "tenant.billing",
  /** Suspensi & pemulihan manual. */
  "tenant.lifecycle",
  /** Bantuan pengguna: cabut sesi, kirim tautan atur ulang, kirim ulang undangan.
   *  Tidak pernah memegang rahasia — hanya meminta aplikasi mengirim tautan. */
  "tenant.users",
  /** Eksekusi penghapusan akun (UU PDP) — tidak bisa dibalik. */
  "tenant.delete",
  /** Isi halaman pendaratan. */
  "site.content",
  /** Kontak publik & instruksi transfer — mengubah ke mana UANG dikirim. */
  "site.settings",
  /** Pengaturan surel penyedia (kredensial SMTP). */
  "platform.mail",
  /** Membuat, mengubah, menonaktifkan akun operator & mencabut sesinya. */
  "operator.accounts",
] as const;
export type OperatorPermission = (typeof OPERATOR_PERMISSIONS)[number];

/**
 * Matriks. `owner` memegang semuanya; yang lain sesempit pekerjaannya.
 *
 * `site.settings` milik owner SAJA, bukan support: salah satu nilainya adalah
 * instruksi transfer manual — rekening tujuan pembayaran pelanggan. Mengubah
 * ke mana uang dikirim bukan pekerjaan dukungan.
 */
const MATRIKS: Record<OperatorRole, readonly OperatorPermission[]> = {
  owner: OPERATOR_PERMISSIONS,
  billing: ["tenant.billing"],
  support: ["tenant.lifecycle", "tenant.users", "site.content"],
  viewer: [],
};

export function isOperatorRole(value: unknown): value is OperatorRole {
  return typeof value === "string" && (OPERATOR_ROLES as readonly string[]).includes(value);
}

/** Peran yang tidak dikenal = NOL izin (gagal-tertutup), bukan galat. */
export function operatorCan(role: string, permission: OperatorPermission): boolean {
  return isOperatorRole(role) && MATRIKS[role].includes(permission);
}
