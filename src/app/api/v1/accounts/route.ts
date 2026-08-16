/**
 * `GET /api/v1/accounts` — bagan akun (issue #389, F-10 lapis 1).
 *
 * Bentuknya mengikuti `/api/v1/customers`: paginasi wajib, `updatedAt` di
 * setiap baris, `?updatedSince=` untuk penarikan bertahap. Alasan lengkap
 * setiap keputusan ada di sana dan di `lib/api-v1-spec.ts` — tidak diulang di
 * lima berkas, sebab lima salinan alasan adalah lima tempat untuk menyimpang.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiToken } from "@/lib/api-token-guard";
import { parseListQuery, listMeta } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiToken("account.read");
  if (!auth.authorized) return auth.response;

  const query = parseListQuery(request);
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400 });
  const { limit, offset, updatedSince } = query;

  const where = updatedSince ? { updatedAt: { gte: updatedSince } } : {};

  const [rows, total] = await Promise.all([
    prisma.account.findMany({
      where,
      // `id` pemutus seri — tanpa urutan total, satu baris bisa muncul dua kali
      // atau terlewat saat penarik berpindah halaman.
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        normalBalance: true,
        currency: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    prisma.account.count({ where }),
  ]);

  return NextResponse.json({
    data: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    meta: listMeta({ total, limit, offset }),
  });
}
