/**
 * `/tenants/new` — BUAT TENANT UJI COBA untuk seorang prospek (alur demo-first,
 * keputusan pemilik 24 Okt 2026; `docs/KOMERSIALISASI.md` §1.2, K-3).
 *
 * Jalurnya: demo → uji coba yang dibuat operator → aktivasi manual. Bukan
 * pendaftaran mandiri (yang tetap di balik gerbang `/settings`, bawaannya
 * tertutup), dan bukan "uji coba habis → tagihan otomatis": uji coba yang
 * habis BEKU hanya-baca sampai diaktifkan dari penawaran.
 *
 * Paket datang dari katalog platform. Platform tak terjangkau = formulir tidak
 * ditawarkan (tidak ada paket untuk dipilih, dan langganannya tidak bisa
 * ditulis) — pola tahan-mati konsol: tombol yang pasti gagal tidak digambar.
 */

import { ConsoleNotice, ConsolePanel } from "@op/components/operator/console-ui";
import { CreateTrialForm } from "@op/components/operator/create-trial-form";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { listPlansForOperator } from "@op/lib/operator/store";
import { SIGNUP_PLAN_KEY, TRIAL_DAYS } from "@sai/core/registration";

import { operatorCreateTrialTenant } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorCreateTrialPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const plans = await listPlansForOperator();

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("operator.nav.tenants"), href: "/tenants" },
          { label: t("operator.trial.title") },
        ]}
        title={t("operator.trial.title")}
        description={t("operator.trial.description")}
      />
      {!operatorCan(operator.role, "tenant.billing") ? (
        <ConsoleNotice>{t("operator.roleCannotEdit")}</ConsoleNotice>
      ) : plans === null || plans.length === 0 ? (
        <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
      ) : (
        <ConsolePanel>
          <CreateTrialForm
            plans={plans.map((p) => ({
              key: p.key,
              name: p.name,
              maxCompanies: p.maxCompanies,
              maxUsers: p.maxUsers,
            }))}
            /* Bawaan pilihan saja — operator bebas memilih paket lain. */
            defaultPlanKey={plans.some((p) => p.key === SIGNUP_PLAN_KEY) ? SIGNUP_PLAN_KEY : plans[0].key}
            defaultTrialDays={TRIAL_DAYS}
            create={operatorCreateTrialTenant}
          />
        </ConsolePanel>
      )}
    </div>
  );
}
