import { requirePagePermission } from "@/lib/page-auth";
import { listClosedPeriods } from "@/lib/period";
import { NewTransactionClient } from "./transaction-form";

export const dynamic = "force-dynamic";

/**
 * Catat Transaksi Kas & Bank — server shell (issue #4/#6).
 *
 * Bulan-bulan yang sudah ditutup dibaca di sini lalu diserahkan ke formulir,
 * supaya tanggal di periode terkunci ditolak di layar sebelum dikirim. Penjaga
 * yang mengikat tetap `assertPeriodOpen` di dalam transaksi penulisan.
 */
export default async function NewTransactionPage() {
  await requirePagePermission("cash.write");

  const closedPeriods = await listClosedPeriods();

  return <NewTransactionClient closedPeriods={closedPeriods} />;
}
