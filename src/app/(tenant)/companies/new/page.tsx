/**
 * "Tambah Perusahaan" (issue #104; dipindah ke lingkup TENANT di issue #135).
 *
 * Izinnya kini `company.create` di MATRIKS TENANT (`lib/tenant-authz.ts`) —
 * milik owner/admin tenant, bukan peran di salah satu PT. Perbedaannya bukan
 * kosmetik: pemilik tenant TANPA satu pun perusahaan harus bisa membuka
 * halaman ini untuk membuat yang pertama, dan penjaga per-perusahaan menuntut
 * konteks yang justru belum ada (ayam-dan-telur, docs/MULTI-TENANT.md §4.2).
 *
 * Karena itu ia hidup di grup `(tenant)` dengan kulit `AuthShell` — sekeluarga
 * dengan /select-company, layar "di antara buku-buku": tanpa sidebar yang
 * menuntut peran per-PT, bisa dibuka sebelum PT pertama ada.
 */
import Link from "next/link";
import { Building2 } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { getT } from "@/lib/i18n/server";

import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const { tenant } = await requireTenantPagePermission("company.create");
  const t = await getT();

  return (
    <AuthShell
      heading={t("companies.newTitle")}
      description={t("companies.newDescription")}
      icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
      footer={
        <Button asChild variant="outline" className="w-full">
          <Link href="/select-company">{t("common.back")}</Link>
        </Button>
      }
    >
      {/* Konsekuensinya disebut SEBELUM tombolnya ditekan: buku yang terpisah
          penuh, dan wizard penyiapan yang masih menunggu. */}
      <div className="mb-6 space-y-1 text-sm leading-relaxed text-muted-foreground">
        <p>{t("companies.explainIsolation")}</p>
        <p>{t("companies.explainNextStep")}</p>
      </div>

      {/* `tenantId` hanya untuk PRATINJAU nama basis data (`sai_t{id}_{slug}`,
          issue #153) — nilai yang dipakai server tetap datang dari penjaga
          `requireTenantApiPermission`, tidak pernah dari klien. */}
      <CompanyForm tenantId={tenant.tenantId} />
    </AuthShell>
  );
}
