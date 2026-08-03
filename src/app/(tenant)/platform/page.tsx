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
 *
 * ══ TATA LETAK: BIDANG, BUKAN SATU KOLOM 448px ═════════════════════════════
 * Isi halaman ini dipisah menurut kewenangan sejak #172; yang belum ikut
 * dipisah adalah BENTUKNYA. Sampai audit ini seluruhnya dituang ke dalam
 * `AuthShell` — kulit layar pra-aplikasi, kolom `max-w-md` — sehingga enam
 * urusan yang berbeda (akun, perusahaan, tim, paket, tagihan, penghapusan)
 * berbaris sebagai satu gulungan rata tanpa batas yang terlihat, dan tabel
 * tagihan lima kolom menggeser dirinya sendiri di dalam sumur 384px pada layar
 * 1440px. Empat perbaikan, semuanya soal bentuk — tak satu pun mengubah siapa
 * melihat apa:
 *
 *   • `PlatformShell` (lebar, ber-`h1`) menggantikan `AuthShell`;
 *   • setiap urusan mendapat `Card`-nya sendiri — batas yang terlihat, bukan
 *     hanya jarak vertikal, dan judul bagian yang benar-benar `h2` di bawah
 *     satu `h1` (dulu semuanya `h2` sederajat, dan tak ada `h1` sama sekali);
 *   • daftar perusahaan menjadi KISI yang ikut melebar — bukan tumpukan kartu
 *     selebar layar yang panjangnya bertambah satu layar penuh tiap tiga PT;
 *   • JALAN KELUAR naik ke kartu "Akun" paling atas. `SignedInAs` dulu ada di
 *     kaki `AuthShell`, yang pada halaman sepanjang ini berarti di bawah tabel
 *     tagihan: orang yang sadar ia masuk sebagai akun yang salah harus
 *     menggulung melewati data akun orang lain untuk bisa keluar.
 */
import Link from "next/link";
import { AlertTriangle, Building2, Mail, Plus, Users } from "lucide-react";

