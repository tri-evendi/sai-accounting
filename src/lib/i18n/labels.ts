/**
 * Peta label enum yang MENGIKUTI BAHASA — versi multibahasa dari peta di
 * `src/lib/constants.ts`.
 *
 * Kenapa fungsi, bukan tiga objek per bahasa?
 *
 * MASTER.md (Anti-Patterns) melarang nilai enum DB tampil mentah dan menuntut
 * peta `Record<Type, string>` BERTIPE PENUH supaya `tsc` menolak nilai enum
 * baru yang belum punya label (issue #68). Kalau labelnya hidup di JSON, tipe
 * itu hilang: JSON hanya `Record<string, string>`, dan status baru bisa lolos
 * tanpa label di ketiga bahasa sekaligus.
 *
 * Maka bentuknya dibalik: TEKS tetap di kamus (satu tempat untuk penerjemah),
 * tetapi BENTUK peta ditegakkan di sini oleh literal objek yang beranotasi
 * `Record<Type, string>`. Menambah satu `DocumentType` baru langsung
 * memerahkan berkas ini — sekali, untuk ketiga bahasa — dan `tsc` juga menolak
 * bila kunci kamusnya belum ada. Persis jaminan issue #68, dikalikan tiga.
 *
 * Tanpa kamus (mis. komponen client di luar `LocaleProvider`), semuanya jatuh
 * ke peta bahasa Indonesia di `constants.ts` — tak pernah ke nilai mentah DB.
 */

import {
  CASH_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_FILTER_LABELS,
  type CashType,
  type ContractStatus,
  type DocumentType,
  type SystemRole,
} from "@/lib/constants";
import { ACCOUNT_TYPES } from "@/lib/accounting";
import {
  APPROVAL_DOCUMENT_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  decisionMessage,
  type ApprovalDocumentType,
  type ApprovalStatus,
} from "@/lib/approvals";
import { MONTH_NAMES } from "@/lib/month-names";
import { TERM_CATEGORY_LABELS, type TermCategory } from "@/lib/labels";
import type { Permission } from "@/lib/authz";
import {
  PERMISSION_LABELS,
  RESOURCE_LABELS,
  type PermissionResource,
} from "@/lib/authz-labels";
import type { Dictionary } from "./dictionary";

/**
 * Label tipe akun (bagan akun). Sumber bentuknya `ACCOUNT_TYPES` di
 * `lib/accounting.ts` — tipe akun baru yang belum punya kunci kamus langsung
 * ditolak `tsc` di sini, persis seperti peta enum lain di berkas ini.
 */
export function accountTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<string, string> {
  if (!dictionary) return Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t.label]));
  const d = dictionary.accountType;
  return {
    cash_bank: d.cash_bank,
    account_receivable: d.account_receivable,
    inventory: d.inventory,
    other_current_asset: d.other_current_asset,
    fixed_asset: d.fixed_asset,
    accumulated_depreciation: d.accumulated_depreciation,
    other_asset: d.other_asset,
    account_payable: d.account_payable,
    tax_payable: d.tax_payable,
    other_current_liability: d.other_current_liability,
    long_term_liability: d.long_term_liability,
    equity: d.equity,
    revenue: d.revenue,
    other_income: d.other_income,
    cogs: d.cogs,
    expense: d.expense,
    other_expense: d.other_expense,
  };
}

/** Satu label tipe akun; nilai tak dikenal dikembalikan apa adanya. */
export function accountTypeLabel(
  dictionary: Dictionary | null | undefined,
  value: string
): string {
  return accountTypeLabels(dictionary)[value] ?? value;
}

/**
 * Nama bulan, urut Januari→Desember (indeks 0 = Januari, seperti
 * `MONTH_NAMES`). `lib/month-names.ts` bebas Prisma, jadi cadangan bahasa
 * Indonesianya aman diimpor komponen client — sama seperti `constants.ts`.
 */
export function monthNames(dictionary: Dictionary | null | undefined): readonly string[] {
  if (!dictionary) return MONTH_NAMES;
  const m = dictionary.month;
  return [m.m1, m.m2, m.m3, m.m4, m.m5, m.m6, m.m7, m.m8, m.m9, m.m10, m.m11, m.m12];
}

/** Label peran SISTEM. Peran kustom (data, tabel `roles`) tetap ambil label dari DB. */
export function roleLabels(dictionary: Dictionary | null | undefined): Record<SystemRole, string> {
  if (!dictionary) {
    return {
      managing_director: ROLE_LABELS.managing_director,
      finance_manager: ROLE_LABELS.finance_manager,
      warehouse_head: ROLE_LABELS.warehouse_head,
      administrator: ROLE_LABELS.administrator,
    };
  }
  return {
    managing_director: dictionary.role.managing_director,
    finance_manager: dictionary.role.finance_manager,
    warehouse_head: dictionary.role.warehouse_head,
    administrator: dictionary.role.administrator,
  };
}

