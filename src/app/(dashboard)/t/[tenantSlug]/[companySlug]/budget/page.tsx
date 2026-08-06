/**
 * Anggaran & Target — hub (issue #29). Three surfaces: input anggaran per akun,
 * input target penjualan, and the Realisasi vs Anggaran report. bos-only, like
 * the other planning/reporting surfaces.
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Card } from "@/components/ui/card";
import { ClipboardList, Target, GaugeCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** `margin` AntD (16) — angka, karena berkas ini server component. */
const CARD_GAP = 16;
/** Lebar dasar satu kartu permukaan: tiga berjajar di 1440px, satu di 375px. */
const SURFACE_BASIS = 260;

export default async function BudgetHubPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("budget.manage", params);
  const t = await getT();

  const surfaces = [
    {
      href: "/budget/report",
      icon: GaugeCircle,
      title: t("budget.surfaceReportTitle"),
      desc: t("budget.surfaceReportDesc"),
    },
    {
      href: "/budget/accounts",
      icon: ClipboardList,
      title: t("budget.surfaceAccountsTitle"),
      desc: t("budget.surfaceAccountsDesc"),
    },
    {
      href: "/budget/targets",
      icon: Target,
      title: t("budget.surfaceTargetsTitle"),
      desc: t("budget.surfaceTargetsDesc"),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("budget.title")}
        description={t("budget.description")}
      />

      <div
        style={{
          display: "grid",
          gap: CARD_GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${SURFACE_BASIS}px, 1fr))`,
        }}
      >
        {surfaces.map((s) => (
          <Link key={s.href} href={s.href} style={{ display: "block", height: "100%" }}>
            <Card style={{ height: "100%" }}>
              <div style={{ padding: "var(--ant-padding-lg)" }}>
                {/* Ikon di dalam `<Card>` AntD, jadi variabel tokennya
                    teratasi — lihat kepala `shared/aging.tsx`. Ia dekoratif:
                    judul kartunya yang membawa maknanya. */}
                <s.icon
                  size="1.5em"
                  aria-hidden="true"
                  style={{ color: "var(--ant-color-primary)" }}
                />
                <h2
                  style={{
                    margin: 0,
                    marginTop: "var(--ant-margin-sm)",
                    fontSize: "var(--ant-font-size)",
                    fontWeight: "var(--ant-font-weight-strong)",
                  }}
                >
                  {s.title}
                </h2>
                <p
                  style={{
                    margin: 0,
                    marginTop: "var(--ant-margin-xxs)",
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  {s.desc}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
