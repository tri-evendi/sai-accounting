/**
 * BERKAS IMPOR CORETAX (XML) satu masa — unduhan (docs/EFAKTUR.md).
 *
 * Inilah jalur yang BISA DIPAKAI HARI INI tanpa PJAP: unduh berkas ini, lalu
 * di Coretax buka e-Faktur → Pajak Keluaran → Impor Data → unggah XML.
 *
 * HANYA MEMBACA buku. Faktur yang kekurangan data wajib DITAHAN (halaman
 * `/tax/efaktur` menyebut mana dan kenapa), faktur ekspor (PEB) tidak ikut.
 *
 * Perusahaan dari JALUR, bukan header (issue #158): unduhan lewat `<a href>`.
 * Query: `from`, `to` (YYYY-MM-DD, inklusif).
 */
import { NextResponse } from "next/server";
import { requireApiPermission, type TenantApiContext } from "@/lib/auth-guard";
import { getCoretaxExport } from "@/lib/coretax-data";
import { CORETAX_MAX_INVOICES_PER_FILE, coretaxToXml } from "@sai/core/coretax-xml";
import { businessISODate } from "@sai/core/business-date";
import { getRequestI18n } from "@sai/platform/i18n/server";

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request, ctx: TenantApiContext) {
  const result = await requireApiPermission("tax.read", ctx.params);
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  const { t } = await getRequestI18n();
  if (!from || !to) {
    return NextResponse.json({ error: t("errors.dateRangeIncomplete") }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: t("errors.dateRangeReversed") }, { status: 400 });
  }

  const { result: built } = await getCoretaxExport({ from, to });
  if (!built.sellerTin) {
    return NextResponse.json({ error: t("errors.sellerTaxIdMissing") }, { status: 422 });
  }
  if (built.invoices.length === 0) {
    return NextResponse.json({ error: t("tax.coretax.nothingReady") }, { status: 422 });
  }
  if (built.invoices.length > CORETAX_MAX_INVOICES_PER_FILE) {
    return NextResponse.json(
      { error: t("tax.coretax.tooMany", { max: CORETAX_MAX_INVOICES_PER_FILE }) },
      { status: 422 }
    );
  }

  const xml = coretaxToXml(built.sellerTin, built.invoices);
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="coretax_faktur_keluaran_${businessISODate(from)}_${businessISODate(to)}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
