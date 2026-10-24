/**
 * BACAAN konsol operator untuk PENAWARAN MASUK (`lead_requests`, migration
 * platform 0016) — daftar kerja dari formulir halaman publik.
 *
 * HANYA-BACA (tulisannya di `lead-writes.ts`) dan TAHAN MATI, pola
 * `activationRequestsForOperator`: platform yang tak terjangkau — atau tabel
 * yang belum dimigrasikan — memulangkan `null`, dan halamannya mengatakannya
 * sebagai kalimat, bukan 500. Klien disuntikkan supaya teruji tanpa basis data.
 */

import "server-only";

import type { Prisma } from "@sai/db/client/platform";
import { platformDb } from "@sai/platform/platform-db";
import { LEAD_STATUSES, normalizeLeadReference, type LeadStatus } from "@sai/core/lead-request";

type PlatformClient = typeof platformDb;

export interface OperatorLeadRow {
  id: number;
  reference: string;
  kind: string;
  name: string;
  company: string;
  phone: string;
  email: string | null;
  legalForm: string | null;
  companyCount: number | null;
  message: string | null;
  consentAt: Date;
  source: string;
  locale: string | null;
  status: string;
  handledBy: string | null;
  handledAt: Date | null;
  notes: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
}

const SELECT = {
  id: true,
  reference: true,
  kind: true,
  name: true,
  company: true,
  phone: true,
  email: true,
  legalForm: true,
  companyCount: true,
  message: true,
  consentAt: true,
  source: true,
  locale: true,
  status: true,
  handledBy: true,
  handledAt: true,
  notes: true,
  anonymizedAt: true,
  createdAt: true,
} as const;

/**
 * Saringan pencarian: nomor rujukan PERSIS bila teksnya berbentuk rujukan
 * (`sai-7k3m9q` pun diterima), selainnya potongan nama, perusahaan, nomor,
 * atau surel. Nomor diketik dengan banyak gaya — digitnya saja yang dicari.
 */
export function leadSearchWhere(q: string | undefined): Prisma.LeadRequestWhereInput {
  const teks = q?.trim();
  if (!teks) return {};
  const rujukan = normalizeLeadReference(teks);
  if (rujukan) return { reference: rujukan };
  const digit = teks.replace(/\D/g, "").replace(/^0/, "");
  return {
    OR: [
      { name: { contains: teks, mode: "insensitive" } },
      { company: { contains: teks, mode: "insensitive" } },
      { email: { contains: teks, mode: "insensitive" } },
      ...(digit.length >= 4 ? [{ phone: { contains: digit } }] : []),
    ],
  };
}

/** Jumlah per status (dengan pencarian yang sama) — lencana tab `/leads`. */
export async function leadStatusCounts(
  filter: { q?: string } = {},
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<Record<LeadStatus, number> | null> {
  try {
    const rows = await deps.platform.leadRequest.groupBy({
      by: ["status"],
      where: leadSearchWhere(filter.q),
      _count: { _all: true },
    });
    const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const r of rows) if (r.status in out) out[r.status as LeadStatus] = r._count._all;
    return out;
  } catch (error) {
    console.error("[operator-leads] jumlah lead tak terbaca:", error);
    return null;
  }
}

/** Daftar lead, terbaru dulu. `null` = platform tak terjangkau. */
export async function listLeadsForOperator(
  filter: { status?: LeadStatus; q?: string; limit?: number } = {},
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<OperatorLeadRow[] | null> {
  try {
    return await deps.platform.leadRequest.findMany({
      where: { ...(filter.status ? { status: filter.status } : {}), ...leadSearchWhere(filter.q) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(500, Math.max(1, filter.limit ?? 200)),
      select: SELECT,
    });
  } catch (error) {
    console.error("[operator-leads] daftar lead tak terbaca:", error);
    return null;
  }
}

/** Satu lead. `null` = tidak ada; `"unreachable"` = platform tak terjangkau. */
export async function leadForOperator(
  id: number,
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<OperatorLeadRow | null | "unreachable"> {
  try {
    return await deps.platform.leadRequest.findUnique({ where: { id }, select: SELECT });
  } catch (error) {
    console.error("[operator-leads] lead tak terbaca:", error);
    return "unreachable";
  }
}

/**
 * Jumlah lead BARU — lencana menu dan baris "perlu ditangani". `null` bila tak
 * terbaca: lencana yang hilang lebih jujur daripada lencana "0".
 */
export async function newLeadCount(
  deps: { platform: PlatformClient } = { platform: platformDb }
): Promise<number | null> {
  try {
    return await deps.platform.leadRequest.count({ where: { status: "baru" } });
  } catch (error) {
    console.error("[operator-leads] jumlah lead baru tak terbaca:", error);
    return null;
  }
}