/** Label status kontrak/dokumen (nilai DB tidak ikut berubah). */
export function contractStatusLabels(
  dictionary: Dictionary | null | undefined
): Record<ContractStatus, string> {
  if (!dictionary) return CONTRACT_STATUS_LABELS;
  return {
    signed: dictionary.status.contract.signed,
    pending: dictionary.status.contract.pending,
    canceled: dictionary.status.contract.canceled,
  };
}

/** Label tombol saringan status, termasuk pilihan "semua". */
export function statusFilterLabels(
  dictionary: Dictionary | null | undefined
): Record<string, string> {
  if (!dictionary) return STATUS_FILTER_LABELS;
  return {
    all: dictionary.status.all,
    ...contractStatusLabels(dictionary),
  };
}

/** Label jenis dokumen ekspor (B/L, COO, …). */
export function documentTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<DocumentType, string> {
  if (!dictionary) return DOCUMENT_TYPE_LABELS;
  return {
    bl: dictionary.documentType.bl,
    invoice: dictionary.documentType.invoice,
    coo: dictionary.documentType.coo,
    fumigation: dictionary.documentType.fumigation,
    contract: dictionary.documentType.contract,
    other: dictionary.documentType.other,
  };
}

/** Label jenis kas (bank / kas besar / kas kecil). */
export function cashTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<CashType, string> {
  if (!dictionary) return CASH_TYPE_LABELS;
  return {
    bank: dictionary.cashType.bank,
    kas_besar: dictionary.cashType.kas_besar,
    kas_kecil: dictionary.cashType.kas_kecil,
  };
}

/**
 * Label jenis dokumen yang bisa tertahan gerbang persetujuan (kontrak, faktur,
 * pembayaran). `lib/approvals.ts` MURNI — tanpa Prisma — jadi cadangan bahasa
 * Indonesianya aman ikut ke bundel peramban, sama seperti `constants.ts`.
 */
export function approvalDocumentTypeLabels(
  dictionary: Dictionary | null | undefined
): Record<ApprovalDocumentType, string> {
  if (!dictionary) return APPROVAL_DOCUMENT_TYPE_LABELS;
  return {
    contract: dictionary.approvalDocumentType.contract,
    invoice: dictionary.approvalDocumentType.invoice,
    payment: dictionary.approvalDocumentType.payment,
  };
}

/** Label status pengajuan persetujuan (draf → menunggu → disetujui/ditolak). */
export function approvalStatusLabels(
  dictionary: Dictionary | null | undefined
): Record<ApprovalStatus, string> {
  if (!dictionary) return APPROVAL_STATUS_LABELS;
  return {
    draft: dictionary.approvalStatus.draft,
    pending_approval: dictionary.approvalStatus.pending_approval,
    approved: dictionary.approvalStatus.approved,
    rejected: dictionary.approvalStatus.rejected,
  };
}

/**
 * Satu kalimat keadaan pengajuan — versi berbahasa dari `decisionMessage`
 * (`lib/approvals.ts`), yang tetap dipakai sebagai cadangan bahasa Indonesia
 * bila kamusnya tidak ada.
 */
export function approvalDecisionMessage(
  dictionary: Dictionary | null | undefined,
  request: { status: string; documentType: string; documentNo?: string | null }
): string {
  if (!dictionary) return decisionMessage(request);
  const kind =
    approvalDocumentTypeLabels(dictionary)[request.documentType as ApprovalDocumentType] ??
    request.documentType;
  const document = `${kind}${request.documentNo ? ` ${request.documentNo}` : ""}`;
  const m = dictionary.approvalMessage;
  const template =
    request.status === "approved"
      ? m.approved
      : request.status === "rejected"
      ? m.rejected
      : request.status === "pending_approval"
      ? m.pending
      : m.draft;
  return template.replace("{document}", document);
}

/**
 * Nama kelompok baris matriks izin. Bentuknya ditegakkan literal seperti peta
 * lain di berkas ini: resource baru di `authz.ts` langsung memerahkan berkas
 * ini di ketiga bahasa sekaligus (jaminan issue #73 dikali tiga).
 * `lib/authz-labels.ts` MURNI — aman diimpor komponen client.
 */
