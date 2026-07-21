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
  | "fixed_asset.transfer";

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
  | "fixed_asset";

export type AuditLogEntry = {
  id: string;
  userId: string;
  username: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  details?: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
};

const AUDIT_DIR = path.join(process.cwd(), "data", "audit");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.jsonl");
const MAX_READ_LINES = 5000;

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

export async function readAuditLogs(options: {
  page?: number;
  perPage?: number;
  action?: string | null;
}): Promise<{
  logs: AuditLogEntry[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(50, Math.max(1, options.perPage ?? 20));

  let lines: string[] = [];
  try {
    const raw = await readFile(AUDIT_FILE, "utf8");
    lines = raw.trim().split("\n").filter(Boolean);
  } catch {
    return { logs: [], page, perPage, totalCount: 0, totalPages: 0 };
  }

  const recent = lines.slice(-MAX_READ_LINES).reverse();
  const entries: AuditLogEntry[] = [];

  for (const line of recent) {
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
