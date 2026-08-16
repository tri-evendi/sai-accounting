/**
 * Impor Data Awal — pembungkus server (issue #381, tahap 2).
 *
 * ══ IZIN DIHITUNG DI SERVER, LALU DITURUNKAN SEBAGAI DAFTAR ════════════════
 * Ketiga jenis dijaga izin yang BERBEDA — dan izin yang sama dengan membuatnya
 * satu per satu lewat formulir. Karena itu halaman ini tidak bisa dijaga oleh
 * satu `requirePagePermission` saja: seorang staf gudang yang boleh menambah
 * barang tapi tidak boleh menambah pelanggan harus tetap bisa membuka layar
 * ini — dan hanya melihat "Barang" di pemilih jenisnya.
 *
 * Yang diturunkan ke klien adalah DAFTAR jenis yang boleh, bukan matriksnya;
 * pola yang sama dengan `/settings` (#73). Route-nya tetap menjaga dirinya
 * sendiri per jenis, jadi ini tampilan yang mengikuti izin, bukan tampilan
 * yang menjaga.
 */
import { redirect } from "next/navigation";

import { requirePagePermission } from "@/lib/page-auth";
import { canEffective } from "@/lib/authz-effective";
import type { TenantScopedParams } from "@/lib/tenant-routes";

import { MasterImportForm } from "./master-import-form";

export const dynamic = "force-dynamic";

export default async function MasterImportPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  /*
   * Gerbangnya `inventory.write` — izin PALING LUAS di antara ketiganya (ALL,
   * bukan OFFICE). Siapa pun yang boleh salah satu jenis pasti melewatinya,
   * dan yang tidak boleh satu pun dipantulkan sebelum halaman digambar.
   */
  const session = await requirePagePermission("inventory.write", params);

  const [customers, suppliers, items] = await Promise.all([
    canEffective(session.user, "customer.write"),
    canEffective(session.user, "supplier.write"),
    canEffective(session.user, "inventory.write"),
  ]);

  const allowed = [
    ...(customers ? (["customers"] as const) : []),
    ...(suppliers ? (["suppliers"] as const) : []),
    ...(items ? (["items"] as const) : []),
  ];

  /* Tidak boleh satu jenis pun: layar ini tidak punya isi baginya. Menggambar
     pemilih kosong akan terbaca sebagai kerusakan, bukan sebagai batas izin. */
  if (allowed.length === 0) redirect("/dashboard");

  return <MasterImportForm allowed={[...allowed]} />;
}
