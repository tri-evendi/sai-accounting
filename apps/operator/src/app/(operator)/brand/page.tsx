/**
 * `/brand` — LOGO PRODUK (migration platform 0005).
 *
 * Operator mengganti lambang SAI tanpa rilis. Yang ikut berganti: `BrandMark`
 * di setiap chrome kedua aplikasi, ikon tab, ikon layar depan, manifest PWA,
 * dan gambar pratinjau tautan. Semua operator boleh melihat; mengganti butuh
 * izin `site.settings`.
 */
import { ConsoleNotice, ConsolePanel, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { BrandMarkPanel } from "@op/components/operator/brand-mark-panel";
import { PageHeader } from "@sai/ui/page-header";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { platformDb } from "@sai/platform/platform-db";
import { readActiveBrandMark, type BrandMarkMeta } from "@sai/platform/brand-assets";

import { operatorResetBrandMark, operatorUploadBrandMark } from "./actions";

export const dynamic = "force-dynamic";

export default async function OperatorBrandPage() {
  const { operator } = await requireOperatorPage();
  const t = await getT();

  let active: BrandMarkMeta | null | undefined;
  try {
    active = await readActiveBrandMark({ platform: platformDb });
  } catch (error) {
    console.error("[operator-brand] logo produk tak terbaca:", error);
    active = undefined;
  }

  return (
    <div>
      <PageHeader title={t("operator.brand.heading")} description={t("operator.brand.description")} />
      <div style={CONSOLE_PAGE}>
        {active === undefined ? (
          <ConsoleNotice>{t("operator.brand.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel>
            <BrandMarkPanel
              active={
                active
                  ? {
                      sha256: active.sha256,
                      width: active.width,
                      height: active.height,
                      createdBy: active.createdBy,
                      createdAt: active.createdAt.toISOString(),
                    }
                  : null
              }
              canEdit={operatorCan(operator.role, "site.settings")}
              upload={operatorUploadBrandMark}
              reset={operatorResetBrandMark}
            />
          </ConsolePanel>
        )}
      </div>
    </div>
  );
}
