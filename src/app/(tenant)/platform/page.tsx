/**
 * `/platform` — PENDARATAN pasca-masuk setiap pelanggan (issue #172).
 *
 * Sebelumnya halaman ini beralamat `/tenant` dan menjaga dirinya dengan
 * `tenant.settings` (OWNER saja). Dua hal berubah, dan keduanya punya alasan
 * yang sama: pelanggan harus melihat KONTEKS AKUNNYA sebelum masuk ke buku.
 *
 *   1. ALAMATNYA. "tenant" adalah kosakata arsitektur; yang dibuka orang di
 *      sini adalah akunnya. Alamat lama dipantulkan 307 oleh `proxy.ts`
 *      (`renamedPagePath`) — bookmark dan tautan di surel yang sudah terkirim
 *      tetap sampai. ⚠ `/api/tenant/*` TIDAK ikut pindah: itu permukaan API
 *      bertingkat tenant (#135) yang namanya memang benar.
 *
 *   2. PENJAGANYA. Menjadikan halaman berpenjaga owner sebagai tujuan
 *      pasca-masuk berarti memantulkan hampir setiap staf pada langkah
 *      pertamanya. Karena itu penjaganya `tenant.home` (setiap anggota) dan
 *      ISINYA yang dipisah menurut kewenangan:
 *
 *        setiap anggota  identitas tenant + perusahaan YANG BOLEH IA BUKA
 *        manajer ke atas buat perusahaan (`company.create`),
 *                        undang staf (`tenant.member.invite`)
 *        owner           langganan & tagihan (`tenant.billing`),
 *                        ekspor (`tenant.export`), penghapusan (`tenant.deletion`)
 *
 * ══ DAFTAR PERUSAHAAN = KEANGGOTAANNYA SENDIRI, BUKAN ISI TENANT ═══════════
 * `companiesForUser()` membaca `memberships` milik PEMANGGIL. Membacanya dari
 * daftar perusahaan milik TENANT akan membocorkan keberadaan PT lain kepada,
 * misalnya, seorang kepala gudang di salah satu PT — ia tidak berhak tahu
 * pemilik akunnya memegang badan hukum lain. Bagian yang bukan haknya TIDAK
 * DIRENDER sama sekali (dan untuk langganan: query-nya pun tidak berjalan),
 * bukan dirender lalu ditolak.
 *
 * Grup `(tenant)` dengan sengaja: halaman ini harus terbuka TANPA perusahaan
 * aktif — pelanggan baru yang belum punya satu pun PT, dan pemilik yang
 * seluruh PT-nya sedang hanya-baca, justru pemakai terpentingnya.
 */
