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
 *      pertamanya. Karena itu penjaganya `tenant.home` — izin yang dipegang
 *      SETIAP anggota tenant.
 *
 * ══ SATU HALAMAN PANJANG → EMPAT RUTE ══════════════════════════════════════
 * Sampai audit rute, seluruh permukaan tenant (akun, perusahaan, tim,
 * langganan, privasi) tinggal di SATU halaman, dan menu panel menunjuknya
 * dengan jangkar `#tim`, `#privasi`, …. Dua hal salah di sana:
 *
 *   • jangkar bukan halaman: tidak bisa di-bookmark, tidak masuk riwayat
 *     sebagai tempat, dan tombol Kembali tidak mengembalikan apa pun;
 *   • pemisahan kewenangan bergantung pada `{canX && …}` yang benar di setiap
 *     cabang SATU pohon render. Sebagai rute tersendiri, penjaga di kepala tiap
 *     halaman yang menolak — dan penolakannya adalah PANTULAN, bukan halaman
 *     kosong. Itu batas yang jauh lebih sulit dilanggar tanpa sengaja.
 *
 * Yang tersisa di sini karena itu hanya yang menjawab "saya mendarat di mana":
 * ringkasan kuota, identitas akun, dan perusahaan yang boleh ia buka.
 *
 * ══ DAFTAR PERUSAHAAN = KEANGGOTAANNYA SENDIRI, BUKAN ISI TENANT ═══════════
 * `companiesForUser()` membaca `memberships` milik PEMANGGIL. Membacanya dari
 * daftar perusahaan milik TENANT akan membocorkan keberadaan PT lain kepada,
 * misalnya, seorang kepala gudang di salah satu PT — ia tidak berhak tahu
 * pemilik akunnya memegang badan hukum lain.
 *
 * Grup `(tenant)` dengan sengaja: halaman ini harus terbuka TANPA perusahaan
 * aktif — pelanggan baru yang belum punya satu pun PT, dan pemilik yang
 * seluruh PT-nya sedang hanya-baca, justru pemakai terpentingnya.
 */
