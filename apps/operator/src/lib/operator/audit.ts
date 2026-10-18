/**
 * Jejak audit BIDANG OPERATOR (issue #154) — keluhan inti #154 adalah
 * "tindakan operator tidak meninggalkan jejak"; konsol ini lahir justru untuk
 * menutupnya, jadi jejaknya berdiri sejak hari pertama, bukan menunggu aksi
 * tulis (#155).
 *
 * Konsol #154 hanya-baca, maka yang dicatat di sini adalah peristiwa BIDANGNYA
 * sendiri: masuk (berhasil/gagal) dan keluar — siapa, dari IP mana, kapan.
 * Saat #155 menambah aksi tulis, aksi terhadap TENANT dicatat lewat
 * `writeTenantAuditLog` (jejak milik tenant, aktornya nama operator dari sesi
 * ini); jejak di berkas ini tetap merekam sisi operatornya.
 *
 * ══ RUMAHNYA: TABEL `operator_audit_logs` DI `sai_platform` ═══════════════
 * Sampai migration platform 0002 jejak ini di-`appendFile` ke
 * `data/audit/operators/audit.jsonl` di volume `audit`: dibaca UTUH setiap
 * kali, tanpa paginasi, tidak ikut `pg_dump`, dan terikat pada satu container
 * yang memasang volumenya — syarat yang harus dibereskan sebelum konsol
 * operator menjadi aplikasi sendiri (dok 14 §5). Isi berkas lama dipindahkan
 * `bun run migrate:operator-audit`.
 *
 * Gagal menulis TIDAK menggagalkan operasinya (pola `tenant-audit.ts`): jejak
 * adalah catatan tentang yang terjadi, bukan gerbang. Konsekuensinya dinyatakan
 * apa adanya — `sai_platform` yang mati berarti masuk konsol tetap bisa, dan
 * jejaknya hanya tertinggal di log server.
 */

import { platformDb } from "@sai/platform/platform-db";

export type OperatorAuditAction =
  | "operator.login"
  | "operator.login.failed"
  | "operator.logout"
  /* Pengaturan surel penyedia (#169) — perubahan & uji kirim. `details`-nya
   * memuat host/port/nama pengguna/alamat pengirim dan penanda "kata sandi
   * berganti", TIDAK PERNAH kata sandinya sendiri. */
  | "operator.mail.update"
  | "operator.mail.test"
  /* Isi halaman pendaratan (CMS). `details` memuat bahasa, bagian, dan DAFTAR
   * KUNCI yang berubah beserta panjang nilainya — tidak pernah nilainya
   * sendiri: jejak yang memuat setiap kalimat pemasaran yang pernah diketik
   * berhenti bisa dibaca sebagai jejak. `rejected` dicatat ketika sebuah
   * kiriman menyebut kunci di luar `landing.*`, yaitu kiriman yang tidak datang
   * dari layar yang dirender server. */
  | "operator.content.update"
  | "operator.content.rejected"
  /**
   * PENGATURAN SITUS (migration 0016): nomor WhatsApp, surel penjualan,
   * instruksi transfer manual. `details` memuat nilai LAMA dan BARU untuk dua
   * yang pertama — keduanya memang dipajang di halaman publik, jadi bukan
   * rahasia — dan untuk instruksi transfer hanya PANJANG + apakah ia terisi.
   *
   * Dicatat karena ia mengubah apa yang dilihat & dihubungi ORANG LUAR: nomor
   * yang salah ketik memutus seluruh corong penawaran tanpa satu pun galat.
   * `reset` = barisnya dihapus, ketiganya kembali ke environment.
   */
  | "operator.settings.update"
  | "operator.settings.reset"
  /**
   * AKUN OPERATOR (migration kendali 0004). `details` memuat nama akun
   * sasaran, peran sebelum/sesudah, dan aktif sebelum/sesudah — TIDAK PERNAH
   * kata sandi atau rahasia TOTP yang diterbitkan (keduanya hanya tampil
   * sekali di layar orang yang membuatnya).
   */
  | "operator.account.create"
  | "operator.account.role"
  | "operator.account.deactivate"
  | "operator.account.activate"
  | "operator.account.revoke"
  | "operator.account.reset"
  /** Unduhan CSV e-Faktur tagihan platform — periode + jumlah baris. */
  | "operator.efaktur.export"
  /** Pengumuman status dibuat / fasenya berpindah (migration platform 0004). */
  | "operator.status.create"
  | "operator.status.phase";

export interface OperatorAuditEntry {
  id: string;
  /** Nama akun operator; percobaan gagal mencatat nama yang DIKETIK. */
  operator: string;
  action: OperatorAuditAction;
  details?: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

/** Tulis satu peristiwa. Gagal menulis dicatat ke log server, tidak melempar. */
export async function writeOperatorAuditLog(params: {
  operator: string;
  action: OperatorAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await platformDb.operatorAuditLog.create({
      data: {
        operator: params.operator.slice(0, 100),
        action: params.action,
        details: params.details === undefined ? null : JSON.stringify(params.details),
        ipAddress: params.ipAddress ? params.ipAddress.slice(0, 45) : null,
      },
    });
  } catch (error) {
    console.error("[operator-audit] gagal menulis jejak:", error);
  }
}

/**
 * Sehalaman jejak, terbaru dulu, + totalnya — DIPAGINASI DI SQL.
 * `id` pemutus seri: dua peristiwa bisa berbagi milidetik yang sama.
 */
export async function readOperatorAuditPage(
  options: { limit?: number; skip?: number } = {}
): Promise<{ entries: OperatorAuditEntry[]; total: number }> {
  const take = Math.min(500, Math.max(1, options.limit ?? 100));
  const skip = Math.max(0, options.skip ?? 0);
  const [rows, total] = await Promise.all([
    platformDb.operatorAuditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    platformDb.operatorAuditLog.count(),
  ]);
  return {
    entries: rows.map((row) => ({
      id: String(row.id),
      operator: row.operator,
      action: row.action as OperatorAuditAction,
      details: parseDetails(row.details),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
}

/** Rincian yang tak terurai TIDAK menggagalkan pembacaan — satu baris rusak
 *  tidak boleh menyembunyikan jejak di sekitarnya. */
function parseDetails(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
