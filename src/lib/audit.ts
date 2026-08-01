import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { currentCompany } from "@/lib/current-company";

export type AuditAction =
  /** Perusahaan baru dibuat dari aplikasi — basis datanya ikut lahir (#104). */
  | "company.create"
  | "finance.create"
  | "stock.in"
  | "stock.out"
  | "item.create"
  /// Barang dinonaktifkan/diaktifkan lagi — bukan dihapus (docs/DATABASE.md §1.3).
  | "item.activate"
  | "item.deactivate"
  | "supplier_transaction.purchase"
  | "supplier_transaction.payment"
  /** Re-allocating an existing payment across purchases (issue #38). No journal. */
  | "supplier_transaction.allocate"
  | "auth.password_change"
  | "period.close"
  | "period.reopen"
  /** Recording uang muka received/paid before any invoice exists (issue #26). */
  | "advance.create"
  | "advance.cancel"
  /** Compensating an advance into an invoice/purchase. Posts its own journal. */
  | "advance.apply"
  | "advance.unapply"
  /** Bank reconciliation (issue #24) — none of these post a journal. */
  | "reconciliation.create"
  | "reconciliation.line.add"
  | "reconciliation.import"
  | "reconciliation.match"
  | "reconciliation.unmatch"
  | "reconciliation.lock"
  | "reconciliation.reopen"
  /** Retur penjualan & pembelian (issue #27). Each posts its own journal. */
  | "sales_return.create"
  | "purchase_return.create"
  /** Setup perusahaan + saldo awal (issue #20). Posts the opening journal, once. */
  | "setup.create"
  /** Aset tetap (issue #28). Depreciation & disposal post journals; the rest don't. */
  | "fixed_asset.category.create"
  | "fixed_asset.create"
  | "fixed_asset.depreciate"
  | "fixed_asset.dispose"
  | "fixed_asset.transfer"
  /** Surat Jalan / Delivery Order (issue #14). Reduces stock; HPP via stock-out. */
  | "delivery_order.create"
  /**
   * Faktur ditarik ("Ambil") dari sebuah kontrak (issue #15). Consumes part of an
   * outstanding contract promise. Posts NO new journal — a pulled faktur posts
   * exactly as a normal faktur does; only the document link is new.
   */
  | "invoice.pull_from_contract"
  /**
   * Approval transaksi (issue #25). `approval.request` is raised by the document
   * route when a value crosses the ambang; `approval.approve` is the ONLY action
   * here that reaches the ledger — it releases the withheld journal through
   * `postForSource`. Rejecting posts nothing. Marking a decision as read is
   * deliberately NOT audited: it is the requester dismissing their own
   * notification, not a change to the record.
   */
  | "approval.request"
  | "approval.approve"
  | "approval.reject"
  /**
   * Persetujuan yang GUGUR karena dokumennya diedit melampaui nilai yang
   * disetujui (issue #45). Bukan penolakan oleh manusia: tak ada penyetuju yang
   * memutuskan apa pun di sini, dokumennya sendiri yang berubah sehingga restu
   * lama tak lagi berlaku. Jurnalnya ditarik oleh `repostForSource`.
   */
  | "approval.revoke"
  /**
   * Dokumen yang ditolak diajukan ulang setelah diperbaiki (issue #44). Tidak
   * menerbitkan jurnal apa pun — hanya mengembalikan dokumen ke antrean.
   */
  | "approval.resubmit"
  | "approval.rule.create"
  | "approval.rule.update"
  | "approval.rule.deactivate"
  /**
   * Wizard terpandu Penjualan/Pembelian Baru (issue #5). Penanda TAMBAHAN, bukan
   * pengganti: dokumen yang dibuat wizard tetap menulis entri normalnya sendiri
   * (`delivery_order.create`, `supplier_transaction.purchase`, `stock.in`, …),
   * jadi jejaknya identik dengan formulir biasa. Entri ini hanya merekam bahwa
   * seluruhnya lahir dari satu transaksi wizard, dan berapa dokumen di dalamnya.
   * Wizard tidak memposting apa pun sendiri — jurnalnya dari `postForSource`.
   */
  | "wizard.sales"
  | "wizard.purchase"
  /**
   * Manajemen pengguna (audit RBAC fase 3). Mutasi paling ber-privilege di
   * app ini (termasuk pemberian peran berakses penuh) dulunya justru TIDAK
   * diaudit.
   * `user.update` mencatat field yang berubah (roleFrom→roleTo, resetPassword)
   * — tidak pernah nilai kata sandinya.
   */
  | "user.create"
  | "user.update"
  | "user.delete"
  /**
   * Matriks izin dikonfigurasi dari UI (issue #73). `authz.override.update`
   * mencatat set override yang DISIMPAN (peran × izin × boleh/tidak — tidak
   * pernah ada rahasia di sini); `authz.override.reset` = kembali persis ke
   * matriks bawaan di kode (semua baris override dihapus).
   */
  | "authz.override.update"
  | "authz.override.reset"
  /**
   * Izin khusus per pengguna (issue #75). `user.authz.override.update`
   * mencatat set override yang DISIMPAN untuk seorang pengguna (izin ×
   * boleh/tidak — tidak pernah ada rahasia); `user.authz.override.reset` =
   * pengguna kembali mengikuti perannya sepenuhnya (semua barisnya dihapus).
   */
  | "user.authz.override.update"
  | "user.authz.override.reset"
  /**
   * Peran dinamis — CRUD peran dari UI (/permissions). `role.create`/`update`/
   * `delete` mencatat key + label + perubahan; menghapus peran juga membuang
   * baris override izinnya.
   */
  | "role.create"
  | "role.update"
  | "role.delete"
  /**
   * Modul per kategori usaha (issue #99). Mencatat himpunan modul yang
   * DISIMPAN beserta keadaan sebelumnya — jejak yang menjawab "sejak kapan
   * menu itu hilang, dan siapa yang mematikannya". Tidak menyentuh satu baris
   * jurnal pun, dan tidak mengubah izin siapa pun.
   */
  | "company_setting.modules.update"
  /**
   * Unggah dokumen (lampiran kontrak/faktur). Tidak menyentuh jurnal — tapi
   * menulis berkas ke server, dan setiap route yang menulis wajib meninggalkan
   * jejak.
   */
  | "document.upload";

