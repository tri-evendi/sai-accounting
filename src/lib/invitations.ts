/**
 * Undangan staf lewat email (issue #139) — LOGIKA MURNI.
 *
 * Alur yang digantikan: admin mengetik kata sandi staf lalu mengirimkannya
 * lewat WhatsApp — kata sandi yang bocor sebelum dipakai. Gantinya: undangan
 * berisi tautan berbatas waktu; penerima menentukan kata sandinya SENDIRI.
 *
 * ══ TIGA DUNIA, SATU JAWABAN KELUAR ═════════════════════════════════════════
 * Sebuah email yang diundang bisa berada di tiga keadaan, dan HTTP menjawab
 * IDENTIK untuk ketiganya ("undangan sudah dikirim") — jawaban yang berbeda
 * ADALAH kebocoran enumerasinya (docs/MULTI-TENANT.md §7.3). Yang berbeda
 * hanya isi SURELNYA:
 *
 *   invite_new_user      → belum punya akun: tautan "buat kata sandi Anda"
 *   add_existing_member  → sudah punya akun DI TENANT INI: langsung
 *                          ditambahkan ke PT-nya (`addExistingUserToCompany`),
 *                          surelnya "Anda ditambahkan, klik untuk membuka"
 *   reject_cross_tenant  → akun milik TENANT LAIN: DITOLAK — user milik tepat
 *                          satu tenant (§2); surelnya menjelaskan ke PEMILIK
 *                          alamat (bukan ke pengundang) bahwa alamat ini tidak
 *                          bisa dipakai
 *
 * ══ TOKEN ═══════════════════════════════════════════════════════════════════
 * Pola `password-reset.ts` persis: 32 byte acak → hex, disimpan SHA-256-nya,
 * berbatas waktu, sekali pakai. TTL 7 hari — undangan menunggu orang yang
 * mungkin sedang cuti; tautan atur-ulang kata sandi menunggu orang yang sedang
 * menatap kotak masuknya.
 *
 * Logika keputusan di sini MURNI (diuji tests/invitations.test.ts); sambungan
 * basis datanya di `invitation-store.ts`.
 */

import { createHash, randomBytes } from "node:crypto";

import { usernameFromEmail } from "@/lib/registration";

/** Umur undangan: 7 hari. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** SHA-256 hex — bentuk yang disimpan; token mentah hanya hidup di surel. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token mentah baru (untuk surel) + jadwal kedaluwarsanya. */
export function mintInvitationToken(now: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
  };
}

export type InvitationVerdict = "valid" | "not_found" | "used" | "expired";

/** Keputusan MURNI atas satu baris undangan (atau ketiadaannya) — bentuk yang
 *  sama dengan `verdictForToken` milik atur-ulang kata sandi. */
export function invitationVerdict(
  row: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date()
): InvitationVerdict {
  if (!row) return "not_found";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export type InvitationOutcome =
  | "invite_new_user"
  | "add_existing_member"
  | "reject_cross_tenant";

/**
 * Dunia mana yang dihadapi undangan ini? MURNI — pemanggil memberi hasil
 * pencarian email, fungsi ini hanya menamai keadaannya. Ketiga hasil WAJIB
 * menghasilkan jawaban HTTP yang sama; yang boleh berbeda hanya surelnya.
 */
export function decideInvitationOutcome(
  emailOwner: { sameTenant: boolean } | null
): InvitationOutcome {
  if (!emailOwner) return "invite_new_user";
  return emailOwner.sameTenant ? "add_existing_member" : "reject_cross_tenant";
}

/**
 * Kuota `max_users` — MURNI, dan diperiksa SEBELUM email dilihat sama sekali.
 *
 * Urutan itu bagian dari anti-enumerasi: kalau kuota hanya menolak calon
 * pengguna BARU, maka "422 kuota" vs "200 terkirim" membocorkan apakah email
 * itu sudah punya akun di tenant ini. Karena itu saat kuota penuh SEMUA
 * undangan ditolak — termasuk yang hanya akan menambahkan orang lama ke PT
 * kedua (pembatasan berlebih yang disengaja dan murah; kuotanya milik tenant,
 * dan tenant yang penuh memang sedang tidak bisa menambah siapa pun tanpa
 * keputusan paket).
 *
 * Undangan yang MASIH MENUNGGU ikut dihitung: sepuluh undangan yang belum
 * diterima adalah sepuluh kursi yang sudah dijanjikan.
 */
export function userQuotaExceeded(input: {
  currentUsers: number;
  pendingInvitations: number;
  maxUsers: number;
}): boolean {
  return input.currentUsers + input.pendingInvitations >= input.maxUsers;
}

/**
 * Kandidat username untuk PENERIMA undangan (#159 temuan 4) — MURNI.
 *
 * Desain #139 menjadikan email pengenal; meminta username lagi di formulir
 * penerimaan menghidupkan kembali ruang nama yang §4.3 ingin pensiunkan.
 * Username DITURUNKAN dari email undangan (`usernameFromEmail`, aturan yang
 * sama dengan pendaftaran mandiri #138) — tapi berbeda dengan pendaftaran
 * (tenant baru, mustahil kembar), penerima undangan masuk ke tenant yang
 * SUDAH berisi orang, dan username unik per tenant (#136, lapisan aplikasi).
 * Dua email berbeda bisa menurunkan bagian lokal yang sama
 * (`budi@a.com` / `budi@b.co.id`), jadi tabrakannya diselesaikan
 * DETERMINISTIK: `budi`, `budi-2` … `budi-9`, lalu akhiran acak — pola yang
 * sama dengan `tenantSlugCandidates`. Basis dipangkas 43 huruf supaya
 * kandidat terpanjang (basis + "-" + 6 hex) tetap muat VarChar(50).
 */
export function invitationUsernameCandidates(email: string, randomSuffix?: string): string[] {
  const base = usernameFromEmail(email).slice(0, 43).replace(/[-._]+$/g, "") || "pengguna";
  const suffix = randomSuffix ?? randomBytes(3).toString("hex");
  return [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`), `${base}-${suffix}`];
}
