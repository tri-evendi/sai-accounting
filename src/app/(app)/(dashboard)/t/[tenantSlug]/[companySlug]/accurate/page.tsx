/**
 * Integrasi Accurate — pembungkus server, dijaga izin `ledger.read`.
 *
 * Ambangnya sengaja sama dengan membaca Buku Besar: yang ditampilkan halaman
 * ini adalah isi buku besar kita berdampingan dengan berkas pembandingnya, dan
 * sebuah layar tidak boleh menjadi jalan memutar untuk melihat apa yang tidak
 * boleh dilihat lewat pintu depannya. `ledger.read` juga izin permukaan
 * akuntansi (`ACCOUNTING_PERMISSIONS`), jadi Mode Akuntan ikut berlaku —
 * mencocokkan buku dengan sistem lain memang pekerjaan akuntan.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { AccurateReconcileForm } from "./accurate-form";

export const dynamic = "force-dynamic";

export default async function AccuratePage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("ledger.read", params);
  return <AccurateReconcileForm />;
}
