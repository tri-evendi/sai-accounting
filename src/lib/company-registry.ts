/**
 * Registry perusahaan (issue #104) — pembacaan `companies` dari basis data
 * kendali, plus cache kecil.
 *
 * KENAPA DI-CACHE. Setiap permintaan perlu menerjemahkan `companyId` di sesi
 * menjadi NAMA BASIS DATA sebelum satu query pun bisa dijalankan. Tanpa cache
 * itu berarti satu query ke basis data kendali di depan setiap permintaan —
 * biaya tetap yang dibayar seumur hidup aplikasi untuk membaca baris yang
 * hampir tidak pernah berubah.
 *
 * TTL-nya pendek (60 detik, seirama revalidasi sesi) dan ada invalidasi
 * eksplisit saat registry ditulis. Yang di-cache hanya identitas perusahaan —
 * nama, slug, nama basis data, aktif/tidak — bukan izin dan bukan data.
 *
 * Perusahaan yang DINONAKTIFKAN tetap bisa dibaca di sini: penjaga yang
 * memutuskan menolaknya, dan untuk menolak dengan kalimat yang benar ia perlu
 * tahu perusahaannya ada tapi nonaktif — bukan sekadar "tidak ditemukan".
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import type { CompanyContext } from "@/lib/company-context";

export interface CompanyRecord extends CompanyContext {
  name: string;
  isActive: boolean;
}

const TTL_MS = 60_000;

const globalForRegistry = globalThis as unknown as {
  companyRegistryCache: Map<number, { record: CompanyRecord; at: number }> | undefined;
};

const cache = globalForRegistry.companyRegistryCache ?? new Map();
if (process.env.NODE_ENV !== "production") globalForRegistry.companyRegistryCache = cache;

function toRecord(row: {
  id: number;
  slug: string;
  name: string;
  databaseName: string;
  isActive: boolean;
}): CompanyRecord {
  return {
    companyId: row.id,
    slug: row.slug,
    name: row.name,
    databaseName: row.databaseName,
    isActive: row.isActive,
  };
}

/** Satu perusahaan menurut id, dari cache bila masih segar. */
export async function getCompany(companyId: number): Promise<CompanyRecord | null> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.record;

  const row = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
  });
  if (!row) {
    cache.delete(companyId);
    return null;
  }

  const record = toRecord(row);
  cache.set(companyId, { record, at: Date.now() });
  return record;
}

/** WAJIB dipanggil setelah menulis baris `companies`. */
export function invalidateCompany(companyId: number): void {
  cache.delete(companyId);
}

/** Perusahaan yang boleh dibuka seorang pengguna, urut nama. */
export async function companiesForUser(userId: number): Promise<CompanyRecord[]> {
  const memberships = await controlDb.membership.findMany({
    where: { userId, isActive: true, company: { isActive: true } },
    select: {
      role: true,
      company: {
        select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
      },
    },
    orderBy: { company: { name: "asc" } },
  });

  return memberships.map((m) => toRecord(m.company));
}

/** Keanggotaan seseorang di satu perusahaan — sumber PERAN-nya di sana. */
export async function membershipFor(
  userId: number,
  companyId: number
): Promise<{ role: string; accountantMode: boolean | null; company: CompanyRecord } | null> {
  const membership = await controlDb.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      role: true,
      accountantMode: true,
      isActive: true,
      company: {
        select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
      },
    },
  });

  if (!membership || !membership.isActive || !membership.company.isActive) return null;

  return {
    role: membership.role,
    accountantMode: membership.accountantMode,
    company: toRecord(membership.company),
  };
}
