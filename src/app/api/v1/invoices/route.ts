/**
 * `GET /api/v1/invoices` — daftar faktur penjualan (issue #389, F-10 lapis 1).
 *
 * ══ `total` DIHITUNG DARI BARIS FAKTURNYA, BUKAN DARI SEBUAH KOLOM ═════════
 * Dan itu bukan pilihan gaya: di seluruh aplikasi ini nilai faktur adalah
 * `Σ(kuantitas × harga) + PPN` (`receivables.ts`), bukan sebuah kolom `total`.
 * Memulangkan angka yang dihitung dengan cara lain di sini akan menghasilkan
 * API yang tidak setuju dengan umur piutangnya sendiri — dan yang menemukannya
 * adalah integrator, saat rekonsiliasinya tidak nol.
 *
 * `base_amount` juga tidak dipakai sebagai `total`: ia nilai IDR, sementara
 * `total` di sini dalam MATA UANG FAKTUR. Menukar keduanya membuat faktur USD
 * pulang sebagai angka rupiah tanpa label yang menyebutnya.
 *
 * Sisanya mengikuti `/api/v1/customers`.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiToken } from "@/lib/api-token-guard";
import { parseListQuery, listMeta } from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET(request: Request) {
  const auth = await requireApiToken("invoice.read");
  if (!auth.authorized) return auth.response;

  const query = parseListQuery(request);
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400 });
  const { limit, offset, updatedSince } = query;

  const where = updatedSince ? { updatedAt: { gte: updatedSince } } : {};

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        dueDate: true,
        status: true,
        customerId: true,
        currency: true,
        rate: true,
        taxAmount: true,
        isOpening: true,
        updatedAt: true,
        customer: { select: { name: true } },
        items: { select: { quantity: true, price: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return NextResponse.json({
    data: rows.map((r) => {
      const subtotal = round2(
        r.items.reduce((sum, i) => sum + num(i.quantity) * num(i.price), 0)
      );
      const tax = round2(num(r.taxAmount));
      return {
        id: r.id,
        invoiceNo: r.invoiceNo,
        /* Tanggal dokumen adalah tanggal KALENDER, bukan momen. ISO penuh akan
           membawa zona waktu yang menggesernya sehari di sebagian klien. */
        date: r.date.toISOString().slice(0, 10),
        dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
        status: r.status,
        customerId: r.customerId,
        customerName: r.customer?.name ?? null,
        currency: r.currency,
        rate: r.rate == null ? null : Number(r.rate),
        subtotal,
        taxAmount: tax,
        total: round2(subtotal + tax),
        isOpening: r.isOpening,
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
    meta: listMeta({ total, limit, offset }),
  });
}