export function permissionResourceLabels(
  dictionary: Dictionary | null | undefined
): Record<PermissionResource, string> {
  if (!dictionary) return RESOURCE_LABELS;
  const r = dictionary.permissionResource;
  return {
    company: r.company,
    approval: r.approval,
    approval_rule: r.approval_rule,
    contract: r.contract,
    invoice: r.invoice,
    delivery_order: r.delivery_order,
    receivable: r.receivable,
    return: r.return,
    customer: r.customer,
    consignee: r.consignee,
    document: r.document,
    supplier: r.supplier,
    payable: r.payable,
    advance: r.advance,
    purchase: r.purchase,
    cash: r.cash,
    reconciliation: r.reconciliation,
    inventory: r.inventory,
    fixed_asset: r.fixed_asset,
    report: r.report,
    budget: r.budget,
    tax: r.tax,
    account: r.account,
    cost_center: r.cost_center,
    journal: r.journal,
    ledger: r.ledger,
    period: r.period,
    setup: r.setup,
    user: r.user,
    audit: r.audit,
    company_setting: r.company_setting,
    authz: r.authz,
    glossary: r.glossary,
    settings: r.settings,
  };
}

/** Satu kalimat per izin: apa yang BOLEH dilakukan pemegangnya. */
export function permissionLabels(
  dictionary: Dictionary | null | undefined
): Record<Permission, string> {
  if (!dictionary) return PERMISSION_LABELS;
  const p = dictionary.permission;
  return {
    "company.create": p.company_create,
    "approval.view": p.approval_view,
    "approval.decide": p.approval_decide,
    "approval_rule.manage": p.approval_rule_manage,
    "contract.read": p.contract_read,
    "contract.write": p.contract_write,
    "contract.delete": p.contract_delete,
    "invoice.read": p.invoice_read,
    "invoice.write": p.invoice_write,
    "invoice.delete": p.invoice_delete,
    "delivery_order.read": p.delivery_order_read,
    "delivery_order.write": p.delivery_order_write,
    "receivable.read": p.receivable_read,
    "return.read": p.return_read,
    "return.write": p.return_write,
    "customer.read": p.customer_read,
    "customer.write": p.customer_write,
    "customer.delete": p.customer_delete,
    "consignee.read": p.consignee_read,
    "consignee.write": p.consignee_write,
    "consignee.delete": p.consignee_delete,
    "document.read": p.document_read,
    "document.write": p.document_write,
    "supplier.read": p.supplier_read,
    "supplier.write": p.supplier_write,
    "supplier.delete": p.supplier_delete,
    "payable.read": p.payable_read,
    "advance.read": p.advance_read,
    "advance.write": p.advance_write,
    "advance.delete": p.advance_delete,
    "purchase.write": p.purchase_write,
    "purchase.delete": p.purchase_delete,
    "cash.read": p.cash_read,
    "cash.write": p.cash_write,
    "reconciliation.read": p.reconciliation_read,
    "reconciliation.write": p.reconciliation_write,
    "inventory.read": p.inventory_read,
    "inventory.write": p.inventory_write,
    "fixed_asset.read": p.fixed_asset_read,
    "fixed_asset.write": p.fixed_asset_write,
    "report.read": p.report_read,
    "report.export": p.report_export,
    "budget.manage": p.budget_manage,
    "tax.read": p.tax_read,
    "account.read": p.account_read,
    "account.manage": p.account_manage,
    "cost_center.read": p.cost_center_read,
    "cost_center.manage": p.cost_center_manage,
    "journal.read": p.journal_read,
    "journal.write": p.journal_write,
    "ledger.read": p.ledger_read,
    "period.manage": p.period_manage,
    "setup.manage": p.setup_manage,
    "user.manage": p.user_manage,
    "audit.read": p.audit_read,
    "company_setting.manage": p.company_setting_manage,
    "authz.manage": p.authz_manage,
    "glossary.read": p.glossary_read,
    "settings.view": p.settings_view,
  };
}

/**
 * Nama kategori Kamus Istilah. Sumber bentuknya `TERM_CATEGORIES`
 * (`lib/labels.ts`, modul murni): kategori baru langsung ditolak `tsc` di sini.
 */
export function termCategoryLabels(
  dictionary: Dictionary | null | undefined
): Record<TermCategory, string> {
  if (!dictionary) return TERM_CATEGORY_LABELS;
  const c = dictionary.termCategory;
  return {
    penjualan: c.penjualan,
    pembelian: c.pembelian,
    kas: c.kas,
    stok: c.stok,
    laporan: c.laporan,
    pajak: c.pajak,
    umum: c.umum,
  };
}