import { SignedInAs } from "@/components/auth/signed-in-as";
import { PlatformShell } from "@/components/tenant/platform-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
    <PlatformShell
      heading={t("platform.title")}
      description={t("platform.description")}
      icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
    >
      {/* Penangguhan langganan — ikon + kata, bukan warna saja (MASTER.md
          §Anti-Patterns). Batasnya `warning`, bukan `border`: bidang berstatus
          yang bertepi netral terbaca sebagai kotak biasa yang kebetulan kuning. */}
      {readOnly && (
        <div
          role="status"
          className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-warning-strong">
            {t("tenantSettings.readOnlyNote")}
          </p>
        </div>
      )}

      {/* Akun — "saya sedang masuk ke akun siapa, sebagai siapa, dan bagaimana
          saya keluar", ketiganya di satu kartu paling atas. */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">
            {t("platform.tenantHeading")}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{tenant.tenantName}</p>
              <p className="truncate text-xs text-muted-foreground">{tenant.tenantSlug}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <div className="w-full">
            <SignedInAs name={user.name ?? ""} />
          </div>
        </CardFooter>
      </Card>

      {/* Perusahaan yang boleh DIA buka — dari keanggotaannya sendiri. */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              {t("platform.companiesHeading")}
            </h2>
            {companies.length > 0 && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("platform.companiesBody")}
              </p>
            )}
          </div>
          {/* Aksi utama di kepala kartu saat daftarnya berisi; saat kosong ia
              pindah ke dalam empty state, tempat ia menjadi satu-satunya
              langkah berikutnya — bukan tombol kedua yang mengulang. */}
          {canCreate && companies.length > 0 && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/companies/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("companies.newTitle")}
              </Link>
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {companies.length === 0 ? (
            /*
             * Nol perusahaan punya DUA arti yang berbeda, dan menjawab keduanya
             * dengan kalimat yang sama akan membuat salah satunya jalan buntu:
             *   • boleh membuat (owner/admin) → yang dibutuhkan adalah tombol;
             *   • tidak boleh (staf)          → yang dibutuhkan adalah alasan
             *     dan langkah berikutnya, bukan layar kosong tanpa penjelasan.
             * Judulnya kini ikut dipisah (kunci `no…Heading` yang sudah ada di
             * kamus tapi tak pernah dipakai halaman ini): layar kosong yang
             * dibuka dengan dua paragraf abu-abu tanpa judul terbaca sebagai
             * halaman gagal memuat.
             */
            <div className="space-y-3">
              <EmptyState
                icon={<Building2 className="h-12 w-12" />}
                title={t(
                  canCreate
                    ? "auth.selectCompany.noCompanyYetHeading"
                    : "auth.selectCompany.noAccessHeading"
                )}
                description={t(
                  canCreate
                    ? "auth.selectCompany.noCompanyYetBody"
                    : "auth.selectCompany.noAccessBody"
                )}
                {...(canCreate
                  ? { actionLabel: t("companies.newTitle"), actionHref: "/companies/new" }
                  : {})}
              />
              <p className="mx-auto max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                {t(
                  canCreate
                    ? "auth.selectCompany.noCompanyYetOwner"
                    : "auth.selectCompany.noAccessNext"
                )}
              </p>
            </div>
          ) : (
            /* Kisi, bukan tumpukan: pada 1024px tiga PT muat dalam satu baris
               pandangan, dan pemilik dengan sepuluh PT tidak lagi menggulung
               sepuluh kartu selebar layar untuk sampai ke kartu di bawahnya. */
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
                <li key={company.companyId}>
                  <div className="flex h-full flex-col justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/40">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                        aria-hidden="true"
                      >
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground" title={company.name}>
                          {company.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{company.slug}</p>
                      </div>
                    </div>
                    {/*
                     * Tautan LANGSUNG ke jalur kanonik, bukan penukar sesi:
                     * sejak #158 `companyId` di sesi hanya catatan "terakhir
                     * dibuka" (tata letak bertenant yang mencatatnya), jadi
                     * membuka buku = pergi ke alamatnya.
                     */}
                    <Button asChild size="sm" className="w-full">
                      <Link href={tenantPath(tenant.tenantSlug, company.slug, "/dashboard")}>
                        {t("auth.selectCompany.openLabel")}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Undangan staf — manajer ke atas. Undangannya per PERUSAHAAN (peran
          akuntansi & jejak auditnya milik satu buku), jadi pintunya pun per
          perusahaan; tanpa satu pun PT, kalimatnya yang menjelaskan. */}
      {canInvite && (
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t("platform.teamHeading")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("platform.teamBody")}
            </p>
          </CardHeader>
          {companies.length > 0 && (
            <CardContent>
              {/* Satu pintu per PT, dalam kisi yang sama dengan daftar di atas —
                  bukan setumpuk tombol selebar kartu yang tingginya tumbuh
                  seiring jumlah perusahaan. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {companies.map((company) => (
                  <Button
                    key={company.companyId}
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={tenantPath(tenant.tenantSlug, company.slug, "/users")}>
                      <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {t("platform.inviteTo", { company: company.name })}
                      </span>
                    </Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Langganan & tagihan — OWNER saja. Komponennya sendiri yang membaca
          data langganan, jadi bagi yang tak berhak query-nya tak berjalan. */}
      {canSeeBilling && <SubscriptionSection overview={overview} />}

      {/* Data & Privasi (issue #142) — ekspor untuk pemegang `tenant.export`,
          permintaan penghapusan untuk `tenant.deletion`; SELALU dirender saat
          berhak, termasuk (terutama) ketika langganan ditangguhkan. */}
      {canExport && <PrivacySection canDelete={canDelete} />}
    </PlatformShell>
  );
}
