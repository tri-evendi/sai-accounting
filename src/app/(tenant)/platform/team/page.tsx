/**
 * `/platform/team` — undangan staf, MANAJER KE ATAS (`tenant.member.invite`).
 *
 * Dulu sebuah `{canInvite && …}` di tengah halaman pendaratan. Sebagai rute
 * tersendiri, yang menolak adalah PENJAGA di baris pertama: seorang `member`
 * yang mengetik alamat ini dipantulkan, bukan disuguhi halaman kosong.
 *
 * ══ UNDANGANNYA PER PERUSAHAAN, DAN ITU BUKAN KETERBATASAN ═════════════════
 * Peran akuntansi (dan jejak auditnya) milik SATU buku, jadi mengundang orang
 * berarti mengundangnya ke sebuah PT — bukan ke tenant secara umum. Karena itu
 * halaman ini adalah daftar pintu, satu per PT, bukan satu formulir undangan:
 * pertanyaan "sebagai apa di buku yang mana" hanya bisa dijawab di halaman
 * Pengguna milik PT itu.
 *
 * Tanpa satu pun PT, kalimatnya yang menjelaskan — dan itu keadaan yang nyata
 * bagi pemilik yang baru saja mendaftar.
 */
import Link from "next/link";
import { Mail, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { companiesForUser } from "@/lib/company-registry";
import { getT } from "@/lib/i18n/server";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { tenantPath } from "@/lib/tenant-routes";

export const dynamic = "force-dynamic";

/** Pengganti `grid gap-3 sm:grid-cols-2` — satu kolom di layar sempit. */
const DOORS_GRID: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
};

export default async function PlatformTeamPage() {
  const { user, tenant } = await requireTenantPagePermission("tenant.member.invite");
  const t = await getT();

  const companies = await companiesForUser(Number.parseInt(user.id, 10));

  return (
    <>
      <PageHeader
        title={t("platform.teamHeading")}
        description={t("platform.teamBody")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("platform.teamHeading") },
        ]}
      />

      <Card>
        <CardContent>
          {companies.length === 0 ? (
            <EmptyState
              icon={<Users size={48} />}
              title={t("auth.selectCompany.noCompanyYetHeading")}
              description={t("auth.selectCompany.noCompanyYetBody")}
              actionLabel={t("companies.newTitle")}
              actionHref="/companies/new"
            />
          ) : (
            /* Satu pintu per PT dalam kisi yang membagi lebarnya sendiri —
               bukan setumpuk tombol selebar kartu yang tingginya tumbuh
               seiring jumlah perusahaan, dan tanpa satu pun media query. */
            <div style={DOORS_GRID}>
              {companies.map((company) => (
                <Button
                  key={company.companyId}
                  asChild
                  variant="outline"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                >
                  <Link href={tenantPath(tenant.tenantSlug, company.slug, "/users")}>
                    <Mail aria-hidden="true" />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("platform.inviteTo", { company: company.name })}
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