import Link from "next/link";
import { Building2, Mail, Plus, Users } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignedInAs } from "@/components/auth/signed-in-as";
import { Button } from "@/components/ui/button";
import { companiesForUser } from "@/lib/company-registry";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import { isReadOnlyTenantStatus } from "@/lib/subscription-lifecycle";
import { tenantCan } from "@/lib/tenant-authz";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { tenantPath } from "@/lib/tenant-routes";
import { PrivacySection } from "./privacy-section";
import { SubscriptionSection } from "./subscription-section";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  const companies = await companiesForUser(Number.parseInt(user.id, 10));

  /* Satu pembacaan matriks per bagian — dan bagian yang jawabannya `false`
   * tidak pernah masuk ke pohon render di bawah. */
  const canCreate = tenantCan(tenant, "company.create");
  const canInvite = tenantCan(tenant, "tenant.member.invite");
  const canSeeBilling = tenantCan(tenant, "tenant.billing");
  const canExport = tenantCan(tenant, "tenant.export");
  const canDelete = tenantCan(tenant, "tenant.deletion");

  /* Status hanya-baca ditampilkan kepada SEMUA anggota: seorang staf yang
   * tombol simpannya ditolak berhak tahu alasannya. Ini keadaan operasional,
   * bukan rincian langganan — tidak ada paket, harga, atau kuota di sini. */
  const readOnly = isReadOnlyTenantStatus(tenant.tenantStatus);

  /* Langganan DIBACA di dalam cabang izinnya: bagi yang tidak berhak, query
   * ke basis data kendali & platform tidak pernah berjalan sama sekali. */
  const overview = canSeeBilling ? await billingOverviewForTenant(tenant.tenantId) : null;

  return (
    <AuthShell
      heading={t("platform.title")}
      description={t("platform.description")}
      icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
      footer={<SignedInAs name={user.name ?? ""} />}
    >
      <div className="space-y-6">
        {readOnly && (
          <div role="status" className="rounded-lg border border-border bg-warning-soft p-4">
            <p className="text-sm leading-relaxed text-warning-strong">
              {t("tenantSettings.readOnlyNote")}
            </p>
          </div>
        )}

        {/* Identitas akun — jawaban atas "saya sedang masuk ke akun siapa". */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("platform.tenantHeading")}
          </h2>
          <div className="rounded-lg border border-border p-3">
            <p className="truncate font-medium text-foreground">{tenant.tenantName}</p>
            <p className="truncate text-xs text-muted-foreground">{tenant.tenantSlug}</p>
          </div>
        </section>

        {/* Perusahaan yang boleh DIA buka — dari keanggotaannya sendiri. */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("platform.companiesHeading")}
          </h2>

          {companies.length === 0 ? (
            /*
             * Nol perusahaan punya DUA arti yang berbeda, dan menjawab keduanya
             * dengan kalimat yang sama akan membuat salah satunya jalan buntu:
             *   • boleh membuat (owner/admin) → yang dibutuhkan adalah tombol;
             *   • tidak boleh (staf)          → yang dibutuhkan adalah alasan
             *     dan langkah berikutnya, bukan layar kosong tanpa penjelasan.
             */
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(
                  canCreate
                    ? "auth.selectCompany.noCompanyYetBody"
                    : "auth.selectCompany.noAccessBody"
                )}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(
                  canCreate
                    ? "auth.selectCompany.noCompanyYetOwner"
                    : "auth.selectCompany.noAccessNext"
                )}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("platform.companiesBody")}
              </p>
              <ul className="space-y-2">
                {companies.map((company) => (
                  <li key={company.companyId}>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                          aria-hidden="true"
                        >
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{company.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{company.slug}</p>
                        </div>
                      </div>
                      {/*
                       * Tautan LANGSUNG ke jalur kanonik, bukan penukar sesi:
                       * sejak #158 `companyId` di sesi hanya catatan "terakhir
                       * dibuka" (tata letak bertenant yang mencatatnya), jadi
                       * membuka buku = pergi ke alamatnya.
                       */}
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={tenantPath(tenant.tenantSlug, company.slug, "/dashboard")}>
                          {t("auth.selectCompany.openLabel")}
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {canCreate && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/companies/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("companies.newTitle")}
              </Link>
            </Button>
          )}
        </section>

        {/* Undangan staf — manajer ke atas. Undangannya per PERUSAHAAN (peran
            akuntansi & jejak auditnya milik satu buku), jadi pintunya pun per
            perusahaan; tanpa satu pun PT, kalimatnya yang menjelaskan. */}
        {canInvite && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t("platform.teamHeading")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("platform.teamBody")}
            </p>
            {companies.map((company) => (
              <Button
                key={company.companyId}
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link href={tenantPath(tenant.tenantSlug, company.slug, "/users")}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("platform.inviteTo", { company: company.name })}
                </Link>
              </Button>
            ))}
          </section>
        )}

        {/* Langganan & tagihan — OWNER saja. Komponennya sendiri yang membaca
            data langganan, jadi bagi yang tak berhak query-nya tak berjalan. */}
        {canSeeBilling && <SubscriptionSection overview={overview} />}

        {/* Data & Privasi (issue #142) — ekspor untuk pemegang `tenant.export`,
            permintaan penghapusan untuk `tenant.deletion`; SELALU dirender saat
            berhak, termasuk (terutama) ketika langganan ditangguhkan. */}
        {canExport && <PrivacySection canDelete={canDelete} />}
      </div>
    </AuthShell>
  );
}
