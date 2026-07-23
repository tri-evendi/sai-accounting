import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

export type AuditAction =
  | "finance.create"
  | "stock.in"
  | "stock.out"
  | "item.create"
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
   * app ini (termasuk pemberian peran bos) dulunya justru TIDAK diaudit.
   * `user.update` mencatat field yang berubah (roleFrom→roleTo, resetPassword)
   * — tidak pernah nilai kata sandinya.
   */
  | "user.create"
  | "user.update"
  | "user.delete";

export type AuditEntity =
  | "cash_account"
  | "stock"
  | "item"
  | "supplier_transaction"
  | "user"
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
  | "approval_rule";

export type AuditLogEntry = {
  id: string;
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

const AUDIT_DIR = path.join(process.cwd(), "data", "audit");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.jsonl");

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
  const entry: AuditLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    await mkdir(AUDIT_DIR, { recursive: true });
    await appendFile(AUDIT_FILE, `${JSON.stringify(entry)}\n`, "utf8");
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
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(50, Math.max(1, options.perPage ?? 20));

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
    const raw = await readFile(AUDIT_FILE, "utf8");
    lines = raw.trim().split("\n").filter(Boolean);
  } catch {
    const page = Math.max(1, options.page ?? 1);
    const perPage = Math.min(50, Math.max(1, options.perPage ?? 20));
    return { logs: [], page, perPage, totalCount: 0, totalPages: 0 };
  }
  return paginateAuditLines(lines, options);
}
