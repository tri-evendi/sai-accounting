/**
 * `/platform/billing/plans` — katalog paket, dibaca pelanggan sendiri.
 *
 * ══ PERTANYAAN YANG SELAMA INI TIDAK PUNYA HALAMAN ═════════════════════════
 * "Bagaimana kalau saya butuh lebih dari 3 perusahaan?" sampai sekarang hanya
 * dijawab satu kalimat di bawah kartu paket: *hubungi pengelola platform*.
 * Kalimat itu benar tapi tidak cukup — ia menyuruh orang bertanya tanpa
 * memberinya bahan untuk bertanya. Halaman ini adalah bahan itu: apa saja yang
 * dijual, berapa harganya, dan kuota apa yang didapat.
 *
 * ══ TIGA KEPUTUSAN YANG MENJADIKANNYA SWALAYAN ═════════════════════════════
 * Mesinnya sudah lama ada — `changeTenantPlan`, ber-audit, dipakai konsol
 * operator. Yang belum ada adalah tiga jawaban KOMERSIAL, dan tak satu pun
 * boleh ditebak oleh kode. Ketiganya kini terjawab (aritmetikanya di
 * `lib/plan-change.ts`, tempat ia bisa diuji tanpa basis data):
 *
 *   • PRORATA SELISIH. Naik paket di hari ke-20 dari 30 membayar
 *     `(baru − lama) × 10/30`, dan tanggal tagihan berikutnya TIDAK bergeser.
 *   • PPN mengikuti tagihan langganan biasa — `platformInvoiceAmounts()` yang
 *     sama, tarif dari `lib/tax.ts`, sakelar `PLATFORM_PPN_DISABLED`. Tidak ada
 *     aturan pajak kedua yang bisa menyimpang dari yang pertama.
 *   • TURUN PAKET DITOLAK bila pemakaian melampaui kuota baru — bukan
 *     "diizinkan dengan peringatan" seperti di konsol operator, sebab di sana
 *     ada manusia yang membaca peringatannya dan tahu buku mana yang boleh
 *     ditutup. Di sini tidak ada.
 *
 * Keputusannya sendiri TIDAK dihitung di halaman ini: tombolnya memanggil
 * `/api/tenant/billing/plan-change`, dan server yang menimbang kuota, prorata,
 * dan penolakan dari pemakaian NYATA. Halaman ini hanya menyediakan
 * perbandingan dan kalimat konfirmasi yang menyebut konsekuensinya.
 *
 * Katalog boleh gagal dengan tenang (`activePlans()` → `null`): platform mati
 * tidak boleh mematikan halaman yang menjelaskan langganan.
 */
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { activePlans } from "@/lib/plan-catalog";
import { periodDaysFor } from "@/lib/plan-change";
import { formatMoney } from "@/lib/money-format";

import { PlanAction } from "./plan-actions";
import { getT } from "@/lib/i18n/server";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

export const dynamic = "force-dynamic";

export default async function PlatformPlansPage() {
  const { tenant } = await requireTenantPagePermission("tenant.billing");
  const t = await getT();

  const [plans, overview] = await Promise.all([
    activePlans(),
    billingOverviewForTenant(tenant.tenantId),
  ]);

  /* Paket berjalan datang dari snapshot KENDALI (`tenants.plan_key`), bukan
   * dari katalog: itu yang benar-benar berlaku bagi tenant ini, termasuk bila
   * paketnya sudah ditarik dari penjualan dan karena itu tidak ada di daftar. */
  const currentKey = overview?.tenant.planKey ?? null;

  /* Tombol pindah paket hanya muncul bila ada LANGGANAN BERJALAN: tanpa
   * periode dan harga snapshot-nya, tidak ada dasar untuk menghitung prorata —
   * dan tombol yang tidak bisa menghitung apa pun lebih buruk daripada tidak
   * ada tombol. Tenant tanpa langganan (platform mati / belum di-seed) karena
   * itu tetap melihat katalog, tapi tanpa aksi. */
  const subscription = overview?.billing?.subscription ?? null;
  const period = subscription
    ? periodDaysFor(subscription.currentPeriodStart, subscription.currentPeriodEnd, new Date())
    : null;

  return (
    <>
      <PageHeader
        title={t("platform.plansTitle")}
        description={t("platform.plansDescription")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("tenantSettings.title"), href: "/platform/billing" },
          { label: t("platform.plansTitle") },
        ]}
      />

      <div className="space-y-6">
        {plans === null ? (
          <Card>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("platform.plansUnavailable")}
              </p>
            </CardContent>
          </Card>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("platform.plansEmpty")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const current = plan.key === currentKey;
              return (
                <li key={plan.key}>
                  <Card
                    className={
                      current ? "h-full border-primary ring-1 ring-primary" : "h-full"
                    }
                  >
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
                      {/* Penanda paket berjalan adalah LENCANA BERTEKS, bukan
                          sekadar tepi berwarna — tepi saja tidak terbaca oleh
                          siapa pun yang tidak membedakan warnanya. */}
                      {current && <Badge variant="success">{t("platform.plansCurrent")}</Badge>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Paket berharga RUNDINGAN tidak memajang nominal: kolom
                          harganya berisi 0, dan "Rp 0" di sini terbaca sebagai
                          gratis. Tombol swalayannya pun tidak dirender — tapi
                          yang MENOLAK adalah route `plan-change`, bukan cabang
                          ini (tombol yang hilang bukan penjaga). */}
                      {plan.contactOnly ? (
                        <p className="text-2xl font-bold text-foreground">
                          {t("landing.pricingContactPrice")}
                        </p>
                      ) : (
                        <>
                          <p className="text-2xl font-bold tabular-nums text-foreground">
                            {formatMoney(plan.priceMonthly, plan.currency)}
                            <span className="text-sm font-normal text-muted-foreground">
                              {t("platform.plansPerMonth")}
                            </span>
                          </p>
                          {plan.priceYearly !== null && (
                            <p className="text-sm tabular-nums text-muted-foreground">
                              {formatMoney(plan.priceYearly, plan.currency)}
                              {t("platform.plansPerYear")}
                            </p>
                          )}
                        </>
                      )}
                      {plan.description && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                      <ul className="space-y-1.5 text-sm text-foreground">
                        <li className="flex items-start gap-2">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                          <span className="tabular-nums">
                            {t("platform.plansQuotaCompanies", { max: plan.maxCompanies })}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                          <span className="tabular-nums">
                            {t("platform.plansQuotaUsers", { max: plan.maxUsers })}
                          </span>
                        </li>
                      </ul>
                      {/* Paket berjalan tidak punya tombol menuju dirinya
                          sendiri; lencana di kepala kartu yang menyatakannya. */}
                      {!current && !plan.contactOnly && subscription && period && (
                        <PlanAction
                          planKey={plan.key}
                          planName={plan.name}
                          priceMonthly={plan.priceMonthly}
                          currentPrice={Number(subscription.price)}
                          remainingDays={period.remainingDays}
                          periodDays={period.periodDays}
                        />
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {/* Prosesnya apa adanya. Tidak menyebutkannya sama sekali akan membuat
            halaman ini terlihat seperti toko yang tombol belinya hilang. */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">
              {t("platform.plansUpgradeHeading")}
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("platform.plansUpgradeBody")}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