import Link from "next/link";
import { AlertTriangle, Building2, Plus } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuotaMeter } from "@/components/ui/quota-meter";
import { formatMoney } from "@/lib/money-format";
import { formatDateMedium } from "@/lib/utils";
import { platformInvoiceAmounts } from "@/lib/subscription-lifecycle";
import { companiesForUser } from "@/lib/company-registry";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { isReadOnlyTenantStatus } from "@/lib/subscription-lifecycle";
import { tenantCan } from "@/lib/tenant-authz";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { tenantPath } from "@/lib/tenant-routes";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  const companies = await companiesForUser(Number.parseInt(user.id, 10));

  const canCreate = tenantCan(tenant, "company.create");
  const canSeeBilling = tenantCan(tenant, "tenant.billing");

  /* Status hanya-baca ditampilkan kepada SEMUA anggota: seorang staf yang
   * tombol simpannya ditolak berhak tahu alasannya. Ini keadaan operasional,
   * bukan rincian langganan — tidak ada paket, harga, atau kuota di sini. */
  const readOnly = isReadOnlyTenantStatus(tenant.tenantStatus);

  /* Kuota DIBACA di dalam cabang izinnya: bagi yang tidak berhak, query ke
   * basis data kendali & platform tidak pernah berjalan sama sekali. */
  const overview = canSeeBilling ? await billingOverviewForTenant(tenant.tenantId) : null;

  /* ── Dua pertanyaan uang yang selama ini hanya bisa dijawab dengan menggulung
   * ke tabel tagihan dan menghitung sendiri: "kapan & berapa berikutnya" dan
   * "apakah saya sedang menunggak". Keduanya dihitung DI SINI dari data yang
   * memang sudah diambil — tidak ada query tambahan.
   *
   * Nominalnya lewat `platformInvoiceAmounts` yang SAMA dengan yang
   * menerbitkan tagihan: harga paket telanjang akan menyebut angka yang tidak
   * akan pernah sama dengan yang tertagih. */
  const subscription = overview?.billing?.subscription ?? null;
  const nextCharge =
    subscription && subscription.status !== "cancelled"
      ? formatMoney(
          Number(
            platformInvoiceAmounts(subscription.price, process.env.PLATFORM_PPN_DISABLED !== "true")
              .total
          ),
          subscription.currency
        )
      : null;

  /* `issued` = sudah terbit dan BELUM lunas (draft belum ditagihkan, void
   * dibatalkan, paid selesai). Menjumlahkan status lain akan menakut-nakuti
   * dengan angka yang tidak ditagihkan kepada siapa pun. */
  const unpaid = (overview?.billing?.invoices ?? []).filter((inv) => inv.status === "issued");

  /* ⚠ DIJUMLAHKAN PER MATA UANG, bukan satu `reduce` datar.
   *
   * Versi sebelumnya menjumlahkan `Number(inv.total)` seluruh tagihan terbuka
   * lalu memberi hasilnya mata uang `unpaid[0].currency`. Selama semua tagihan
   * ber-IDR angkanya kebetulan benar; pada tenant yang satu tagihannya
   * berdenominasi USD, 100 dolar ikut ditambahkan sebagai 100 rupiah dan
   * seluruh kartu berbohong — tanpa satu pun tanda di layar bahwa ada yang
   * dicampur. Menjumlahkan mata uang berbeda menuntut kurs, dan halaman ini
   * tidak punya (juga tidak boleh mengarangnya): jadi yang ditampilkan adalah
   * SETIAP mata uang apa adanya, dipisah titik-tengah. */
  const unpaidByCurrency = new Map<string, number>();
  for (const inv of unpaid) {
    unpaidByCurrency.set(
      inv.currency,
      (unpaidByCurrency.get(inv.currency) ?? 0) + Number(inv.total)
    );
  }
  const unpaidTotalLabel = Array.from(unpaidByCurrency.entries())
    .map(([currency, total]) => formatMoney(total, currency))
    .join(" · ");

  return (
    <>
      <PageHeader title={t("platform.title")} description={t("platform.description")} />

      <div className="space-y-6">
        {/* Penangguhan langganan — ikon + kata, bukan warna saja (MASTER.md
            §Anti-Patterns). Batasnya `warning`, bukan `border`: bidang
            berstatus yang bertepi netral terbaca sebagai kotak biasa yang
            kebetulan kuning. */}
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

        {/* Baris ringkasan. Untuk pemilik ia adalah PEMAKAIAN vs kuota — angka
            yang paling sering dicari dan dulu terkubur di tengah gulungan;
            untuk anggota biasa cukup satu kartu, sebab kuota bukan urusannya
            (dan datanya memang tidak pernah dibaca untuknya). */}
        <section aria-labelledby={canSeeBilling && overview ? "ringkasan" : undefined}>
          {canSeeBilling && overview && (
            <h2 id="ringkasan" className="mb-3 text-lg font-semibold text-foreground">
              {t("tenantSettings.usageHeading")}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {canSeeBilling && overview ? (
              <>
                {/* METER, bukan angka telanjang. "2 / 3" benar dan tidak
                    menjawab pertanyaan yang sebenarnya dibawa pemilik akun ke
                    sini: seberapa dekat saya dengan mentok. Bentuknya dipilih
                    dari heuristik — satu rasio terhadap sebuah BATAS adalah
                    meter. Keparahannya juga berupa kata, bukan rona saja. */}
                <QuotaMeter
                  label={t("tenantSettings.usageCompanies")}
                  used={overview.usage.companies}
                  max={overview.tenant.maxCompanies}
                  valueLabel={t("tenantSettings.usageOf", {
                    used: overview.usage.companies,
                    max: overview.tenant.maxCompanies,
                  })}
                  stateLabel={
                    overview.usage.companies >= overview.tenant.maxCompanies
                      ? t("tenantSettings.quotaFull")
                      : t("tenantSettings.quotaNearlyFull")
                  }
                />
                <QuotaMeter
                  label={t("tenantSettings.usageUsers")}
                  used={overview.usage.users}
                  max={overview.tenant.maxUsers}
                  valueLabel={t("tenantSettings.usageOf", {
                    used: overview.usage.users,
                    max: overview.tenant.maxUsers,
                  })}
                  stateLabel={
                    overview.usage.users >= overview.tenant.maxUsers
                      ? t("tenantSettings.quotaFull")
                      : t("tenantSettings.quotaNearlyFull")
                  }
                />
                {/* Status sebagai KATA, bukan warna saja — dan warnanya
                    mengikuti artinya (ditangguhkan = peringatan). */}
                <StatCard
                  title={t("tenantSettings.statusLabel")}
                  value={t(`tenantSettings.status.${overview.tenant.status}` as DictionaryKey)}
                  valueClassName={
                    isReadOnlyTenantStatus(overview.tenant.status)
                      ? "text-lg text-warning-strong"
                      : "text-lg text-success-strong"
                  }
                />
                {/* Kapan & berapa berikutnya — pertanyaan yang dulu hanya bisa
                    dijawab dengan menggulung ke tabel tagihan lalu menghitung
                    PPN-nya sendiri. */}
                {nextCharge && subscription && (
                  <StatCard
                    title={t("tenantSettings.nextChargeLabel")}
                    value={nextCharge}
                    hint={t("tenantSettings.nextChargeOn", {
                      date: formatDateMedium(subscription.currentPeriodEnd),
                    })}
                  />
                )}
                {/* Tunggakan hanya muncul bila MEMANG ada. Kartu "Rp 0" yang
                    selalu menyala mengajari pembacanya mengabaikan tempat itu,
                    dan pada hari angkanya bukan nol ia sudah tak terlihat. */}
                {unpaid.length > 0 && (
                  <StatCard
                    title={t("tenantSettings.unpaidLabel")}
                    href="/platform/billing"
                    value={unpaidTotalLabel}
                    valueClassName="text-lg text-warning-strong"
                    hint={t("tenantSettings.unpaidCount", { count: unpaid.length })}
                  />
                )}
              </>
            ) : (
              <StatCard title={t("platform.companiesHeading")} value={companies.length} />
            )}
          </div>
        </section>

        {/* Akun — "saya sedang masuk ke akun siapa". Nama pendeknya juga ada di
            bilah atas; yang tinggal di sini adalah slug teknisnya, yang dipakai
            saat menyebut akun ini kepada dukungan. */}
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
               * Nol perusahaan punya DUA arti yang berbeda, dan menjawab
               * keduanya dengan kalimat yang sama akan membuat salah satunya
               * jalan buntu:
               *   • boleh membuat (owner/admin) → yang dibutuhkan adalah tombol;
               *   • tidak boleh (staf)          → yang dibutuhkan adalah alasan
               *     dan langkah berikutnya, bukan layar kosong tanpa penjelasan.
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
                          <p
                            className="truncate font-medium text-foreground"
                            title={company.name}
                          >
                            {company.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {company.slug}
                          </p>
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
      </div>
    </>
  );
}