export type AuditEntity =
  /** Baris `companies` di basis data KENDALI — bukan tabel di buku perusahaan. */
  | "company"
  | "cash_movement"
  | "stock"
  | "item"
  | "supplier_transaction"
  | "user"
  | "role"
  | "period"
  | "advance_payment"
  | "advance_application"
  | "bank_statement"
  | "bank_statement_line"
  | "sales_return"
  | "purchase_return"
  | "company_settings"
  | "fixed_asset_category"
  | "fixed_asset"
  | "delivery_order"
  | "invoice"
  /** Approval transaksi (issue #25). */
  | "approval_request"
  | "approval_rule"
  /** Override matriks izin (issue #73). */
  | "role_permission_override"
  /** Izin khusus per pengguna (issue #75). */
  | "user_permission_override"
  /** Dokumen unggahan (lampiran). */
  | "document";

export type AuditLogEntry = {
  id: string;
  /** Perusahaan tempat tindakan ini terjadi (issue #104). */
  companyId?: number;
  companySlug?: string;
  userId: string;
  username: string;
  /** Peran aktor SAAT beraksi (audit RBAC fase 3) — peran bisa berubah, jejak tidak. */
  role?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  details?: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
};

/**
 * Jejak audit DIPISAH PER PERUSAHAAN (issue #104): `data/audit/<slug>/audit.jsonl`.
 *
 * Kenapa berkas terpisah, bukan satu berkas dengan kolom `companyId`. Layar
 * Audit hanya boleh memperlihatkan jejak perusahaan yang sedang dibuka —
 * "siapa mengubah faktur siapa" adalah informasi yang paling tidak boleh
 * menyeberang. Dengan satu berkas bersama, kebenaran itu bergantung pada satu
 * penyaring yang harus diingat setiap pembaca; dengan berkas terpisah, pembaca
 * yang lupa menyaring TIDAK PUNYA apa-apa untuk bocor. Pemisahan yang sama
 * dengan alasan basis data per perusahaan.
 *
 * Berkas lama `data/audit/audit.jsonl` (sebelum multi-perusahaan) dibiarkan di
 * tempatnya dan tetap terbaca sebagai jejak perusahaan yang diadopsi — lihat
 * `scripts/adopt-existing-company.ts`, yang memindahkannya ke folder slug-nya.
 */
