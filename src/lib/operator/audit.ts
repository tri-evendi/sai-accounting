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
 * Rumahnya `data/audit/operators/audit.jsonl` — pola persis `tenant-audit.ts`:
 * fs murni, tanpa Prisma, gagal menulis tidak menggagalkan operasinya, dan
 * bisa dialihkan lewat env untuk tes.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type OperatorAuditAction =
  | "operator.login"
  | "operator.login.failed"
  | "operator.logout";

export interface OperatorAuditEntry {
  id: string;
  /** Nama akun operator; percobaan gagal mencatat nama yang DIKETIK. */
  operator: string;
  action: OperatorAuditAction;
  details?: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

function auditFile(): { dir: string; file: string } {
  const dir = process.env.OPERATOR_AUDIT_DIR ?? path.join(process.cwd(), "data", "audit", "operators");
  return { dir, file: path.join(dir, "audit.jsonl") };
}

/** Tulis satu peristiwa. Gagal menulis dicatat ke log server, tidak melempar. */
export async function writeOperatorAuditLog(params: {
  operator: string;
  action: OperatorAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  const { dir, file } = auditFile();
  const entry: OperatorAuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    operator: params.operator.slice(0, 100),
    action: params.action,
    details: params.details,
    ipAddress: params.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    await mkdir(dir, { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[operator-audit] gagal menulis jejak:", error);
  }
}

/** Baca jejak, terbaru dulu — untuk halaman/audit kelak. Belum ada = kosong. */
export async function readOperatorAuditLogs(
  options: { limit?: number } = {}
): Promise<OperatorAuditEntry[]> {
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  let raw: string;
  try {
    raw = await readFile(auditFile().file, "utf8");
  } catch {
    return [];
  }

  const entries: OperatorAuditEntry[] = [];
  for (const line of raw.trim().split("\n").reverse()) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as OperatorAuditEntry);
    } catch {
      // baris korup dilewati — jejak lain tetap terbaca
    }
    if (entries.length >= limit) break;
  }
  return entries;
}
