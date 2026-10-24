/**
 * PEMILIK / SEKUTU — tulis ke buku (bentuk usaha, 24 Okt 2026).
 *
 * Dipakai Pengaturan → Bentuk usaha. Menyimpan SELURUH daftar sekaligus dalam
 * satu transaksi: porsi laba harus berjumlah 100% pada setiap keadaan
 * tersimpan, dan sekutu BARU lahir bersama akun Modal & Prive-nya — sekutu
 * tanpa akun tidak bisa menerima bagian laba saat tutup buku.
 *
 * TIDAK PERNAH menyentuh jurnal: mengganti porsi berlaku untuk tutup buku
 * BERIKUTNYA; tahun yang sudah ditutup memakai porsi yang tercatat di jurnal
 * penutupnya (dan di jejak audit `year_close.run`).
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { normalBalanceFor } from "@/lib/accounting";
import {
  nextChildCode,
  PARTNER_CAPITAL_PARENT,
  PARTNER_DRAWING_PARENT,
  partnerAccountName,
  validatePartners,
  type PartnerIssue,
} from "@/lib/partners";
import { equityModelFor, usesPartnerRoles, type LegalForm, type PartnerRole } from "@sai/core/legal-form";
import type { Prisma } from "@sai/db/client/company";

type Tx = Prisma.TransactionClient;

export interface PartnerView {
  id: number;
  name: string;
  role: string | null;
  shareBp: number;
  isActive: boolean;
  capitalAccount: { code: string; name: string } | null;
  drawingAccount: { code: string; name: string } | null;
}

/** Daftar pemilik/sekutu beserta akunnya, urutan tampil. */
export async function listPartners(): Promise<PartnerView[]> {
  const rows = await prisma.companyPartner.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const ids = rows.flatMap((r) => [r.capitalAccountId, ...(r.drawingAccountId ? [r.drawingAccountId] : [])]);
  const accounts = ids.length
    ? await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } })
    : [];
  const byId = new Map(accounts.map((a) => [a.id, { code: a.code, name: a.name }]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    shareBp: r.shareBp,
    isActive: r.isActive,
    capitalAccount: byId.get(r.capitalAccountId) ?? null,
    drawingAccount: r.drawingAccountId ? (byId.get(r.drawingAccountId) ?? null) : null,
  }));
}

export interface PartnerSaveRow {
  id?: number;
  name: string;
  role?: PartnerRole | null;
  shareBp: number;
  isActive: boolean;
}

export class PartnerSaveError extends Error {
  constructor(readonly issues: (PartnerIssue | "partnersNotForThisForm" | "partnerUnknown" | "partnersIncomplete" | "parentCodeTaken")[]) {
    super(issues.join(", "));
    this.name = "PartnerSaveError";
  }
}

/** Induk akun ekuitas — dipakai bila ada, dibuat bila belum. */
async function ensureParent(tx: Tx, code: string, name: string): Promise<number> {
  const found = await tx.account.findUnique({ where: { code }, select: { id: true, type: true } });
  if (found) {
    /* Kode induk dipakai akun yang BUKAN ekuitas (bagan akun yang disesuaikan):
       menaruh modal sekutu di bawahnya akan memindahkan ekuitas ke kelompok
       lain di Neraca. Ditolak; pemiliknya memilih sendiri lewat Bagan Akun. */
    if (found.type !== "equity") throw new PartnerSaveError(["parentCodeTaken"]);
    return found.id;
  }
  const created = await tx.account.create({
    data: { code, name, type: "equity", currency: "IDR", normalBalance: normalBalanceFor("equity"), isActive: true },
    select: { id: true },
  });
  return created.id;
}

/** Akun anak baru di bawah `parent` untuk satu sekutu. */
async function createChild(tx: Tx, parent: { code: string; id: number }, name: string): Promise<{ id: number; code: string }> {
  const taken = await tx.account.findMany({
    where: { code: { startsWith: parent.code } },
    select: { code: true },
  });
  const code = nextChildCode(parent.code, taken.map((a) => a.code));
  const a = await tx.account.create({
    data: {
      code,
      name,
      type: "equity",
      currency: "IDR",
      parentId: parent.id,
      normalBalance: normalBalanceFor("equity"),
      isActive: true,
    },
    select: { id: true, code: true },
  });
  return a;
}

