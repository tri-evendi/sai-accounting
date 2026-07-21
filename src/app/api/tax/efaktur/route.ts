/**
 * e-Faktur / CTAS export — CSV download endpoint (issue #17).
 *
 * READ-ONLY over the ledger: it gathers output-VAT / export invoices for a period
 * (`getEfakturExport`), builds the rows with the pure `@/lib/efaktur` mapping, and
 * streams a UTF-8 CSV. It posts no journal and changes no posting rule.
 *
 * Query params: `from` and `to` (YYYY-MM-DD, inclusive).
 * Behaviour:
 *   • Seller NPWP missing → 422: the export cannot be filed without it, so we
 *     refuse rather than emit a file DJP would reject.
 *   • Invoices missing a required field are held back by the builder; only valid
 *     rows are written. The /tax/efaktur page surfaces the held-back list.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getEfakturExport } from "@/lib/efaktur-data";
import { efakturToCsv } from "@/lib/efaktur";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const result = await requireAuth(["bos"]);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { error: "Rentang tanggal tidak valid. Sertakan `from` dan `to` (YYYY-MM-DD)." },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "Tanggal awal tidak boleh setelah tanggal akhir." },
      { status: 400 }
    );
  }

  const { result: built, sellerNpwpMissing } = await getEfakturExport(from, to);

  if (sellerNpwpMissing) {
    return NextResponse.json(
      {
        error:
          "NPWP penjual belum diisi. Isi Identitas Pajak Penjual dulu — file e-Faktur tidak dibuat agar tidak gagal impor DJP.",
      },
      { status: 422 }
    );
  }

  const csv = efakturToCsv(built.rows);
  // Prepend a UTF-8 BOM so Excel/DJP tooling reads unicode names correctly.
  const body = "﻿" + csv;
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="efaktur_${fromStr}_${toStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