const AUDIT_ROOT = path.join(process.cwd(), "data", "audit");

async function auditPaths(): Promise<{ dir: string; file: string; companyId: number }> {
  const { slug, companyId } = await currentCompany();
  const dir = path.join(AUDIT_ROOT, slug);
  return { dir, file: path.join(dir, "audit.jsonl"), companyId };
}

export function getClientIp(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

export async function writeAuditLog(params: {
  userId: string;
  username: string;
  /** Peran aktor saat beraksi — isi dari session.user.role (fase 3). */
  role?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  const { dir, file, companyId } = await auditPaths();
  const slug = path.basename(dir);
  const entry: AuditLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    companyId,
    companySlug: slug,
    userId: params.userId,
    username: params.username.slice(0, 50),
    role: params.role,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    details: params.details,
    ipAddress: getClientIp(params.request),
    createdAt: new Date().toISOString(),
  };

  try {
    await mkdir(dir, { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}

export interface AuditPage {
  logs: AuditLogEntry[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
}

/**
 * Pure pagination over raw JSONL lines (issue #60). Extracted so the paging
 * rules are unit-testable without touching the filesystem.
 *
 * Paginates over ALL lines, newest first — no arbitrary window. The previous
 * `slice(-5000)` cap silently hid older entries and undercounted `totalCount`,
 * so the UI showed fewer pages than existed. The whole file is read anyway, so
 * removing the cap costs nothing beyond parsing (cheap for small JSON lines).
 */
export function paginateAuditLines(
  lines: string[],
  options: { page?: number; perPage?: number; action?: string | null }
): AuditPage {
  // NaN-safe: `Math.max(1, NaN)` tetap NaN dan `slice(NaN, NaN)` mengembalikan
  // [] — halaman yang tak bisa diurai jatuh ke bawaan, bukan ke daftar kosong.
  const rawPage = options.page ?? 1;
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const rawPerPage = options.perPage ?? 20;
  const perPage = Number.isFinite(rawPerPage) ? Math.min(50, Math.max(1, rawPerPage)) : 20;

  const ordered = [...lines].reverse();
  const entries: AuditLogEntry[] = [];
  for (const line of ordered) {
    try {
      const parsed = JSON.parse(line) as AuditLogEntry;
      if (options.action && parsed.action !== options.action) continue;
      entries.push(parsed);
    } catch {
      // skip corrupt lines
    }
  }

  const totalCount = entries.length;
  const totalPages = Math.ceil(totalCount / perPage) || 0;
  const logs = entries.slice((page - 1) * perPage, page * perPage);
  return { logs, page, perPage, totalCount, totalPages };
}

export async function readAuditLogs(options: {
  page?: number;
  perPage?: number;
  action?: string | null;
}): Promise<AuditPage> {
  let lines: string[] = [];
  try {
    const raw = await readFile((await auditPaths()).file, "utf8");
    lines = raw.trim().split("\n").filter(Boolean);
  } catch {
    // Sanitasi sama dengan paginateAuditLines — termasuk aman terhadap NaN.
    const rawPage = options.page ?? 1;
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const rawPerPage = options.perPage ?? 20;
    const perPage = Number.isFinite(rawPerPage) ? Math.min(50, Math.max(1, rawPerPage)) : 20;
    return { logs: [], page, perPage, totalCount: 0, totalPages: 0 };
  }
  return paginateAuditLines(lines, options);
}
