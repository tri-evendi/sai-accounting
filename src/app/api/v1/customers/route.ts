/**
 * `GET /api/v1/customers` — daftar pelanggan untuk sistem luar (issue #389).
 *
 * Endpoint PERTAMA lapis 1 (baca). Bentuknya sengaja ditetapkan di sini dan
 * diikuti endpoint berikutnya, sebab bentuk yang ditetapkan pada endpoint
 * kelima adalah bentuk yang tidak pernah berlaku untuk empat yang pertama.
 *
 * ══ VERSI DI JALUR, SEJAK HARI PERTAMA ═════════════════════════════════════
 * `/api/v1/`. Menambahkan versi SESUDAH ada pemakai berarti memilih antara
 * merusak integrasi orang atau memelihara bentuk lama selamanya tanpa nama
 * untuk menyebutnya. Satu segmen jalur hari ini menghapus pilihan itu.
 *
 * ══ PAGINASI WAJIB, BUKAN OPSIONAL ═════════════════════════════════════════
 * Tidak ada bentuk "kembalikan semuanya". Perusahaan dengan 40.000 pelanggan
 * akan meminta seluruhnya pada percobaan pertama — dan jawaban yang berhasil
 * sekali di laptop pengembang adalah jawaban yang menjatuhkan mesin 3,6 GB
 * ketika pelanggan sungguhan mencobanya.
 *
 * ══ `updatedAt` ADA DI SETIAP BARIS, DAN ITU DISENGAJA ═════════════════════
 * Integrasi yang menarik ulang SELURUH daftar setiap jam adalah integrasi yang
 * akan berhenti dipakai. Dengan `updatedAt` di setiap baris dan saringan
 * `?updatedSince=`, penariknya cukup meminta yang berubah — dan itu perbedaan
 * antara satu permintaan kecil per jam dan 40.000 baris per jam.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiToken } from "@/lib/api-token-guard";
import { parseListQuery, listMeta } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiToken("customer.read");
  if (!auth.authorized) return auth.response;

  const query = parseListQuery(request);
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400 });
  const { limit, offset, updatedSince } = query;

  const where = updatedSince ? { updatedAt: { gte: updatedSince } } : {};

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      /* `id` sebagai pemutus seri: beberapa baris bisa berbagi milidetik
         `updated_at` yang sama, dan tanpa urutan total sebuah baris bisa
         muncul dua kali atau terlewat sama sekali saat penarik berpindah
         halaman — cacat yang tidak pernah terlihat sampai datanya salah. */
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        pic: true,
        npwp: true,
        taxExempt: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({
    data: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    meta: listMeta({ total, limit, offset }),
  });
}
