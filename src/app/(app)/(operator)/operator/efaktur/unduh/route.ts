/**
 * Unduhan CSV e-Faktur TAGIHAN PLATFORM — padanan layar dari
 * `bun run efaktur:platform`. Izin `tenant.billing`.
 *
 * Isinya dibangun `platformEfaktur()` yang sama dengan skrip CLI. Tagihan yang
 * kolom wajibnya kosong TIDAK ikut berkas; daftarnya dipajang di halaman
 * `/operator/efaktur` sebelum orang menekan tombol unduh.
 */
import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@/lib/platform-db";
import { platformEfaktur } from "@/lib/billing/platform-efaktur";
import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { requireOperatorRoute } from "@/lib/operator/guard";
import { clientIpFrom } from "@/lib/operator/plane";

export const dynamic = "force-dynamic";

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await requireOperatorRoute("tenant.billing");
  if (!session) return new Response("Not Found", { status: 404 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !TANGGAL.test(from)) || (to && !TANGGAL.test(to))) {
    return new Response("Tanggal harus YYYY-MM-DD", { status: 400 });
  }

  const result = await platformEfaktur({ platform: platformDb, control: controlDb }, { from, to });

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.efaktur.export",
    ipAddress: clientIpFrom(request.headers),
    details: { from, to, rows: result.rowCount, problems: result.problems.length },
  });

  const nama = `efaktur-platform-${from ?? "awal"}-${to ?? "kini"}.csv`;
  /* UTF-8 + BOM, konvensi route e-Faktur pelanggan (ramah Excel/DJP). */
  return new Response("﻿" + result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
}
