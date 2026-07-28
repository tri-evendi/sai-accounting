/**
 * "Tambah Perusahaan" (issue #104) — penyediaan PT baru dari dalam aplikasi.
 *
 * Sampai sekarang ini pekerjaan baris perintah, dan itu berarti menambah PT
 * menuntut akses SSH ke server. Halaman ini memindahkannya ke tempat orang yang
 * berwenang sudah berada.
 *
 * Izinnya `company.create` — akses penuh saja, dan sengaja TERPISAH dari
 * `company_setting.manage` (mengubah identitas perusahaan yang sudah ada).
 * Yang memegangnya bisa membuat basis data baru di server; itu kemampuan yang
 * pantas berdiri sendiri, bukan menumpang izin lain.
 */
import { Building2 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePagePermission } from "@/lib/page-auth";
import { getT } from "@/lib/i18n/server";

import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  await requirePagePermission("company.create");
  const t = await getT();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("companies.newTitle")}
        breadcrumbs={[
          { label: t("nav.groups.settings"), href: "/settings" },
          { label: t("companies.newTitle") },
        ]}
        description={t("companies.newDescription")}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1 text-sm text-muted-foreground">
              {/* Konsekuensinya disebut SEBELUM tombolnya ditekan: buku yang
                  terpisah penuh, dan wizard penyiapan yang masih menunggu. */}
              <p>{t("companies.explainIsolation")}</p>
              <p>{t("companies.explainNextStep")}</p>
            </div>
          </div>

          <CompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}