export interface PartnerSaveResult {
  created: { id: number; name: string; capitalCode: string; drawingCode: string }[];
  updated: { id: number; before: Omit<PartnerSaveRow, "id">; after: Omit<PartnerSaveRow, "id"> }[];
}

/**
 * Simpan seluruh daftar pemilik/sekutu. Aturan `validatePartners` berlaku
 * atas yang AKTIF; yang nonaktif boleh berporsi berapa pun (tidak ikut tutup
 * buku) tetapi disimpan 0 supaya tidak menyesatkan pembacanya.
 */
export async function savePartners(form: LegalForm, rows: readonly PartnerSaveRow[]): Promise<PartnerSaveResult> {
  if (equityModelFor(form) === "retained_earnings") throw new PartnerSaveError(["partnersNotForThisForm"]);
  const normalized = rows.map((r) => ({
    ...r,
    name: r.name.trim(),
    role: usesPartnerRoles(form) ? (r.role ?? null) : null,
    shareBp: r.isActive ? r.shareBp : 0,
  }));
  const issues = validatePartners(
    form,
    normalized.filter((r) => r.isActive)
  );
  if (issues.length > 0) throw new PartnerSaveError(issues);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.companyPartner.findMany();
    const byId = new Map(existing.map((p) => [p.id, p]));
    for (const r of normalized) {
      if (r.id !== undefined && !byId.has(r.id)) throw new PartnerSaveError(["partnerUnknown"]);
    }
    /* SELURUH daftar, bukan sebagian: sekutu aktif yang tidak disebut akan
       tetap memegang porsinya, dan jumlahnya tidak lagi 100%. */
    const sent = new Set(normalized.flatMap((r) => (r.id === undefined ? [] : [r.id])));
    if (existing.some((p) => !sent.has(p.id))) throw new PartnerSaveError(["partnersIncomplete"]);

    const result: PartnerSaveResult = { created: [], updated: [] };
    let capitalParent: { code: string; id: number } | null = null;
    let drawingParent: { code: string; id: number } | null = null;

    for (const [i, r] of normalized.entries()) {
      if (r.id !== undefined) {
        const before = byId.get(r.id)!;
        const changed =
          before.name !== r.name ||
          before.role !== r.role ||
          before.shareBp !== r.shareBp ||
          before.isActive !== r.isActive ||
          before.sortOrder !== i;
        if (!changed) continue;
        await tx.companyPartner.update({
          where: { id: r.id },
          data: { name: r.name, role: r.role, shareBp: r.shareBp, isActive: r.isActive, sortOrder: i },
        });
        result.updated.push({
          id: r.id,
          before: { name: before.name, role: before.role as PartnerRole | null, shareBp: before.shareBp, isActive: before.isActive },
          after: { name: r.name, role: r.role, shareBp: r.shareBp, isActive: r.isActive },
        });
        continue;
      }
      capitalParent ??= {
        code: PARTNER_CAPITAL_PARENT.code,
        id: await ensureParent(tx, PARTNER_CAPITAL_PARENT.code, PARTNER_CAPITAL_PARENT.name),
      };
      drawingParent ??= {
        code: PARTNER_DRAWING_PARENT.code,
        id: await ensureParent(tx, PARTNER_DRAWING_PARENT.code, PARTNER_DRAWING_PARENT.name),
      };
      const capital = await createChild(tx, capitalParent, partnerAccountName("capital", r.name));
      const drawing = await createChild(tx, drawingParent, partnerAccountName("drawing", r.name));
      const row = await tx.companyPartner.create({
        data: {
          name: r.name,
          role: r.role,
          shareBp: r.shareBp,
          isActive: r.isActive,
          sortOrder: i,
          capitalAccountId: capital.id,
          drawingAccountId: drawing.id,
        },
        select: { id: true },
      });
      result.created.push({ id: row.id, name: r.name, capitalCode: capital.code, drawingCode: drawing.code });
    }
    return result;
  });
}
